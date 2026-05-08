const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dbDir = process.env.DB_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(dbDir, { recursive: true });
const configuredDbPath = process.env.DB_PATH || path.join(dbDir, 'dairy-farm.db');

const db = new Database(configuredDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const defaultExpenseCategories = [
  'Feed 1', 'Feed 2', 'Feed 3', 'Feed 4', 'Medical expense', 'Labour', 'Transport', 'Electricity', 'Maintenance', 'Cow purchase', 'Other expense'
];

function initDb() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      breed TEXT,
      age TEXT,
      status TEXT DEFAULT 'Active',
      purchase_date TEXT,
      status_date TEXT,
      purchase_price REAL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS buyers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      location TEXT,
      default_rate REAL DEFAULT 0,
      contact TEXT,
      notes TEXT,
      active INTEGER DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expense_categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS food_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      purchase_kg REAL DEFAULT 0,
      purchase_amount REAL DEFAULT 0,
      rate_per_kg REAL DEFAULT 0,
      unit_type TEXT DEFAULT 'kg',
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS food_price_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      food_item_id INTEGER NOT NULL,
      purchase_quantity REAL DEFAULT 0,
      purchase_amount REAL DEFAULT 0,
      unit_rate REAL DEFAULT 0,
      unit_type TEXT DEFAULT 'kg',
      effective_from TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(food_item_id) REFERENCES food_items(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS calves (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      breed TEXT,
      birth_date TEXT,
      source_type TEXT DEFAULT 'raised',
      expected_lactation_date TEXT,
      purchase_price REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      status TEXT DEFAULT 'Growing',
      notes TEXT,
      transferred_to_cow_id INTEGER,
      transferred_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(transferred_to_cow_id) REFERENCES cows(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS calf_expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      calf_id INTEGER NOT NULL,
      expense_date TEXT NOT NULL,
      expense_type TEXT DEFAULT 'food',
      category_id INTEGER,
      food_item_id INTEGER,
      food_price_history_id INTEGER,
      food_name_snapshot TEXT,
      unit_type_snapshot TEXT,
      rate_effective_from TEXT,
      quantity_kg REAL DEFAULT 0,
      unit_rate REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      entry_shift TEXT,
      description TEXT,
      payment_mode TEXT DEFAULT 'Cash',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(calf_id) REFERENCES calves(id) ON DELETE CASCADE,
      FOREIGN KEY(category_id) REFERENCES expense_categories(id) ON DELETE SET NULL,
      FOREIGN KEY(food_item_id) REFERENCES food_items(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS daily_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entry_date TEXT NOT NULL UNIQUE,
      total_milk_litres REAL DEFAULT 0,
      remaining_milk_litres REAL DEFAULT 0,
      total_income REAL DEFAULT 0,
      total_expenses REAL DEFAULT 0,
      profit REAL DEFAULT 0,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cow_milk_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      daily_entry_id INTEGER NOT NULL,
      cow_id INTEGER NOT NULL,
      morning_litres REAL DEFAULT 0,
      evening_litres REAL DEFAULT 0,
      total_litres REAL DEFAULT 0,
      entry_shift TEXT,
      status TEXT DEFAULT 'Milked',
      notes TEXT,
      FOREIGN KEY(daily_entry_id) REFERENCES daily_entries(id) ON DELETE CASCADE,
      FOREIGN KEY(cow_id) REFERENCES cows(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS milk_sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      daily_entry_id INTEGER NOT NULL,
      buyer_id INTEGER,
      litres REAL DEFAULT 0,
      rate_per_litre REAL DEFAULT 0,
      income REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'Paid',
      entry_shift TEXT DEFAULT 'Morning',
      notes TEXT,
      FOREIGN KEY(daily_entry_id) REFERENCES daily_entries(id) ON DELETE CASCADE,
      FOREIGN KEY(buyer_id) REFERENCES buyers(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      daily_entry_id INTEGER,
      category_id INTEGER,
      expense_type TEXT DEFAULT 'common',
      cow_id INTEGER,
      food_item_id INTEGER,
      food_price_history_id INTEGER,
      food_name_snapshot TEXT,
      unit_type_snapshot TEXT,
      rate_effective_from TEXT,
      quantity_kg REAL DEFAULT 0,
      unit_rate REAL DEFAULT 0,
      amount REAL DEFAULT 0,
      entry_shift TEXT,
      description TEXT,
      payment_mode TEXT,
      bill_path TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(daily_entry_id) REFERENCES daily_entries(id) ON DELETE CASCADE,
      FOREIGN KEY(category_id) REFERENCES expense_categories(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS investments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_type TEXT NOT NULL DEFAULT 'manual',
      source_id INTEGER,
      title TEXT NOT NULL,
      investment_date TEXT NOT NULL,
      investment_amount REAL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      completed_on TEXT,
      completed_income_amount REAL,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const investmentColumns = db.prepare("PRAGMA table_info(investments)").all();
  if (investmentColumns.length && !investmentColumns.some((column) => column.name === 'completed_income_amount')) {
    db.exec('ALTER TABLE investments ADD COLUMN completed_income_amount REAL');
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_investments_status_date ON investments(status, investment_date)');

  const milkSalesColumns = db.prepare("PRAGMA table_info(milk_sales)").all();
  if (!milkSalesColumns.some((column) => column.name === 'payment_mode')) {
    db.exec("ALTER TABLE milk_sales ADD COLUMN payment_mode TEXT DEFAULT 'Cash'");
  }
  if (!milkSalesColumns.some((column) => column.name === 'entry_shift')) {
    db.exec("ALTER TABLE milk_sales ADD COLUMN entry_shift TEXT DEFAULT 'Morning'");
  }

  const cowColumns = db.prepare("PRAGMA table_info(cows)").all();
  if (!cowColumns.some((column) => column.name === 'status_date')) {
    db.exec("ALTER TABLE cows ADD COLUMN status_date TEXT");
  }

  const expenseColumns = db.prepare("PRAGMA table_info(expenses)").all();
  if (!expenseColumns.some((column) => column.name === 'expense_type')) {
    db.exec("ALTER TABLE expenses ADD COLUMN expense_type TEXT DEFAULT 'common'");
  }
  if (!expenseColumns.some((column) => column.name === 'cow_id')) {
    db.exec('ALTER TABLE expenses ADD COLUMN cow_id INTEGER');
  }
  if (!expenseColumns.some((column) => column.name === 'food_item_id')) {
    db.exec('ALTER TABLE expenses ADD COLUMN food_item_id INTEGER');
  }
  if (!expenseColumns.some((column) => column.name === 'quantity_kg')) {
    db.exec('ALTER TABLE expenses ADD COLUMN quantity_kg REAL DEFAULT 0');
  }
  if (!expenseColumns.some((column) => column.name === 'unit_rate')) {
    db.exec('ALTER TABLE expenses ADD COLUMN unit_rate REAL DEFAULT 0');
  }
  if (!expenseColumns.some((column) => column.name === 'food_price_history_id')) {
    db.exec('ALTER TABLE expenses ADD COLUMN food_price_history_id INTEGER');
  }
  if (!expenseColumns.some((column) => column.name === 'food_name_snapshot')) {
    db.exec('ALTER TABLE expenses ADD COLUMN food_name_snapshot TEXT');
  }
  if (!expenseColumns.some((column) => column.name === 'unit_type_snapshot')) {
    db.exec("ALTER TABLE expenses ADD COLUMN unit_type_snapshot TEXT DEFAULT 'kg'");
  }
  if (!expenseColumns.some((column) => column.name === 'rate_effective_from')) {
    db.exec('ALTER TABLE expenses ADD COLUMN rate_effective_from TEXT');
  }
  if (!expenseColumns.some((column) => column.name === 'entry_shift')) {
    db.exec('ALTER TABLE expenses ADD COLUMN entry_shift TEXT');
  }

  const cowMilkColumns = db.prepare("PRAGMA table_info(cow_milk_entries)").all();
  if (!cowMilkColumns.some((column) => column.name === 'entry_shift')) {
    db.exec('ALTER TABLE cow_milk_entries ADD COLUMN entry_shift TEXT');
  }

  const calfExpenseColumns = db.prepare("PRAGMA table_info(calf_expenses)").all();
  if (calfExpenseColumns.length && !calfExpenseColumns.some((column) => column.name === 'category_id')) {
    db.exec('ALTER TABLE calf_expenses ADD COLUMN category_id INTEGER');
  }
  if (calfExpenseColumns.length && !calfExpenseColumns.some((column) => column.name === 'food_price_history_id')) {
    db.exec('ALTER TABLE calf_expenses ADD COLUMN food_price_history_id INTEGER');
  }
  if (calfExpenseColumns.length && !calfExpenseColumns.some((column) => column.name === 'food_name_snapshot')) {
    db.exec('ALTER TABLE calf_expenses ADD COLUMN food_name_snapshot TEXT');
  }
  if (calfExpenseColumns.length && !calfExpenseColumns.some((column) => column.name === 'unit_type_snapshot')) {
    db.exec("ALTER TABLE calf_expenses ADD COLUMN unit_type_snapshot TEXT DEFAULT 'kg'");
  }
  if (calfExpenseColumns.length && !calfExpenseColumns.some((column) => column.name === 'rate_effective_from')) {
    db.exec('ALTER TABLE calf_expenses ADD COLUMN rate_effective_from TEXT');
  }
  if (calfExpenseColumns.length && !calfExpenseColumns.some((column) => column.name === 'entry_shift')) {
    db.exec('ALTER TABLE calf_expenses ADD COLUMN entry_shift TEXT');
  }

  const foodColumns = db.prepare("PRAGMA table_info(food_items)").all();
  if (!foodColumns.some((column) => column.name === 'unit_type')) {
    db.exec("ALTER TABLE food_items ADD COLUMN unit_type TEXT DEFAULT 'kg'");
  }

  db.exec('CREATE INDEX IF NOT EXISTS idx_food_price_history_food_effective ON food_price_history(food_item_id, effective_from DESC)');

  const foodsWithoutHistory = db.prepare(`
    SELECT fi.*
    FROM food_items fi
    LEFT JOIN food_price_history fph ON fph.food_item_id = fi.id
    WHERE fph.id IS NULL
  `).all();

  const insertFoodHistory = db.prepare(`
    INSERT INTO food_price_history (food_item_id, purchase_quantity, purchase_amount, unit_rate, unit_type, effective_from, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  foodsWithoutHistory.forEach((food) => {
    insertFoodHistory.run(
      food.id,
      Number(food.purchase_kg || 0),
      Number(food.purchase_amount || 0),
      Number(food.rate_per_kg || 0),
      food.unit_type || 'kg',
      food.created_at || new Date().toISOString(),
      food.notes || ''
    );
  });

  const existingHistoryKeys = new Set(
    db.prepare('SELECT food_item_id, effective_from, unit_rate, unit_type FROM food_price_history').all()
      .map((row) => `${row.food_item_id}::${row.effective_from}::${Number(row.unit_rate || 0).toFixed(4)}::${row.unit_type || 'kg'}`)
  );

  const historicalExpenseRates = db.prepare(`
    SELECT DISTINCT
      e.food_item_id,
      COALESCE(e.quantity_kg, 0) AS purchase_quantity,
      COALESCE(e.amount, 0) AS purchase_amount,
      COALESCE(e.unit_rate, 0) AS unit_rate,
      COALESCE(e.unit_type_snapshot, fi.unit_type, 'kg') AS unit_type,
      datetime(d.entry_date || ' 23:59:59') AS effective_from,
      e.description AS notes
    FROM expenses e
    JOIN daily_entries d ON d.id = e.daily_entry_id
    LEFT JOIN food_items fi ON fi.id = e.food_item_id
    WHERE e.expense_type = 'feed' AND e.food_item_id IS NOT NULL AND COALESCE(e.unit_rate, 0) > 0
  `).all();

  const historicalCalfRates = db.prepare(`
    SELECT DISTINCT
      ce.food_item_id,
      COALESCE(ce.quantity_kg, 0) AS purchase_quantity,
      COALESCE(ce.amount, 0) AS purchase_amount,
      COALESCE(ce.unit_rate, 0) AS unit_rate,
      COALESCE(ce.unit_type_snapshot, fi.unit_type, 'kg') AS unit_type,
      datetime(ce.expense_date || ' 23:59:59') AS effective_from,
      ce.description AS notes
    FROM calf_expenses ce
    LEFT JOIN food_items fi ON fi.id = ce.food_item_id
    WHERE ce.expense_type = 'feed' AND ce.food_item_id IS NOT NULL AND COALESCE(ce.unit_rate, 0) > 0
  `).all();

  [...historicalExpenseRates, ...historicalCalfRates].forEach((row) => {
    const key = `${row.food_item_id}::${row.effective_from}::${Number(row.unit_rate || 0).toFixed(4)}::${row.unit_type || 'kg'}`;
    if (existingHistoryKeys.has(key)) return;
    insertFoodHistory.run(
      row.food_item_id,
      Number(row.purchase_quantity || 0),
      Number(row.purchase_amount || 0),
      Number(row.unit_rate || 0),
      row.unit_type || 'kg',
      row.effective_from,
      row.notes || ''
    );
    existingHistoryKeys.add(key);
  });

  db.exec(`
    CREATE TABLE IF NOT EXISTS cow_update_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cow_id INTEGER NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      changes TEXT NOT NULL,
      snapshot TEXT NOT NULL,
      FOREIGN KEY(cow_id) REFERENCES cows(id) ON DELETE CASCADE
    )
  `);

  const historyColumns = db.prepare("PRAGMA table_info(cow_update_history)").all();
  if (!historyColumns.length) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cow_update_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cow_id INTEGER NOT NULL,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        changes TEXT NOT NULL,
        snapshot TEXT NOT NULL,
        FOREIGN KEY(cow_id) REFERENCES cows(id) ON DELETE CASCADE
      )
    `);
  }

  const insertCategory = db.prepare('INSERT OR IGNORE INTO expense_categories (name, is_default) VALUES (?, 1)');
  defaultExpenseCategories.forEach((name) => insertCategory.run(name));
}

module.exports = { db, initDb, defaultExpenseCategories };
