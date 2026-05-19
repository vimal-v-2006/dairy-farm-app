const dayjs = require('dayjs');
const { db } = require('../src/db');
const { createPendingAction, getPendingAction, removePendingAction } = require('./pendingActions');
const { compactRows, formatMoney, monthRange, normalizeDate, toNumber, today } = require('./safety');

function rangeOrDefault(args = {}) {
  return {
    startDate: normalizeDate(args.startDate || monthRange().startDate),
    endDate: normalizeDate(args.endDate || today())
  };
}

function dateFromMonth(value) {
  if (!value) return monthRange();
  const raw = String(value);
  const date = /^\d{4}-\d{2}$/.test(raw) ? `${raw}-01` : raw;
  return monthRange(date);
}

function getSingle(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function getDailyEntryBundleByDate(date) {
  const entry = getSingle('SELECT * FROM daily_entries WHERE entry_date = ?', [date]);
  if (!entry) return { entry: null, cowEntries: [], milkSales: [], expenses: [] };
  return {
    entry,
    cowEntries: db.prepare(`SELECT me.*, c.name AS cow_name
      FROM cow_milk_entries me
      LEFT JOIN cows c ON c.id = me.cow_id
      WHERE me.daily_entry_id = ?
      ORDER BY me.id ASC`).all(entry.id),
    milkSales: db.prepare(`SELECT ms.*, COALESCE(b.name, 'Unknown buyer') AS buyer_name
      FROM milk_sales ms
      LEFT JOIN buyers b ON b.id = ms.buyer_id
      WHERE ms.daily_entry_id = ?
      ORDER BY ms.id ASC`).all(entry.id),
    expenses: db.prepare(`SELECT e.*, COALESCE(c.name, 'Unknown category') AS category_name, cw.name AS cow_name,
        COALESCE(e.food_name_snapshot, f.name) AS food_name, COALESCE(e.unit_type_snapshot, f.unit_type, 'kg') AS unit_type
      FROM expenses e
      LEFT JOIN expense_categories c ON c.id = e.category_id
      LEFT JOIN cows cw ON cw.id = e.cow_id
      LEFT JOIN food_items f ON f.id = e.food_item_id
      WHERE e.daily_entry_id = ?
      ORDER BY e.id ASC`).all(entry.id)
  };
}

function getOrCreateDailyEntry(date) {
  const existing = getSingle('SELECT id FROM daily_entries WHERE entry_date = ?', [date]);
  if (existing) return existing.id;
  const info = db.prepare(`INSERT INTO daily_entries (entry_date, total_milk_litres, remaining_milk_litres, total_income, total_expenses, profit, notes)
    VALUES (?, 0, 0, 0, 0, 0, '')`).run(date);
  return info.lastInsertRowid;
}

function recalcDailyEntry(dailyEntryId) {
  const milk = getSingle('SELECT COALESCE(SUM(total_litres), 0) AS total FROM cow_milk_entries WHERE daily_entry_id = ?', [dailyEntryId])?.total || 0;
  const sales = getSingle('SELECT COALESCE(SUM(litres), 0) AS litres, COALESCE(SUM(income), 0) AS income FROM milk_sales WHERE daily_entry_id = ?', [dailyEntryId]) || {};
  const expenses = getSingle('SELECT COALESCE(SUM(amount), 0) AS amount FROM expenses WHERE daily_entry_id = ?', [dailyEntryId])?.amount || 0;
  const directEntry = getSingle('SELECT total_milk_litres FROM daily_entries WHERE id = ?', [dailyEntryId]);
  const totalMilk = Math.max(toNumber(milk), toNumber(directEntry?.total_milk_litres));
  const income = toNumber(sales.income);
  const totalExpenses = toNumber(expenses);
  const remaining = totalMilk - toNumber(sales.litres);
  const profit = income - totalExpenses;
  db.prepare(`UPDATE daily_entries
    SET total_milk_litres = ?, remaining_milk_litres = ?, total_income = ?, total_expenses = ?, profit = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`).run(totalMilk, remaining, income, totalExpenses, profit, dailyEntryId);
  return getSingle('SELECT * FROM daily_entries WHERE id = ?', [dailyEntryId]);
}

function getCategoryByName(name) {
  return db.prepare('SELECT * FROM expense_categories WHERE lower(name) = lower(?) LIMIT 1').get(name);
}

function getCowByName(name) {
  return db.prepare('SELECT * FROM cows WHERE lower(name) = lower(?) LIMIT 1').get(name);
}

function getBuyerByName(name) {
  return db.prepare('SELECT * FROM buyers WHERE lower(name) = lower(?) LIMIT 1').get(name);
}

function monthlySummary(range) {
  const summary = getSingle(`SELECT COUNT(*) AS totalDays, COALESCE(SUM(total_milk_litres),0) AS milk,
      COALESCE(SUM(total_income),0) AS income, COALESCE(SUM(total_expenses),0) AS expenses,
      COALESCE(SUM(profit),0) AS profit
    FROM daily_entries WHERE entry_date BETWEEN ? AND ?`, [range.startDate, range.endDate]);
  const rows = db.prepare('SELECT * FROM daily_entries WHERE entry_date BETWEEN ? AND ? ORDER BY entry_date ASC').all(range.startDate, range.endDate);
  const buyerWise = db.prepare(`SELECT COALESCE(b.name,'Unknown') AS name, ROUND(SUM(ms.litres),2) AS litres, ROUND(SUM(ms.income),2) AS income
    FROM milk_sales ms
    JOIN daily_entries d ON d.id = ms.daily_entry_id
    LEFT JOIN buyers b ON b.id = ms.buyer_id
    WHERE d.entry_date BETWEEN ? AND ?
    GROUP BY b.name ORDER BY litres DESC`).all(range.startDate, range.endDate);
  const expenseWise = db.prepare(`SELECT CASE WHEN e.expense_type='feed' THEN COALESCE(e.food_name_snapshot, f.name, 'Feed') ELSE COALESCE(c.name,'Unknown') END AS name,
      ROUND(SUM(e.amount),2) AS amount
    FROM expenses e
    JOIN daily_entries d ON d.id = e.daily_entry_id
    LEFT JOIN expense_categories c ON c.id = e.category_id
    LEFT JOIN food_items f ON f.id = e.food_item_id
    WHERE d.entry_date BETWEEN ? AND ?
    GROUP BY CASE WHEN e.expense_type='feed' THEN COALESCE(e.food_name_snapshot, f.name, 'Feed') ELSE COALESCE(c.name,'Unknown') END
    ORDER BY amount DESC`).all(range.startDate, range.endDate);
  const cowWise = db.prepare(`SELECT c.name, ROUND(SUM(me.total_litres),2) AS litres
    FROM cow_milk_entries me
    JOIN cows c ON c.id = me.cow_id
    JOIN daily_entries d ON d.id = me.daily_entry_id
    WHERE d.entry_date BETWEEN ? AND ?
    GROUP BY c.id ORDER BY litres DESC`).all(range.startDate, range.endDate);
  return { range, summary, rows: compactRows(rows), buyerWise, expenseWise, cowWise };
}

function createPending(type, title, payload, preview) {
  return {
    needsConfirmation: true,
    pendingAction: createPendingAction({ type, title, payload, preview }),
    result: { message: 'Pending action created. Ask the user to confirm before writing to the database.', preview }
  };
}

function executeAddExpense(payload) {
  const date = normalizeDate(payload.date);
  const category = getCategoryByName(payload.category);
  if (!category) throw new Error(`Expense category not found: ${payload.category}`);
  const tx = db.transaction(() => {
    const dailyEntryId = getOrCreateDailyEntry(date);
    db.prepare(`INSERT INTO expenses (daily_entry_id, category_id, expense_type, amount, description, payment_mode)
      VALUES (?, ?, 'common', ?, ?, ?)`).run(dailyEntryId, category.id, payload.amount, payload.description || '', payload.paymentMode || 'Cash');
    return recalcDailyEntry(dailyEntryId);
  });
  return tx();
}

function executeAddMilkEntry(payload) {
  const date = normalizeDate(payload.date);
  const cow = getCowByName(payload.cowName);
  if (!cow) throw new Error(`Cow not found: ${payload.cowName}`);
  const morning = toNumber(payload.morningLitres);
  const evening = toNumber(payload.eveningLitres);
  const total = toNumber(payload.totalLitres, morning + evening) || morning + evening;
  if (!(total > 0)) throw new Error('Milk litres must be greater than zero');
  const tx = db.transaction(() => {
    const dailyEntryId = getOrCreateDailyEntry(date);
    const existing = db.prepare('SELECT * FROM cow_milk_entries WHERE daily_entry_id = ? AND cow_id = ? LIMIT 1').get(dailyEntryId, cow.id);
    if (existing) {
      db.prepare(`UPDATE cow_milk_entries SET morning_litres=?, evening_litres=?, total_litres=?, entry_shift=?, status=?, notes=? WHERE id=?`)
        .run(morning, evening, total, payload.shift || null, 'Recorded', payload.notes || existing.notes || '', existing.id);
    } else {
      db.prepare(`INSERT INTO cow_milk_entries (daily_entry_id, cow_id, morning_litres, evening_litres, total_litres, entry_shift, status, notes)
        VALUES (?, ?, ?, ?, ?, ?, 'Recorded', ?)`).run(dailyEntryId, cow.id, morning, evening, total, payload.shift || null, payload.notes || '');
    }
    return recalcDailyEntry(dailyEntryId);
  });
  return tx();
}

function executeAddMilkSale(payload) {
  const date = normalizeDate(payload.date);
  const tx = db.transaction(() => {
    let buyer = getBuyerByName(payload.buyerName);
    if (!buyer) {
      const info = db.prepare('INSERT INTO buyers (name, default_rate, active) VALUES (?, ?, 1)').run(payload.buyerName, toNumber(payload.ratePerLitre));
      buyer = { id: info.lastInsertRowid, name: payload.buyerName, default_rate: toNumber(payload.ratePerLitre) };
    }
    const rate = toNumber(payload.ratePerLitre, buyer.default_rate || 0);
    if (!(rate > 0)) throw new Error('Rate per litre is required for this buyer');
    const dailyEntryId = getOrCreateDailyEntry(date);
    db.prepare(`INSERT INTO milk_sales (daily_entry_id, buyer_id, litres, rate_per_litre, income, payment_status, entry_shift, notes)
      VALUES (?, ?, ?, ?, ?, 'Paid', ?, ?)`).run(dailyEntryId, buyer.id, payload.litres, rate, payload.litres * rate, payload.shift || 'Morning', payload.notes || '');
    return recalcDailyEntry(dailyEntryId);
  });
  return tx();
}

function executeAddCow(payload) {
  const info = db.prepare(`INSERT INTO cows (name, breed, age, status, purchase_date, status_date, purchase_price, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    payload.name,
    payload.breed || '',
    payload.age || '',
    payload.status || 'Lactating',
    payload.purchaseDate || null,
    payload.statusDate || null,
    toNumber(payload.purchasePrice, 0) || null,
    payload.notes || ''
  );
  db.prepare('INSERT INTO cow_update_history (cow_id, updated_at, changes, snapshot) VALUES (?, ?, ?, ?)')
    .run(info.lastInsertRowid, new Date().toISOString(), JSON.stringify([{ field: 'Created', oldValue: '(new record)', newValue: payload.name }]), JSON.stringify({ id: info.lastInsertRowid, name: payload.name }));
  return db.prepare('SELECT * FROM cows WHERE id = ?').get(info.lastInsertRowid);
}

function executeAddCalf(payload) {
  const info = db.prepare(`INSERT INTO calves (name, breed, birth_date, source_type, expected_lactation_date, purchase_price, paid_amount, status, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    payload.name,
    payload.breed || '',
    payload.birthDate || null,
    payload.sourceType || 'raised',
    payload.expectedLactationDate || null,
    Number(payload.purchasePrice || 0),
    Number(payload.paidAmount || 0),
    payload.status || 'Growing',
    payload.notes || ''
  );
  return db.prepare('SELECT * FROM calves WHERE id = ?').get(info.lastInsertRowid);
}

function executeAddCalfExpense(payload) {
  const calf = db.prepare('SELECT id FROM calves WHERE lower(name) = lower(?) LIMIT 1').get(payload.calfName);
  if (!calf) throw new Error(`Calf not found: ${payload.calfName}`);
  const category = getCategoryByName(payload.category);
  if (!category) throw new Error(`Expense category not found: ${payload.category}`);
  const date = normalizeDate(payload.date);
  db.prepare(`INSERT INTO calf_expenses (calf_id, expense_date, expense_type, category_id, amount, description, payment_mode)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).run(calf.id, date, payload.expenseType || 'common', category.id, payload.amount, payload.description || '', payload.paymentMode || 'Cash');
  return db.prepare('SELECT * FROM calf_expenses WHERE id = last_insert_rowid()').get();
}

function executeAddBuyer(payload) {
  const info = db.prepare('INSERT INTO buyers (name, location, default_rate, contact, notes, active) VALUES (?, ?, ?, ?, ?, ?)')
    .run(payload.name, payload.location || '', payload.defaultRate || 0, payload.contact || '', payload.notes || '', payload.active !== false ? 1 : 0);
  return db.prepare('SELECT * FROM buyers WHERE id = ?').get(info.lastInsertRowid);
}

function executeAddFoodItem(payload) {
  const purchaseKg = Number(payload.purchaseKg || 0);
  const purchaseAmount = Number(payload.purchaseAmount || 0);
  const ratePerKg = purchaseKg > 0 ? Number((purchaseAmount / purchaseKg).toFixed(2)) : 0;
  const unitType = payload.unitType || 'kg';
  const info = db.prepare('INSERT INTO food_items (name, purchase_kg, purchase_amount, rate_per_kg, unit_type, notes) VALUES (?, ?, ?, ?, ?, ?)')
    .run(payload.name, purchaseKg, purchaseAmount, ratePerKg, unitType, payload.notes || '');
  db.prepare('INSERT INTO food_price_history (food_item_id, purchase_quantity, purchase_amount, unit_rate, unit_type, effective_from, notes) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(info.lastInsertRowid, purchaseKg, purchaseAmount, ratePerKg, unitType, new Date().toISOString(), payload.notes || '');
  return db.prepare('SELECT * FROM food_items WHERE id = ?').get(info.lastInsertRowid);
}

function executeAddExpenseCategory(payload) {
  const info = db.prepare('INSERT INTO expense_categories (name, is_default) VALUES (?, 0)').run(payload.name);
  return db.prepare('SELECT * FROM expense_categories WHERE id = ?').get(info.lastInsertRowid);
}

function executeAddInvestment(payload) {
  const info = db.prepare(`INSERT INTO investments (source_type, source_id, title, investment_date, investment_amount, notes)
    VALUES (?, ?, ?, ?, ?, ?)`).run(
    payload.sourceType || 'manual',
    payload.sourceId || null,
    payload.title,
    payload.investmentDate,
    Number(payload.investmentAmount),
    payload.notes || ''
  );
  return db.prepare('SELECT * FROM investments WHERE id = ?').get(info.lastInsertRowid);
}

function executeUpdateCow(payload) {
  const existing = db.prepare('SELECT * FROM cows WHERE id = ?').get(payload.cowId);
  if (!existing) throw new Error('Cow not found');
  const newName = payload.name || existing.name;
  const newBreed = payload.breed || existing.breed;
  const newAge = payload.age || existing.age;
  const newStatus = payload.status || existing.status;
  const newPurchaseDate = payload.purchaseDate !== undefined ? payload.purchaseDate : existing.purchase_date;
  const newStatusDate = payload.statusDate !== undefined ? payload.statusDate : existing.status_date;
  const newPurchasePrice = payload.purchasePrice !== undefined ? payload.purchasePrice : existing.purchase_price;
  const newNotes = payload.notes !== undefined ? payload.notes : existing.notes;

  const changes = [];
  if (String(existing.name) !== String(newName)) changes.push({ field: 'Name', oldValue: existing.name, newValue: newName });
  if (String(existing.breed) !== String(newBreed)) changes.push({ field: 'Breed', oldValue: existing.breed, newValue: newBreed });
  if (String(existing.age) !== String(newAge)) changes.push({ field: 'Age', oldValue: existing.age, newValue: newAge });
  if (String(existing.status) !== String(newStatus)) changes.push({ field: 'Lifecycle status', oldValue: existing.status, newValue: newStatus });
  if (String(existing.purchase_date || '') !== String(newPurchaseDate || '')) changes.push({ field: 'Purchase date', oldValue: existing.purchase_date || '(empty)', newValue: newPurchaseDate || '(empty)' });
  if (String(existing.status_date || '') !== String(newStatusDate || '')) changes.push({ field: 'Status date', oldValue: existing.status_date || '(empty)', newValue: newStatusDate || '(empty)' });

  db.prepare(`UPDATE cows SET name=?, breed=?, age=?, status=?, purchase_date=?, status_date=?, purchase_price=?, notes=? WHERE id=?`)
    .run(newName, newBreed, newAge, newStatus, newPurchaseDate, newStatusDate, newPurchasePrice, newNotes, payload.cowId);

  if (changes.length > 0) {
    const updated = db.prepare('SELECT * FROM cows WHERE id = ?').get(payload.cowId);
    db.prepare('INSERT INTO cow_update_history (cow_id, updated_at, changes, snapshot) VALUES (?, ?, ?, ?)')
      .run(payload.cowId, new Date().toISOString(), JSON.stringify(changes), JSON.stringify(updated));
  }

  return db.prepare('SELECT * FROM cows WHERE id = ?').get(payload.cowId);
}

function executeDeleteCow(payload) {
  const cow = db.prepare('SELECT id, name FROM cows WHERE lower(name) = lower(?) LIMIT 1').get(payload.cowName);
  if (!cow) throw new Error(`Cow not found: ${payload.cowName}`);
  const used = db.prepare('SELECT id FROM cow_milk_entries WHERE cow_id = ? LIMIT 1').get(cow.id);
  if (used) throw new Error(`Cow "${cow.name}" is already used in saved daily entries. Update status instead of deleting.`);
  db.prepare('DELETE FROM cows WHERE id = ?').run(cow.id);
  return { deleted: true, name: cow.name, id: cow.id };
}

function executeDeleteCalf(payload) {
  const calf = db.prepare('SELECT id, name, transferred_to_cow_id FROM calves WHERE lower(name) = lower(?) LIMIT 1').get(payload.calfName);
  if (!calf) throw new Error(`Calf not found: ${payload.calfName}`);
  if (calf.transferred_to_cow_id) throw new Error(`Calf "${calf.name}" was already transferred and cannot be deleted.`);
  db.prepare('DELETE FROM calves WHERE id = ?').run(calf.id);
  return { deleted: true, name: calf.name, id: calf.id };
}

function executeCalfTransfer(payload) {
  const calf = db.prepare('SELECT * FROM calves WHERE lower(name) = lower(?) LIMIT 1').get(payload.calfName);
  if (!calf) throw new Error(`Calf not found: ${payload.calfName}`);
  if (calf.transferred_to_cow_id) throw new Error(`Calf "${calf.name}" is already transferred.`);
  const tx = db.transaction(() => {
    const expenseTotal = db.prepare('SELECT COALESCE(SUM(amount),0) total FROM calf_expenses WHERE calf_id=?').get(calf.id)?.total || 0;
    const cowInfo = db.prepare(`INSERT INTO cows (name, breed, age, status, purchase_date, status_date, purchase_price, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
      calf.name, calf.breed || '', 'From calf rearing', 'Lactating',
      calf.birth_date || new Date().toISOString().split('T')[0],
      new Date().toISOString().split('T')[0],
      Number(calf.paid_amount || 0),
      `Transferred from calf. Previous expenses: ${Number(expenseTotal).toFixed(2)}.`
    );
    db.prepare('UPDATE calves SET transferred_to_cow_id=?, transferred_at=?, status=? WHERE id=?')
      .run(cowInfo.lastInsertRowid, new Date().toISOString().split('T')[0], 'Transferred', calf.id);
    return { cowId: cowInfo.lastInsertRowid, calfName: calf.name };
  });
  return tx();
}

function executeDeleteBuyer(payload) {
  const buyer = db.prepare('SELECT id, name FROM buyers WHERE lower(name) = lower(?) LIMIT 1').get(payload.buyerName);
  if (!buyer) throw new Error(`Buyer not found: ${payload.buyerName}`);
  const used = db.prepare('SELECT id FROM milk_sales WHERE buyer_id = ? LIMIT 1').get(buyer.id);
  if (used) throw new Error(`Buyer "${buyer.name}" is already used in saved milk sales. Deactivate instead.`);
  db.prepare('DELETE FROM buyers WHERE id = ?').run(buyer.id);
  return { deleted: true, name: buyer.name, id: buyer.id };
}

function executeDeleteDailyEntry(payload) {
  const date = normalizeDate(payload.date);
  const entry = db.prepare('SELECT id, entry_date FROM daily_entries WHERE entry_date = ?').get(date);
  if (!entry) throw new Error(`Daily entry not found for date: ${date}`);
  db.prepare('DELETE FROM daily_entries WHERE id = ?').run(entry.id);
  return { deleted: true, date: entry.entry_date, id: entry.id };
}

function executeUpdateCalf(payload) {
  const calf = db.prepare('SELECT * FROM calves WHERE lower(name) = lower(?) LIMIT 1').get(payload.calfName);
  if (!calf) throw new Error(`Calf not found: ${payload.calfName}`);
  db.prepare(`UPDATE calves SET name=?, breed=?, birth_date=?, source_type=?, expected_lactation_date=?, purchase_price=?, paid_amount=?, status=?, notes=? WHERE id=?`)
    .run(
      payload.name || calf.name,
      payload.breed || calf.breed,
      payload.birthDate !== undefined ? payload.birthDate : calf.birth_date,
      payload.sourceType || calf.source_type,
      payload.expectedLactationDate !== undefined ? payload.expectedLactationDate : calf.expected_lactation_date,
      payload.purchasePrice !== undefined ? payload.purchasePrice : calf.purchase_price,
      payload.paidAmount !== undefined ? payload.paidAmount : calf.paid_amount,
      payload.status || calf.status,
      payload.notes !== undefined ? payload.notes : calf.notes
    );
  return db.prepare('SELECT * FROM calves WHERE id = ?').get(calf.id);
}

function confirmPendingAction({ pendingActionId }) {
  const pending = getPendingAction(pendingActionId);
  if (!pending) throw new Error('Pending action expired or was already handled');
  let result;
  if (pending.type === 'addExpense') result = executeAddExpense(pending.payload);
  else if (pending.type === 'addMilkEntry') result = executeAddMilkEntry(pending.payload);
  else if (pending.type === 'addMilkSale') result = executeAddMilkSale(pending.payload);
  else if (pending.type === 'addCow') result = executeAddCow(pending.payload);
  else if (pending.type === 'addCalf') result = executeAddCalf(pending.payload);
  else if (pending.type === 'addCalfExpense') result = executeAddCalfExpense(pending.payload);
  else if (pending.type === 'addBuyer') result = executeAddBuyer(pending.payload);
  else if (pending.type === 'addFoodItem') result = executeAddFoodItem(pending.payload);
  else if (pending.type === 'addExpenseCategory') result = executeAddExpenseCategory(pending.payload);
  else if (pending.type === 'addInvestment') result = executeAddInvestment(pending.payload);
  else if (pending.type === 'updateCow') result = executeUpdateCow(pending.payload);
  else if (pending.type === 'deleteCow') result = executeDeleteCow(pending.payload);
  else if (pending.type === 'deleteCalf') result = executeDeleteCalf(pending.payload);
  else if (pending.type === 'calfTransfer') result = executeCalfTransfer(pending.payload);
  else if (pending.type === 'deleteBuyer') result = executeDeleteBuyer(pending.payload);
  else if (pending.type === 'deleteDailyEntry') result = executeDeleteDailyEntry(pending.payload);
  else if (pending.type === 'updateCalf') result = executeUpdateCalf(pending.payload);
  else throw new Error(`Unsupported pending action: ${pending.type}`);
  removePendingAction(pendingActionId);
  return { confirmed: true, action: pending, result };
}

function cancelPendingAction({ pendingActionId }) {
  const pending = getPendingAction(pendingActionId);
  if (pending) removePendingAction(pendingActionId);
  return { cancelled: true, action: pending || null };
}

async function executeTool(toolName, args) {
  switch (toolName) {
    case 'getFarmDashboardData': {
      const range = monthRange();
      return {
        dashboard: monthlySummary(range),
        cows: db.prepare('SELECT * FROM cows ORDER BY created_at DESC').all(),
        buyers: db.prepare('SELECT * FROM buyers ORDER BY active DESC, name ASC').all(),
        investments: db.prepare('SELECT * FROM investments ORDER BY investment_date DESC').all()
      };
    }
    case 'getTodaySummary':
      return getDailyEntryBundleByDate(today());
    case 'getDateSummary':
    case 'generateDailyReport':
      return getDailyEntryBundleByDate(normalizeDate(args.date));
    case 'getMonthlySummary':
    case 'generateMonthlyReport':
      return monthlySummary(dateFromMonth(args.month));
    case 'getMilkProductionSummary': {
      const range = rangeOrDefault(args);
      const totals = getSingle('SELECT COALESCE(SUM(total_milk_litres),0) AS milk, COALESCE(AVG(total_milk_litres),0) AS averageMilk FROM daily_entries WHERE entry_date BETWEEN ? AND ?', [range.startDate, range.endDate]);
      const trend = db.prepare('SELECT entry_date, total_milk_litres, remaining_milk_litres FROM daily_entries WHERE entry_date BETWEEN ? AND ? ORDER BY entry_date ASC').all(range.startDate, range.endDate);
      return { range, totals, trend };
    }
    case 'getCowPerformance':
    case 'compareCowPerformance': {
      const range = rangeOrDefault(args);
      const params = [range.startDate, range.endDate];
      const filter = args.cowName ? 'AND lower(c.name) LIKE lower(?)' : '';
      if (args.cowName) params.push(`%${args.cowName}%`);
      const cows = db.prepare(`SELECT c.id, c.name, c.status, ROUND(COALESCE(SUM(me.total_litres),0),2) AS litres,
          ROUND(AVG(NULLIF(me.total_litres,0)),2) AS averageLitres, COUNT(me.id) AS entries
        FROM cows c
        LEFT JOIN cow_milk_entries me ON me.cow_id = c.id
        LEFT JOIN daily_entries d ON d.id = me.daily_entry_id
        WHERE (d.entry_date BETWEEN ? AND ? OR d.entry_date IS NULL) ${filter}
        GROUP BY c.id ORDER BY litres DESC`).all(...params);
      return { range, cows };
    }
    case 'getExpenseSummary':
    case 'detectHighExpenses': {
      const range = rangeOrDefault(args);
      const topN = args.topN || 10;
      const categoryFilter = args.category ? "AND lower(COALESCE(c.name, e.food_name_snapshot, f.name, '')) LIKE lower(?)" : '';
      const params = [range.startDate, range.endDate];
      if (args.category) params.push(`%${args.category}%`);
      const total = getSingle(`SELECT COALESCE(SUM(e.amount),0) AS amount FROM expenses e JOIN daily_entries d ON d.id=e.daily_entry_id LEFT JOIN expense_categories c ON c.id=e.category_id LEFT JOIN food_items f ON f.id=e.food_item_id WHERE d.entry_date BETWEEN ? AND ? ${categoryFilter}`, params);
      const breakdown = db.prepare(`SELECT CASE WHEN e.expense_type='feed' THEN COALESCE(e.food_name_snapshot, f.name, 'Feed') ELSE COALESCE(c.name,'Unknown') END AS name,
          ROUND(SUM(e.amount),2) AS amount, COUNT(*) AS count
        FROM expenses e
        JOIN daily_entries d ON d.id=e.daily_entry_id
        LEFT JOIN expense_categories c ON c.id=e.category_id
        LEFT JOIN food_items f ON f.id=e.food_item_id
        WHERE d.entry_date BETWEEN ? AND ? ${categoryFilter}
        GROUP BY name ORDER BY amount DESC LIMIT ?`).all(...params, topN);
      return { range, total, breakdown };
    }
    case 'getProfitLoss':
    case 'analyzeMonthlyProfit': {
      const range = toolName === 'analyzeMonthlyProfit' ? dateFromMonth(args.month) : rangeOrDefault(args);
      return monthlySummary(range);
    }
    case 'getBuyerSummary': {
      const range = rangeOrDefault(args);
      const params = [range.startDate, range.endDate];
      const filter = args.buyerName ? 'AND lower(b.name) LIKE lower(?)' : '';
      if (args.buyerName) params.push(`%${args.buyerName}%`);
      const buyers = db.prepare(`SELECT COALESCE(b.name,'Unknown') AS name, ROUND(SUM(ms.litres),2) AS litres,
          ROUND(AVG(ms.rate_per_litre),2) AS averageRate, ROUND(SUM(ms.income),2) AS income
        FROM milk_sales ms
        JOIN daily_entries d ON d.id = ms.daily_entry_id
        LEFT JOIN buyers b ON b.id = ms.buyer_id
        WHERE d.entry_date BETWEEN ? AND ? ${filter}
        GROUP BY b.name ORDER BY litres DESC`).all(...params);
      return { range, buyers };
    }
    case 'searchRecords': {
      const query = `%${args.query}%`;
      const limit = args.limit || 20;
      return {
        cows: db.prepare('SELECT id, name, breed, status, notes FROM cows WHERE name LIKE ? OR breed LIKE ? OR notes LIKE ? LIMIT ?').all(query, query, query, limit),
        buyers: db.prepare('SELECT id, name, location, default_rate, notes FROM buyers WHERE name LIKE ? OR location LIKE ? OR notes LIKE ? LIMIT ?').all(query, query, query, limit),
        expenses: db.prepare(`SELECT e.id, d.entry_date, e.amount, e.description, c.name AS category_name FROM expenses e LEFT JOIN daily_entries d ON d.id=e.daily_entry_id LEFT JOIN expense_categories c ON c.id=e.category_id WHERE e.description LIKE ? OR c.name LIKE ? LIMIT ?`).all(query, query, limit),
        calves: db.prepare('SELECT id, name, breed, status, notes FROM calves WHERE name LIKE ? OR breed LIKE ? OR notes LIKE ? LIMIT ?').all(query, query, query, limit),
        investments: db.prepare('SELECT id, title, investment_date, investment_amount, status, notes FROM investments WHERE title LIKE ? OR notes LIKE ? LIMIT ?').all(query, query, limit)
      };
    }
    case 'getRecentEntries': {
      const rows = db.prepare('SELECT entry_date FROM daily_entries ORDER BY entry_date DESC LIMIT ?').all(args.limit || 10);
      return { entries: rows.map((row) => getDailyEntryBundleByDate(row.entry_date)) };
    }
    case 'detectMilkDrop': {
      const days = args.days || 7;
      const threshold = args.thresholdPercent || 15;
      const currentStart = dayjs().subtract(days - 1, 'day').format('YYYY-MM-DD');
      const previousStart = dayjs().subtract(days * 2 - 1, 'day').format('YYYY-MM-DD');
      const previousEnd = dayjs().subtract(days, 'day').format('YYYY-MM-DD');
      const rows = db.prepare(`SELECT c.name,
          COALESCE(SUM(CASE WHEN d.entry_date BETWEEN ? AND ? THEN me.total_litres END),0) AS previousMilk,
          COALESCE(SUM(CASE WHEN d.entry_date BETWEEN ? AND ? THEN me.total_litres END),0) AS currentMilk
        FROM cows c
        LEFT JOIN cow_milk_entries me ON me.cow_id = c.id
        LEFT JOIN daily_entries d ON d.id = me.daily_entry_id
        GROUP BY c.id`).all(previousStart, previousEnd, currentStart, today());
      return {
        days,
        thresholdPercent: threshold,
        cows: rows.map((row) => {
          const previous = toNumber(row.previousMilk);
          const current = toNumber(row.currentMilk);
          const dropPercent = previous > 0 ? Number((((previous - current) / previous) * 100).toFixed(2)) : 0;
          return { ...row, dropPercent, flagged: previous > 0 && dropPercent >= threshold };
        }).filter((row) => row.previousMilk > 0 || row.currentMilk > 0)
      };
    }
    case 'getCalvesList': {
      const statusFilter = args.status ? 'WHERE lower(status) = lower(?)' : '';
      const params = args.status ? [args.status] : [];
      return db.prepare(`SELECT * FROM calves ${statusFilter} ORDER BY created_at DESC`).all(...params);
    }
    case 'getCalfDetails': {
      const calf = db.prepare('SELECT * FROM calves WHERE lower(name) = lower(?) LIMIT 1').get(args.calfName);
      if (!calf) return { error: `Calf "${args.calfName}" was not found.` };
      const expenses = db.prepare(`SELECT ce.*, COALESCE(ce.food_name_snapshot, f.name) AS food_name, COALESCE(c.name, 'Unknown') AS category_name
        FROM calf_expenses ce
        LEFT JOIN food_items f ON f.id = ce.food_item_id
        LEFT JOIN expense_categories c ON c.id = ce.category_id
        WHERE ce.calf_id = ?
        ORDER BY ce.expense_date DESC, ce.id DESC`).all(calf.id);
      return { calf, expenses };
    }
    case 'getCalfExpenses': {
      const range = rangeOrDefault(args);
      const calfFilter = args.calfName ? 'AND lower(cl.name) = lower(?)' : '';
      const queryParams = [range.startDate, range.endDate];
      if (args.calfName) queryParams.push(args.calfName);
      const expenses = db.prepare(`SELECT ce.*, cl.name AS calf_name, COALESCE(c.name, 'Unknown') AS category_name
        FROM calf_expenses ce
        JOIN calves cl ON cl.id = ce.calf_id
        LEFT JOIN expense_categories c ON c.id = ce.category_id
        WHERE ce.expense_date BETWEEN ? AND ? ${calfFilter}
        ORDER BY ce.expense_date DESC, ce.id DESC`).all(...queryParams);
      return { range, expenses };
    }
    case 'getFoodItems': {
      const items = db.prepare('SELECT * FROM food_items ORDER BY name').all();
      const priceHistory = db.prepare('SELECT * FROM food_price_history ORDER BY food_item_id, effective_from DESC').all();
      return items.map((item) => ({
        ...item,
        priceHistory: priceHistory.filter((ph) => ph.food_item_id === item.id)
      }));
    }
    case 'getExpenseCategories':
      return db.prepare('SELECT * FROM expense_categories ORDER BY name').all();
    case 'getInvestmentsList': {
      const statusFilter = args.status ? 'WHERE lower(status) = lower(?)' : '';
      const params = args.status ? [args.status] : [];
      const investments = db.prepare(`SELECT * FROM investments ${statusFilter} ORDER BY investment_date DESC, id DESC`).all(...params);
      return investments.map((inv) => {
        const recovered = inv.status === 'finished' ? Number(inv.completed_income_amount || inv.investment_amount || 0) : 0;
        return { ...inv, recoveredIncome: Number(recovered.toFixed(2)) };
      });
    }
    case 'getBuyersList': {
      if (args.active !== undefined) {
        return db.prepare('SELECT * FROM buyers WHERE active = ? ORDER BY name').all(args.active ? 1 : 0);
      }
      return db.prepare('SELECT * FROM buyers ORDER BY active DESC, name').all();
    }
    case 'getCowHistory': {
      const cow = db.prepare('SELECT id, name FROM cows WHERE lower(name) = lower(?) LIMIT 1').get(args.cowName);
      if (!cow) return { error: `Cow "${args.cowName}" was not found.` };
      const history = db.prepare('SELECT * FROM cow_update_history WHERE cow_id = ? ORDER BY updated_at DESC').all(cow.id)
        .map((entry) => ({ ...entry, changes: JSON.parse(entry.changes), snapshot: JSON.parse(entry.snapshot) }));
      return { cow, history };
    }
    case 'prepareAddExpense': {
      const date = normalizeDate(args.date);
      const category = getCategoryByName(args.category);
      if (!category) return { error: `Expense category "${args.category}" was not found. Ask the user to choose one of the saved categories.`, categories: db.prepare('SELECT name FROM expense_categories ORDER BY name').all() };
      return createPending('addExpense', 'Add expense', { ...args, date, category: category.name, amount: toNumber(args.amount), paymentMode: args.paymentMode || 'Cash' }, {
        Type: 'Expense',
        Category: category.name,
        Amount: formatMoney(args.amount),
        Date: date,
        Description: args.description || '',
        Payment: args.paymentMode || 'Cash'
      });
    }
    case 'prepareAddMilkEntry': {
      const date = normalizeDate(args.date);
      const cow = getCowByName(args.cowName);
      if (!cow) return { error: `Cow "${args.cowName}" was not found. Ask the user to add the cow first or choose an existing cow.`, cows: db.prepare('SELECT name, status FROM cows ORDER BY name').all() };
      const morning = toNumber(args.morningLitres);
      const evening = toNumber(args.eveningLitres);
      const total = toNumber(args.totalLitres, morning + evening) || morning + evening;
      return createPending('addMilkEntry', 'Add milk entry', { ...args, date, cowName: cow.name, morningLitres: morning, eveningLitres: evening, totalLitres: total }, {
        Type: 'Cow milk entry',
        Cow: cow.name,
        Date: date,
        Morning: `${morning} litres`,
        Evening: `${evening} litres`,
        Total: `${total} litres`,
        Notes: args.notes || ''
      });
    }
    case 'prepareAddMilkSale': {
      const date = normalizeDate(args.date);
      const buyer = getBuyerByName(args.buyerName);
      const rate = toNumber(args.ratePerLitre, buyer?.default_rate || 0);
      if (!(rate > 0)) return { error: `Rate per litre is needed for buyer "${args.buyerName}". Ask the user for the rate.` };
      return createPending('addMilkSale', 'Add milk sale', { ...args, date, buyerName: buyer?.name || args.buyerName, ratePerLitre: rate, shift: args.shift || 'Morning' }, {
        Type: 'Milk sale',
        Buyer: buyer?.name || `${args.buyerName} (new buyer)`,
        Date: date,
        Litres: `${args.litres} litres`,
        Rate: formatMoney(rate),
        Income: formatMoney(args.litres * rate),
        Shift: args.shift || 'Morning'
      });
    }
    case 'prepareAddCow':
      return createPending('addCow', 'Add cow', args, {
        Type: 'Cow',
        Name: args.name,
        Breed: args.breed || '',
        Age: args.age || '',
        Status: args.status || 'Lactating',
        PurchaseDate: args.purchaseDate || '',
        PurchasePrice: args.purchasePrice ? formatMoney(args.purchasePrice) : ''
      });
    case 'prepareAddCalf':
      return createPending('addCalf', 'Add calf', args, {
        Type: 'Calf',
        Name: args.name,
        Breed: args.breed || '',
        BirthDate: args.birthDate || '',
        Source: args.sourceType || 'raised',
        ExpectedLactation: args.expectedLactationDate || '',
        PurchasePrice: args.purchasePrice ? formatMoney(args.purchasePrice) : '',
        PaidAmount: args.paidAmount ? formatMoney(args.paidAmount) : '',
        Status: args.status || 'Growing',
        Notes: args.notes || ''
      });
    case 'prepareAddCalfExpense': {
      const calf = db.prepare('SELECT id, name FROM calves WHERE lower(name) = lower(?) LIMIT 1').get(args.calfName);
      if (!calf) return { error: `Calf "${args.calfName}" was not found.`, calves: db.prepare('SELECT name FROM calves ORDER BY name').all() };
      const category = getCategoryByName(args.category);
      if (!category) return { error: `Expense category "${args.category}" was not found.`, categories: db.prepare('SELECT name FROM expense_categories ORDER BY name').all() };
      return createPending('addCalfExpense', 'Add calf expense', { ...args, calfName: calf.name, category: category.name, amount: toNumber(args.amount), paymentMode: args.paymentMode || 'Cash' }, {
        Type: 'Calf expense',
        Calf: calf.name,
        Category: category.name,
        Amount: formatMoney(args.amount),
        Date: normalizeDate(args.date),
        Description: args.description || '',
        Payment: args.paymentMode || 'Cash'
      });
    }
    case 'prepareAddBuyer':
      return createPending('addBuyer', 'Add buyer', args, {
        Type: 'Buyer',
        Name: args.name,
        Location: args.location || '',
        DefaultRate: args.defaultRate ? formatMoney(args.defaultRate) + '/litre' : '',
        Contact: args.contact || '',
        Active: args.active !== false ? 'Yes' : 'No',
        Notes: args.notes || ''
      });
    case 'prepareAddFoodItem':
      return createPending('addFoodItem', 'Add food item', args, {
        Type: 'Food item',
        Name: args.name,
        PurchaseKg: args.purchaseKg ? `${args.purchaseKg} kg` : '',
        PurchaseAmount: args.purchaseAmount ? formatMoney(args.purchaseAmount) : '',
        UnitType: args.unitType || 'kg',
        Notes: args.notes || ''
      });
    case 'prepareAddExpenseCategory':
      return createPending('addExpenseCategory', 'Add expense category', args, {
        Type: 'Expense category',
        Name: args.name
      });
    case 'prepareAddInvestment':
      return createPending('addInvestment', 'Add investment', args, {
        Type: 'Investment',
        Title: args.title,
        Date: args.investmentDate,
        Amount: formatMoney(args.investmentAmount),
        Source: args.sourceType || 'manual',
        Notes: args.notes || ''
      });
    case 'prepareUpdateCow': {
      const cow = db.prepare('SELECT * FROM cows WHERE lower(name) = lower(?) LIMIT 1').get(args.cowName);
      if (!cow) return { error: `Cow "${args.cowName}" was not found.`, cows: db.prepare('SELECT name FROM cows ORDER BY name').all() };
      return createPending('updateCow', 'Update cow', { ...args, cowId: cow.id }, {
        Type: 'Cow update',
        Cow: cow.name,
        NewName: args.name || cow.name,
        Breed: args.breed || cow.breed,
        Age: args.age || cow.age,
        Status: args.status || cow.status,
        PurchaseDate: args.purchaseDate || cow.purchase_date || '',
        StatusDate: args.statusDate || cow.status_date || '',
        PurchasePrice: args.purchasePrice ? formatMoney(args.purchasePrice) : cow.purchase_price ? formatMoney(cow.purchase_price) : '',
        Notes: args.notes || cow.notes || ''
      });
    }
    case 'prepareDeleteCow': {
      const cow = db.prepare('SELECT * FROM cows WHERE lower(name) = lower(?) LIMIT 1').get(args.cowName);
      if (!cow) return { error: `Cow "${args.cowName}" was not found.`, cows: db.prepare('SELECT name FROM cows ORDER BY name').all() };
      const used = db.prepare('SELECT id FROM cow_milk_entries WHERE cow_id = ? LIMIT 1').get(cow.id);
      if (used) return { error: `Cow "${cow.name}" is used in saved daily entries. Update status instead of deleting.` };
      return createPending('deleteCow', 'Delete cow', { cowName: cow.name, cowId: cow.id }, {
        Type: 'Delete cow',
        Name: cow.name,
        Breed: cow.breed || '',
        Status: cow.status
      });
    }
    case 'prepareDeleteCalf': {
      const calf = db.prepare('SELECT * FROM calves WHERE lower(name) = lower(?) LIMIT 1').get(args.calfName);
      if (!calf) return { error: `Calf "${args.calfName}" was not found.`, calves: db.prepare('SELECT name FROM calves ORDER BY name').all() };
      if (calf.transferred_to_cow_id) return { error: `Calf "${calf.name}" was already transferred and cannot be deleted.` };
      return createPending('deleteCalf', 'Delete calf', { calfName: calf.name, calfId: calf.id }, {
        Type: 'Delete calf',
        Name: calf.name,
        Breed: calf.breed || '',
        Status: calf.status
      });
    }
    case 'prepareCalfTransfer': {
      const calf = db.prepare('SELECT * FROM calves WHERE lower(name) = lower(?) LIMIT 1').get(args.calfName);
      if (!calf) return { error: `Calf "${args.calfName}" was not found.`, calves: db.prepare('SELECT name FROM calves ORDER BY name').all() };
      if (calf.transferred_to_cow_id) return { error: `Calf "${calf.name}" is already transferred to a cow.` };
      return createPending('calfTransfer', 'Transfer calf to cow', { calfName: calf.name, calfId: calf.id }, {
        Type: 'Calf transfer',
        Name: calf.name,
        Breed: calf.breed || '',
        BirthDate: calf.birth_date || '',
        CurrentStatus: calf.status,
        Action: 'Create cow record from this calf'
      });
    }
    case 'prepareDeleteBuyer': {
      const buyer = db.prepare('SELECT * FROM buyers WHERE lower(name) = lower(?) LIMIT 1').get(args.buyerName);
      if (!buyer) return { error: `Buyer "${args.buyerName}" was not found.`, buyers: db.prepare('SELECT name FROM buyers ORDER BY name').all() };
      const used = db.prepare('SELECT id FROM milk_sales WHERE buyer_id = ? LIMIT 1').get(buyer.id);
      if (used) return { error: `Buyer "${buyer.name}" is used in saved milk sales. Deactivate instead of deleting.` };
      return createPending('deleteBuyer', 'Delete buyer', { buyerName: buyer.name, buyerId: buyer.id }, {
        Type: 'Delete buyer',
        Name: buyer.name,
        Location: buyer.location || '',
        Active: buyer.active ? 'Yes' : 'No'
      });
    }
    case 'prepareDeleteDailyEntry': {
      const date = normalizeDate(args.date);
      const entry = db.prepare('SELECT id, entry_date FROM daily_entries WHERE entry_date = ?').get(date);
      if (!entry) return { error: `No daily entry found for ${date}.` };
      return createPending('deleteDailyEntry', 'Delete daily entry', { date: entry.entry_date, entryId: entry.id }, {
        Type: 'Delete daily entry',
        Date: entry.entry_date
      });
    }
    case 'prepareUpdateCalf': {
      const calf = db.prepare('SELECT * FROM calves WHERE lower(name) = lower(?) LIMIT 1').get(args.calfName);
      if (!calf) return { error: `Calf "${args.calfName}" was not found.`, calves: db.prepare('SELECT name FROM calves ORDER BY name').all() };
      return createPending('updateCalf', 'Update calf', { ...args, calfId: calf.id }, {
        Type: 'Calf update',
        Name: args.name || calf.name,
        Breed: args.breed || calf.breed,
        BirthDate: args.birthDate || calf.birth_date || '',
        Source: args.sourceType || calf.source_type,
        Status: args.status || calf.status,
        Notes: args.notes || calf.notes || ''
      });
    }
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = {
  cancelPendingAction,
  confirmPendingAction,
  executeTool
};
