require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { body, validationResult } = require('express-validator');
const dayjs = require('dayjs');
const { db, initDb } = require('./db');
const { handleChat } = require('./ai/aiDbAgent');

initDb();

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'milk-business-pro-reset-2026-05-01-v2';
const isProduction = process.env.NODE_ENV === 'production';
const clientUrl = process.env.CLIENT_URL || '';
const uploadsDir = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({ dest: uploadsDir });

const devAllowedOrigins = [
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174'
];
const privateLanOriginPattern = /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$/;
const publicDevOriginPattern = /^https?:\/\/[^/\s]+:(5173|5174|4000)$/;
const allowedOrigins = isProduction
  ? (clientUrl ? [clientUrl] : []).concat(['https://*.vercel.app', 'https://*.railway.app'])
  : devAllowedOrigins;
app.use(cors({
  origin: (origin, callback) => {
    const isAllowedOrigin = !origin
      || allowedOrigins.some(o => origin.match(o.replace('*', '.*')))
      || (!isProduction && (privateLanOriginPattern.test(origin) || publicDevOriginPattern.test(origin)));

    if (isAllowedOrigin) {
      callback(null, true);
    } else {
      callback(new Error(`Not allowed by CORS: ${origin}`));
    }
  },
  credentials: true
}));
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(express.json({ limit: '5mb' }));
app.use(morgan('dev'));
app.use('/uploads', express.static(uploadsDir));

const clientDistPath = process.env.SERVE_CLIENT_DIR
  ? path.resolve(process.env.SERVE_CLIENT_DIR)
  : path.join(__dirname, '..', 'public');
const hasClientBuild = fs.existsSync(path.join(clientDistPath, 'index.html'));
if (hasClientBuild) {
  app.use(express.static(clientDistPath));
  console.log(`Serving client build from: ${clientDistPath}`);
}

const ok = (res, data) => res.json({ success: true, ...data });
const fail = (res, status, message) => res.status(status).json({ success: false, message });

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return fail(res, 401, 'Authentication required');
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return fail(res, 401, 'Invalid token');
  }
}

function validate(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) return fail(res, 400, errors.array()[0].msg);
  next();
}

function getSingleValue(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function normalizeLookupTimestamp(value) {
  if (!value) return dayjs().toISOString();
  const raw = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return dayjs(raw).endOf('day').toISOString();
  const parsed = dayjs(raw);
  return parsed.isValid() ? parsed.toISOString() : dayjs().toISOString();
}

function getFoodPriceHistoryRows(foodId) {
  return db.prepare(`SELECT * FROM food_price_history WHERE food_item_id = ? ORDER BY effective_from DESC, id DESC`).all(foodId);
}

function resolveFoodRateSnapshot(foodId, atValue) {
  if (!foodId) return null;
  const lookupAt = normalizeLookupTimestamp(atValue);
  const history = db.prepare(`
    SELECT fph.*, fi.name AS food_name
    FROM food_price_history fph
    JOIN food_items fi ON fi.id = fph.food_item_id
    WHERE fph.food_item_id = ? AND fph.effective_from <= ?
    ORDER BY fph.effective_from DESC, fph.id DESC
    LIMIT 1
  `).get(foodId, lookupAt);

  if (history) {
    return {
      food_price_history_id: history.id,
      food_name_snapshot: history.food_name,
      unit_type_snapshot: history.unit_type || 'kg',
      unit_rate: Number(history.unit_rate || 0),
      rate_effective_from: history.effective_from
    };
  }

  const oldestHistory = db.prepare(`
    SELECT fph.*, fi.name AS food_name
    FROM food_price_history fph
    JOIN food_items fi ON fi.id = fph.food_item_id
    WHERE fph.food_item_id = ?
    ORDER BY fph.effective_from ASC, fph.id ASC
    LIMIT 1
  `).get(foodId);

  if (oldestHistory) {
    return {
      food_price_history_id: oldestHistory.id,
      food_name_snapshot: oldestHistory.food_name,
      unit_type_snapshot: oldestHistory.unit_type || 'kg',
      unit_rate: Number(oldestHistory.unit_rate || 0),
      rate_effective_from: oldestHistory.effective_from
    };
  }

  const fallback = db.prepare('SELECT id, name, rate_per_kg, unit_type FROM food_items WHERE id = ?').get(foodId);
  if (!fallback) return null;

  return {
    food_price_history_id: null,
    food_name_snapshot: fallback.name,
    unit_type_snapshot: fallback.unit_type || 'kg',
    unit_rate: Number(fallback.rate_per_kg || 0),
    rate_effective_from: null
  };
}

function getFoodsWithHistory() {
  const foods = db.prepare('SELECT * FROM food_items ORDER BY name').all();
  return foods.map((food) => ({
    ...food,
    priceHistory: getFoodPriceHistoryRows(food.id)
  }));
}

function mergeExpenseRows(expenses = []) {
  const merged = new Map();
  const preservedFeedRows = [];

  expenses.forEach((item, index) => {
    const amount = Number(item.amount || 0);
    const hasExplicitAmount = item.amount !== '' && item.amount !== null && item.amount !== undefined;
    if (!hasExplicitAmount) return;

    if ((item.expense_type || 'common') === 'feed') {
      preservedFeedRows.push({
        ...item,
        expense_type: 'feed',
        amount: Number(amount.toFixed(2)),
        quantity_kg: Number(item.quantity_kg || 0),
        unit_rate: Number(item.unit_rate || 0),
        entry_shift: item.entry_shift || '',
        payment_mode: (item.payment_mode || 'Cash').trim() || 'Cash',
        description: (item.description || '').trim()
      });
      return;
    }

    const categoryKey = item.category_id || (item.category_name || '').trim().toLowerCase() || `row-${index}`;
    const paymentMode = (item.payment_mode || 'Cash').trim() || 'Cash';
    const description = (item.description || '').trim();
    const key = `${categoryKey}::${paymentMode.toLowerCase()}`;

    if (!merged.has(key)) {
      merged.set(key, {
        ...item,
        amount: Number(amount.toFixed(2)),
        payment_mode: paymentMode,
        description
      });
      return;
    }

    const current = merged.get(key);
    current.amount = Number((Number(current.amount || 0) + amount).toFixed(2));
    current.description = Array.from(new Set([current.description, description].map((value) => value?.trim()).filter(Boolean))).join(' | ');
    current.bill_path = current.bill_path || item.bill_path || null;
    if (!current.category_name && item.category_name) current.category_name = item.category_name;
  });

  return [...Array.from(merged.values()), ...preservedFeedRows];
}

function getDailyEntryBundle(entry) {
  if (!entry) return { entry: null, cowEntries: [], milkSales: [], expenses: [] };
  const cowEntries = db.prepare(`SELECT me.*, c.name AS cow_name, c.status AS cow_status
    FROM cow_milk_entries me
    LEFT JOIN cows c ON c.id = me.cow_id
    WHERE me.daily_entry_id = ?
    ORDER BY me.id ASC`).all(entry.id);
  const milkSales = db.prepare(`SELECT ms.*, COALESCE(b.name, 'Unknown buyer') buyer_name
    FROM milk_sales ms
    LEFT JOIN buyers b ON b.id = ms.buyer_id
    WHERE ms.daily_entry_id = ?
    ORDER BY ms.id ASC`).all(entry.id);
  const expenses = mergeExpenseRows(db.prepare(`SELECT e.*, COALESCE(c.name, 'Unknown category') category_name, cw.name AS cow_name, COALESCE(e.food_name_snapshot, f.name) AS food_name, COALESCE(e.unit_type_snapshot, f.unit_type, 'kg') AS unit_type
    FROM expenses e
    LEFT JOIN expense_categories c ON c.id = e.category_id
    LEFT JOIN cows cw ON cw.id = e.cow_id
    LEFT JOIN food_items f ON f.id = e.food_item_id
    WHERE e.daily_entry_id = ?
    ORDER BY e.id ASC`).all(entry.id));
  return { entry, cowEntries, milkSales, expenses };
}

function getCalfBundle(calf) {
  if (!calf) return { calf: null, expenses: [] };
  const expenses = db.prepare(`SELECT ce.*, COALESCE(ce.food_name_snapshot, f.name) AS food_name, COALESCE(ce.unit_type_snapshot, f.unit_type, 'kg') AS unit_type, c.name AS category_name
    FROM calf_expenses ce
    LEFT JOIN food_items f ON f.id = ce.food_item_id
    LEFT JOIN expense_categories c ON c.id = ce.category_id
    WHERE ce.calf_id = ?
    ORDER BY ce.expense_date DESC, ce.id DESC`).all(calf.id);
  return { calf, expenses };
}

function getInvestmentIncomeProgress(investmentDate) {
  const progress = getSingleValue(
    `SELECT COALESCE(SUM(total_income), 0) AS income
     FROM daily_entries
     WHERE entry_date >= ?`,
    [investmentDate]
  );
  return Number(progress?.income || 0);
}

function findInvestmentCompletion(investmentDate, investmentAmount) {
  const rows = db.prepare(
    `SELECT entry_date, total_income
     FROM daily_entries
     WHERE entry_date >= ?
     ORDER BY entry_date ASC, id ASC`
  ).all(investmentDate);

  let runningIncome = 0;
  for (const row of rows) {
    runningIncome += Number(row.total_income || 0);
    if (runningIncome >= Number(investmentAmount || 0)) {
      return {
        completed_on: row.entry_date,
        completed_income_amount: Number(runningIncome.toFixed(2))
      };
    }
  }

  return null;
}

function refreshInvestmentStatuses() {
  const activeInvestments = db.prepare(`SELECT * FROM investments WHERE status = 'active' ORDER BY investment_date ASC, id ASC`).all();
  const updateInvestment = db.prepare(`
    UPDATE investments
    SET status = ?, completed_on = ?, completed_income_amount = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  activeInvestments.forEach((investment) => {
    const completion = findInvestmentCompletion(investment.investment_date, investment.investment_amount);
    if (completion) {
      updateInvestment.run('finished', completion.completed_on, completion.completed_income_amount, investment.id);
    }
  });
}

function getInvestments() {
  refreshInvestmentStatuses();

  const rows = db.prepare(`SELECT * FROM investments ORDER BY status ASC, investment_date DESC, id DESC`).all();
  return rows.map((investment) => {
    const recoveredIncome = investment.status === 'finished'
      ? Number(investment.completed_income_amount || investment.investment_amount || 0)
      : getInvestmentIncomeProgress(investment.investment_date);
    const investmentAmount = Number(investment.investment_amount || 0);
    const pendingAmount = investment.status === 'finished' ? 0 : Math.max(investmentAmount - recoveredIncome, 0);
    return {
      ...investment,
      investment_amount: investmentAmount,
      completed_income_amount: Number(investment.completed_income_amount || 0),
      recovered_income: Number(recoveredIncome.toFixed(2)),
      pending_amount: Number(pendingAmount.toFixed(2))
    };
  });
}

function getDashboard() {
  const today = dayjs().format('YYYY-MM-DD');
  const monthStart = dayjs().startOf('month').format('YYYY-MM-DD');
  const monthEnd = dayjs().endOf('month').format('YYYY-MM-DD');

  const todayEntry = getSingleValue('SELECT * FROM daily_entries WHERE entry_date = ?', [today]) || {};
  const monthly = getSingleValue(`SELECT COALESCE(SUM(total_income),0) income, COALESCE(SUM(total_expenses),0) expenses, COALESCE(SUM(profit),0) profit, COALESCE(SUM(total_milk_litres),0) milk FROM daily_entries WHERE entry_date BETWEEN ? AND ?`, [monthStart, monthEnd]);
  const buyerSplit = db.prepare(`SELECT b.name, ROUND(SUM(ms.litres),2) value FROM milk_sales ms LEFT JOIN buyers b ON b.id=ms.buyer_id GROUP BY b.name ORDER BY value DESC`).all();
  const trend = db.prepare(`SELECT entry_date as date, total_income as income, total_expenses as expenses, profit, total_milk_litres as milk, remaining_milk_litres as remaining FROM daily_entries ORDER BY entry_date DESC LIMIT 30`).all().reverse();
  const cowSummary = db.prepare(`SELECT c.id, c.name, c.status, ROUND(COALESCE(SUM(me.total_litres),0),2) totalMilk, COUNT(CASE WHEN me.total_litres=0 THEN 1 END) nilDays
    FROM cows c LEFT JOIN cow_milk_entries me ON me.cow_id=c.id
    LEFT JOIN daily_entries d ON d.id=me.daily_entry_id AND d.entry_date BETWEEN ? AND ?
    GROUP BY c.id ORDER BY totalMilk DESC`).all([monthStart, monthEnd]);

  return {
    today: {
      totalMilkLitres: Number(todayEntry.total_milk_litres || 0),
      totalIncome: Number(todayEntry.total_income || 0),
      totalExpenses: Number(todayEntry.total_expenses || 0),
      profit: Number(todayEntry.profit || 0),
      remainingMilkLitres: Number(todayEntry.remaining_milk_litres || 0)
    },
    monthly: {
      income: Number(monthly.income || 0),
      expenses: Number(monthly.expenses || 0),
      profit: Number(monthly.profit || 0),
      milk: Number(monthly.milk || 0),
      profitMargin: monthly.income ? Number(((monthly.profit / monthly.income) * 100).toFixed(2)) : 0
    },
    charts: { buyerSplit, trend },
    cows: {
      summary: cowSummary,
      best: cowSummary[0] || null,
      low: cowSummary[cowSummary.length - 1] || null
    },
    lastUpdated: todayEntry.updated_at || null
  };
}

app.get('/api/auth/status', (req, res) => {
  const user = getSingleValue('SELECT id, username, created_at FROM users LIMIT 1');
  ok(res, { hasUser: !!user, user });
});

app.post('/api/auth/register', body('username').isLength({ min: 3 }), body('password').isLength({ min: 6 }), validate, async (req, res) => {
  const existing = getSingleValue('SELECT id FROM users LIMIT 1');
  if (existing) return fail(res, 400, 'Single-user account already exists');
  const { username, password } = req.body;
  const passwordHash = await bcrypt.hash(password, 10);
  const info = db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, passwordHash);
  const token = jwt.sign({ id: info.lastInsertRowid, username }, JWT_SECRET, { expiresIn: '7d' });
  ok(res, { token, user: { id: info.lastInsertRowid, username } });
});

app.post('/api/auth/login', body('username').notEmpty(), body('password').notEmpty(), validate, async (req, res) => {
  const user = getSingleValue('SELECT * FROM users WHERE username = ?', [req.body.username]);
  if (!user) return fail(res, 401, 'Invalid credentials');
  const match = await bcrypt.compare(req.body.password, user.password_hash);
  if (!match) return fail(res, 401, 'Invalid credentials');
  const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  ok(res, { token, user: { id: user.id, username: user.username } });
});

app.get('/api/bootstrap', auth, (req, res) => {
  ok(res, {
    dashboard: getDashboard(),
    cows: db.prepare('SELECT * FROM cows ORDER BY created_at DESC').all(),
    calves: db.prepare('SELECT * FROM calves ORDER BY created_at DESC').all(),
    investments: getInvestments(),
    buyers: db.prepare('SELECT * FROM buyers ORDER BY active DESC, name').all(),
    categories: db.prepare('SELECT * FROM expense_categories ORDER BY is_default DESC, name').all(),
    foods: getFoodsWithHistory(),
    dailyEntries: db.prepare('SELECT * FROM daily_entries ORDER BY entry_date DESC LIMIT 90').all()
  });
});

app.get('/api/dashboard', auth, (req, res) => ok(res, { dashboard: getDashboard() }));

app.get('/api/daily-entries', auth, (req, res) => {
  const entries = db.prepare('SELECT * FROM daily_entries ORDER BY entry_date DESC LIMIT 90').all();
  ok(res, { entries: entries.map((entry) => getDailyEntryBundle(entry)) });
});

app.get('/api/daily-entries/:entryDate', auth, (req, res) => {
  const entry = getSingleValue('SELECT * FROM daily_entries WHERE entry_date = ?', [req.params.entryDate]);
  ok(res, getDailyEntryBundle(entry));
});

app.post('/api/cows', auth, body('name').notEmpty(), validate, (req, res) => {
  const { name, breed, age, status, purchase_date, status_date, purchase_price, notes } = req.body;
  const info = db.prepare('INSERT INTO cows (name, breed, age, status, purchase_date, status_date, purchase_price, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(name, breed || '', age || '', status || 'Lactating', purchase_date || null, status_date || null, purchase_price || null, notes || '');

  db.prepare('INSERT INTO cow_update_history (cow_id, updated_at, changes, snapshot) VALUES (?, ?, ?, ?)')
    .run(info.lastInsertRowid, new Date().toISOString(), JSON.stringify([{ field: 'Created', oldValue: '(new record)', newValue: name }]),
      JSON.stringify({ id: info.lastInsertRowid, name, breed: breed || '', age: age || '', status: status || 'Lactating', purchase_date, status_date, purchase_price: purchase_price || null, notes: notes || '' }));

  ok(res, { id: info.lastInsertRowid });
});

app.put('/api/cows/:id', auth, (req, res) => {
  const { name, breed, age, status, purchase_date, status_date, purchase_price, notes } = req.body;
  const cowId = req.params.id;

  const existing = db.prepare('SELECT * FROM cows WHERE id = ?').get(cowId);
  if (!existing) return fail(res, 404, 'Cow not found');

  const changes = [];
  const fields = [
    { key: 'name', label: 'Name' },
    { key: 'breed', label: 'Breed' },
    { key: 'age', label: 'Age' },
    { key: 'status', label: 'Lifecycle status' },
    { key: 'status_date', label: 'Status date' },
    { key: 'notes', label: 'Notes' }
  ];

  fields.forEach(({ key, label }) => {
    const oldVal = existing[key] ?? '';
    const newVal = key === 'status_date' ? (req.body[key] || '') : (req.body[key] ?? '');
    if (String(oldVal) !== String(newVal)) {
      changes.push({ field: label, oldValue: oldVal || '(empty)', newValue: newVal || '(empty)' });
    }
  });

  db.prepare('UPDATE cows SET name=?, breed=?, age=?, status=?, purchase_date=?, status_date=?, purchase_price=?, notes=? WHERE id=?')
    .run(name, breed, age, status, purchase_date || null, status_date || null, purchase_price || null, notes, cowId);

  if (changes.length > 0) {
    const updated = db.prepare('SELECT * FROM cows WHERE id = ?').get(cowId);
    db.prepare('INSERT INTO cow_update_history (cow_id, updated_at, changes, snapshot) VALUES (?, ?, ?, ?)')
      .run(cowId, new Date().toISOString(), JSON.stringify(changes), JSON.stringify({
        id: updated.id, name: updated.name, breed: updated.breed, age: updated.age,
        status: updated.status, purchase_date: updated.purchase_date, status_date: updated.status_date,
        purchase_price: updated.purchase_price, notes: updated.notes
      }));
  }

  ok(res, { changes });
});

app.get('/api/cows/:id/history', auth, (req, res) => {
  const history = db.prepare(`SELECT * FROM cow_update_history WHERE cow_id = ? ORDER BY updated_at DESC`)
    .all(req.params.id)
    .map((entry) => ({ ...entry, changes: JSON.parse(entry.changes), snapshot: JSON.parse(entry.snapshot) }));
  ok(res, { history });
});

app.delete('/api/cows/:id', auth, (req, res) => {
  const existing = getSingleValue('SELECT id, name FROM cows WHERE id = ?', [req.params.id]);
  if (!existing) return fail(res, 404, 'Cow not found');
  const used = getSingleValue('SELECT id FROM cow_milk_entries WHERE cow_id = ? LIMIT 1', [req.params.id]);
  if (used) return fail(res, 400, 'Cow is already used in saved daily entries. Update its status instead of deleting it.');
  db.prepare('DELETE FROM cows WHERE id = ?').run(req.params.id);
  ok(res, { deletedId: Number(req.params.id), name: existing.name });
});

app.get('/api/calves', auth, (req, res) => {
  const calves = db.prepare('SELECT * FROM calves ORDER BY created_at DESC').all();
  ok(res, { calves: calves.map((calf) => getCalfBundle(calf)) });
});

app.post('/api/calves', auth, body('name').notEmpty(), validate, (req, res) => {
  const { name, breed, birth_date, source_type, expected_lactation_date, purchase_price, paid_amount, status, notes } = req.body;
  const info = db.prepare(`INSERT INTO calves (name, breed, birth_date, source_type, expected_lactation_date, purchase_price, paid_amount, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(name, breed || '', birth_date || null, source_type || 'raised', expected_lactation_date || null, Number(purchase_price || 0), Number(paid_amount || 0), status || 'Growing', notes || '');
  ok(res, { id: info.lastInsertRowid });
});

app.put('/api/calves/:id', auth, body('name').notEmpty(), validate, (req, res) => {
  const { name, breed, birth_date, source_type, expected_lactation_date, purchase_price, paid_amount, status, notes } = req.body;
  db.prepare(`UPDATE calves SET name=?, breed=?, birth_date=?, source_type=?, expected_lactation_date=?, purchase_price=?, paid_amount=?, status=?, notes=? WHERE id=?`)
    .run(name, breed || '', birth_date || null, source_type || 'raised', expected_lactation_date || null, Number(purchase_price || 0), Number(paid_amount || 0), status || 'Growing', notes || '', req.params.id);
  ok(res, {});
});

app.delete('/api/calves/:id', auth, (req, res) => {
  const calf = getSingleValue('SELECT id, transferred_to_cow_id FROM calves WHERE id=?', [req.params.id]);
  if (!calf) return fail(res, 404, 'Calf not found');
  if (calf.transferred_to_cow_id) return fail(res, 400, 'Transferred calf records cannot be deleted');
  db.prepare('DELETE FROM calves WHERE id=?').run(req.params.id);
  ok(res, {});
});

app.post('/api/calves/:id/expenses', auth, (req, res) => {
  const calf = getSingleValue('SELECT * FROM calves WHERE id=?', [req.params.id]);
  if (!calf) return fail(res, 404, 'Calf not found');
  const { expense_date, expense_type, category_id, food_item_id, food_price_history_id, food_name_snapshot, unit_type_snapshot, rate_effective_from, quantity_kg, unit_rate, amount, entry_shift, description, payment_mode } = req.body;
  if (!expense_date) return fail(res, 400, 'Expense date is required');
  const resolvedFoodSnapshot = (expense_type || 'common') === 'feed' && food_item_id
    ? (food_name_snapshot || unit_type_snapshot || food_price_history_id || rate_effective_from ? {
        food_price_history_id: food_price_history_id || null,
        food_name_snapshot: food_name_snapshot || null,
        unit_type_snapshot: unit_type_snapshot || 'kg',
        unit_rate: Number(unit_rate || 0),
        rate_effective_from: rate_effective_from || null
      } : resolveFoodRateSnapshot(food_item_id, expense_date))
    : null;
  db.prepare(`INSERT INTO calf_expenses (calf_id, expense_date, expense_type, category_id, food_item_id, food_price_history_id, food_name_snapshot, unit_type_snapshot, rate_effective_from, quantity_kg, unit_rate, amount, entry_shift, description, payment_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`) 
    .run(req.params.id, expense_date, expense_type || 'common', category_id || null, food_item_id || null, resolvedFoodSnapshot?.food_price_history_id || null, resolvedFoodSnapshot?.food_name_snapshot || null, resolvedFoodSnapshot?.unit_type_snapshot || null, resolvedFoodSnapshot?.rate_effective_from || null, Number(quantity_kg || 0), Number((resolvedFoodSnapshot?.unit_rate ?? unit_rate) || 0), Number(amount || 0), (expense_type || 'common') === 'feed' ? (entry_shift || 'Morning') : null, description || '', payment_mode || 'Cash');
  ok(res, {});
});

app.delete('/api/calf-expenses/:id', auth, (req, res) => {
  db.prepare('DELETE FROM calf_expenses WHERE id=?').run(req.params.id);
  ok(res, {});
});

app.post('/api/calves/:id/transfer', auth, (req, res) => {
  const calf = getSingleValue('SELECT * FROM calves WHERE id=?', [req.params.id]);
  if (!calf) return fail(res, 404, 'Calf not found');
  if (calf.transferred_to_cow_id) return fail(res, 400, 'Calf is already transferred');

  const tx = db.transaction(() => {
    const expenseTotal = getSingleValue('SELECT COALESCE(SUM(amount),0) total FROM calf_expenses WHERE calf_id=?', [req.params.id])?.total || 0;
    const priorExpense = Number(expenseTotal || 0);
    const purchasePaid = Number(calf.paid_amount || 0);
    const cowInfo = db.prepare(`INSERT INTO cows (name, breed, age, status, purchase_date, status_date, purchase_price, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        calf.name,
        calf.breed || '',
        'From calf rearing',
        'Lactating',
        calf.birth_date || dayjs().format('YYYY-MM-DD'),
        dayjs().format('YYYY-MM-DD'),
        purchasePaid,
        [
          calf.notes,
          `Transferred from calf section. Previous expense only for reference: ${priorExpense.toFixed(2)}. Purchase paid before transfer: ${purchasePaid.toFixed(2)}.`
        ].filter(Boolean).join(' | ')
      );

    db.prepare('UPDATE calves SET transferred_to_cow_id=?, transferred_at=?, status=? WHERE id=?')
      .run(cowInfo.lastInsertRowid, dayjs().format('YYYY-MM-DD'), 'Transferred', req.params.id);

    return { cowId: cowInfo.lastInsertRowid, previousExpense: Number(priorExpense.toFixed(2)), purchasePaid: Number(purchasePaid.toFixed(2)) };
  });

  ok(res, tx());
});

app.get('/api/investments', auth, (req, res) => {
  ok(res, { investments: getInvestments() });
});

app.post('/api/investments', auth, body('title').notEmpty(), body('investment_date').notEmpty(), validate, (req, res) => {
  const { source_type, source_id, title, investment_date, investment_amount, notes } = req.body;
  const normalizedSourceType = ['cow', 'calf', 'manual'].includes(source_type) ? source_type : 'manual';
  const amount = Number(investment_amount || 0);
  if (!(amount > 0)) return fail(res, 400, 'Investment amount must be greater than zero');

  if (normalizedSourceType !== 'manual' && source_id) {
    const duplicate = db.prepare('SELECT id FROM investments WHERE source_type = ? AND source_id = ? LIMIT 1').get(normalizedSourceType, source_id);
    if (duplicate) return fail(res, 400, 'This cow or calf is already imported into investments');
  }

  const info = db.prepare(`
    INSERT INTO investments (source_type, source_id, title, investment_date, investment_amount, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(normalizedSourceType, source_id || null, title, investment_date, amount, notes || '');

  refreshInvestmentStatuses();
  ok(res, { id: info.lastInsertRowid });
});

app.put('/api/investments/:id', auth, body('title').notEmpty(), body('investment_date').notEmpty(), validate, (req, res) => {
  const existing = db.prepare('SELECT * FROM investments WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, 404, 'Investment not found');

  const { title, investment_date, investment_amount, notes } = req.body;
  const amount = Number(investment_amount || 0);
  if (!(amount > 0)) return fail(res, 400, 'Investment amount must be greater than zero');

  db.prepare(`
    UPDATE investments
    SET title = ?, investment_date = ?, investment_amount = ?, notes = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(title, investment_date, amount, notes || '', req.params.id);

  refreshInvestmentStatuses();
  ok(res, {});
});

app.delete('/api/investments/:id', auth, (req, res) => {
  const existing = db.prepare('SELECT id, title FROM investments WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, 404, 'Investment not found');
  db.prepare('DELETE FROM investments WHERE id = ?').run(req.params.id);
  ok(res, { deletedId: Number(req.params.id), title: existing.title });
});

app.post('/api/buyers', auth, body('name').notEmpty(), validate, (req, res) => {
  const { name, location, default_rate, contact, notes, active } = req.body;
  const info = db.prepare('INSERT INTO buyers (name, location, default_rate, contact, notes, active) VALUES (?, ?, ?, ?, ?, ?)')
    .run(name, location || '', default_rate || 0, contact || '', notes || '', active ? 1 : 0);
  ok(res, { id: info.lastInsertRowid });
});

app.put('/api/buyers/:id', auth, (req, res) => {
  const { name, location, default_rate, contact, notes, active } = req.body;
  db.prepare('UPDATE buyers SET name=?, location=?, default_rate=?, contact=?, notes=?, active=? WHERE id=?')
    .run(name, location, default_rate || 0, contact, notes, active ? 1 : 0, req.params.id);
  ok(res, {});
});

app.delete('/api/buyers/:id', auth, (req, res) => {
  const existing = getSingleValue('SELECT id, name FROM buyers WHERE id = ?', [req.params.id]);
  if (!existing) return fail(res, 404, 'Buyer not found');
  const used = getSingleValue('SELECT id FROM milk_sales WHERE buyer_id = ? LIMIT 1', [req.params.id]);
  if (used) return fail(res, 400, 'Buyer is already used in saved milk sales. Edit or deactivate instead.');
  db.prepare('DELETE FROM buyers WHERE id = ?').run(req.params.id);
  ok(res, { deletedId: Number(req.params.id), name: existing.name });
});

app.post('/api/categories', auth, body('name').notEmpty(), validate, (req, res) => {
  const info = db.prepare('INSERT INTO expense_categories (name, is_default) VALUES (?, 0)').run(req.body.name);
  ok(res, { id: info.lastInsertRowid });
});

app.put('/api/categories/:id', auth, body('name').notEmpty(), validate, (req, res) => {
  db.prepare('UPDATE expense_categories SET name=? WHERE id=?').run(req.body.name, req.params.id);
  ok(res, {});
});

app.delete('/api/categories/:id', auth, (req, res) => {
  const used = getSingleValue('SELECT id FROM expenses WHERE category_id=? LIMIT 1', [req.params.id]);
  if (used) return fail(res, 400, 'Category is in use and cannot be deleted');
  db.prepare('DELETE FROM expense_categories WHERE id=? AND is_default=0').run(req.params.id);
  ok(res, {});
});

app.post('/api/foods', auth, body('name').notEmpty(), validate, (req, res) => {
  const purchaseKg = Number(req.body.purchase_kg || 0);
  const purchaseAmount = Number(req.body.purchase_amount || 0);
  const ratePerKg = purchaseKg > 0 ? Number((purchaseAmount / purchaseKg).toFixed(2)) : 0;
  const unitType = req.body.unit_type || 'kg';
  const info = db.prepare('INSERT INTO food_items (name, purchase_kg, purchase_amount, rate_per_kg, unit_type, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.body.name, purchaseKg, purchaseAmount, ratePerKg, unitType, req.body.notes || '');
  db.prepare('INSERT INTO food_price_history (food_item_id, purchase_quantity, purchase_amount, unit_rate, unit_type, effective_from, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(info.lastInsertRowid, purchaseKg, purchaseAmount, ratePerKg, unitType, new Date().toISOString(), req.body.notes || '');
  ok(res, { id: info.lastInsertRowid, ratePerKg });
});

app.put('/api/foods/:id', auth, body('name').notEmpty(), validate, (req, res) => {
  const existing = db.prepare('SELECT * FROM food_items WHERE id = ?').get(req.params.id);
  if (!existing) return fail(res, 404, 'Food item not found');
  const purchaseKg = Number(req.body.purchase_kg || 0);
  const purchaseAmount = Number(req.body.purchase_amount || 0);
  const ratePerKg = purchaseKg > 0 ? Number((purchaseAmount / purchaseKg).toFixed(2)) : 0;
  const unitType = req.body.unit_type || 'kg';
  db.prepare('UPDATE food_items SET name=?, purchase_kg=?, purchase_amount=?, rate_per_kg=?, unit_type=?, notes=? WHERE id=?')
    .run(req.body.name, purchaseKg, purchaseAmount, ratePerKg, unitType, req.body.notes || '', req.params.id);
  const priceChanged = Number(existing.purchase_kg || 0) !== purchaseKg
    || Number(existing.purchase_amount || 0) !== purchaseAmount
    || Number(existing.rate_per_kg || 0) !== ratePerKg
    || String(existing.unit_type || 'kg') !== String(unitType || 'kg');
  if (priceChanged) {
    db.prepare('INSERT INTO food_price_history (food_item_id, purchase_quantity, purchase_amount, unit_rate, unit_type, effective_from, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(req.params.id, purchaseKg, purchaseAmount, ratePerKg, unitType, new Date().toISOString(), req.body.notes || '');
  }
  ok(res, { ratePerKg });
});

app.delete('/api/food-history/:id', auth, (req, res) => {
  const history = db.prepare('SELECT * FROM food_price_history WHERE id = ?').get(req.params.id);
  if (!history) return fail(res, 404, 'Food history entry not found');
  db.prepare('DELETE FROM food_price_history WHERE id = ?').run(req.params.id);
  ok(res, { deletedId: Number(req.params.id), foodItemId: history.food_item_id });
});

app.delete('/api/foods/:id', auth, (req, res) => {
  const used = getSingleValue('SELECT id FROM expenses WHERE food_item_id=? LIMIT 1', [req.params.id])
    || getSingleValue('SELECT id FROM calf_expenses WHERE food_item_id=? LIMIT 1', [req.params.id]);
  if (used) return fail(res, 400, 'Food item is already used in saved expenses and cannot be deleted');
  db.prepare('DELETE FROM food_items WHERE id=?').run(req.params.id);
  ok(res, {});
});

app.delete('/api/daily-entries/:id', auth, (req, res) => {
  const existing = getSingleValue('SELECT id, entry_date FROM daily_entries WHERE id = ?', [req.params.id]);
  if (!existing) return fail(res, 404, 'Daily entry not found');
  db.prepare('DELETE FROM daily_entries WHERE id = ?').run(req.params.id);
  refreshInvestmentStatuses();
  ok(res, { deletedId: Number(req.params.id), entryDate: existing.entry_date });
});

app.post('/api/daily-entries', auth, upload.any(), (req, res) => {
  const payload = typeof req.body.payload === 'string' ? JSON.parse(req.body.payload) : req.body;
  const { entry_date, total_milk_litres, notes, cowEntries = [], milkSales = [], expenses = [], remaining_milk_usage } = payload;
  if (!entry_date) return fail(res, 400, 'Entry date is required');

  const tx = db.transaction(() => {
    const mergedExpenses = mergeExpenseRows(expenses);

    // Compute milk total from cow entries if present (cow-wise mode), else use client-supplied value
    const cowTotal = cowEntries.reduce((sum, item) => sum + Number(item.total_litres || 0), 0);
    const effectiveMilkLitres = cowEntries.length > 0 ? cowTotal : Number(total_milk_litres || 0);

    const totalIncome = milkSales.reduce((sum, item) => sum + Number(item.litres || 0) * Number(item.rate_per_litre || 0), 0);
    const totalExpenses = mergedExpenses.reduce((sum, item) => sum + Number(item.amount || 0), 0);
    const sold = milkSales.reduce((sum, item) => sum + Number(item.litres || 0), 0);
    const remaining = Number((effectiveMilkLitres - sold).toFixed(2));
    const profit = Number((totalIncome - totalExpenses).toFixed(2));

    const existing = getSingleValue('SELECT id FROM daily_entries WHERE entry_date = ?', [entry_date]);
    let dailyEntryId;

    if (existing) {
      dailyEntryId = existing.id;
      db.prepare(`UPDATE daily_entries SET total_milk_litres=?, remaining_milk_litres=?, total_income=?, total_expenses=?, profit=?, notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`)
        .run(effectiveMilkLitres, remaining, totalIncome, totalExpenses, profit, [notes, remaining_milk_usage].filter(Boolean).join(' | '), dailyEntryId);
      db.prepare('DELETE FROM cow_milk_entries WHERE daily_entry_id=?').run(dailyEntryId);
      db.prepare('DELETE FROM milk_sales WHERE daily_entry_id=?').run(dailyEntryId);
      db.prepare('DELETE FROM expenses WHERE daily_entry_id=?').run(dailyEntryId);
    } else {
      const info = db.prepare(`INSERT INTO daily_entries (entry_date, total_milk_litres, remaining_milk_litres, total_income, total_expenses, profit, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(entry_date, effectiveMilkLitres, remaining, totalIncome, totalExpenses, profit, [notes, remaining_milk_usage].filter(Boolean).join(' | '));
      dailyEntryId = info.lastInsertRowid;
    }

    const insertCow = db.prepare('INSERT INTO cow_milk_entries (daily_entry_id, cow_id, morning_litres, evening_litres, total_litres, entry_shift, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    cowEntries.forEach((item) => {
      const totalLitres = Number(item.total_litres || 0);
      const shift = item.entry_shift || '';
      const morningLitres = shift === 'Evening' ? 0 : (totalLitres || Number(item.morning_litres || 0));
      const eveningLitres = shift === 'Evening' ? (totalLitres || Number(item.evening_litres || 0)) : (totalLitres ? 0 : Number(item.evening_litres || 0));
      insertCow.run(dailyEntryId, item.cow_id, morningLitres, eveningLitres, totalLitres || (morningLitres + eveningLitres), shift || null, item.status || 'Recorded', item.notes || '');
    });

    const insertSale = db.prepare('INSERT INTO milk_sales (daily_entry_id, buyer_id, litres, rate_per_litre, income, payment_status, entry_shift, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    milkSales.forEach((item) => {
      const litres = Number(item.litres || 0);
      const rate = Number(item.rate_per_litre || 0);
      const income = Number((litres * rate).toFixed(2));
      insertSale.run(dailyEntryId, item.buyer_id || null, litres, rate, income, 'Paid', item.entry_shift || 'Morning', item.notes || '');
    });

    const insertExpense = db.prepare('INSERT INTO expenses (daily_entry_id, category_id, expense_type, cow_id, food_item_id, food_price_history_id, food_name_snapshot, unit_type_snapshot, rate_effective_from, quantity_kg, unit_rate, amount, entry_shift, description, payment_mode, bill_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
    mergedExpenses.forEach((item) => {
      const resolvedFoodSnapshot = (item.expense_type || 'common') === 'feed' && item.food_item_id
        ? (item.food_name_snapshot || item.unit_type_snapshot || item.food_price_history_id || item.rate_effective_from ? {
            food_price_history_id: item.food_price_history_id || null,
            food_name_snapshot: item.food_name_snapshot || null,
            unit_type_snapshot: item.unit_type_snapshot || 'kg',
            unit_rate: Number(item.unit_rate || 0),
            rate_effective_from: item.rate_effective_from || null
          } : resolveFoodRateSnapshot(item.food_item_id, entry_date))
        : null;
      insertExpense.run(
        dailyEntryId,
        item.category_id || null,
        item.expense_type || 'common',
        item.cow_id || null,
        item.food_item_id || null,
        resolvedFoodSnapshot?.food_price_history_id || null,
        resolvedFoodSnapshot?.food_name_snapshot || null,
        resolvedFoodSnapshot?.unit_type_snapshot || null,
        resolvedFoodSnapshot?.rate_effective_from || null,
        Number(item.quantity_kg || 0),
        Number((resolvedFoodSnapshot?.unit_rate ?? item.unit_rate) || 0),
        item.amount || 0,
        item.entry_shift || null,
        item.description || '',
        item.payment_mode || 'Cash',
        item.bill_path || null
      );
    });

    refreshInvestmentStatuses();
    return { dailyEntryId, totalMilkLitres: effectiveMilkLitres, totalIncome, totalExpenses, profit, remaining };
  });

  ok(res, { entry: tx() });
});

app.get('/api/reports', auth, (req, res) => {
  const { start, end } = req.query;
  const from = start || '0000-01-01';
  const to = end || '9999-12-31';
  const summary = getSingleValue(`SELECT COUNT(*) totalDays, COALESCE(SUM(total_milk_litres),0) milk, COALESCE(SUM(total_income),0) income, COALESCE(SUM(total_expenses),0) expenses, COALESCE(SUM(profit),0) profit FROM daily_entries WHERE entry_date BETWEEN ? AND ?`, [from, to]);
  const rows = db.prepare('SELECT * FROM daily_entries WHERE entry_date BETWEEN ? AND ? ORDER BY entry_date ASC').all(from, to);
  const buyerWise = db.prepare(`SELECT COALESCE(b.name,'Unknown') name, ROUND(SUM(ms.litres),2) litres, ROUND(SUM(ms.income),2) income FROM milk_sales ms LEFT JOIN milk_sales t ON t.id=ms.id LEFT JOIN daily_entries d ON d.id=ms.daily_entry_id LEFT JOIN buyers b ON b.id=ms.buyer_id WHERE d.entry_date BETWEEN ? AND ? GROUP BY b.name ORDER BY litres DESC`).all(from, to);
  const expenseWise = db.prepare(`SELECT CASE WHEN e.expense_type='feed' THEN COALESCE(e.food_name_snapshot, f.name, 'Feed') ELSE COALESCE(c.name,'Unknown') END name, ROUND(SUM(e.amount),2) amount FROM expenses e LEFT JOIN expense_categories c ON c.id=e.category_id LEFT JOIN food_items f ON f.id=e.food_item_id LEFT JOIN daily_entries d ON d.id=e.daily_entry_id WHERE d.entry_date BETWEEN ? AND ? GROUP BY CASE WHEN e.expense_type='feed' THEN COALESCE(e.food_name_snapshot, f.name, 'Feed') ELSE COALESCE(c.name,'Unknown') END ORDER BY amount DESC`).all(from, to);
  const cowWise = db.prepare(`SELECT cows.name, ROUND(SUM(cow_milk_entries.total_litres),2) litres FROM cow_milk_entries JOIN cows ON cows.id=cow_milk_entries.cow_id JOIN daily_entries d ON d.id=cow_milk_entries.daily_entry_id WHERE d.entry_date BETWEEN ? AND ? GROUP BY cows.name ORDER BY litres DESC`).all(from, to);
  ok(res, { summary, rows, buyerWise, expenseWise, cowWise });
});

app.get('/api/export/json', auth, (req, res) => {
  ok(res, {
    users: db.prepare('SELECT id, username, created_at FROM users').all(),
    cows: db.prepare('SELECT * FROM cows').all(),
    calves: db.prepare('SELECT * FROM calves').all(),
    buyers: db.prepare('SELECT * FROM buyers').all(),
    expense_categories: db.prepare('SELECT * FROM expense_categories').all(),
    food_items: db.prepare('SELECT * FROM food_items').all(),
    food_price_history: db.prepare('SELECT * FROM food_price_history').all(),
    investments: db.prepare('SELECT * FROM investments').all(),
    daily_entries: db.prepare('SELECT * FROM daily_entries').all(),
    calf_expenses: db.prepare('SELECT * FROM calf_expenses').all(),
    cow_milk_entries: db.prepare('SELECT * FROM cow_milk_entries').all(),
    milk_sales: db.prepare('SELECT * FROM milk_sales').all(),
    expenses: db.prepare('SELECT * FROM expenses').all()
  });
});

app.delete('/api/account', auth, (req, res) => {
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM expenses').run();
    db.prepare('DELETE FROM milk_sales').run();
    db.prepare('DELETE FROM cow_milk_entries').run();
    db.prepare('DELETE FROM daily_entries').run();
    db.prepare('DELETE FROM expense_categories').run();
    db.prepare('DELETE FROM food_price_history').run();
    db.prepare('DELETE FROM food_items').run();
    db.prepare('DELETE FROM investments').run();
    db.prepare('DELETE FROM calf_expenses').run();
    db.prepare('DELETE FROM calves').run();
    db.prepare('DELETE FROM buyers').run();
    db.prepare('DELETE FROM cows').run();
    db.prepare('DELETE FROM users').run();
  });
  tx();
  ok(res, { message: 'Account and all data deleted' });
});

app.get('/api/meta', auth, (req, res) => ok(res, { now: new Date().toISOString() }));

app.post('/api/ai/chat', auth, body('message').isString().isLength({ min: 1 }).withMessage('Message is required'), validate, async (req, res) => {
  const result = await handleChat({ message: req.body.message, userId: req.user?.id || 'default' });
  res.status(result.success ? 200 : 400).json(result);
});



app.use((err, req, res, next) => {
  console.error(err);
  if (req.files) req.files.forEach((file) => fs.existsSync(file.path) && fs.unlinkSync(file.path));
  fail(res, 500, 'Server error');
});

if (hasClientBuild) {
  app.get(/^(?!\/api|\/uploads).*/, (req, res) => {
    res.sendFile(path.join(clientDistPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`Dairy Farm API running on http://localhost:${PORT}`);
  console.log(`SQLite DB: ${process.env.DB_PATH || path.join(__dirname, '..', 'data', 'dairy-farm.db')}`);
  console.log(`Uploads dir: ${uploadsDir}`);
  console.log(`NODE_ENV: ${process.env.NODE_ENV || 'development'}`);
  console.log(`CLIENT_URL: ${clientUrl || '(not set - using CORS defaults)'}`);
  if (hasClientBuild) {
    console.log(`Serving client build from: ${clientDistPath}`);
  }
});
