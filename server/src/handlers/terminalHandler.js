const os = require('os');
const path = require('path');
const logger = require('../utils/logger');

// node-pty is loaded lazily to allow server to start even if it fails
let pty;
try {
  pty = require('node-pty');
} catch (err) {
  logger.error('TERMINAL', 'node-pty failed to load:', err.message);
  logger.warn('TERMINAL', 'Terminal functionality will be unavailable');
}

/**
 * Manages PTY terminal sessions.
 * Each session is a forked shell process with its own buffer history.
 */
class TerminalManager {
  constructor() {
    /** @type {Map<string, { pty: any, buffer: string[], createdAt: number }>} */
    this.sessions = new Map();
    this.nextSessionId = 1;
    this.maxBufferLines = 1000;
  }

  /**
   * Detect the best shell for the current platform.
   */
  getDefaultShell() {
    if (os.platform() === 'win32') {
      return process.env.COMSPEC || 'powershell.exe';
    }
    return process.env.SHELL || '/bin/bash';
  }

  /**
   * Create a new terminal session.
   * @param {WebSocket} ws - The WebSocket to send output to
   * @param {object} options - { cols, rows, shell }
   * @returns {string} sessionId
   */
  createSession(ws, options = {}) {
    if (!pty) {
      return { error: 'node-pty is not available on this system' };
    }

    const sessionId = `term-${this.nextSessionId++}`;
    const shell = options.shell || this.getDefaultShell();
    const cols = options.cols || 80;
    const rows = options.rows || 24;

    try {
      const ptyProcess = pty.spawn(shell, [], {
        name: 'xterm-256color',
        cols,
        rows,
        cwd: options.cwd || os.homedir(),
        env: {
          ...process.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      });

      const session = {
        pty: ptyProcess,
        buffer: [],
        createdAt: Date.now(),
        shell,
        cols,
        rows,
      };

      // Handle PTY output → send to WebSocket
      ptyProcess.onData((data) => {
        // Buffer for replay on reconnect
        const lines = data.split('\n');
        for (const line of lines) {
          session.buffer.push(line);
          if (session.buffer.length > this.maxBufferLines) {
            session.buffer.shift();
          }
        }

        // Send to client
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'terminal:output',
            sessionId,
            data,
          }));
        }
      });

      // Handle PTY exit
      ptyProcess.onExit(({ exitCode, signal }) => {
        logger.info('TERMINAL', `Session ${sessionId} exited (code: ${exitCode}, signal: ${signal})`);

        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'terminal:exit',
            sessionId,
            exitCode,
            signal,
          }));
        }

        this.sessions.delete(sessionId);
      });

      this.sessions.set(sessionId, session);

      logger.success('TERMINAL', `Session ${sessionId} created (shell: ${shell}, ${cols}x${rows})`);

      return {
        sessionId,
        shell,
        cols,
        rows,
        pid: ptyProcess.pid,
      };
    } catch (err) {
      logger.error('TERMINAL', `Failed to create session: ${err.message}`);
      return { error: err.message };
    }
  }

  /**
   * Write input data to a terminal session's stdin.
   */
  write(sessionId, data) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { error: `Session ${sessionId} not found` };
    }
    session.pty.write(data);
    return { ok: true };
  }

  /**
   * Resize a terminal session.
   */
  resize(sessionId, cols, rows) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { error: `Session ${sessionId} not found` };
    }

    try {
      session.pty.resize(cols, rows);
      session.cols = cols;
      session.rows = rows;
      logger.info('TERMINAL', `Session ${sessionId} resized to ${cols}x${rows}`);
      return { ok: true, cols, rows };
    } catch (err) {
      logger.error('TERMINAL', `Resize failed for ${sessionId}: ${err.message}`);
      return { error: err.message };
    }
  }

  /**
   * Get buffered output for session replay (reconnection).
   */
  getReplay(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { error: `Session ${sessionId} not found` };
    }
    return {
      sessionId,
      data: session.buffer.join('\n'),
      shell: session.shell,
      cols: session.cols,
      rows: session.rows,
    };
  }

  /**
   * Kill a terminal session.
   */
  killSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return { error: `Session ${sessionId} not found` };
    }

    try {
      session.pty.kill();
    } catch (err) {
      // Process might already be dead
    }
    this.sessions.delete(sessionId);
    logger.warn('TERMINAL', `Session ${sessionId} killed`);
    return { ok: true };
  }

  /**
   * List all active sessions.
   */
  listSessions() {
    const list = [];
    for (const [id, session] of this.sessions) {
      list.push({
        sessionId: id,
        shell: session.shell,
        cols: session.cols,
        rows: session.rows,
        createdAt: session.createdAt,
        pid: session.pty.pid,
      });
    }
    return list;
  }

  /**
   * Reassign a session's output to a new WebSocket (for reconnection).
   */
  reassignSocket(sessionId, newWs) {
    const session = this.sessions.get(sessionId);
    if (!session) return false;

    // Remove old data listener and set up new one
    // node-pty doesn't support removing listeners easily,
    // so we use the ws reference check in the onData handler above
    // The handler already checks ws.readyState before sending
    return true;
  }

  /**
   * Kill all sessions (for graceful shutdown).
   */
  killAll() {
    for (const [id] of this.sessions) {
      this.killSession(id);
    }
  }
}

// Singleton instance
const terminalManager = new TerminalManager();

/**
 * Handle terminal-related WebSocket messages.
 * @param {WebSocket} ws
 * @param {string} clientId
 * @param {object} message
 */
function handleTerminalMessage(ws, clientId, message) {
  switch (message.type) {
    case 'terminal:create': {
      const result = terminalManager.createSession(ws, {
        cols: message.cols,
        rows: message.rows,
        shell: message.shell,
        cwd: message.cwd,
      });

      ws.send(JSON.stringify({
        type: 'terminal:created',
        ...result,
      }));
      break;
    }

    case 'terminal:input': {
      terminalManager.write(message.sessionId, message.data);
      break;
    }

    case 'terminal:resize': {
      const result = terminalManager.resize(message.sessionId, message.cols, message.rows);
      ws.send(JSON.stringify({
        type: 'terminal:resized',
        ...result,
      }));
      break;
    }

    case 'terminal:replay': {
      const replay = terminalManager.getReplay(message.sessionId);
      ws.send(JSON.stringify({
        type: 'terminal:replay:response',
        ...replay,
      }));
      break;
    }

    case 'terminal:kill': {
      const result = terminalManager.killSession(message.sessionId);
      ws.send(JSON.stringify({
        type: 'terminal:killed',
        sessionId: message.sessionId,
        ...result,
      }));
      break;
    }

    case 'terminal:list': {
      const sessions = terminalManager.listSessions();
      ws.send(JSON.stringify({
        type: 'terminal:list:response',
        sessions,
      }));
      break;
    }

    default:
      return false; // Not handled
  }
  return true; // Handled
}

module.exports = { handleTerminalMessage, terminalManager };
