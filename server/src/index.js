const http = require('http');
const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');
const { Bonjour } = require('bonjour-service');
const os = require('os');

const config = require('./config');
const logger = require('./utils/logger');
const { handleConnection, getClients, setMessageHandler } = require('./handlers/connectionHandler');
const { handleTerminalMessage, terminalManager } = require('./handlers/terminalHandler');
const { handleFileMessage, fileManager } = require('./handlers/fileHandler');
const { handleAIMessage } = require('./handlers/aiHandler');

// ─── Express Setup ───────────────────────────────────────────────────────────

const app = express();
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    hostname: os.hostname(),
    platform: process.platform,
    uptime: Math.floor(process.uptime()),
    connectedClients: getClients().size,
    timestamp: Date.now(),
  });
});

// ─── HTTP + WebSocket Server ─────────────────────────────────────────────────

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  handleConnection(ws, req);
});

// ─── Message Routing ─────────────────────────────────────────────────────────

// Route unhandled messages to feature handlers (terminal, file, ai, etc.)
setMessageHandler((ws, clientId, message) => {
  // Try terminal handler
  if (handleTerminalMessage(ws, clientId, message)) return;

  // Try file handler
  if (handleFileMessage(ws, clientId, message)) return;

  // Try AI handler
  if (handleAIMessage(ws, clientId, message)) return;

  logger.warn('ROUTER', `Unhandled message type: ${message.type}`);
});

// ─── Heartbeat ───────────────────────────────────────────────────────────────

const heartbeatInterval = setInterval(() => {
  const now = Date.now();
  for (const [id, client] of getClients()) {
    if (client.ws.readyState !== 1) continue;

    // If client hasn't responded within timeout, terminate
    if (now - client.lastPing > config.HEARTBEAT_TIMEOUT) {
      logger.warn('HEARTBEAT', `Client ${id.slice(0, 8)}... timed out — terminating`);
      client.ws.terminate();
      getClients().delete(id);
      continue;
    }

    // Send a WebSocket-level ping frame
    client.ws.ping();
  }
}, config.HEARTBEAT_INTERVAL);

wss.on('close', () => {
  clearInterval(heartbeatInterval);
});

// ─── mDNS Advertisement ─────────────────────────────────────────────────────

const bonjour = new Bonjour();

/**
 * Get all available local IPv4 addresses with their interface names.
 * Filters out virtual adapters and loopback.
 */
function getAllLocalIPs() {
  const interfaces = os.networkInterfaces();
  const results = [];

  // Interface names to SKIP (virtual adapters)
  const VIRTUAL_PATTERNS = [
    'virtualbox', 'vmware', 'vmnet', 'docker', 'vethernet',
    'hyper-v', 'wsl', 'bluetooth', 'loopback',
    'vbox', 'virbr', 'br-', 'ham',
  ];

  for (const [name, addrs] of Object.entries(interfaces)) {
    const nameLower = name.toLowerCase();

    // Check if this is a virtual adapter
    const isVirtual = VIRTUAL_PATTERNS.some((pattern) => nameLower.includes(pattern));

    for (const iface of addrs) {
      if (iface.family === 'IPv4' && !iface.internal) {
        results.push({
          name,
          address: iface.address,
          isVirtual,
          // Higher priority = preferred. WiFi/WLAN highest, then Ethernet, then others
          priority: nameLower.includes('wi-fi') || nameLower.includes('wlan') ? 3
            : nameLower.includes('eth') ? 2
            : isVirtual ? 0
            : 1,
        });
      }
    }
  }

  // Sort by priority descending
  results.sort((a, b) => b.priority - a.priority);
  return results;
}

function getLocalIP() {
  const ips = getAllLocalIPs();
  // Return the highest-priority non-virtual IP, or first available
  const best = ips.find((ip) => !ip.isVirtual) || ips[0];
  return best ? best.address : '127.0.0.1';
}

// ─── Start ───────────────────────────────────────────────────────────────────

server.listen(config.PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  const allIPs = getAllLocalIPs();

  console.log('');
  logger.success('SERVER', `🚀 Pocket Edge server is running`);
  logger.info('SERVER', `   Local:     http://localhost:${config.PORT}`);
  logger.info('SERVER', `   Network:   http://${localIP}:${config.PORT}`);
  logger.info('SERVER', `   WebSocket: ws://${localIP}:${config.PORT}`);
  console.log('');

  // Log ALL available network interfaces so user knows which IP to use
  logger.info('NETWORK', '📋 Available network interfaces:');
  for (const ip of allIPs) {
    const tag = ip.isVirtual ? ' (virtual — skipped)' : '';
    const star = ip.address === localIP ? ' ⭐' : '';
    logger.info('NETWORK', `   ${ip.name}: ${ip.address}${tag}${star}`);
  }
  console.log('');

  if (allIPs.length === 0 || localIP === '127.0.0.1') {
    logger.warn('NETWORK', '⚠️  No network interface found! Make sure you are connected to WiFi.');
  }

  // Publish mDNS service
  bonjour.publish({
    name: config.SERVICE_NAME,
    type: config.SERVICE_TYPE,
    port: config.PORT,
    txt: {
      hostname: os.hostname(),
      platform: process.platform,
      ip: localIP,
    },
  });

  logger.success('MDNS', `📡 Broadcasting _${config.SERVICE_TYPE}._tcp on port ${config.PORT}`);

  // Firewall reminder
  logger.warn('FIREWALL', '🔥 If phone cannot connect, run this in an ADMIN terminal:');
  logger.warn('FIREWALL', `   netsh advfirewall firewall add rule name="Pocket Edge" dir=in action=allow protocol=TCP localport=${config.PORT}`);
  console.log('');
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

function shutdown(signal) {
  logger.warn('SERVER', `Received ${signal}, shutting down...`);

  clearInterval(heartbeatInterval);

  // Kill all terminal sessions
  terminalManager.killAll();

  // Cleanup file watchers
  fileManager.cleanup();

  // Stop mDNS
  bonjour.unpublishAll();
  bonjour.destroy();

  // Close all WebSocket connections
  wss.clients.forEach((ws) => {
    ws.close(1001, 'Server shutting down');
  });

  // Close HTTP server
  server.close(() => {
    logger.info('SERVER', 'Server closed cleanly');
    process.exit(0);
  });

  // Force exit after 5 seconds if graceful shutdown stalls
  setTimeout(() => {
    logger.error('SERVER', 'Forced exit after timeout');
    process.exit(1);
  }, 5000);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
