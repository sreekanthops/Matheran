const express = require('express');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');
const multer = require('multer');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'trek.db.bin');
const UPLOADS_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

app.use(express.json({ limit: '50mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ── Multer ─────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const folder = req.params.folder || 'General';
    const dir = path.join(UPLOADS_DIR, folder);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, Date.now() + '_' + safe);
  }
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ── Database ───────────────────────────────────────────────
let db;

async function openDB() {
  const SQL = await initSqlJs();
  db = fs.existsSync(DB_FILE)
    ? new SQL.Database(fs.readFileSync(DB_FILE))
    : new SQL.Database();

  db.run(`PRAGMA journal_mode=WAL;`);
  db.run(`
    CREATE TABLE IF NOT EXISTS members (
      id    INTEGER PRIMARY KEY AUTOINCREMENT,
      name  TEXT NOT NULL UNIQUE,
      phone TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS expenses (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      payer_id   INTEGER NOT NULL,
      desc       TEXT NOT NULL,
      amount     REAL NOT NULL,
      category   TEXT NOT NULL DEFAULT 'Misc',
      created_at TEXT NOT NULL DEFAULT (strftime('%d/%m/%Y', 'now'))
    );
    CREATE TABLE IF NOT EXISTS checklist (
      id       INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL,
      item     TEXT NOT NULL,
      done     INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS folders (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
    );
    CREATE TABLE IF NOT EXISTS photos (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      folder_id  INTEGER NOT NULL REFERENCES folders(id),
      filename   TEXT NOT NULL,
      orig_name  TEXT NOT NULL,
      uploaded_at TEXT NOT NULL DEFAULT (strftime('%d/%m/%Y %H:%M', 'now'))
    );
    CREATE TABLE IF NOT EXISTS activity_log (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      user_name  TEXT NOT NULL,
      action     TEXT NOT NULL,
      detail     TEXT NOT NULL DEFAULT '',
      ts         TEXT NOT NULL DEFAULT (strftime('%d/%m/%Y %H:%M', 'now'))
    );
    CREATE TABLE IF NOT EXISTS locations (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      member_id INTEGER NOT NULL UNIQUE,
      lat       REAL NOT NULL,
      lng       REAL NOT NULL,
      accuracy  REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT (strftime('%d/%m/%Y %H:%M', 'now'))
    );
  `);
  // Migrate: add phone column if not present
  try { db.run(`ALTER TABLE members ADD COLUMN phone TEXT NOT NULL DEFAULT ''`); save(); } catch(_) {}

  // Seed members
  if (get('SELECT COUNT(*) as c FROM members').c === 0) {
    ['Sreekanth','Pooja','Sai','Naresh','Prashant','Vijay','Sonal',
     'Divya','Shruti','Suresh','Sohan','Vinay','Swapna']
      .forEach(n => db.run('INSERT OR IGNORE INTO members (name) VALUES (?)', [n]));
  }

  // Seed checklist
  if (get('SELECT COUNT(*) as c FROM checklist').c === 0) {
    [
      ['clothing','T-shirts (3-4)'],['clothing','Shorts / Track pants'],
      ['clothing','Light jacket / Sweater'],['clothing','Innerwear & socks (extra)'],
      ['clothing','Comfortable walking shoes'],['clothing','Flip flops'],
      ['clothing','Raincoat / Poncho'],['clothing','Cap / Hat'],['clothing','Sunglasses'],
      ['toiletries','Toothbrush & toothpaste'],['toiletries','Sunscreen SPF50+'],
      ['toiletries','Moisturizer'],['toiletries','Insect repellent (Odomos)'],
      ['toiletries','Hand sanitizer'],['toiletries','Wet wipes'],
      ['toiletries','Tissues'],['toiletries','Personal medicines'],
      ['toiletries','Pain balm (Iodex / Volini)'],['toiletries','Band-aids'],
      ['trekking','Trekking shoes (must!)'],['trekking','Water bottle (2L)'],
      ['trekking','Backpack (20-30L)'],['trekking','Rainproof bag cover'],
      ['trekking','Torch / Headlamp + extra batteries'],['trekking','Whistle'],
      ['trekking','Energy bars / trail mix'],['trekking','Walking stick (optional)'],
      ['electronics','Phone charger'],['electronics','Power bank (10000mAh+)'],
      ['electronics','Camera'],['electronics','Earphones'],
      ['electronics','Offline maps saved (Google Maps)'],['electronics','OTT downloaded'],
      ['food','Energy bars'],['food','Dry fruits & nuts'],
      ['food','Glucose / ORS packets'],['food','Chocolates'],['food','Chewing gum'],
      ['docs','Aadhar / ID proof'],['docs','Resort booking confirmation'],
      ['docs','Emergency contacts list (printed)'],['docs','Cash (₹2000-3000)'],
      ['firstaid','Paracetamol (Crocin 500mg)'],['firstaid','Antacid (Gelusil / Digene)'],
      ['firstaid','ORS sachets (5-6)'],['firstaid','Betadine antiseptic'],
      ['firstaid','Crepe bandage'],['firstaid','Moov / Volini spray'],
      ['firstaid','Motion sickness tablets (Avomine)'],['firstaid','Antihistamine (Cetirizine)'],
      ['firstaid','Diarrhea medication (Norflox)'],['firstaid','Salt (for leeches!)'],
      ['firstaid','Glucose-D powder'],['firstaid','Scissors + safety pins'],
    ].forEach(([c, i]) => db.run('INSERT INTO checklist (category,item) VALUES (?,?)', [c, i]));
  }

  // Seed default folders
  if (get('SELECT COUNT(*) as c FROM folders').c === 0) {
    ['General','Day 1 - 29 Aug Arrival','Day 2 - 30 Aug Trek & Games','Pool & DJ Night','Group Selfies','Viewpoints']
      .forEach(n => db.run('INSERT OR IGNORE INTO folders (name) VALUES (?)', [n]));
  }

  save();
}

function save() {
  fs.writeFileSync(DB_FILE, Buffer.from(db.export()));
}

// Returns current time as "dd/mm/yyyy HH:MM" in IST (UTC+5:30)
function istNow() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const dd = String(ist.getUTCDate()).padStart(2,'0');
  const mm = String(ist.getUTCMonth()+1).padStart(2,'0');
  const yyyy = ist.getUTCFullYear();
  const hh = String(ist.getUTCHours()).padStart(2,'0');
  const min = String(ist.getUTCMinutes()).padStart(2,'0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}
function istDate() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  const dd = String(ist.getUTCDate()).padStart(2,'0');
  const mm = String(ist.getUTCMonth()+1).padStart(2,'0');
  return `${dd}/${mm}/${ist.getUTCFullYear()}`;
}

function all(sql, params = []) {
  const [res] = db.exec(sql, params);
  if (!res) return [];
  return res.values.map(row => {
    const obj = {}; res.columns.forEach((c, i) => obj[c] = row[i]); return obj;
  });
}
function get(sql, params = []) { return all(sql, params)[0] || null; }
function run(sql, params = []) { db.run(sql, params); save(); }

// ═══════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════
app.post('/api/login', (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name required' });
  const member = get('SELECT * FROM members WHERE LOWER(name)=LOWER(?)', [name]);
  if (!member) return res.status(404).json({ error: 'Name not found. Ask the trip organiser to add you.' });
  logActivity(member.name, 'logged in', '');
  res.json({ id: member.id, name: member.name });
});

// ═══════════════════════════════════════════════════════════
//  ACTIVITY LOG
// ═══════════════════════════════════════════════════════════
function logActivity(user, action, detail) {
  try { run('INSERT INTO activity_log (user_name,action,detail,ts) VALUES (?,?,?,?)', [user, action, detail, istNow()]); } catch(_) {}
}

app.get('/api/activity', (_req, res) => {
  res.json(all('SELECT * FROM activity_log ORDER BY id DESC LIMIT 50'));
});

// ═══════════════════════════════════════════════════════════
//  MEMBERS
// ═══════════════════════════════════════════════════════════
app.get('/api/members', (_req, res) => res.json(all('SELECT * FROM members ORDER BY id')));

app.post('/api/members', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  if (get('SELECT id FROM members WHERE name=?', [name.trim()])) return res.status(400).json({ error: 'Name already exists' });
  run('INSERT INTO members (name) VALUES (?)', [name.trim()]);
  res.json(get('SELECT * FROM members WHERE name=?', [name.trim()]));
});

app.put('/api/members/:id/phone', (req, res) => {
  const { phone } = req.body;
  if (phone === undefined) return res.status(400).json({ error: 'phone required' });
  run('UPDATE members SET phone=? WHERE id=?', [phone.trim(), +req.params.id]);
  res.json(get('SELECT * FROM members WHERE id=?', [+req.params.id]));
});

app.delete('/api/members/:id', (req, res) => {
  if (get('SELECT COUNT(*) as c FROM members').c <= 2) return res.status(400).json({ error: 'Need at least 2 members' });
  run('DELETE FROM members WHERE id=?', [+req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  LOCATIONS
// ═══════════════════════════════════════════════════════════
app.post('/api/location', (req, res) => {
  const { member_id, lat, lng, accuracy } = req.body;
  if (!member_id || lat == null || lng == null) return res.status(400).json({ error: 'Missing fields' });
  const ts = istNow();
  run(`INSERT INTO locations (member_id, lat, lng, accuracy, updated_at)
       VALUES (?,?,?,?,?)
       ON CONFLICT(member_id) DO UPDATE SET lat=excluded.lat, lng=excluded.lng,
         accuracy=excluded.accuracy, updated_at=excluded.updated_at`,
      [+member_id, parseFloat(lat), parseFloat(lng), parseFloat(accuracy || 0), ts]);
  res.json({ ok: true });
});

app.get('/api/locations', (_req, res) => {
  res.json(all(`SELECT l.*, m.name FROM locations l JOIN members m ON l.member_id=m.id`));
});

// ═══════════════════════════════════════════════════════════
//  EXPENSES
// ═══════════════════════════════════════════════════════════
const EXP_SEL = `SELECT e.id,e.desc,e.amount,e.category,e.created_at,m.id as payer_id,m.name as payer_name FROM expenses e JOIN members m ON e.payer_id=m.id`;

app.get('/api/expenses', (_req, res) => res.json(all(EXP_SEL + ' ORDER BY e.id DESC')));

app.post('/api/expenses', (req, res) => {
  const { payer_id, desc, amount, category, logged_by } = req.body;
  if (!payer_id || !desc || !amount) return res.status(400).json({ error: 'Missing fields' });
  run('INSERT INTO expenses (payer_id,desc,amount,category,created_at) VALUES (?,?,?,?,?)',
      [+payer_id, desc.trim(), parseFloat(amount), category || 'Misc', istDate()]);
  const row = all(EXP_SEL + ' ORDER BY e.id DESC LIMIT 1')[0];
  if (logged_by) logActivity(logged_by, 'added expense', `${desc} ₹${amount}`);
  res.json(row);
});

app.put('/api/expenses/:id', (req, res) => {
  const { payer_id, desc, amount, category, logged_by } = req.body;
  run('UPDATE expenses SET payer_id=?,desc=?,amount=?,category=? WHERE id=?',
      [+payer_id, desc.trim(), parseFloat(amount), category, +req.params.id]);
  if (logged_by) logActivity(logged_by, 'edited expense', `${desc} ₹${amount}`);
  res.json(get(EXP_SEL + ' WHERE e.id=?', [+req.params.id]));
});

app.delete('/api/expenses/:id', (req, res) => {
  const { logged_by } = req.body || {};
  const e = get('SELECT desc,amount FROM expenses WHERE id=?', [+req.params.id]);
  run('DELETE FROM expenses WHERE id=?', [+req.params.id]);
  if (logged_by && e) logActivity(logged_by, 'deleted expense', `${e.desc} ₹${e.amount}`);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  CHECKLIST
// ═══════════════════════════════════════════════════════════
app.get('/api/checklist', (_req, res) => res.json(all('SELECT * FROM checklist ORDER BY category,id')));

app.post('/api/checklist', (req, res) => {
  const { category, item, logged_by } = req.body;
  if (!category || !item) return res.status(400).json({ error: 'Missing fields' });
  run('INSERT INTO checklist (category,item) VALUES (?,?)', [category, item.trim()]);
  if (logged_by) logActivity(logged_by, 'added packing item', item.trim());
  res.json(all('SELECT * FROM checklist ORDER BY id DESC LIMIT 1')[0]);
});

app.put('/api/checklist/:id', (req, res) => {
  const done = req.body.done ? 1 : 0;
  const { logged_by } = req.body;
  const it = get('SELECT item FROM checklist WHERE id=?', [+req.params.id]);
  run('UPDATE checklist SET done=? WHERE id=?', [done, +req.params.id]);
  if (logged_by && it) logActivity(logged_by, done ? 'checked packing item' : 'unchecked packing item', it.item);
  res.json({ ok: true });
});

app.delete('/api/checklist/:id', (req, res) => {
  const { logged_by } = req.body || {};
  const it = get('SELECT item FROM checklist WHERE id=?', [+req.params.id]);
  run('DELETE FROM checklist WHERE id=?', [+req.params.id]);
  if (logged_by && it) logActivity(logged_by, 'removed packing item', it.item);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  FOLDERS
// ═══════════════════════════════════════════════════════════
app.get('/api/folders', (_req, res) => {
  const rows = all('SELECT * FROM folders ORDER BY id');
  rows.forEach(f => {
    f.count = get('SELECT COUNT(*) as c FROM photos WHERE folder_id=?', [f.id])?.c || 0;
  });
  res.json(rows);
});

app.post('/api/folders', (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  if (get('SELECT id FROM folders WHERE name=?', [name.trim()])) return res.status(400).json({ error: 'Folder exists' });
  run('INSERT INTO folders (name) VALUES (?)', [name.trim()]);
  const f = get('SELECT * FROM folders WHERE name=?', [name.trim()]);
  f.count = 0;
  res.json(f);
});

app.delete('/api/folders/:id', (req, res) => {
  const photos = all('SELECT filename,folder_id FROM photos WHERE folder_id=?', [+req.params.id]);
  const folder = get('SELECT name FROM folders WHERE id=?', [+req.params.id]);
  photos.forEach(p => {
    const fp = path.join(UPLOADS_DIR, folder.name, p.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  run('DELETE FROM photos WHERE folder_id=?', [+req.params.id]);
  run('DELETE FROM folders WHERE id=?', [+req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  PHOTOS
// ═══════════════════════════════════════════════════════════
app.get('/api/folders/:folderId/photos', (req, res) => {
  res.json(all('SELECT * FROM photos WHERE folder_id=? ORDER BY id DESC', [+req.params.folderId]));
});

app.post('/api/folders/:folder/upload', (req, res, next) => {
  upload.array('photos', 30)(req, res, err => {
    if (err) return res.status(400).json({ error: err.message });
    const folderName = req.params.folder;
    const logged_by = req.query.logged_by || '';
    let frow = get('SELECT * FROM folders WHERE name=?', [folderName]);
    if (!frow) {
      run('INSERT OR IGNORE INTO folders (name) VALUES (?)', [folderName]);
      frow = get('SELECT * FROM folders WHERE name=?', [folderName]);
    }
    const inserted = [];
    (req.files || []).forEach(f => {
      run('INSERT INTO photos (folder_id,filename,orig_name,uploaded_at) VALUES (?,?,?,?)',
          [frow.id, f.filename, f.originalname, istNow()]);
      inserted.push(all('SELECT * FROM photos ORDER BY id DESC LIMIT 1')[0]);
    });
    if (logged_by && inserted.length) logActivity(logged_by, 'uploaded photos', `${inserted.length} photo(s) to "${folderName}"`);
    res.json(inserted);
  });
});

app.delete('/api/photos/:id', (req, res) => {
  const { logged_by } = req.body || {};
  const p = get('SELECT p.*,f.name as folder_name FROM photos p JOIN folders f ON p.folder_id=f.id WHERE p.id=?', [+req.params.id]);
  if (p) {
    const fp = path.join(UPLOADS_DIR, p.folder_name, p.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
    run('DELETE FROM photos WHERE id=?', [+req.params.id]);
    if (logged_by) logActivity(logged_by, 'deleted photo', p.orig_name);
  }
  res.json({ ok: true });
});

app.delete('/api/folders/:folderId/photos', (req, res) => {
  const folder = get('SELECT name FROM folders WHERE id=?', [+req.params.folderId]);
  const photos = all('SELECT filename FROM photos WHERE folder_id=?', [+req.params.folderId]);
  photos.forEach(p => {
    const fp = path.join(UPLOADS_DIR, folder.name, p.filename);
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  });
  run('DELETE FROM photos WHERE folder_id=?', [+req.params.folderId]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  CHAT
// ═══════════════════════════════════════════════════════════

// Ensure chat table exists (migration-safe)
function ensureChat() {
  db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id  INTEGER NOT NULL,
    name       TEXT NOT NULL,
    msg        TEXT NOT NULL,
    ts         TEXT NOT NULL,
    reply_to   INTEGER DEFAULT NULL
  );`);
  try { save(); } catch(_) {}
}

// GET /api/chat?since=<id>  — returns messages newer than id (default all, max 200)
app.get('/api/chat', (req, res) => {
  ensureChat();
  const since = parseInt(req.query.since) || 0;
  const rows = all(
    'SELECT * FROM chat_messages WHERE id > ? ORDER BY id ASC LIMIT 200',
    [since]
  );
  const total = get('SELECT COUNT(*) as c FROM chat_messages').c || 0;
  res.json({ messages: rows, total });
});

// POST /api/chat  — send a message
app.post('/api/chat', (req, res) => {
  ensureChat();
  const { member_id, name, msg, reply_to } = req.body;
  if (!member_id || !name || !msg?.trim()) return res.status(400).json({ error: 'Missing fields' });
  run(
    'INSERT INTO chat_messages (member_id, name, msg, ts, reply_to) VALUES (?,?,?,?,?)',
    [+member_id, name, msg.trim(), istNow(), reply_to || null]
  );
  const row = all('SELECT * FROM chat_messages ORDER BY id DESC LIMIT 1')[0];
  res.json(row);
});

// DELETE /api/chat/:id  — delete own message
app.delete('/api/chat/:id', (req, res) => {
  const { member_id } = req.body || {};
  const m = get('SELECT * FROM chat_messages WHERE id=?', [+req.params.id]);
  if (!m) return res.status(404).json({ error: 'Not found' });
  if (m.member_id !== +member_id) return res.status(403).json({ error: 'Not your message' });
  run('DELETE FROM chat_messages WHERE id=?', [+req.params.id]);
  res.json({ ok: true });
});

// ── Catch-all ──────────────────────────────────────────────
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ── Start ──────────────────────────────────────────────────
openDB().then(() =>
  app.listen(PORT, () => console.log(`\n🏔️  Matheran Trek → http://localhost:${PORT}\n`))
);
