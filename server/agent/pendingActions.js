const crypto = require('crypto');

const pendingActions = new Map();
const TTL_MS = 30 * 60 * 1000;

function cleanupPendingActions() {
  const now = Date.now();
  for (const [id, item] of pendingActions.entries()) {
    if (now - item.createdAt > TTL_MS) pendingActions.delete(id);
  }
}

function createPendingAction(action) {
  cleanupPendingActions();
  const id = crypto.randomUUID();
  const pendingAction = {
    id,
    createdAt: Date.now(),
    ...action
  };
  pendingActions.set(id, pendingAction);
  return pendingAction;
}

function getPendingAction(id) {
  cleanupPendingActions();
  return pendingActions.get(id) || null;
}

function removePendingAction(id) {
  pendingActions.delete(id);
}

module.exports = {
  createPendingAction,
  getPendingAction,
  removePendingAction
};
