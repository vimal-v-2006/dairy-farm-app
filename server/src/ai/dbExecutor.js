const { db } = require('../db');

const BLOCKED_KEYWORDS = [
  'ATTACH', 'DETACH', 'DROP', 'ALTER', 'TRUNCATE', 'REINDEX', 'VACUUM', 'PRAGMA',
  'CREATE', 'REPLACE', 'GRANT', 'REVOKE', 'LOAD_EXTENSION', 'sqlite_master', 'sqlite_schema'
];

const WRITE_TABLES_THAT_AFFECT_DAILY_TOTALS = new Set(['cow_milk_entries', 'milk_sales', 'expenses']);

function normalizeSql(sql) {
  return String(sql || '').trim().replace(/;+\s*$/, '');
}

function stripStrings(sql) {
  return sql.replace(/'([^']|'')*'/g, "''").replace(/"([^"]|"")*"/g, '""');
}

function getStatementType(sql) {
  const match = normalizeSql(sql).match(/^\s*(SELECT|WITH|INSERT|UPDATE|DELETE)\b/i);
  return match ? match[1].toUpperCase() : null;
}

function assertSingleStatement(sql) {
  const withoutStrings = stripStrings(sql);
  if (withoutStrings.includes(';')) {
    throw new Error('Only one SQL statement is allowed per action.');
  }
}

function assertNoBlockedKeywords(sql) {
  const upper = stripStrings(sql).toUpperCase();
  for (const keyword of BLOCKED_KEYWORDS) {
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(upper)) {
      throw new Error(`Blocked dangerous SQL keyword: ${keyword}`);
    }
  }
}

function assertWriteHasWhere(sql, type) {
  const upper = stripStrings(sql).toUpperCase();
  if ((type === 'UPDATE' || type === 'DELETE') && !/\bWHERE\b/.test(upper)) {
    throw new Error(`${type} without WHERE is blocked.`);
  }
}

function getTargetTable(sql, type) {
  const normalized = normalizeSql(sql);
  if (type === 'INSERT') return normalized.match(/^INSERT\s+(?:OR\s+(?:IGNORE|ABORT|FAIL|ROLLBACK)\s+)?INTO\s+([`"\[]?\w+[`"\]]?)/i)?.[1]?.replace(/[`"\[\]]/g, '') || null;
  if (type === 'UPDATE') return normalized.match(/^UPDATE\s+([`"\[]?\w+[`"\]]?)/i)?.[1]?.replace(/[`"\[\]]/g, '') || null;
  if (type === 'DELETE') return normalized.match(/^DELETE\s+FROM\s+([`"\[]?\w+[`"\]]?)/i)?.[1]?.replace(/[`"\[\]]/g, '') || null;
  return null;
}

function getWhereClause(sql) {
  const match = normalizeSql(sql).match(/\bWHERE\b([\s\S]*)$/i);
  if (!match) return null;
  return match[1]
    .replace(/\bORDER\s+BY\b[\s\S]*$/i, '')
    .replace(/\bLIMIT\b[\s\S]*$/i, '')
    .trim();
}

function validateSql(sql, options = {}) {
  const safeSql = normalizeSql(sql);
  if (!safeSql) throw new Error('SQL is empty.');
  assertSingleStatement(safeSql);
  assertNoBlockedKeywords(safeSql);

  const type = getStatementType(safeSql);
  if (!type) throw new Error('Only SELECT, INSERT, UPDATE, and DELETE statements are allowed.');
  if (type === 'WITH') {
    if (/\b(INSERT|UPDATE|DELETE)\b/i.test(stripStrings(safeSql))) throw new Error('WITH statements must be read-only.');
    if (!/^WITH\b[\s\S]+\bSELECT\b/i.test(safeSql)) throw new Error('Only read-only WITH SELECT statements are allowed.');
  }

  const writeType = ['INSERT', 'UPDATE', 'DELETE'].includes(type) ? type : null;
  if (writeType && options.readOnly) throw new Error('Write operation blocked in read-only mode.');
  assertWriteHasWhere(safeSql, type);

  return { sql: safeSql, type, targetTable: getTargetTable(safeSql, type) };
}

function collectAffectedDailyEntryIds(sql, type, table) {
  if (!WRITE_TABLES_THAT_AFFECT_DAILY_TOTALS.has(table)) return [];
  if (type !== 'UPDATE' && type !== 'DELETE') return [];
  const where = getWhereClause(sql);
  if (!where) return [];
  const rows = db.prepare(`SELECT DISTINCT daily_entry_id FROM ${table} WHERE ${where}`).all();
  return rows.map((row) => row.daily_entry_id).filter(Boolean);
}

function refreshDailyTotals(dailyEntryIds = []) {
  const ids = Array.from(new Set(dailyEntryIds.map(Number).filter(Boolean)));
  const updateEntry = db.prepare(`
    UPDATE daily_entries
    SET total_milk_litres = ?, remaining_milk_litres = ?, total_income = ?, total_expenses = ?, profit = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `);

  ids.forEach((id) => {
    const milk = db.prepare('SELECT COALESCE(SUM(total_litres),0) AS total FROM cow_milk_entries WHERE daily_entry_id = ?').get(id)?.total || 0;
    const sales = db.prepare('SELECT COALESCE(SUM(litres),0) AS litres, COALESCE(SUM(income),0) AS income FROM milk_sales WHERE daily_entry_id = ?').get(id) || {};
    const expenses = db.prepare('SELECT COALESCE(SUM(amount),0) AS total FROM expenses WHERE daily_entry_id = ?').get(id)?.total || 0;
    const current = db.prepare('SELECT total_milk_litres FROM daily_entries WHERE id = ?').get(id);
    if (!current) return;
    const totalMilk = Number(milk || current.total_milk_litres || 0);
    const totalIncome = Number(sales.income || 0);
    const totalExpenses = Number(expenses || 0);
    updateEntry.run(
      Number(totalMilk.toFixed(2)),
      Number((totalMilk - Number(sales.litres || 0)).toFixed(2)),
      Number(totalIncome.toFixed(2)),
      Number(totalExpenses.toFixed(2)),
      Number((totalIncome - totalExpenses).toFixed(2)),
      id
    );
  });
}

function executeOne(action, options = {}) {
  const sql = typeof action === 'string' ? action : action.sql;
  const validation = validateSql(sql, options);
  console.log('[AI DB SQL]', validation.sql);

  if (validation.type === 'SELECT' || validation.type === 'WITH') {
    const rows = db.prepare(validation.sql).all();
    return { type: 'select', sql: validation.sql, rowCount: rows.length, rows: rows.slice(0, options.maxRows || 100) };
  }

  if (validation.type === 'DELETE' && !options.confirmed) {
    return { type: 'confirmation_required', sql: validation.sql, message: 'Delete operations require confirmation before execution.' };
  }

  const beforeDailyIds = collectAffectedDailyEntryIds(validation.sql, validation.type, validation.targetTable);
  const info = db.prepare(validation.sql).run();
  const afterDailyIds = [...beforeDailyIds];
  if (validation.type === 'INSERT' && WRITE_TABLES_THAT_AFFECT_DAILY_TOTALS.has(validation.targetTable)) {
    const row = db.prepare(`SELECT daily_entry_id FROM ${validation.targetTable} WHERE id = ?`).get(info.lastInsertRowid);
    if (row?.daily_entry_id) afterDailyIds.push(row.daily_entry_id);
  }
  refreshDailyTotals(afterDailyIds);

  return {
    type: validation.type.toLowerCase(),
    sql: validation.sql,
    changes: info.changes,
    lastInsertRowid: Number(info.lastInsertRowid || 0),
    refreshedDailyEntryIds: Array.from(new Set(afterDailyIds.map(Number).filter(Boolean)))
  };
}

function executePlan(plan, options = {}) {
  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  if (!actions.length) return { results: [] };

  const hasWrite = actions.some((action) => ['INSERT', 'UPDATE', 'DELETE'].includes(getStatementType(action.sql || action)));
  const runner = () => ({ results: actions.map((action) => executeOne(action, options)) });
  return hasWrite ? db.transaction(runner)() : runner();
}

module.exports = { validateSql, executeOne, executePlan };
