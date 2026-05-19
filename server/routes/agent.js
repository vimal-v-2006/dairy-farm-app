const express = require('express');
const { runAgent } = require('../agent/agent');
const { cancelPendingAction, confirmPendingAction } = require('../agent/toolExecutor');

function createAgentRouter({ auth }) {
  const router = express.Router();

  router.post('/chat', auth, async (req, res) => {
    const { message, conversationId, confirmedAction, cancelledAction, pendingActionId, history } = req.body || {};

    try {
      if (cancelledAction && pendingActionId) {
        cancelPendingAction({ pendingActionId });
        return res.json({
          reply: 'Cancelled. I did not change the database.',
          needsConfirmation: false,
          pendingAction: null,
          toolResults: [],
          error: null,
          conversationId: conversationId || null
        });
      }

      if (confirmedAction && pendingActionId) {
        const result = confirmPendingAction({ pendingActionId });
        return res.json({
          reply: 'Confirmed. I updated the farm records.',
          needsConfirmation: false,
          pendingAction: null,
          toolResults: [{ tool: 'confirmPendingAction', result }],
          error: null,
          conversationId: conversationId || null
        });
      }

      if (!message || !String(message).trim()) {
        return res.status(400).json({
          reply: 'Please type a message for the farm assistant.',
          needsConfirmation: false,
          pendingAction: null,
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
        pendingAction: null,
        toolResults: [],
        error: 'AGENT_ROUTE_ERROR',
        conversationId: conversationId || null
      });
    }
  });

  return router;
}

module.exports = { createAgentRouter };
