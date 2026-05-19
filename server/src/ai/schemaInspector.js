const { db } = require('../db');

const INTERNAL_TABLE_PREFIXES = ['sqlite_'];

function isInternalTable(name) {
  return INTERNAL_TABLE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

function getTables() {
  return db.prepare(`
    SELECT name, type, sql
    FROM sqlite_master
    WHERE type IN ('table', 'view')
    ORDER BY type, name
  `).all().filter((table) => !isInternalTable(table.name));
}

function getColumns(tableName) {
  return db.prepare(`PRAGMA table_info(${JSON.stringify(tableName)})`).all().map((column) => ({
    cid: column.cid,
    name: column.name,
    type: column.type || 'ANY',
    notNull: Boolean(column.notnull),
    defaultValue: column.dflt_value,
    primaryKey: Boolean(column.pk)
  }));
}

function getForeignKeys(tableName) {
  return db.prepare(`PRAGMA foreign_key_list(${JSON.stringify(tableName)})`).all().map((fk) => ({
    from: fk.from,
    table: fk.table,
    to: fk.to,
    onUpdate: fk.on_update,
    onDelete: fk.on_delete
  }));
}

function getIndexes(tableName) {
  return db.prepare(`PRAGMA index_list(${JSON.stringify(tableName)})`).all().map((index) => ({
    name: index.name,
    unique: Boolean(index.unique),
    origin: index.origin
  }));
}

function getRelationshipHints() {
  return [
    'daily_entries.id -> cow_milk_entries.daily_entry_id, milk_sales.daily_entry_id, expenses.daily_entry_id',
    'cows.id -> cow_milk_entries.cow_id, expenses.cow_id, cow_update_history.cow_id',
    'buyers.id -> milk_sales.buyer_id',
    'expense_categories.id -> expenses.category_id, calf_expenses.category_id',
    'food_items.id -> expenses.food_item_id, calf_expenses.food_item_id, food_price_history.food_item_id',
    'calves.id -> calf_expenses.calf_id',
    'calves.transferred_to_cow_id -> cows.id',
    'investments can refer to cows/calves using source_type and source_id'
  ];
}

function inspectSchema() {
  const tables = getTables().map((table) => ({
    ...table,
    columns: getColumns(table.name),
    foreignKeys: getForeignKeys(table.name),
    indexes: getIndexes(table.name)
  }));

  return {
    database: 'SQLite via better-sqlite3',
    tables,
    relationshipHints: getRelationshipHints(),
    dateFormat: 'YYYY-MM-DD for business dates such as entry_date, expense_date, investment_date',
    importantBehavior: [
      'daily_entries is the parent/day summary table. The UI opens one daily_entries row by entry_date and then displays child rows from cow_milk_entries, milk_sales, and expenses.',
      'Do not say cow-wise milk production was added by only inserting/updating daily_entries.total_milk_litres. Cow-wise production is visible only when cow_milk_entries rows exist for the daily_entry_id and cow_id.',
      'For cow-wise production, create/find the daily_entries parent first, then INSERT/UPDATE cow_milk_entries with daily_entry_id, cow_id, entry_shift, total_litres, and matching morning_litres/evening_litres. Morning shift stores morning_litres=total_litres and evening_litres=0. Evening shift stores evening_litres=total_litres and morning_litres=0.',
      'Direct total milk production without cow names may update daily_entries.total_milk_litres, but cow-wise requests must use cow_milk_entries child rows.',
      'Milk sales are visible only when milk_sales child rows exist for the daily_entry_id. Always use an existing buyer_id when the user mentions a buyer; if buyer is missing or ambiguous, SELECT buyers and ask before writing.',
      'milk_sales.income must equal litres * rate_per_litre. payment_status should normally be Paid and entry_shift should default to Morning if unknown.',
      'After cow_milk_entries, milk_sales, or expenses writes, daily_entries totals should be recalculated from child rows: milk from cow_milk_entries, income from milk_sales, expenses from expenses, remaining = milk - sold.',
      'expenses usually connect to daily_entries through daily_entry_id',
      'expense categories already include Medical expense, Feed 1-4, Labour, Transport, Electricity, Maintenance, Cow purchase, Other expense',
      'Use SELECT first when updating/deleting ambiguous records so the user can confirm exact rows'
    ]
  };
}

function buildSchemaContext() {
  const schema = inspectSchema();
  const lines = [];
  lines.push(`${schema.database}`);
  schema.tables.forEach((table) => {
    lines.push(`TABLE ${table.name}:`);
    lines.push(`  columns: ${table.columns.map((c) => `${c.name} ${c.type}${c.primaryKey ? ' PK' : ''}${c.notNull ? ' NOT NULL' : ''}`).join(', ')}`);
    if (table.foreignKeys.length) {
      lines.push(`  foreign keys: ${table.foreignKeys.map((fk) => `${fk.from} -> ${fk.table}.${fk.to} ON DELETE ${fk.onDelete}`).join('; ')}`);
    }
  });
  lines.push('RELATIONSHIPS:');
  schema.relationshipHints.forEach((hint) => lines.push(`- ${hint}`));
  lines.push('BUSINESS BEHAVIOR:');
  schema.importantBehavior.forEach((hint) => lines.push(`- ${hint}`));
  return lines.join('\n');
}

module.exports = { inspectSchema, buildSchemaContext };
