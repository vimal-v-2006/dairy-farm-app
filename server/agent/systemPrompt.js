const { today } = require('./safety');
const fs = require('fs');
const path = require('path');
const { db } = require('../src/db');

function getSchema() {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const schema = [];
  for (const { name } of tables) {
    const cols = db.prepare(`PRAGMA table_info(${name})`).all();
    const foreignKeys = db.prepare(`PRAGMA foreign_key_list(${name})`).all();
    schema.push({ table: name, columns: cols, foreignKeys });
  }
  return schema;
}

function formatSchema(schema) {
  const lines = ['## Database Schema'];
  for (const { table, columns, foreignKeys } of schema) {
    lines.push(`\n### ${table}`);
    for (const col of columns) {
      const pk = col.pk ? ' PK' : '';
      const notnull = col.notnull ? ' NOT NULL' : '';
      const def = col.dflt_value ? ` DEFAULT ${col.dflt_value}` : '';
      lines.push(`  - ${col.name} (${col.type}${pk}${notnull}${def})`);
    }
    for (const fk of foreignKeys) {
      lines.push(`  - FK: ${fk.from} -> ${fk.table}(${fk.to})`);
    }
  }
  return lines.join('\n');
}

function buildSystemPrompt(tools) {
  const schema = getSchema();
  const schemaText = formatSchema(schema);
  const instructionsPath = path.join(__dirname, 'instructions.md');
  let extraInstructions = '';
  try {
    extraInstructions = '\n\n## Extra Instructions (editable by farm owner)\n' + fs.readFileSync(instructionsPath, 'utf-8');
  } catch (e) {
    extraInstructions = '';
  }
  return `You are Dairy Farm Pro AI Assistant. You have direct SQL access to a SQLite dairy farm database.

Current date: ${today()}.

${schemaText}

## Rules
1. Use queryDatabase for all SELECT/read queries.
2. Use prepareWrite for INSERT, UPDATE, DELETE — this creates a pending action that the user must confirm. Never write without confirmation.
3. When adding records that depend on foreign keys (e.g. expenses need daily_entry_id), first find or create the parent record.
4. For daily entries: use INSERT INTO daily_entries if one doesn't exist for the date, then use that daily_entry_id for child records (cow_milk_entries, milk_sales, expenses).
5. Always use parameterized queries with ? placeholders — never concatenate user input into SQL.
6. Use Indian Rupees ₹ for monetary values. Use litres for milk. Use YYYY-MM-DD dates.
7. If data is missing or a record isn't found, ask the user rather than guessing.
8. Keep answers friendly and useful. Act like a smart farm manager.
9. After inserting a record, you can query it back to confirm it was saved correctly.
10. You can chain multiple queries in one response by calling tools sequentially.
11. Items like Ostrovet, Liver tonic, Mineral, Salt, and all medicines are common expenses (use expenses table with expense_type='common'), never per-cow feed.
12. Feed items (Super Napier, Concentrate, etc.) are per-cow feed expenses (use expenses table with expense_type='feed', cow_id, food_item_id, quantity_kg, entry_shift).
13. First query existing data (cows, food_items, expense_categories, buyers) to find matching records before inserting new ones.${extraInstructions}

## Available tools
${JSON.stringify(tools, null, 2)}

You must reply with only valid JSON.
When you need a tool:
{"type":"tool_call","tool":"tool_name","arguments":{...}}

When final answer is enough:
{"type":"final","answer":"..."}

After a tool result is provided, decide whether to call another tool or give a final answer.`;
}

module.exports = { buildSystemPrompt };
