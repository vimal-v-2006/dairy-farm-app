const { buildSystemPrompt } = require('./systemPrompt');
const { chatWithOllama } = require('./ollamaClient');
const { toolDefinitions, validateToolArguments } = require('./toolSchemas');
const { executeTool } = require('./toolExecutor');
const { FALLBACK_MESSAGE } = require('./safety');

const MAX_TOOL_CALLS = 18;

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    const match = String(text || '').match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Model did not return JSON');
    return JSON.parse(match[0]);
  }
}

async function parseModelJson(messages, content) {
  try {
    return safeJsonParse(content);
  } catch {
    const repairMessages = [
      ...messages,
      { role: 'assistant', content },
      { role: 'user', content: 'Your previous response was invalid. Return only valid JSON in the required protocol.' }
    ];
    const repaired = await chatWithOllama(repairMessages, { timeoutMs: 60000 });
    return safeJsonParse(repaired);
  }
}

function normalizeHistory(history = []) {
  if (!Array.isArray(history)) return [];
  return history.slice(-8).flatMap((item) => {
    const messages = [];
    if (item.user) messages.push({ role: 'user', content: String(item.user).slice(0, 2000) });
    if (item.assistant) messages.push({ role: 'assistant', content: JSON.stringify({ type: 'final', answer: String(item.assistant).slice(0, 2000) }) });
    return messages;
  });
}

async function runAgent({ message, history = [] }) {
  const toolResults = [];
  const pendingActions = [];
  const messages = [
    { role: 'system', content: buildSystemPrompt(toolDefinitions) },
    ...normalizeHistory(history),
    { role: 'user', content: message }
  ];

  try {
    for (let i = 0; i < MAX_TOOL_CALLS; i += 1) {
      const content = await chatWithOllama(messages);
      const parsed = await parseModelJson(messages, content);

      if (parsed.type === 'final') {
        if (pendingActions.length > 0) {
          return {
            reply: parsed.answer || 'I have prepared the changes. Please confirm to save them.',
            needsConfirmation: true,
            pendingActions,
            toolResults,
            error: null
          };
        }
        return {
          reply: parsed.answer || '',
          needsConfirmation: false,
          pendingActions: [],
          toolResults,
          error: null
        };
      }

      if (parsed.type !== 'tool_call' || !parsed.tool) {
        throw new Error('Model returned an unsupported response shape');
      }

      const args = validateToolArguments(parsed.tool, parsed.arguments || {});
      const toolResult = await executeTool(parsed.tool, args);
      toolResults.push({ tool: parsed.tool, arguments: args, result: toolResult.result || toolResult });

      if (toolResult.needsConfirmation) {
        pendingActions.push(toolResult.pendingAction);
        messages.push({ role: 'assistant', content: JSON.stringify(parsed) });
        messages.push({ role: 'user', content: `Tool result for ${parsed.tool}: ${JSON.stringify(toolResult)}. You may continue preparing more actions or give a final answer.` });
        continue;
      }

      messages.push({ role: 'assistant', content: JSON.stringify(parsed) });
      messages.push({ role: 'user', content: `Tool result for ${parsed.tool}: ${JSON.stringify(toolResult)}` });
    }

    if (pendingActions.length > 0) {
      return {
        reply: `I have prepared ${pendingActions.length} change(s). Please review and confirm.`,
        needsConfirmation: true,
        pendingActions,
        toolResults,
        error: null
      };
    }

    return {
      reply: 'I checked the data, but this needs more steps than I can safely run in one request. Please ask for a narrower report.',
      needsConfirmation: false,
      pendingActions: [],
      toolResults,
      error: null
    };
  } catch (error) {
    const isOllamaIssue = ['OLLAMA_NOT_READY', 'OLLAMA_TIMEOUT', 'EMPTY_MODEL_RESPONSE', 'AI_DISABLED'].includes(error.code)
      || /fetch failed|ECONNREFUSED|model/i.test(error.message || '');
    return {
      reply: isOllamaIssue ? FALLBACK_MESSAGE : (error.message || 'AI agent failed safely.'),
      needsConfirmation: false,
      pendingActions: [],
      toolResults,
      error: isOllamaIssue ? 'OLLAMA_NOT_READY' : 'AGENT_ERROR'
    };
  }
}

module.exports = { runAgent };
