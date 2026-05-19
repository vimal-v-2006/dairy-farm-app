const express = require('express');
const { runAgent } = require('../agent/agent');
const { cancelPendingAction, confirmPendingAction, cancelPendingActions, confirmPendingActions } = require('../agent/toolExecutor');

function createAgentRouter({ auth }) {
  const router = express.Router();

  router.post('/chat', auth, async (req, res) => {
    const { message, conversationId, confirmedAction, cancelledAction, pendingActionId, pendingActionIds, history } = req.body || {};

    try {
      if (cancelledAction && (pendingActionIds || pendingActionId)) {
        const ids = pendingActionIds || [pendingActionId].filter(Boolean);
        if (ids.length > 0) cancelPendingActions({ pendingActionIds: ids });
        return res.json({
          reply: ids.length > 1 ? `Cancelled ${ids.length} pending changes.` : 'Cancelled. I did not change the database.',
          needsConfirmation: false,
          pendingActions: [],
          toolResults: [],
          error: null,
          conversationId: conversationId || null
        });
      }

      if (confirmedAction && (pendingActionIds || pendingActionId)) {
        const ids = pendingActionIds || [pendingActionId].filter(Boolean);
        const results = confirmPendingActions({ pendingActionIds: ids });
        return res.json({
          reply: ids.length > 1 ? `Confirmed all ${ids.length} changes. Farm records updated.` : 'Confirmed. I updated the farm records.',
          needsConfirmation: false,
          pendingActions: [],
          toolResults: results.map((r) => ({ tool: 'confirmPendingAction', result: r })),
          error: null,
          conversationId: conversationId || null
        });
      }

      if (!message || !String(message).trim()) {
        return res.status(400).json({
          reply: 'Please type a message for the farm assistant.',
          needsConfirmation: false,
          pendingActions: [],
          toolResults: [],
          error: 'EMPTY_MESSAGE'
        });
      }

      const result = await runAgent({ message: String(message).trim(), history });
      return res.json({ ...result, conversationId: conversationId || null });
    } catch (error) {
      return res.status(500).json({
        reply: error.message || 'AI agent failed safely.',
        needsConfirmation: false,
        pendingActions: [],
        toolResults: [],
        error: 'AGENT_ROUTE_ERROR',
        conversationId: conversationId || null
      });
    }
  });

  return router;
}

module.exports = { createAgentRouter };
