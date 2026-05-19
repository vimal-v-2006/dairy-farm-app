const { FALLBACK_MESSAGE } = require('./safety');

const DEFAULT_TIMEOUT_MS = 240000;

function getOllamaConfig() {
  const rawBaseUrl = process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
  const baseUrl = rawBaseUrl.replace(/\/$/, '').replace(/\/api$/, '');
  return {
    baseUrl,
    model: process.env.OLLAMA_MODEL || 'gemma4:31b-cloud',
    enabled: process.env.AI_AGENT_ENABLED !== 'false',
    apiKey: process.env.OLLAMA_API_KEY || ''
  };
}

async function chatWithOllama(messages, options = {}) {
  const config = getOllamaConfig();
  if (!config.enabled) {
    const error = new Error('AI agent is disabled');
    error.code = 'AI_DISABLED';
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {})
      },
      body: JSON.stringify({
        model: config.model,
        messages,
        stream: false,
        keep_alive: '10m',
        options: {
          temperature: 0.2,
          num_ctx: 8192
        }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      const error = new Error(text || FALLBACK_MESSAGE);
      error.code = 'OLLAMA_NOT_READY';
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    const content = data?.message?.content || data?.response || '';
    if (!content) {
      const error = new Error(FALLBACK_MESSAGE);
      error.code = 'EMPTY_MODEL_RESPONSE';
      throw error;
    }
    return content;
  } catch (error) {
    if (error.name === 'AbortError') {
      const timeoutError = new Error(FALLBACK_MESSAGE);
      timeoutError.code = 'OLLAMA_TIMEOUT';
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = {
  chatWithOllama,
  getOllamaConfig
};
