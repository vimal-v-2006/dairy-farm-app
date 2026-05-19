const { buildSchemaContext } = require('./schemaInspector');
const { executePlan, validateSql } = require('./dbExecutor');
const { db } = require('../db');

const pendingConfirmations = new Map();
const OLLAMA_UNAVAILABLE_REPLY = 'AI model is not available right now. Please check Ollama and the gemma4:31b-cloud model.';

function getOllamaConfig() {
  return {
    baseUrl: (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, ''),
    model: process.env.OLLAMA_MODEL || 'gemma4:31b-cloud'
  };
}

function extractJson(text) {
  if (!text) throw new Error('AI returned an empty response.');
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI did not return JSON.');
    return JSON.parse(match[0]);
  }
}

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function isConfirmationMessage(message) {
  return /^(yes|y|confirm|confirmed|ok|okay|do it|execute|delete it|proceed)$/i.test(String(message || '').trim());
}

function needsConfirmation(plan) {
  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  return actions.some((action) => {
    const sql = action.sql || action;
    try {
      const validated = validateSql(sql);
      if (validated.type === 'DELETE') return true;
      if (validated.type === 'UPDATE' && /\b(users|password_hash)\b/i.test(validated.sql)) return true;
      return Boolean(action.requiresConfirmation);
    } catch {
      return false;
    }
  });
}

function getActionTable(action) {
  const sql = String(action?.sql || action || '').trim();
  const insertMatch = sql.match(/^INSERT\s+(?:OR\s+(?:IGNORE|ABORT|FAIL|ROLLBACK)\s+)?INTO\s+([`"\[]?\w+[`"\]]?)/i);
  if (insertMatch) return insertMatch[1].replace(/[`"\[\]]/g, '').toLowerCase();
  const updateMatch = sql.match(/^UPDATE\s+([`"\[]?\w+[`"\]]?)/i);
  if (updateMatch) return updateMatch[1].replace(/[`"\[\]]/g, '').toLowerCase();
  const deleteMatch = sql.match(/^DELETE\s+FROM\s+([`"\[]?\w+[`"\]]?)/i);
  if (deleteMatch) return deleteMatch[1].replace(/[`"\[\]]/g, '').toLowerCase();
  return null;
}

function planHasWrite(plan) {
  return (Array.isArray(plan?.actions) ? plan.actions : []).some((action) => /^(INSERT|UPDATE|DELETE)\b/i.test(String(action.sql || action || '').trim()));
}

function planWritesTable(plan, tableName) {
  return (Array.isArray(plan?.actions) ? plan.actions : []).some((action) => getActionTable(action) === tableName);
}

function insertColumnsForTable(action, tableName) {
  if (getActionTable(action) !== tableName) return [];
  const sql = String(action?.sql || action || '').trim();
  const match = sql.match(/^INSERT\s+(?:OR\s+(?:IGNORE|ABORT|FAIL|ROLLBACK)\s+)?INTO\s+[`"\[]?\w+[`"\]]?\s*\(([^)]+)\)/i);
  if (!match) return [];
  return match[1].split(',').map((column) => column.trim().replace(/[`"\[\]]/g, '').toLowerCase());
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function messageMentionsKnownCow(message) {
  try {
    const normalized = String(message || '').toLowerCase();
    return db.prepare("SELECT name FROM cows WHERE name IS NOT NULL AND TRIM(name) != ''").all()
      .some((cow) => new RegExp(`\\b${escapeRegex(String(cow.name).toLowerCase())}\\b`).test(normalized));
  } catch {
    return false;
  }
}

function validateBusinessPlanForVisibility(userMessage, plan) {
  if (!planHasWrite(plan)) return null;
  const message = String(userMessage || '').toLowerCase();
  const actions = Array.isArray(plan?.actions) ? plan.actions : [];
  const wantsSale = /\b(sales?|sell|sold|buyer|customer|aavin|payment for milk)\b/.test(message);
  const wantsCowWiseMilk = (/(cow\s*wise|cow-wise|\bcow\b|\bcows\b|\bmilked\b)/.test(message) || messageMentionsKnownCow(userMessage))
    && /\b(milk|litre|liter|litres|liters|production|produced|yield)\b/.test(message)
    && !/\bdirect\b/.test(message);

  if (wantsSale && !planWritesTable(plan, 'milk_sales')) {
    return 'I should save milk sales in the milk sales rows, not only in the daily total. Please include the buyer/date/litres/rate, and I will add it correctly.';
  }

  if (wantsCowWiseMilk && !planWritesTable(plan, 'cow_milk_entries')) {
    return 'I should save cow-wise production in cow milk entry rows so it appears in the cow-wise section. Please include the cow name, date, shift, and litres.';
  }

  const milkSaleInserts = actions.filter((action) => getActionTable(action) === 'milk_sales' && /^INSERT\b/i.test(String(action.sql || action || '').trim()));
  if (milkSaleInserts.some((action) => !insertColumnsForTable(action, 'milk_sales').includes('buyer_id'))) {
    return 'Milk sales need a buyer so they appear correctly in the Sales section. Please mention the buyer name, or ask me to list buyers first.';
  }

  const cowMilkInserts = actions.filter((action) => getActionTable(action) === 'cow_milk_entries' && /^INSERT\b/i.test(String(action.sql || action || '').trim()));
  if (cowMilkInserts.some((action) => !insertColumnsForTable(action, 'cow_milk_entries').includes('cow_id'))) {
    return 'Cow-wise milk entries need a cow name/id so they appear correctly. Please mention which cow produced the milk.';
  }

  return null;
}

function buildSystemPrompt(schemaContext) {
  return `You are the backend AI database assistant for Milk Business Pro, a dairy farm financial app.
You receive the SQLite schema and a natural language user request. Return ONLY valid JSON. No markdown.

DATABASE SCHEMA:
${schemaContext}

CURRENT DATE: ${todayIsoDate()}

SECURITY AND EXECUTION RULES:
- The frontend never touches the database. You are inside the backend.
- Generate a small DB plan using generic SQL actions, not hardcoded app tools.
- Allowed SQL only: SELECT, INSERT, UPDATE, DELETE.
- Never generate DROP, ALTER, CREATE, PRAGMA, VACUUM, ATTACH, DETACH, schema changes, or multiple statements in one SQL string.
- UPDATE and DELETE must always include a precise WHERE clause.
- DELETE is dangerous: first SELECT matching rows and set requiresConfirmation true unless the user is already confirming a pending delete.
- If a delete request matches multiple possible rows, only SELECT choices and ask the user which row to delete.
- Normal safe INSERTs may execute without confirmation.
- Simple precise UPDATEs may execute without confirmation, but if ambiguous, SELECT first and ask a clarifying question.
- Prefer existing categories/rows. Use SELECT first if you need IDs such as category_id, daily_entry_id, cow_id, buyer_id, food_item_id.
- For expenses: ensure a daily_entries row exists for the target date before inserting expenses. You may use INSERT OR IGNORE into daily_entries(entry_date,...).
- For cow-wise milk production: ensure a daily_entries row exists, then write cow_milk_entries. Never only update daily_entries.total_milk_litres for cow-wise/cow-named production. Use existing cows.id; if cow is missing or ambiguous, SELECT cows and ask.
- For milk sales: ensure a daily_entries row exists, then write milk_sales with an existing buyer_id, litres, rate_per_litre, income, payment_status, and entry_shift. If buyer is missing or ambiguous, SELECT buyers and ask.
- For parent creation, use INSERT OR IGNORE INTO daily_entries(entry_date, total_milk_litres, remaining_milk_litres, total_income, total_expenses, profit, notes) VALUES (...), then use SELECT id FROM daily_entries WHERE entry_date = ... for child rows.
- For milk sales: income = litres * rate_per_litre.
- For cow milk entries: total_litres should be the entered total, or morning_litres + evening_litres.
- Keep SQL concise and use SQLite date functions when helpful.
- Never expose secrets, database paths, JWTs, or password hashes.
- User-facing reply text must be plain text only: no markdown, no **bold**, no headings, no code fences.

Return JSON with this exact shape:
{
  "reply": "short human answer or confirmation question",
  "actions": [
    { "sql": "SELECT ...", "purpose": "why this query is needed", "requiresConfirmation": false }
  ],
  "readOnly": false,
  "expectsConfirmation": false
}

If the user is asking only for explanation or you cannot safely decide the SQL, return actions: [] and a helpful reply.`;
}

async function callOllama(messages) {
  const { baseUrl, model } = getOllamaConfig();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages, stream: false, format: 'json' }),
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Ollama returned HTTP ${response.status}`);
    const data = await response.json();
    return data.message?.content || '';
  } finally {
    clearTimeout(timeout);
  }
}

function summarizeResults(plan, execution) {
  const results = execution.results || [];
  return results.map((result, index) => ({
    index,
    purpose: plan.actions?.[index]?.purpose || '',
    type: result.type,
    rowCount: result.rowCount,
    changes: result.changes,
    lastInsertRowid: result.lastInsertRowid,
    rows: result.rows
  }));
}

async function makeReplyFromResults(userMessage, plan, execution) {
  const schemaContext = buildSchemaContext();
  const resultSummary = summarizeResults(plan, execution);
  const system = `You convert database execution results into a concise friendly answer for the dairy farm app user. Return ONLY JSON: {"reply":"..."}. Do not mention SQL unless needed. Use rupee symbol for money when relevant. Write plain text only: no markdown, no **bold**, no headings, no code fences.`;
  const content = await callOllama([
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify({ userMessage, schemaContext, planReply: plan.reply, results: resultSummary }).slice(0, 20000) }
  ]);
  return extractJson(content).reply || plan.reply || 'Done.';
}

async function planForMessage(message) {
  const schemaContext = buildSchemaContext();
  const content = await callOllama([
    { role: 'system', content: buildSystemPrompt(schemaContext) },
    { role: 'user', content: message }
  ]);
  const plan = extractJson(content);
  if (!Array.isArray(plan.actions)) plan.actions = [];
  return plan;
}

async function handleChat({ message, userId = 'default' }) {
  const trimmed = String(message || '').trim();
  if (!trimmed) return { success: true, reply: 'Please type a question or database request.', actions: [], data: {} };

  try {
    const pending = pendingConfirmations.get(userId);
    if (pending && isConfirmationMessage(trimmed)) {
      pendingConfirmations.delete(userId);
      const execution = executePlan(pending.plan, { confirmed: true });
      const reply = await makeReplyFromResults(pending.originalMessage, pending.plan, execution);
      return { success: true, reply, actions: pending.plan.actions || [], data: { results: summarizeResults(pending.plan, execution) } };
    }

    const plan = await planForMessage(trimmed);
    if (!plan.actions.length) {
      return { success: true, reply: plan.reply || 'I need a clearer database request.', actions: [], data: {} };
    }

    const visibilityProblem = validateBusinessPlanForVisibility(trimmed, plan);
    if (visibilityProblem) {
      console.warn('[AI DB Plan Blocked]', visibilityProblem, plan.actions);
      return { success: true, reply: visibilityProblem, actions: [], data: { blockedPlan: true } };
    }

    // Validate before saving/executing so unsafe plans fail closed.
    plan.actions.forEach((action) => validateSql(action.sql || action, { readOnly: Boolean(plan.readOnly) }));

    if (needsConfirmation(plan) || plan.expectsConfirmation) {
      const confirmationId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      pendingConfirmations.set(userId, { confirmationId, originalMessage: trimmed, plan, createdAt: Date.now() });
      return {
        success: true,
        reply: plan.reply || 'This action needs confirmation. Reply yes to execute it.',
        actions: plan.actions,
        data: { confirmationRequired: true, confirmationId }
      };
    }

    const execution = executePlan(plan);
    const reply = await makeReplyFromResults(trimmed, plan, execution);
    return { success: true, reply, actions: plan.actions, data: { results: summarizeResults(plan, execution) } };
  } catch (err) {
    const messageText = String(err.message || err);
    if (/fetch|Ollama|abort|ECONNREFUSED|ENOTFOUND|terminated|HTTP 404|HTTP 500/i.test(messageText)) {
      return { success: true, reply: OLLAMA_UNAVAILABLE_REPLY, actions: [], data: { error: 'ollama_unavailable' } };
    }
    console.error('[AI DB Agent Error]', err);
    return { success: false, reply: 'I could not safely complete that database request.', actions: [], data: { error: messageText } };
  }
}

module.exports = { handleChat, OLLAMA_UNAVAILABLE_REPLY };
