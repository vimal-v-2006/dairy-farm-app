const { buildSchemaContext } = require('./schemaInspector');
const { executePlan, validateSql } = require('./dbExecutor');

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
- For milk sales: income = litres * rate_per_litre.
- For cow milk entries: total_litres should be the entered total, or morning_litres + evening_litres.
- Keep SQL concise and use SQLite date functions when helpful.
- Never expose secrets, database paths, JWTs, or password hashes.

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
  const system = `You convert database execution results into a concise friendly answer for the dairy farm app user. Return ONLY JSON: {"reply":"..."}. Do not mention SQL unless needed. Use rupee symbol for money when relevant.`;
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
