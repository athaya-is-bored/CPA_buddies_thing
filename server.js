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

  await runSql(db, `CREATE TABLE IF NOT EXISTS study_buddy_invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_email TEXT,
    to_email TEXT,
    status TEXT DEFAULT 'pending',
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(from_email, to_email)
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
  origin: true,
  credentials: true
}));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
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
function authenticateAccessToken(req, res, next){
  const accessToken = req.cookies.accessToken;
  if(!accessToken) return res.status(401).json({ error: 'No access token' });
  
  jwt.verify(accessToken, ACCESS_TOKEN_SECRET, (err, payload)=>{
    if(err) return res.status(401).json({ error: 'Invalid access token' });
    req.auth = payload;
    next();
  });
}

// === Auth Endpoints ===

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

app.post('/api/auth/login', async (req,res)=>{
  try{
    const { email, password } = req.body;
    if(!email || !password) return res.status(400).json({ error: 'Missing fields' });
    const row = await getUserByEmail(email);
    if(!row) return res.status(401).json({ error: 'Invalid credentials' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if(!ok) return res.status(401).json({ error: 'Invalid credentials' });
    
    const accessToken = generateAccessToken({ email: row.email, status: row.status, id: row.id });
    const refreshToken = generateRefreshToken({ email: row.email, id: row.id });
    
    await storeRefreshToken(row.id, refreshToken);
    
    res.cookie('accessToken', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 15 * 60 * 1000
    });
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    const user = sanitizeUserRow(row);
    return res.json({ message: 'Logged in', user });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/auth/refresh', async (req,res)=>{
  try{
    const refreshToken = req.cookies.refreshToken;
    if(!refreshToken) return res.status(401).json({ error: 'No refresh token' });
    
    jwt.verify(refreshToken, REFRESH_TOKEN_SECRET, async (err, payload)=>{
      if(err) return res.status(401).json({ error: 'Invalid refresh token' });
      
      const userId = payload.id;
      const isValid = await verifyRefreshToken(refreshToken, userId);
      if(!isValid) return res.status(401).json({ error: 'Refresh token not found or expired' });
      
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

app.post('/api/auth/logout', authenticateAccessToken, async (req,res)=>{
  try{
    const userId = req.auth.id;
    await runSql(db, 'DELETE FROM refresh_tokens WHERE user_id = ?', [userId]);
    
    res.clearCookie('accessToken', { httpOnly: true, sameSite: 'strict' });
    res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict' });
    return res.json({ message: 'Logged out' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/auth/me', authenticateAccessToken, async (req,res)=>{
  try{
    const user = await getSql(db, 'SELECT * FROM users WHERE email = ?', [req.auth.email]);
    if(!user) return res.status(404).json({ error: 'User not found' });
    return res.json({ user: sanitizeUserRow(user) });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// === Account Setup ===

app.post('/api/account-setup', async (req,res)=>{
  try{
    const { email, answers, status } = req.body;
    if(!email || !answers || Object.keys(answers).length < 4){
      return res.status(400).json({ error: 'At least 4 security answers required' });
    }
    
    const user = await getUserByEmail(email);
    if(!user) return res.status(404).json({ error: 'User not found' });
    
    const securityJson = JSON.stringify(answers);
    const userStatus = status || 'Student';
    
    await runSql(db, 'UPDATE users SET security = ?, status = ? WHERE email = ?', 
      [securityJson, userStatus, email]);
    
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

app.get('/api/admin/pending-approvals', authenticateAccessToken, async (req,res)=>{
  try{
    const requester = await getUserByEmail(req.auth.email);
    if(requester.status !== 'Admin') return res.status(403).json({ error: 'Unauthorized' });
    
    const users = await allSql(db, 'SELECT id, name, email, status, created_at FROM users WHERE approved = 0 ORDER BY created_at ASC');
    res.json({ pending: users });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/approve-user', authenticateAccessToken, async (req,res)=>{
  try{
    const { userEmail } = req.body;
    if(!userEmail) return res.status(400).json({ error: 'Missing userEmail' });
    
    const requester = await getUserByEmail(req.auth.email);
    if(requester.status !== 'Admin') return res.status(403).json({ error: 'Unauthorized' });
    
    const user = await getUserByEmail(userEmail);
    if(!user) return res.status(404).json({ error: 'User not found' });
    
    await runSql(db, 'UPDATE users SET approved = 1 WHERE email = ?', [userEmail]);
    
    await runSql(db, 'INSERT INTO notifications (title, body, to_email) VALUES (?,?,?)',
      ['Account Approved!', 'Your account has been approved! You can now explore CPA Study Buddies.', userEmail]);
    
    res.json({ message: 'User approved' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/reject-user', authenticateAccessToken, async (req,res)=>{
  try{
    const { userEmail } = req.body;
    if(!userEmail) return res.status(400).json({ error: 'Missing userEmail' });
    
    const requester = await getUserByEmail(req.auth.email);
    if(requester.status !== 'Admin') return res.status(403).json({ error: 'Unauthorized' });
    
    const user = await getUserByEmail(userEmail);
    if(!user) return res.status(404).json({ error: 'User not found' });
    
    await runSql(db, 'DELETE FROM users WHERE email = ?', [userEmail]);
    
    res.json({ message: 'User rejected and deleted' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// === Password Recovery ===

app.post('/api/auth/forgot-password', async (req,res)=>{
  try{
    const { email } = req.body;
    if(!email) return res.status(400).json({ error: 'Email required' });
    
    const user = await getUserByEmail(email);
    if(!user) return res.status(404).json({ error: 'Email not found. Please check spelling and try again.' });
    
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
    
    const answeredKeys = Object.keys(security).filter(k => security[k]);
    if(answeredKeys.length === 0) return res.status(400).json({ error: 'No security questions set' });
    
    const randomKey = answeredKeys[Math.floor(Math.random() * answeredKeys.length)];
    
    res.json({ 
      message: 'Question retrieved',
      question: questions[randomKey],
      questionKey: randomKey,
      email: email
    });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/auth/verify-recovery-answer', async (req,res)=>{
  try{
    const { email, questionKey, answer } = req.body;
    if(!email || !questionKey || !answer) return res.status(400).json({ error: 'Missing fields' });
    
    const user = await getUserByEmail(email);
    if(!user) return res.status(404).json({ error: 'User not found' });
    
    const security = JSON.parse(user.security || '{}');
    const storedAnswer = security[questionKey];
    
    if(!storedAnswer || storedAnswer.toLowerCase() !== answer.toLowerCase()){
      return res.status(401).json({ error: 'Incorrect. Please try again.' });
    }
    
    const resetToken = jwt.sign({ email, resetIntent: true }, ACCESS_TOKEN_SECRET, { expiresIn: '10m' });
    
    res.json({ message: 'Answer verified', resetToken });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/auth/reset-password', async (req,res)=>{
  try{
    const { email, resetToken, newPassword, repeatPassword } = req.body;
    if(!email || !resetToken || !newPassword || !repeatPassword) 
      return res.status(400).json({ error: 'Missing fields' });
    
    if(newPassword !== repeatPassword)
      return res.status(400).json({ error: 'Your password does not match your repeated password. Please check spelling and try again.' });
    
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
      rows = await allSql(db, `SELECT * FROM users WHERE approved = 1 AND (name LIKE ? OR bio LIKE ?) ORDER BY CASE WHEN status='Admin' THEN 0 WHEN status='Teacher' THEN 1 ELSE 2 END, name asc`, [qlike, qlike]);
    } else {
      rows = await allSql(db, `SELECT * FROM users WHERE approved = 1 ORDER BY CASE WHEN status='Admin' THEN 0 WHEN status='Teacher' THEN 1 ELSE 2 END, name asc`);
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
    const requester = req.auth && req.auth.email;
    const requesterRow = requester ? await getUserByEmail(requester) : null;
    const requesterIsAdmin = requesterRow && requesterRow.status === 'Admin';
    if(user.email_public || requester === user.email || requesterIsAdmin){ user.email = row.email; } else { user.email = null; }
    res.json({ user });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// === Profile Updates ===

app.put('/api/users/:email', authenticateAccessToken, async (req,res)=>{
  try{
    const targetEmail = req.params.email;
    const { name, bio, classes } = req.body;
    
    const requester = await getUserByEmail(req.auth.email);
    const target = await getUserByEmail(targetEmail);
    if(!target) return res.status(404).json({ error: 'User not found' });
    
    // Can only edit self, or admin/teacher can edit students
    const isAdmin = requester.status === 'Admin';
    const isTeacher = requester.status === 'Teacher';
    const isSelf = requester.email === targetEmail;
    
    if(!isSelf && !isAdmin && !isTeacher) return res.status(403).json({ error: 'Unauthorized' });
    if(!isSelf && isTeacher && target.status !== 'Student') return res.status(403).json({ error: 'Teachers can only edit students' });
    
    const updates = {};
    if(name !== undefined) updates.name = name;
    if(bio !== undefined) updates.bio = bio;
    if(classes !== undefined) updates.classes = JSON.stringify(classes);
    
    const setClause = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = [...Object.values(updates), targetEmail];
    
    await runSql(db, `UPDATE users SET ${setClause} WHERE email = ?`, values);
    
    res.json({ message: 'Profile updated' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// === Settings ===

app.put('/api/settings/password', authenticateAccessToken, async (req,res)=>{
  try{
    const { currentPassword, newPassword, repeatPassword } = req.body;
    if(!currentPassword || !newPassword || !repeatPassword)
      return res.status(400).json({ error: 'Missing fields' });
    
    if(newPassword !== repeatPassword)
      return res.status(400).json({ error: 'Repeated password does not match. Please try again.' });
    
    const user = await getUserByEmail(req.auth.email);
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if(!isValid) return res.status(401).json({ error: 'Current password is incorrect. Please try again.' });
    
    const hash = await bcrypt.hash(newPassword, 10);
    await runSql(db, 'UPDATE users SET password_hash = ? WHERE email = ?', [hash, req.auth.email]);
    
    res.json({ message: 'Password updated' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/settings/email-visibility', authenticateAccessToken, async (req,res)=>{
  try{
    const { email_public } = req.body;
    const val = email_public ? 1 : 0;
    await runSql(db, 'UPDATE users SET email_public = ? WHERE email = ?', [val, req.auth.email]);
    res.json({ message: 'Email visibility updated' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/settings/security-questions', authenticateAccessToken, async (req,res)=>{
  try{
    const { answers } = req.body;
    const answerCount = Object.keys(answers || {}).filter(k => answers[k]).length;
    if(answerCount < 4) return res.status(400).json({ error: 'At least 4 Security Questions are required. Please add more, then try again.' });
    
    const securityJson = JSON.stringify(answers);
    await runSql(db, 'UPDATE users SET security = ? WHERE email = ?', [securityJson, req.auth.email]);
    
    res.json({ message: 'Security Questions successfully updated!' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/settings/reset-profile', authenticateAccessToken, async (req,res)=>{
  try{
    await runSql(db, 'UPDATE users SET bio = ?, classes = ?, email_public = 0 WHERE email = ?', 
      ['', '[]', req.auth.email]);
    res.json({ message: 'Profile reset' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/settings/delete-account', authenticateAccessToken, async (req,res)=>{
  try{
    const email = req.auth.email;
    await runSql(db, 'DELETE FROM refresh_tokens WHERE user_id = (SELECT id FROM users WHERE email = ?)', [email]);
    await runSql(db, 'DELETE FROM users WHERE email = ?', [email]);
    
    res.clearCookie('accessToken', { httpOnly: true, sameSite: 'strict' });
    res.clearCookie('refreshToken', { httpOnly: true, sameSite: 'strict' });
    
    res.json({ message: 'Account deleted' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// === Study Buddies ===

app.get('/api/study-buddies/with-classes', authenticateAccessToken, async (req,res)=>{
  try{
    const user = await getUserByEmail(req.auth.email);
    const userClasses = user.classes ? JSON.parse(user.classes) : [];
    
    if(userClasses.length === 0) return res.json({ hasClasses: false });
    
    // Get all approved users with shared classes, excluding self and already messaged
    const query = `
      SELECT DISTINCT u.* FROM users u
      WHERE u.email != ? AND u.approved = 1
      AND (u.classes LIKE ${userClasses.map(() => '?').join(' OR u.classes LIKE ')})
      ORDER BY RANDOM()
      LIMIT 5
    `;
    const patterns = userClasses.map(c => `%"${c}"%`);
    const buddies = await allSql(db, query, [req.auth.email, ...patterns]);
    
    res.json({ hasClasses: true, buddies: buddies.map(b => sanitizeUserRow(b)) });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/study-buddies/shared-classes', authenticateAccessToken, async (req,res)=>{
  try{
    const user = await getUserByEmail(req.auth.email);
    const userClasses = user.classes ? JSON.parse(user.classes) : [];
    
    if(userClasses.length === 0) return res.json({ users: [] });
    
    const q = (req.query.q || '').trim();
    const qlike = `%${q}%`;
    const classPatterns = userClasses.map(c => `%"${c}"%`);
    
    let query = `
      SELECT DISTINCT u.* FROM users u
      WHERE u.email != ? AND u.approved = 1 AND u.status = 'Student'
      AND (${classPatterns.map(() => 'u.classes LIKE ?').join(' OR ')})
    `;
    const params = [req.auth.email, ...classPatterns];
    
    if(q){
      query += ` AND (u.name LIKE ? OR u.bio LIKE ?)`;
      params.push(qlike, qlike);
    }
    
    query += ` ORDER BY u.name ASC`;
    
    const users = await allSql(db, query, params);
    res.json({ users: users.map(u => sanitizeUserRow(u)) });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/study-buddies/invite', authenticateAccessToken, async (req,res)=>{
  try{
    const { toEmail } = req.body;
    if(!toEmail) return res.status(400).json({ error: 'Missing toEmail' });
    
    await runSql(db, 'INSERT OR IGNORE INTO study_buddy_invites (from_email, to_email, status) VALUES (?,?,?)',
      [req.auth.email, toEmail, 'pending']);
    
    await runSql(db, 'INSERT INTO notifications (title, body, to_email) VALUES (?,?,?)',
      ['Study Buddy Invite', `You have been invited to study with ${(await getUserByEmail(req.auth.email)).name}. Accept/Decline in the Study Buddies tab.`, toEmail]);
    
    res.status(201).json({ message: 'Invite sent' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/study-buddies/invites', authenticateAccessToken, async (req,res)=>{
  try{
    const invites = await allSql(db, 'SELECT * FROM study_buddy_invites WHERE to_email = ? AND status = ?', 
      [req.auth.email, 'pending']);
    res.json({ invites });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/study-buddies/respond', authenticateAccessToken, async (req,res)=>{
  try{
    const { inviteId, response } = req.body;
    if(!inviteId || !response) return res.status(400).json({ error: 'Missing fields' });
    
    const invite = await getSql(db, 'SELECT * FROM study_buddy_invites WHERE id = ?', [inviteId]);
    if(!invite) return res.status(404).json({ error: 'Invite not found' });
    if(invite.to_email !== req.auth.email) return res.status(403).json({ error: 'Unauthorized' });
    
    const newStatus = response === 'accept' ? 'accepted' : 'declined';
    await runSql(db, 'UPDATE study_buddy_invites SET status = ? WHERE id = ?', [newStatus, inviteId]);
    
    const title = response === 'accept' ? 'Study Buddy Invite Accepted' : 'Study Buddy Invite Declined';
    const currentUser = await getUserByEmail(req.auth.email);
    const body = response === 'accept' 
      ? `${currentUser.name} has accepted your invite!`
      : `${currentUser.name} has declined your invite.`;
    
    await runSql(db, 'INSERT INTO notifications (title, body, to_email) VALUES (?,?,?)',
      [title, body, invite.from_email]);
    
    res.json({ message: 'Response recorded' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// === Admin Dashboard - User Management ===

app.post('/api/admin/promote-user', authenticateAccessToken, async (req,res)=>{
  try{
    const { userEmail, newStatus } = req.body;
    if(!userEmail || !newStatus) return res.status(400).json({ error: 'Missing fields' });
    
    const requester = await getUserByEmail(req.auth.email);
    if(requester.status !== 'Admin') return res.status(403).json({ error: 'Unauthorized' });
    
    const target = await getUserByEmail(userEmail);
    if(!target) return res.status(404).json({ error: 'User not found' });
    
    // Admins can't change other admins' status
    if(target.status === 'Admin') return res.status(403).json({ error: 'Cannot change admin status' });
    
    await runSql(db, 'UPDATE users SET status = ? WHERE email = ?', [newStatus, userEmail]);
    
    res.json({ message: 'User status updated' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/suspend-user', authenticateAccessToken, async (req,res)=>{
  try{
    const { userEmail, suspendUntil } = req.body;
    if(!userEmail || !suspendUntil) return res.status(400).json({ error: 'Missing fields' });
    
    const requester = await getUserByEmail(req.auth.email);
    if(requester.status !== 'Admin' && requester.status !== 'Teacher') return res.status(403).json({ error: 'Unauthorized' });
    
    const target = await getUserByEmail(userEmail);
    if(!target) return res.status(404).json({ error: 'User not found' });
    if(target.status !== 'Student') return res.status(403).json({ error: 'Can only suspend students' });
    
    await runSql(db, 'UPDATE users SET suspended_until = ? WHERE email = ?', [suspendUntil, userEmail]);
    
    res.json({ message: 'User suspended' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/admin/unsuspend-user', authenticateAccessToken, async (req,res)=>{
  try{
    const { userEmail } = req.body;
    if(!userEmail) return res.status(400).json({ error: 'Missing userEmail' });
    
    const requester = await getUserByEmail(req.auth.email);
    if(requester.status !== 'Admin' && requester.status !== 'Teacher') return res.status(403).json({ error: 'Unauthorized' });
    
    await runSql(db, 'UPDATE users SET suspended_until = NULL WHERE email = ?', [userEmail]);
    
    res.json({ message: 'User unsuspended' });
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
    const rows = await allSql(db, 'SELECT * FROM notifications WHERE to_email = ? AND created_at > datetime("now","-30 days") ORDER BY created_at DESC', [to]);
    res.json({ notifications: rows });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.put('/api/notifications/:id', authenticateAccessToken, async (req,res)=>{
  try{
    const { read } = req.body;
    await runSql(db, 'UPDATE notifications SET read = ? WHERE id = ?', [read ? 1 : 0, req.params.id]);
    res.json({ message: 'Notification updated' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.delete('/api/notifications/:id', authenticateAccessToken, async (req,res)=>{
  try{
    await runSql(db, 'DELETE FROM notifications WHERE id = ?', [req.params.id]);
    res.json({ message: 'Notification deleted' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/maintenance/cleanup_notifications', async (req,res)=>{
  try{
    await runSql(db, `DELETE FROM notifications WHERE created_at < datetime('now','-30 days')`);
    res.json({ message: 'cleaned' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.listen(PORT, ()=>{ console.log('Server listening on', PORT); });
