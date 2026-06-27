const http = require('http');
const WebSocket = require('ws');
const logger = require('../utils/logger');

// Default Chrome DevTools Protocol endpoint
const CDP_HOST = 'localhost';
const CDP_PORT = 9222;

// ---------------------------------------------------------------------------
// Helper: HTTP GET that returns parsed JSON
// ---------------------------------------------------------------------------

/**
 * Perform an HTTP GET request and parse the response as JSON.
 * @param {string} url - Full URL to fetch
 * @returns {Promise<any>} Parsed JSON body
 */
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (err) {
          reject(new Error(`Failed to parse JSON from ${url}: ${err.message}`));
        }
      });
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// ---------------------------------------------------------------------------
// Helper: look up a tab's webSocketDebuggerUrl by tab ID
// ---------------------------------------------------------------------------

/**
 * Fetch the full tab list and return the webSocketDebuggerUrl for the given
 * tab ID.
 * @param {string} tabId - Chrome DevTools tab ID
 * @returns {Promise<string>} webSocketDebuggerUrl
 */
async function getTabDebuggerUrl(tabId) {
  const tabs = await fetchJSON(`http://${CDP_HOST}:${CDP_PORT}/json`);
  const tab = tabs.find((t) => t.id === tabId);

  if (!tab) {
    throw new Error(`Tab not found: ${tabId}`);
  }
  if (!tab.webSocketDebuggerUrl) {
    throw new Error(`Tab ${tabId} does not expose a debugger WebSocket`);
  }

  return tab.webSocketDebuggerUrl;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

/**
 * Handle browser-related WebSocket messages (Chrome DevTools Protocol).
 * @param {WebSocket} ws   - Client WebSocket connection
 * @param {string} clientId
 * @param {object} message - Parsed JSON message from the client
 * @returns {boolean} true if the message was handled, false otherwise
 */
function handleBrowserMessage(ws, clientId, message) {
  switch (message.type) {
    // -----------------------------------------------------------------------
    // List open browser tabs
    // -----------------------------------------------------------------------
    case 'browser:tabs:list': {
      fetchJSON(`http://${CDP_HOST}:${CDP_PORT}/json`)
        .then((tabs) => {
          // Filter to only real user-visible tabs (exclude extensions, devtools, internal pages)
          const filtered = tabs
            .filter((t) => {
              // Must be a page type
              if (t.type !== 'page') return false;
              // Exclude internal browser pages
              const url = (t.url || '').toLowerCase();
              if (url.startsWith('chrome://')) return false;
              if (url.startsWith('chrome-extension://')) return false;
              if (url.startsWith('devtools://')) return false;
              if (url.startsWith('about:')) return false;
              if (url.startsWith('edge://')) return false;
              if (url.startsWith('brave://')) return false;
              return true;
            })
            .map((t) => ({
              id: t.id,
              title: t.title,
              url: t.url,
              favIconUrl: t.favIconUrl,
            }));

          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'browser:tabs:list:response',
              tabs: filtered,
            }));
          }

          logger.info('BROWSER', `Sent ${filtered.length} tab(s) to client ${clientId}`);
        })
        .catch((err) => {
          const isRefused = err.code === 'ECONNREFUSED';

          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'browser:tabs:error',
              reason: isRefused ? 'not_running' : 'error',
              message: isRefused
                ? 'Chrome remote debugging is not enabled. Launch Chrome with --remote-debugging-port=9222'
                : err.message,
            }));
          }

          logger.error('BROWSER', `tabs:list failed: ${err.message}`);
        });
      break;
    }

    // -----------------------------------------------------------------------
    // Close a tab
    // -----------------------------------------------------------------------
    case 'browser:tab:close': {
      const { tabId } = message;

      if (!tabId) {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'browser:tab:close:response',
            tabId: null,
            success: false,
            error: 'Missing tabId',
          }));
        }
        break;
      }

      // Note: /json/close/ returns plain text "Target is closing", NOT JSON
      http.get(`http://${CDP_HOST}:${CDP_PORT}/json/close/${tabId}`, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'browser:tab:close:response',
              tabId,
              success: true,
            }));
          }
          logger.info('BROWSER', `Tab ${tabId} closed by client ${clientId}`);
        });
      }).on('error', (err) => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'browser:tab:close:response',
            tabId,
            success: false,
            error: err.message,
          }));
        }
        logger.error('BROWSER', `tab:close failed for ${tabId}: ${err.message}`);
      });
      break;
    }

    // -----------------------------------------------------------------------
    // Freeze / unfreeze a tab (CPU-throttle via Emulation domain)
    // -----------------------------------------------------------------------
    case 'browser:tab:freeze': {
      const { tabId, freeze } = message;

      if (!tabId) {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'browser:tab:freeze:response',
            tabId: null,
            frozen: !!freeze,
            success: false,
            error: 'Missing tabId',
          }));
        }
        break;
      }

      getTabDebuggerUrl(tabId)
        .then((debuggerUrl) => {
          return new Promise((resolve, reject) => {
            const cdpSocket = new WebSocket(debuggerUrl);

            const timeout = setTimeout(() => {
              cdpSocket.terminate();
              reject(new Error('CDP WebSocket timed out'));
            }, 5000);

            cdpSocket.on('open', () => {
              // rate: 1 = normal speed, 100 = near-frozen
              cdpSocket.send(JSON.stringify({
                id: 1,
                method: 'Emulation.setCPUThrottlingRate',
                params: { rate: freeze ? 100 : 1 },
              }));
            });

            cdpSocket.on('message', (raw) => {
              try {
                const resp = JSON.parse(raw);
                if (resp.id === 1) {
                  clearTimeout(timeout);
                  cdpSocket.close();
                  resolve(resp);
                }
              } catch (e) {
                // Ignore non-JSON messages from CDP
              }
            });

            cdpSocket.on('error', (err) => {
              clearTimeout(timeout);
              reject(err);
            });
          });
        })
        .then(() => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'browser:tab:freeze:response',
              tabId,
              frozen: !!freeze,
              success: true,
            }));
          }

          logger.info('BROWSER', `Tab ${tabId} ${freeze ? 'frozen' : 'unfrozen'} by client ${clientId}`);
        })
        .catch((err) => {
          if (ws.readyState === 1) {
            ws.send(JSON.stringify({
              type: 'browser:tab:freeze:response',
              tabId,
              frozen: !!freeze,
              success: false,
              error: err.message,
            }));
          }

          logger.error('BROWSER', `tab:freeze failed for ${tabId}: ${err.message}`);
        });
      break;
    }

    default:
      return false; // Not handled
  }

  return true; // Handled
}

module.exports = { handleBrowserMessage };
