const express = require('express');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

const DB_FILE = path.join(__dirname, 'data.sqlite3');
const db = new sqlite3.Database(DB_FILE);

// Initialize DB
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    password_hash TEXT,
    approved INTEGER DEFAULT 0,
    status TEXT DEFAULT 'Student',
    bio TEXT DEFAULT '',
    classes TEXT DEFAULT '[]',
    suspended INTEGER DEFAULT 0,
    suspended_until TEXT,
    security TEXT DEFAULT '{}',
    settings TEXT DEFAULT '{}'
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS chats (
    id TEXT PRIMARY KEY,
    type TEXT,
    title TEXT,
    participants TEXT,
    created_at TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id TEXT,
    sender TEXT,
    text TEXT,
    ts TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    to_email TEXT,
    title TEXT,
    body TEXT,
    read INTEGER DEFAULT 0,
    created_at TEXT
  )`);

  // Seed admin account if not exists
  const adminEmail = 'athayacraven+admin@gmail.com';
  db.get('SELECT * FROM users WHERE email = ?', [adminEmail], (err, row) => {
    if (err) return console.error(err);
    if (!row) {
      const passwordHash = bcrypt.hashSync('Admin', 10);
      const security = JSON.stringify({ q1: 'Ferb', q2: 'Reza', q3: 'San Diego', q5: 'Joy', q6: 'Hannah', q9: 'August 11' });
      const settings = JSON.stringify({ emailPublic: false });
      db.run(`INSERT INTO users (name,email,password_hash,approved,status,bio,classes,suspended,security,settings) VALUES (?,?,?,?,?,?,?,?,?,?)`,
        ['Admin', adminEmail, passwordHash, 1, 'Admin', '', JSON.stringify([]), 0, security, settings], (e) => {
          if (e) console.error('Failed to seed admin:', e);
          else console.log('Seeded admin account:', adminEmail);
        });
    }
  });
});

const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files (frontend)
app.use(express.static(path.join(__dirname)));

// API endpoints

// Signup
app.post('/api/auth/signup', (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
  const hash = bcrypt.hashSync(password, 10);
  const sql = `INSERT INTO users (name,email,password_hash,approved,status,bio,classes,suspended,security,settings) VALUES (?,?,?,?,?,?,?,?,?,?)`;
  db.run(sql, [name, email, hash, 0, 'Student', '', JSON.stringify([]), 0, JSON.stringify({}), JSON.stringify({ emailPublic:false })], function(err){
    if (err) return res.status(409).json({ error: 'Account already exists' });
    // create admin notifications - simplistic: fetch all admins and add a notification row per admin
    db.all(`SELECT email FROM users WHERE status = 'Admin'`, [], (err2, admins) =>{
      if(!err2 && admins && admins.length){
        const now = new Date().toISOString();
        const stmt = db.prepare(`INSERT INTO notifications (to_email,title,body,read,created_at) VALUES (?,?,?,?,?)`);
        admins.forEach(a=>{
          stmt.run(a.email, 'New Signup Awaiting Approval', `New signup: ${name} (${email}). Please review and approve.`, 0, now);
        });
        stmt.finalize();
      }
    });
    return res.status(201).json({ success: true });
  });
});

// Login
app.post('/api/auth/login', (req, res) =>{
  const { email, password } = req.body;
  if(!email || !password) return res.status(400).json({ error: 'Missing fields' });
  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err,row)=>{
    if(err) return res.status(500).json({ error: 'DB error' });
    if(!row) return res.status(401).json({ error: 'Invalid credentials' });
    if(!bcrypt.compareSync(password, row.password_hash)) return res.status(401).json({ error: 'Invalid credentials' });
    // return user object (without password hash)
    const user = Object.assign({}, row);
    delete user.password_hash;
    user.classes = JSON.parse(user.classes || '[]');
    user.security = JSON.parse(user.security || '{}');
    user.settings = JSON.parse(user.settings || '{}');
    res.json({ user });
  });
});

// Get users (with optional search)
app.get('/api/users', (req,res)=>{
  const q = req.query.q || '';
  if(q){
    const like = `%${q}%`;
    db.all(`SELECT id,name,email,approved,status,bio,classes,settings FROM users WHERE name LIKE ? OR bio LIKE ?`, [like,like], (err,rows)=>{
      if(err) return res.status(500).json({error:'DB'});
      rows.forEach(r=>{ r.classes = JSON.parse(r.classes || '[]'); r.settings = JSON.parse(r.settings || '{}'); });
      res.json({ users:rows });
    });
  } else {
    db.all(`SELECT id,name,email,approved,status,bio,classes,settings FROM users`, [], (err,rows)=>{
      if(err) return res.status(500).json({error:'DB'});
      rows.forEach(r=>{ r.classes = JSON.parse(r.classes || '[]'); r.settings = JSON.parse(r.settings || '{}'); });
      res.json({ users:rows });
    });
  }
});

// Get single user
app.get('/api/users/:email', (req,res)=>{
  const email = req.params.email;
  db.get(`SELECT id,name,email,approved,status,bio,classes,settings FROM users WHERE email = ?`, [email], (err,row)=>{
    if(err) return res.status(500).json({error:'DB'});
    if(!row) return res.status(404).json({error:'Not found'});
    row.classes = JSON.parse(row.classes || '[]'); row.settings = JSON.parse(row.settings || '{}');
    res.json({ user: row });
  });
});

// Update user (profile) - simple
app.put('/api/users/:email', (req,res)=>{
  const email = req.params.email;
  const { name, bio, classes, settings } = req.body;
  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err,row)=>{
    if(err) return res.status(500).json({error:'DB'});
    if(!row) return res.status(404).json({error:'Not found'});
    const newName = name || row.name;
    const newBio = bio !== undefined ? bio : row.bio;
    const newClasses = classes ? JSON.stringify(classes) : row.classes;
    const newSettings = settings ? JSON.stringify(settings) : row.settings;
    db.run(`UPDATE users SET name=?, bio=?, classes=?, settings=? WHERE email=?`, [newName,newBio,newClasses,newSettings,email], function(err2){
      if(err2) return res.status(500).json({error:'DB update'});
      res.json({ success:true });
    });
  });
});

// Admin approve
app.post('/api/admin/approve', (req,res)=>{
  const { email, status } = req.body;
  if(!email) return res.status(400).json({ error:'Missing email' });
  db.run(`UPDATE users SET approved=1, status=? WHERE email=?`, [status||'Student', email], function(err){
    if(err) return res.status(500).json({ error:'DB' });
    res.json({ success:true });
  });
});

// Notifications for user
app.get('/api/notifications', (req,res)=>{
  const to = req.query.to;
  if(!to) return res.status(400).json({ error:'Missing to query' });
  db.all(`SELECT id,to_email,title,body,read,created_at FROM notifications WHERE to_email = ? ORDER BY created_at DESC`, [to], (err,rows)=>{
    if(err) return res.status(500).json({ error:'DB' });
    res.json({ notifications: rows });
  });
});

app.post('/api/notifications', (req,res)=>{
  const { to_email, title, body } = req.body;
  if(!to_email||!title) return res.status(400).json({ error:'Missing fields' });
  const now = new Date().toISOString();
  db.run(`INSERT INTO notifications (to_email,title,body,read,created_at) VALUES (?,?,?,?,?)`, [to_email,title,body,0,now], function(err){
    if(err) return res.status(500).json({ error:'DB' });
    res.json({ success:true });
  });
});

// Chats
app.post('/api/chats', (req,res)=>{
  const { id, type, title, participants } = req.body; // participants should be array
  if(!id || !type || !participants) return res.status(400).json({ error:'Missing fields' });
  const now = new Date().toISOString();
  db.run(`INSERT INTO chats (id,type,title,participants,created_at) VALUES (?,?,?,?,?)`, [id,type,title||null, JSON.stringify(participants), now], function(err){
    if(err) return res.status(500).json({ error:'DB' });
    res.json({ success:true });
  });
});

app.get('/api/chats', (req,res)=>{
  const email = req.query.email;
  if(!email) return res.status(400).json({ error:'Missing email' });
  db.all(`SELECT id,type,title,participants,created_at FROM chats`, [], (err,rows)=>{
    if(err) return res.status(500).json({ error:'DB' });
    const filtered = rows.filter(r=> JSON.parse(r.participants || '[]').includes(email));
    filtered.forEach(r=> r.participants = JSON.parse(r.participants || '[]'));
    res.json({ chats: filtered });
  });
});

app.get('/api/chats/:id/messages', (req,res)=>{
  const id = req.params.id;
  db.all(`SELECT id,chat_id,sender,text,ts FROM messages WHERE chat_id = ? ORDER BY ts ASC`, [id], (err,rows)=>{
    if(err) return res.status(500).json({ error:'DB' });
    res.json({ messages: rows });
  });
});

app.post('/api/chats/:id/messages', (req,res)=>{
  const id = req.params.id;
  const { sender, text } = req.body;
  if(!sender || !text) return res.status(400).json({ error:'Missing fields' });
  const ts = new Date().toISOString();
  db.run(`INSERT INTO messages (chat_id,sender,text,ts) VALUES (?,?,?,?)`, [id,sender,text,ts], function(err){
    if(err) return res.status(500).json({ error:'DB' });
    // notify participants
    db.get(`SELECT participants FROM chats WHERE id = ?`, [id], (err2,row)=>{
      if(!err2 && row){
        const participants = JSON.parse(row.participants || '[]');
        const stmt = db.prepare(`INSERT INTO notifications (to_email,title,body,read,created_at) VALUES (?,?,?,?,?)`);
        participants.filter(p=>p!==sender).forEach(p=>{
          stmt.run(p, `New Message from ${sender}`, `You have received a new message from ${sender}.`, 0, ts);
        });
        stmt.finalize();
      }
    });
    res.json({ success:true });
  });
});

// Delete old notifications older than 30 days - maintenance endpoint
app.post('/api/maintenance/cleanup_notifications', (req,res)=>{
  const cutoff = new Date(Date.now() - 1000*60*60*24*30).toISOString();
  db.run(`DELETE FROM notifications WHERE created_at < ?`, [cutoff], function(err){
    if(err) return res.status(500).json({ error:'DB' });
    res.json({ deleted: this.changes });
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>{ console.log(`Server listening on ${PORT}`); });
