// server.js - Express server with SQLite and JWT authentication
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const fs = require('fs');

const DB_FILE = path.join(__dirname, 'data.sqlite3');
const JWT_SECRET = process.env.JWT_SECRET || 'change_this_secret_in_prod';
const PORT = process.env.PORT || 3000;

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
app.use(cors());
app.use(bodyParser.json());

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

function generateToken(payload){
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '7d' });
}

async function getUserByEmail(email){
  const row = await getSql(db, 'SELECT * FROM users WHERE email = ?', [email]);
  if(!row) return null;
  row.classes = row.classes || '[]';
  return row;
}

// JWT middleware
function authenticateJWT(req,res,next){
  const auth = req.headers.authorization;
  if(!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'Missing token' });
  const token = auth.slice('Bearer '.length);
  jwt.verify(token, JWT_SECRET, (err, payload)=>{
    if(err) return res.status(401).json({ error: 'Invalid token' });
    req.auth = payload; // contains email, status
    next();
  });
}

// Auth endpoints
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
    const token = generateToken({ email: row.email, status: row.status });
    const user = sanitizeUserRow(row);
    return res.json({ token, user });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Users
app.get('/api/users', authenticateJWT, async (req,res)=>{
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

app.get('/api/users/:email', authenticateJWT, async (req,res)=>{
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

// Chats
app.post('/api/chats', authenticateJWT, async (req,res)=>{
  try{
    const { id, type, participants, name } = req.body;
    if(!id || !type || !participants) return res.status(400).json({ error: 'Missing fields' });
    const participantsJson = JSON.stringify(participants);
    await runSql(db, 'INSERT OR REPLACE INTO chats (id,type,name,participants) VALUES (?,?,?,?)', [id,type,name||'',participantsJson]);
    res.status(201).json({ message: 'created' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/chats', authenticateJWT, async (req,res)=>{
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

app.get('/api/chats/:id/messages', authenticateJWT, async (req,res)=>{
  try{
    const id = req.params.id;
    const msgs = await allSql(db, 'SELECT * FROM messages WHERE chat_id = ? ORDER BY id ASC', [id]);
    res.json({ messages: msgs });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/chats/:id/messages', authenticateJWT, async (req,res)=>{
  try{
    const id = req.params.id;
    const { text } = req.body;
    if(!text) return res.status(400).json({ error: 'Missing text' });
    const sender = req.auth.email;
    await runSql(db, 'INSERT INTO messages (chat_id,sender,text) VALUES (?,?,?)', [id,sender,text]);
    res.status(201).json({ message: 'sent' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

// Notifications - simple
app.post('/api/notifications', authenticateJWT, async (req,res)=>{
  try{
    const { title, body, to_email } = req.body;
    if(!title || !body || !to_email) return res.status(400).json({ error: 'Missing fields' });
    await runSql(db, 'INSERT INTO notifications (title,body,to_email) VALUES (?,?,?)', [title,body,to_email]);
    res.status(201).json({ message: 'created' });
  }catch(err){ console.error(err); res.status(500).json({ error: 'Server error' }); }
});

app.get('/api/notifications', authenticateJWT, async (req,res)=>{
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
