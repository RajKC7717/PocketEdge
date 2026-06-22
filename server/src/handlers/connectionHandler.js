const { v4: uuidv4 } = require('uuid');
const os = require('os');
const logger = require('../utils/logger');

// Map of clientId → client info
const clients = new Map();

/**
 * Handle a new WebSocket connection.
 * Registers the client, sends a welcome message, and sets up event listeners.
 */
function handleConnection(ws, req) {
  const clientId = uuidv4();
  const clientInfo = {
    id: clientId,
    ws,
    deviceName: null,
    platform: null,
    connectedAt: Date.now(),
    lastPing: Date.now(),
  };

  clients.set(clientId, clientInfo);

  logger.success(
    'CONNECTION',
    `Client connected: ${clientId.slice(0, 8)}... from ${req.socket.remoteAddress}`
  );

  // Send welcome message with server info
  send(ws, {
    type: 'welcome',
    clientId,
    hostname: os.hostname(),
    platform: process.platform,
    timestamp: Date.now(),
  });

  // Handle incoming messages
  ws.on('message', (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch (err) {
      logger.error('MESSAGE', `Invalid JSON from ${clientId.slice(0, 8)}...: ${err.message}`);
      return;
    }
    routeMessage(ws, clientId, message);
  });

  // Handle disconnect
  ws.on('close', (code, reason) => {
    clients.delete(clientId);
    logger.warn(
      'CONNECTION',
      `Client disconnected: ${clientId.slice(0, 8)}... (code: ${code})`
    );
  });

  // Handle errors
  ws.on('error', (err) => {
    logger.error('CONNECTION', `Error for ${clientId.slice(0, 8)}...: ${err.message}`);
  });

  // Respond to WebSocket-level pong frames (from our server-initiated pings)
  ws.on('pong', () => {
    const client = clients.get(clientId);
    if (client) {
      client.lastPing = Date.now();
    }
  });
}

/**
 * Route an incoming message to the appropriate handler based on its type.
 */
function routeMessage(ws, clientId, message) {
  const client = clients.get(clientId);
  if (!client) return;

  switch (message.type) {
    case 'ping': {
      client.lastPing = Date.now();
      send(ws, {
        type: 'pong',
        timestamp: message.timestamp,
        serverTime: Date.now(),
      });
      break;
    }

    case 'identify': {
      client.deviceName = message.deviceName || 'Unknown Device';
      client.platform = message.platform || 'unknown';
      logger.info(
        'IDENTIFY',
        `${clientId.slice(0, 8)}... → ${client.deviceName} (${client.platform})`
      );
      send(ws, {
        type: 'identified',
        clientId,
        deviceName: client.deviceName,
      });
      break;
    }

    default: {
      // External message handlers can be registered via setMessageHandler
      if (externalHandler) {
        externalHandler(ws, clientId, message);
      } else {
        logger.warn('MESSAGE', `Unhandled message type: ${message.type}`);
      }
      break;
    }
  }
}

/**
 * Send a JSON message to a WebSocket client (only if the socket is open).
 */
function send(ws, data) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

/**
 * Broadcast a JSON message to all connected clients, optionally excluding one.
 */
function broadcast(data, excludeClientId) {
  const payload = JSON.stringify(data);
  for (const [id, client] of clients) {
    if (id !== excludeClientId && client.ws.readyState === 1) {
      client.ws.send(payload);
    }
  }
}

/**
 * Get the clients map (for heartbeat checks, etc.)
 */
function getClients() {
  return clients;
}

// External handler for message types not handled here (terminal, file, ai, etc.)
let externalHandler = null;

/**
 * Register an external message handler for forwarding unhandled message types.
 */
function setMessageHandler(handler) {
  externalHandler = handler;
}

module.exports = {
  handleConnection,
  getClients,
  broadcast,
  send,
  setMessageHandler,
};
