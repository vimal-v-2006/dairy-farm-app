const { db } = require('../src/db');
const { createPendingAction, getPendingAction, removePendingAction } = require('./pendingActions');

function executeQuery({ sql, params = [] }) {
  const trimmed = String(sql).trim().toUpperCase();
  if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('WITH') && !trimmed.startsWith('PRAGMA')) {
    throw new Error('Only SELECT, WITH, and PRAGMA queries are allowed via queryDatabase');
  }
  const stmt = db.prepare(sql);
  const rows = stmt.all(...params);
  return { rows, count: rows.length };
}

function executeWriteDirect(sql, params) {
  const trimmed = String(sql).trim().toUpperCase();
  if (trimmed.startsWith('INSERT')) {
    const stmt = db.prepare(sql);
    const info = stmt.run(...params);
    return { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
  }
  if (trimmed.startsWith('UPDATE') || trimmed.startsWith('DELETE')) {
    const stmt = db.prepare(sql);
    const info = stmt.run(...params);
    return { changes: info.changes };
  }
  throw new Error('Only INSERT, UPDATE, and DELETE statements are supported for writes');
}

function prepareWriteAction({ sql, params = [], preview }) {
  return {
    needsConfirmation: true,
    pendingAction: createPendingAction({
      type: 'sqlWrite',
      title: 'SQL write',
      payload: { sql, params, preview },
      preview: { Action: preview }
    }),
    result: { message: 'Write prepared. Ask the user to confirm before executing.', preview }
  };
}

function confirmPendingAction({ pendingActionId }) {
  const pending = getPendingAction(pendingActionId);
  if (!pending) throw new Error('Pending action not found or expired');
  removePendingAction(pendingActionId);
  const { sql, params = [] } = pending.payload;
  const result = executeWriteDirect(sql, params);
  return { action: pending, result };
}

function cancelPendingAction({ pendingActionId }) {
  const pending = getPendingAction(pendingActionId);
  if (pending) removePendingAction(pendingActionId);
  return { cancelled: true, action: pending || null };
}

function confirmPendingActions({ pendingActionIds }) {
  return pendingActionIds.map((id) => confirmPendingAction({ pendingActionId: id }));
}

function cancelPendingActions({ pendingActionIds }) {
  return pendingActionIds.map((id) => cancelPendingAction({ pendingActionId: id }));
}

async function executeTool(toolName, args) {
  switch (toolName) {
    case 'queryDatabase':
      return executeQuery(args);
    case 'prepareWrite':
      return prepareWriteAction(args);
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

module.exports = {
  executeQuery,
  executeWriteDirect,
  confirmPendingAction,
  cancelPendingAction,
  confirmPendingActions,
  cancelPendingActions,
  executeTool
};
