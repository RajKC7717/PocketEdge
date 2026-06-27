const http = require('http');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const config = require('../config');
const logger = require('../utils/logger');

const OLLAMA_BASE = 'http://localhost:11434';

// ─── Backend state ───────────────────────────────────────────────────────────
// 'ollama' | 'gemini' | 'none'
let activeBackend = 'none';
let geminiClient = null;

/**
 * Initialise the Gemini SDK client if an API key is configured.
 */
function initGemini() {
  if (config.GEMINI_API_KEY && !geminiClient) {
    geminiClient = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    logger.info('AI', 'Gemini SDK initialised (fallback ready)');
  }
}

// Eagerly try to init on load
initGemini();

/**
 * Quick connectivity probe — resolve to true if Ollama is reachable.
 */
function probeOllama() {
  return new Promise((resolve) => {
    const req = http.get(`${OLLAMA_BASE}/api/tags`, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        try {
          JSON.parse(body);
          resolve(true);
        } catch {
          resolve(false);
        }
      });
    });
    req.on('error', () => resolve(false));
    req.setTimeout(3000, () => { req.destroy(); resolve(false); });
  });
}

// ─── Public handler ──────────────────────────────────────────────────────────

/**
 * Handle AI-related WebSocket messages.
 * Probes Ollama first; falls back to Gemini when unreachable.
 */
function handleAIMessage(ws, clientId, message) {
  switch (message.type) {
    case 'ai:models': {
      handleModelsRequest(ws);
      break;
    }

    case 'ai:chat': {
      handleChatRequest(ws, message);
      break;
    }

    case 'ai:stop': {
      if (ws._activeAIRequest) {
        ws._activeAIRequest.destroy?.();
        ws._activeAIRequest = null;
      }
      break;
    }

    default:
      return false;
  }
  return true;
}

// ─── Models ──────────────────────────────────────────────────────────────────

async function handleModelsRequest(ws) {
  // Always re-probe Ollama so we pick up if the user starts/stops it
  const ollamaUp = await probeOllama();

  if (ollamaUp) {
    activeBackend = 'ollama';
    fetchOllamaModels(ws);
  } else if (config.GEMINI_API_KEY) {
    activeBackend = 'gemini';
    initGemini(); // ensure client exists
    sendGeminiModels(ws);
  } else {
    activeBackend = 'none';
    sendAIError(ws, 'Ollama is not running and no GEMINI_API_KEY is configured. Please start Ollama or add a Gemini API key to .env');
  }
}

function fetchOllamaModels(ws) {
  const req = http.get(`${OLLAMA_BASE}/api/tags`, (res) => {
    let body = '';
    res.on('data', (chunk) => { body += chunk; });
    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        const models = (data.models || []).map((m) => ({
          name: m.name,
          size: m.size,
          modifiedAt: m.modified_at,
        }));

        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'ai:models:response',
            models,
            backend: 'ollama',
          }));
        }
        logger.info('AI', `Backend: Ollama — ${models.length} model(s) available`);
      } catch (err) {
        sendAIError(ws, 'Failed to parse model list');
      }
    });
  });

  req.on('error', (err) => {
    sendAIError(ws, `Ollama not reachable: ${err.message}. Is Ollama running?`);
  });

  req.setTimeout(5000, () => {
    req.destroy();
    sendAIError(ws, 'Ollama connection timed out');
  });
}

function sendGeminiModels(ws) {
  const models = [
    { name: config.GEMINI_MODEL },
    { name: 'gemini-2.5-flash' },
    { name: 'gemini-2.0-flash-lite' },
  ];

  if (ws.readyState === 1) {
    ws.send(JSON.stringify({
      type: 'ai:models:response',
      models,
      backend: 'gemini',
    }));
  }
  logger.info('AI', `Backend: Gemini (Ollama unreachable) — offering ${models.length} model(s)`);
}

// ─── Chat routing ────────────────────────────────────────────────────────────

async function handleChatRequest(ws, message) {
  // Re-check which backend we should use
  if (activeBackend === 'ollama') {
    // Quick sanity: is Ollama still up?
    const stillUp = await probeOllama();
    if (stillUp) {
      streamChatOllama(ws, message);
      return;
    }
    // Ollama went down — try Gemini
    if (config.GEMINI_API_KEY) {
      activeBackend = 'gemini';
      initGemini();
      logger.warn('AI', 'Ollama went down mid-session, switching to Gemini');
    } else {
      sendAIError(ws, 'Ollama stopped responding and no Gemini API key is configured.');
      return;
    }
  }

  if (activeBackend === 'gemini') {
    if (!geminiClient) {
      sendAIError(ws, 'Gemini client not initialised. Check your GEMINI_API_KEY in .env');
      return;
    }
    streamChatGemini(ws, message);
    return;
  }

  sendAIError(ws, 'No AI backend available. Start Ollama or configure GEMINI_API_KEY.');
}

// ─── Ollama streaming (original logic, unchanged) ────────────────────────────

function streamChatOllama(ws, message) {
  const { model, messages, context } = message;

  if (!model || !messages || !Array.isArray(messages)) {
    sendAIError(ws, 'Invalid request: model and messages are required');
    return;
  }

  const ollamaMessages = [];

  if (context) {
    ollamaMessages.push({
      role: 'system',
      content: `You are a helpful coding assistant. The user is currently working on the following file:\n\n\`\`\`\n${context}\n\`\`\`\n\nHelp them with their questions about this code.`,
    });
  }

  ollamaMessages.push(...messages);

  const requestBody = JSON.stringify({
    model,
    messages: ollamaMessages,
    stream: true,
  });

  const options = {
    hostname: 'localhost',
    port: 11434,
    path: '/api/chat',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(requestBody),
    },
  };

  const req = http.request(options, (res) => {
    let buffer = '';

    res.on('data', (chunk) => {
      buffer += chunk.toString();

      // Parse NDJSON lines
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;

        try {
          const data = JSON.parse(line);

          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'ai:token',
              content: data.message?.content || '',
              done: data.done || false,
              totalDuration: data.total_duration,
              evalCount: data.eval_count,
            }));
          }

          if (data.done) {
            ws._activeAIRequest = null;
          }
        } catch (err) {
          // Skip unparseable lines
        }
      }
    });

    res.on('end', () => {
      if (buffer.trim()) {
        try {
          const data = JSON.parse(buffer);
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'ai:token',
              content: data.message?.content || '',
              done: true,
              totalDuration: data.total_duration,
              evalCount: data.eval_count,
            }));
          }
        } catch { /* ignore */ }
      }
      ws._activeAIRequest = null;
    });
  });

  req.on('error', (err) => {
    sendAIError(ws, `Chat request failed: ${err.message}`);
    ws._activeAIRequest = null;
  });

  req.setTimeout(120000, () => {
    req.destroy();
    sendAIError(ws, 'Chat request timed out (120s)');
    ws._activeAIRequest = null;
  });

  ws._activeAIRequest = req;
  req.write(requestBody);
  req.end();

  logger.info('AI', `[Ollama] Chat: model=${model}, messages=${messages.length}`);
}

// ─── Gemini streaming ────────────────────────────────────────────────────────

async function streamChatGemini(ws, message) {
  const { model, messages, context } = message;

  if (!messages || !Array.isArray(messages)) {
    sendAIError(ws, 'Invalid request: messages are required');
    return;
  }

  const modelName = model || config.GEMINI_MODEL;

  try {
    const genModel = geminiClient.getGenerativeModel({ model: modelName });

    // Build Gemini-compatible history.
    // Gemini expects {role: 'user'|'model', parts: [{text}]} and the last
    // message must be role=user (the current prompt).
    const systemParts = [];
    if (context) {
      systemParts.push(`You are a helpful coding assistant. The user is working on:\n\`\`\`\n${context}\n\`\`\`\nHelp them with their questions.`);
    }

    const geminiHistory = [];
    for (const m of messages.slice(0, -1)) {
      // Skip system messages — handled via systemInstruction
      if (m.role === 'system') {
        systemParts.push(m.content);
        continue;
      }
      geminiHistory.push({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      });
    }

    const lastMsg = messages[messages.length - 1];
    const userPrompt = lastMsg?.content || '';

    // Start a chat and stream
    const chat = genModel.startChat({
      history: geminiHistory,
      ...(systemParts.length > 0 && {
        systemInstruction: systemParts.join('\n\n'),
      }),
    });

    // Use an AbortController so ai:stop works
    const controller = new AbortController();
    ws._activeAIRequest = { destroy: () => controller.abort() };

    const result = await chat.sendMessageStream(userPrompt, {
      signal: controller.signal,
    });

    for await (const chunk of result.stream) {
      if (ws.readyState !== 1) break;

      const text = chunk.text();
      if (text) {
        ws.send(JSON.stringify({
          type: 'ai:token',
          content: text,
          done: false,
        }));
      }
    }

    // Final done token
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({
        type: 'ai:token',
        content: '',
        done: true,
      }));
    }

    ws._activeAIRequest = null;
    logger.info('AI', `[Gemini] Chat complete: model=${modelName}, messages=${messages.length}`);
  } catch (err) {
    ws._activeAIRequest = null;

    if (err.name === 'AbortError') {
      // User cancelled — not an error
      logger.info('AI', '[Gemini] Chat aborted by user');
      return;
    }

    let errMsg = err.message || String(err);
    if (errMsg.includes('429 Too Many Requests') || errMsg.includes('Quota exceeded')) {
      errMsg = 'Gemini API free tier quota exceeded. Please wait a minute and try again.';
    } else if (errMsg.length > 200) {
      errMsg = errMsg.substring(0, 200) + '... (truncated)';
    }

    logger.error('AI', `[Gemini] Error: ${errMsg}`);
    sendAIError(ws, `Gemini error: ${errMsg}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sendAIError(ws, errorMessage) {
  logger.error('AI', errorMessage);
  if (ws.readyState === 1) {
    ws.send(JSON.stringify({
      type: 'ai:error',
      message: errorMessage,
    }));
  }
}

module.exports = { handleAIMessage };
