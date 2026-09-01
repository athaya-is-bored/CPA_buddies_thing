// server.js - Express server with SQLite, secure cookie-based authentication
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const fs = require('fs');

const DB_FILE = path.join(__dirname, 'data.sqlite3');
const ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'access_secret_change_in_prod';
const REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'refresh_secret_change_in_prod';
const PORT = process.env.PORT || 3000;

// Token expiry times
const ACCESS_TOKEN_EXPIRY = '15m';  // short-lived
const REFRESH_TOKEN_EXPIRY = '7d';  // long-lived

// ensure DB file exists
const db = new sqlite3.Database(DB_FILE);

function runSql(db, sql, params=[]) {
  return new Promise((resolve, reject)=>{
    db.run(sql, params, function(err){ if(err) return reject(err); resolve(this); });
  });
}
function getSql(db, sql, params=[]) {
  return new Promise((resolve,reject)=>{ db.get(sql, params, (err,row)=>{ if(err) return reject(err); resolve(row); }); });
}
function allSql(db, sql, params=[]) {
  return new Promise((resolve,reject)=>{ db.all(sql, params, (err,rows)=>{ if(err) return reject(err); resolve(rows); }); });
}

async function initDb(){
  await runSql(db, `CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password_hash TEXT,
    approved INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Student',
    security TEXT,
    bio TEXT,
    classes TEXT,
    email_public INTEGER DEFAULT 0,
    suspended_until TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  await runSql(db, `CREATE TABLE IF NOT EXISTS refresh_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    token_hash TEXT UNIQUE,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`);

  await runSql(db, `CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    body TEXT,
    to_email TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  await runSql(db, `CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    type TEXT,
    name TEXT,
    participants TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);
  
  await runSql(db, `CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT,
    sender TEXT,
    text TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  )`);

  // seed admin if not exists
  const adminEmail = 'athayacraven+admin@gmail.com';
  const existing = await getSql(db, 'SELECT * FROM users WHERE email = ?', [adminEmail]);
  if(!existing){
    const hash = await bcrypt.hash('Admin', 10);
    const security = JSON.stringify({
      q1: 'Ferb', q2: 'Reza', q3: 'San Diego', q5: 'Joy', q6: 'Hannah', q9: 'August 11'
    });
    await runSql(db, `INSERT INTO users (name,email,password_hash,approved,status,security) VALUES (?,?,?,?,?,?)`, [
      'Admin', adminEmail, hash, 1, 'Admin', security
    ]);
    console.log('Seeded admin user:', adminEmail);
  }
}

initDb().catch(err=>{ console.error('DB init failed', err); process.exit(1); });

const app = express();
app.use(cors({
  origin: true, // in prod, specify exact origin
  credentials: true // allow cookies
}));
app.use(bodyParser.json());
app.use(cookieParser());

// serve static frontend files from repo root
app.use(express.static(path.join(__dirname)));

// helpers
function sanitizeUserRow(row){
  if(!row) return null;
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    approved: !!row.approved,
    status: row.status,
    bio: row.bio || '',
    classes: row.classes ? JSON.parse(row.classes) : [],
    email_public: !!row.email_public,
    suspended_until: row.suspended_until,
    created_at: row.created_at
  };
}

function generateAccessToken(payload){
  return jwt.sign(payload, ACCESS_TOKEN_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY });
}

function generateRefreshToken(payload){
  return jwt.sign(payload, REFRESH_TOKEN_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY });
}

async function storeRefreshToken(userId, token){
  const hash = require('crypto').createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  await runSql(db, 'INSERT INTO refresh_tokens (user_id, token_hash, expires_at) VALUES (?,?,?)', 
    [userId, hash, expiresAt]);
}

async function verifyRefreshToken(token, userId){
  const hash = require('crypto').createHash('sha256').update(token).digest('hex');
  const row = await getSql(db, 
    'SELECT * FROM refresh_tokens WHERE user_id = ? AND token_hash = ? AND expires_at > datetime("now")',
    [userId, hash]);
  return !!row;
}

async function getUserByEmail(email){
  const row = await getSql(db, 'SELECT * FROM users WHERE email = ?', [email]);
  if(!row) return null;
  row.classes = row.classes || '[]';
  return row;
}

// === Authentication Middleware ===
// Verify access token from HttpOnly cookie
function authenticateAccessToken(req, res, next){
  const accessToken = req.cookies.accessToken;
  if(!accessToken) return res.status(401).json({ error: 'No access token' });
  
  jwt.verify(accessToken, ACCESS_TOKEN_SECRET, (err, payload)=>{
    if(err) return res.status(401).json({ error: 'Invalid access token' });
    req.auth = payload; // contains email, status, id
    next();
  });
}

// === Auth Endpoints ===

// POST /api/auth/signup - create account (no auto-login)
app.post('/api/auth/signup', async (req,res)=>{
  try{
    const { name, email, password } = req.body;
    if(!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const exists = await getSql(db, 'SELECT id FROM users WHERE email = ?', [email]);
    if(exists) return res.status(409).json({ error: 'Email already exists' });
    const hash = await bcrypt.hash(password, 10);
    await runSql(db, 'INSERT INTO users (name,email,password_hash,approved,status) VALUES (?,?,?,?,?)', [name,email,hash,0,'Student']);
    return res.status(201).json({ message: 'Created' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/auth/login - authenticate and set HttpOnly cookies
app.post('/api/auth/login', async (req,res)=>{
  try{
    const { email, password } = req.body;
    if(!email || !password) return res.status(400).json({ error: 'Missing fields' });
    const row = await getUserByEmail(email);
    if(!row) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if(!ok) return res.status(401).json({ error: 'Invalid credentials' });
    
    // Generate tokens
    const accessToken = generateAccessToken({ email: row.email, status: row.status, id: row.id });
    const refreshToken = generateRefreshToken({ email: row.email, id: row.id });
    
    // Store refresh token in DB
    await storeRefreshToken(row.id, refreshToken);
    
    // Set HttpOnly cookies (not accessible to JS, sent automatically)
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000 // 15 minutes
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
    
    const user = sanitizeUserRow(row);
    return res.json({ message: 'Logged in', user });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/auth/refresh - refresh access token using refresh token
app.post('/api/auth/refresh', async (req,res)=>{
  try{
    const refreshToken = req.cookies.refreshToken;
    if(!refreshToken) return res.status(401).json({ error: 'No refresh token' });
    
    jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, async (err, payload)=>{
      if(err) return res.status(401).json({ error: 'Invalid refresh token' });
      
      const userId = payload.id;
      const isValid = await verifyRefreshToken(refreshToken, userId);
      if(!isValid) return res.status(401).json({ error: 'Refresh token not found or expired' });
      
      // Fetch user and issue new access token
      const user = await getSql(db, 'SELECT * FROM users WHERE id = ?', [userId]);
      if(!user) return res.status(404).json({ error: 'User not found' });
      
      const newAccessToken = generateAccessToken({ email: user.email, status: user.status, id: user.id });
      res.cookie('accessToken', newAccessToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: 15 * 60 * 1000
      });
      
      return res.json({ message: 'Token refreshed' });
    });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/auth/logout - clear cookies and optionally invalidate refresh token
app.post('/api/auth/logout', authenticateAccessToken, async (req,res)=>{
  try{
    const userId = req.auth.id;
    // Delete all refresh tokens for this user (force re-login on all devices)
    await runSql(db, 'DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
    
    // Clear cookies
    res.clearCookie('accessToken', { httpOnly: true, sameSite: 'strict' });
    res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict' });
    return res.json({ message: 'Logged out' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// GET /api/auth/me - get current user from access token
app.get('/api/auth/me', authenticateAccessToken, async (req,res)=>{
  try{
    const user = await getSql(db, 'SELECT * FROM users WHERE email = ?', [req.auth.email]);
    if(!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: sanitizeUserRow(user) });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// === Account Setup ===

// POST /api/account-setup - save security questions and status after signup
app.post('/api/account-setup', async (req,res)=>{
  try{
    const { email, answers, status } = req.body;
    if(!email || !answers || Object.keys(answers).length < 4){
      return res.status(400).json({ error: 'At least 4 security answers required' });
    }
    
    const user = await getUserByEmail(email);
    if(!user) return res.status(404).json({ error: 'User not found' });
    
    // Save security answers as JSON
    const securityJson = JSON.stringify(answers);
    const userStatus = status || 'Student';
    
    await runSql(db, 'UPDATE users SET security = ?, status = ? WHERE email = ?', 
      [securityJson, userStatus, email]);
    
    // Send notification to all admins
    const admins = await allSql(db, 'SELECT email FROM users WHERE status = ?', ['Admin']);
    const signupInfo = `User: ${user.name}\nEmail: ${user.email}\nStatus: ${userStatus}`;
    for(const admin of admins){
      await runSql(db, 'INSERT INTO notifications (title, body, to_email) VALUES (?,?,?)',
        ['New Account Awaiting Approval', `A new account has been created and requires approval.\n\n${signupInfo}`, admin.email]);
    }
    
    return res.status(200).json({ message: 'Account setup complete' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// === Account Approval (Admin) ===

// GET /api/admin/pending-approvals - get all unapproved accounts
app.get('/api/admin/pending-approvals', authenticateAccessToken, async (req,res)=>{
  try{
    // Check if requester is admin
    const requester = await getUserByEmail(req.auth.email);
    if(requester.status !== 'Admin') return res.status(403).json({ error: 'Unauthorized' });
    
    const users = await allSql(db, 'SELECT id, name, email, status, created_at FROM users WHERE approved = 0 ORDER BY created_at ASC');
    res.json({ pending: users });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/admin/approve-user - approve a pending user
app.post('/api/admin/approve-user', authenticateAccessToken, async (req,res)=>{
  try{
    const { userEmail } = req.body;
    if(!userEmail) return res.status(400).json({ error: 'Missing userEmail' });
    
    // Check if requester is admin
    const requester = await getUserByEmail(req.auth.email);
    if(requester.status !== 'Admin') return res.status(403).json({ error: 'Unauthorized' });
    
    const user = await getUserByEmail(userEmail);
    if(!user) return res.status(404).json({ error: 'User not found' });
    
    // Approve user
    await runSql(db, 'UPDATE users SET approved = 1 WHERE email = ?', [userEmail]);
    
    // Send approval notification to user
    await runSql(db, 'INSERT INTO notifications (title, body, to_email) VALUES (?,?,?)',
      ['Account Approved!', 'Your account has been approved! You can now explore CPA Study Buddies.', userEmail]);
    
    res.json({ message: 'User approved' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/admin/reject-user - reject a pending user (delete account)
app.post('/api/admin/reject-user', authenticateAccessToken, async (req,res)=>{
  try{
    const { userEmail } = req.body;
    if(!userEmail) return res.status(400).json({ error: 'Missing userEmail' });
    
    // Check if requester is admin
    const requester = await getUserByEmail(req.auth.email);
    if(requester.status !== 'Admin') return res.status(403).json({ error: 'Unauthorized' });
    
    const user = await getUserByEmail(userEmail);
    if(!user) return res.status(404).json({ error: 'User not found' });
    
    // Delete user
    await runSql(db, 'DELETE FROM users WHERE email = ?', [userEmail]);
    
    res.json({ message: 'User rejected and deleted' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// === Password Recovery ===

// POST /api/auth/forgot-password - check if email exists
app.post('/api/auth/forgot-password', async (req,res)=>{
  try{
    const { email } = req.body;
    if(!email) return res.status(400).json({ error: 'Email required' });
    
    const user = await getUserByEmail(email);
    if(!user) return res.status(404).json({ error: 'Email not found. Please check spelling and try again.' });
    
    // Return a random security question from their saved answers
    const security = JSON.parse(user.security || '{}');
    const questions = {
      q1: 'What was your first pet\'s name?',
      q2: 'What was your mother\'s maiden name?',
      q3: 'What city were you born in?',
      q4: 'What year did you join CPA?',
      q5: 'What is your middle name?',
      q6: 'What is your oldest sibling\'s name?',
      q7: 'What is your youngest sibling\'s name?',
      q8: 'What time were you born?',
      q9: 'When is your birthday?',
      q10: 'What is your mother\'s father\'s name?'
    };
    
    // Pick a random answered question
    const answeredKeys = Object.keys(security).filter(k => security[k]);
    if(answeredKeys.length === 0) return res.status(400).json({ error: 'No security questions set' });
    
    const randomKey = answeredKeys[Math.floor(Math.random() * answeredKeys.length)];
    
    // Store state temporarily (in production, use Redis or secure session storage)
    // For now, return the key and client will remember it
    res.json({ 
      message: 'Question retrieved',
      question: questions[randomKey],
      questionKey: randomKey,
      email: email
    });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/auth/verify-recovery-answer - verify security answer
app.post('/api/auth/verify-recovery-answer', async (req,res)=>{
  try{
    const { email, questionKey, answer } = req.body;
    if(!email || !questionKey || !answer) return res.status(400).json({ error: 'Missing fields' });
    
    const user = await getUserByEmail(email);
    if(!user) return res.status(404).json({ error: 'User not found' });
    
    const security = JSON.parse(user.security || '{}');
    const storedAnswer = security[questionKey];
    
    // Case-insensitive comparison
    if(!storedAnswer || storedAnswer.toLowerCase() !== answer.toLowerCase()){
      return res.status(401).json({ error: 'Incorrect. Please try again.' });
    }
    
    // Generate a temporary reset token (short-lived, use different secret)
    const resetToken = jwt.sign({ email, resetIntent: true }, ACCESS_TOKEN_SECRET, { expiresIn: '10m' });
    
    res.json({ message: 'Answer verified', resetToken });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// POST /api/auth/reset-password - reset password with reset token
app.post('/api/auth/reset-password', async (req,res)=>{
  try{
    const { email, resetToken, newPassword, repeatPassword } = req.body;
    if(!email || !resetToken || !newPassword || !repeatPassword) 
      return res.status(400).json({ error: 'Missing fields' });
    
    if(newPassword !== repeatPassword)
      return res.status(400).json({ error: 'Your password does not match your repeated password. Please check spelling and try again.' });
    
    // Verify reset token
    jwt.verify(resetToken, ACCESS_TOKEN_SECRET, async (err, payload)=>{
      if(err || !payload.resetIntent || payload.email !== email)
        return res.status(401).json({ error: 'Invalid reset token' });
      
      try{
        const user = await getUserByEmail(email);
        if(!user) return res.status(404).json({ error: 'User not found' });
        
        const hash = await bcrypt.hash(newPassword, 10);
        await runSql(db, 'UPDATE users SET password_hash = ? WHERE email = ?', [hash, email]);
        
        res.json({ message: 'Password reset successful' });
      }catch(e){
        console.error(e);
        res.status(500).json({ error: 'Server error' });
      }
    });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// === Users ===
app.get('/api/users', authenticateAccessToken, async (req,res)=>{
  try{
    const q = (req.query.q || '').trim();
    let rows;
    if(q){
      const qlike = `%${q}%`;
      rows = await allSql(db, `SELECT * FROM users WHERE name LIKE ? OR bio LIKE ? ORDER BY CASE WHEN status='Admin' THEN 0 WHEN status='Teacher' THEN 1 ELSE 2 END, name asc`, [qlike, qlike]);
    } else {
      rows = await allSql(db, `SELECT * FROM users ORDER BY CASE WHEN status='Admin' THEN 0 WHEN status='Teacher' THEN 1 ELSE 2 END, name asc`);
    }
    const users = rows.map(r=>sanitizeUserRow(r));
    res.json({ users });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/users/:email', authenticateAccessToken, async (req,res)=>{
  try{
    const email = req.params.email;
    const row = await getUserByEmail(email);
    if(!row) return res.status(404).json({ error: 'Not found' });
    const user = sanitizeUserRow(row);
    // Respect email visibility: if email_public is true or requester is self or admin, expose email
    const requester = req.auth && req.auth.email;
    const requesterRow = requester ? await getUserByEmail(requester) : null;
    const requesterIsAdmin = requesterRow && requesterRow.status === 'Admin';
    if(user.email_public || requester === user.email || requesterIsAdmin){ user.email = row.email; } else { user.email = null; }
    res.json({ user });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// === Chats ===
app.post('/api/chats', authenticateAccessToken, async (req,res)=>{
  try{
    const { id, type, participants, name } = req.body;
    if(!id || !type || !participants) return res.status(400).json({ error: 'Missing fields' });
    const participantsJson = JSON.stringify(participants);
    await runSql(db, 'INSERT OR REPLACE INTO chats (id,type,name,participants) VALUES (?,?,?,?)', [id,type,name||'',participantsJson]);
    res.status(201).json({ message: 'created' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/chats', authenticateAccessToken, async (req,res)=>{
  try{
    const email = req.query.email;
    if(!email) return res.status(400).json({ error: 'email required' });
    const rows = await allSql(db, 'SELECT * FROM chats');
    const chats = rows.filter(r=>{
      const parts = JSON.parse(r.participants || '[]');
      return parts.includes(email);
    }).map(r=>({ id:r.id, type:r.type, name:r.name, participants: JSON.parse(r.participants || '[]'), created_at: r.created_at }));
    res.json({ chats });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/chats/:id/messages', authenticateAccessToken, async (req,res)=>{
  try{
    const id = req.params.id;
    const msgs = await allSql(db, 'SELECT * FROM messages WHERE chat_id = ? ORDER BY id ASC', [id]);
    res.json({ messages: msgs });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/chats/:id/messages', authenticateAccessToken, async (req,res)=>{
  try{
    const id = req.params.id;
    const { text } = req.body;
    if(!text) return res.status(400).json({ error: 'Missing text' });
    const sender = req.auth.email;
    await runSql(db, 'INSERT INTO messages (chat_id,sender,text) VALUES (?,?,?)', [id,sender,text]);
    res.status(201).json({ message: 'sent' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// === Notifications ===
app.post('/api/notifications', authenticateAccessToken, async (req,res)=>{
  try{
    const { title, body, to_email } = req.body;
    if(!title || !body || !to_email) return res.status(400).json({ error: 'Missing fields' });
    await runSql(db, 'INSERT INTO notifications (title,body,to_email) VALUES (?,?,?)', [title,body,to_email]);
    res.status(201).json({ message: 'created' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/notifications', authenticateAccessToken, async (req,res)=>{
  try{
    const to = req.query.to;
    if(!to) return res.status(400).json({ error: 'to query required' });
    const rows = await allSql(db, 'SELECT * FROM notifications WHERE to_email = ? ORDER BY created_at DESC', [to]);
    res.json({ notifications: rows });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// maintenance: delete notifications older than 30 days
app.post('/api/maintenance/cleanup_notifications', async (req,res)=>{
  try{
    await runSql(db, `DELETE FROM notifications WHERE created_at < datetime('now','-30 days')`);
    res.json({ message: 'cleaned' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.listen(PORT, ()=>{ console.log('Server listening on', PORT); });
