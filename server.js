const express = require('express');
const path = require('path');
const fs = require('fs');
const initSqlJs = require('sql.js');

const app = express();
const PORT = 3000;
const DB_FILE = path.join(__dirname, 'trek.db.bin');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ── Bootstrap DB ──────────────────────────────────────────
let db;

async function openDB() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_FILE)) {
    db = new SQL.Database(fs.readFileSync(DB_FILE));
  } else {
    db = new SQL.Database();
  }
  db.run(`PRAGMA journal_mode=WAL;`);
  db.run(`
    CREATE TABLE IF NOT EXISTS members (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
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
  `);

  // Seed members
  const mc = db.exec('SELECT COUNT(*) as c FROM members')[0];
  if (mc.values[0][0] === 0) {
    ['Sreekanth','Pooja','Sai','Naresh','Prashant','Vijay','Sonal',
     'Divya','Shruti','Suresh','Sohan','Vinay','Swapna'].forEach(n => {
      db.run('INSERT OR IGNORE INTO members (name) VALUES (?)', [n]);
    });
  }

  // Seed checklist
  const cc = db.exec('SELECT COUNT(*) as c FROM checklist')[0];
  if (cc.values[0][0] === 0) {
    const items = [
      ['clothing','T-shirts (3-4)'],['clothing','Shorts / Track pants'],
      ['clothing','Light jacket'],['clothing','Innerwear & socks (extra)'],
      ['clothing','Comfortable walking shoes'],['clothing','Flip flops'],
      ['clothing','Raincoat / Poncho'],['clothing','Cap / Hat'],['clothing','Sunglasses'],
      ['toiletries','Toothbrush & toothpaste'],['toiletries','Sunscreen SPF50+'],
      ['toiletries','Moisturizer'],['toiletries','Insect repellent'],
      ['toiletries','Hand sanitizer'],['toiletries','Wet wipes'],
      ['toiletries','Tissues'],['toiletries','Personal medicines'],
      ['toiletries','Pain balm'],['toiletries','Band-aids'],
      ['trekking','Trekking shoes (must!)'],['trekking','Water bottle (2L)'],
      ['trekking','Backpack (20-30L)'],['trekking','Rainproof bag cover'],
      ['trekking','Torch / Headlamp'],['trekking','Extra batteries'],
      ['trekking','Whistle'],['trekking','Energy bars'],
      ['electronics','Phone charger'],['electronics','Power bank'],
      ['electronics','Camera'],['electronics','Earphones'],
      ['electronics','Offline maps saved'],
      ['food','Energy bars'],['food','Dry fruits & nuts'],
      ['food','Biscuits'],['food','Glucose / ORS packets'],['food','Chocolates'],
      ['docs','Aadhar / ID proof'],['docs','Resort booking confirmation'],
      ['docs','Emergency contacts list'],['docs','Cash (₹2000-3000)']
    ];
    items.forEach(([c, i]) => db.run('INSERT INTO checklist (category,item) VALUES (?,?)', [c, i]));
  }
  save();
}

function save() {
  const data = db.export();
  fs.writeFileSync(DB_FILE, Buffer.from(data));
}

// ── Query helpers ─────────────────────────────────────────
function all(sql, params = []) {
  const [res] = db.exec(sql, params);
  if (!res) return [];
  return res.values.map(row => {
    const obj = {};
    res.columns.forEach((c, i) => obj[c] = row[i]);
    return obj;
  });
}
function get(sql, params = []) { return all(sql, params)[0] || null; }
function run(sql, params = []) { db.run(sql, params); save(); }

// ═══════════════════════════════════════════════════════════
//  MEMBERS
// ═══════════════════════════════════════════════════════════
app.get('/api/members', (_req, res) => {
  res.json(all('SELECT * FROM members ORDER BY id'));
});

app.post('/api/members', (req, res) => {
  const { name } = req.body;
  if (!name || !name.trim()) return res.status(400).json({ error: 'Name required' });
  const exists = get('SELECT id FROM members WHERE name=?', [name.trim()]);
  if (exists) return res.status(400).json({ error: 'Name already exists' });
  run('INSERT INTO members (name) VALUES (?)', [name.trim()]);
  const row = get('SELECT * FROM members WHERE name=?', [name.trim()]);
  res.json(row);
});

app.delete('/api/members/:id', (req, res) => {
  const count = get('SELECT COUNT(*) as c FROM members').c;
  if (count <= 2) return res.status(400).json({ error: 'Need at least 2 members' });
  run('DELETE FROM members WHERE id=?', [+req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  EXPENSES
// ═══════════════════════════════════════════════════════════
const EXP_SELECT = `
  SELECT e.id, e.desc, e.amount, e.category, e.created_at,
         m.id as payer_id, m.name as payer_name
  FROM expenses e JOIN members m ON e.payer_id = m.id
`;

app.get('/api/expenses', (_req, res) => {
  res.json(all(EXP_SELECT + ' ORDER BY e.id DESC'));
});

app.post('/api/expenses', (req, res) => {
  const { payer_id, desc, amount, category } = req.body;
  if (!payer_id || !desc || !amount) return res.status(400).json({ error: 'Missing fields' });
  run('INSERT INTO expenses (payer_id,desc,amount,category) VALUES (?,?,?,?)',
      [+payer_id, desc.trim(), parseFloat(amount), category || 'Misc']);
  const row = get(EXP_SELECT + ' WHERE e.id = last_insert_rowid()');
  // fallback if last_insert_rowid trick not available in sql.js
  const row2 = row || all(EXP_SELECT + ' ORDER BY e.id DESC LIMIT 1')[0];
  res.json(row2);
});

app.put('/api/expenses/:id', (req, res) => {
  const { payer_id, desc, amount, category } = req.body;
  run('UPDATE expenses SET payer_id=?,desc=?,amount=?,category=? WHERE id=?',
      [+payer_id, desc.trim(), parseFloat(amount), category, +req.params.id]);
  const row = get(EXP_SELECT + ' WHERE e.id=?', [+req.params.id]);
  res.json(row);
});

app.delete('/api/expenses/:id', (req, res) => {
  run('DELETE FROM expenses WHERE id=?', [+req.params.id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════
//  CHECKLIST
// ═══════════════════════════════════════════════════════════
app.get('/api/checklist', (_req, res) => {
  res.json(all('SELECT * FROM checklist ORDER BY category, id'));
});

app.post('/api/checklist', (req, res) => {
  const { category, item } = req.body;
  if (!category || !item) return res.status(400).json({ error: 'Missing fields' });
  run('INSERT INTO checklist (category,item) VALUES (?,?)', [category, item.trim()]);
  const row = all('SELECT * FROM checklist ORDER BY id DESC LIMIT 1')[0];
  res.json(row);
});

app.put('/api/checklist/:id', (req, res) => {
  run('UPDATE checklist SET done=? WHERE id=?', [req.body.done ? 1 : 0, +req.params.id]);
  res.json({ ok: true });
});

app.delete('/api/checklist/:id', (req, res) => {
  run('DELETE FROM checklist WHERE id=?', [+req.params.id]);
  res.json({ ok: true });
});

// ── Catch-all ─────────────────────────────────────────────
app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ── Start ─────────────────────────────────────────────────
openDB().then(() => {
  app.listen(PORT, () =>
    console.log(`\n🏔️  Matheran Trek → http://localhost:${PORT}\n`)
  );
});
