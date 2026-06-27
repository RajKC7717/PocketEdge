const { exec } = require('child_process');
const logger = require('../utils/logger');

// ─── Platform-specific power commands ────────────────────────────────────────

const POWER_COMMANDS = {
  win32: {
    shutdown: 'shutdown /s /t 10',
    restart: 'shutdown /r /t 10',
    sleep: 'rundll32.exe powrprof.dll,SetSuspendState 0,1,0',
    cancel: 'shutdown /a',
  },
  darwin: {
    shutdown: 'osascript -e \'tell app "System Events" to shut down\'',
    restart: 'osascript -e \'tell app "System Events" to restart\'',
    sleep: 'pmset sleepnow',
    cancel: null, // macOS does not support cancel for scheduled shutdown via osascript
  },
  linux: {
    shutdown: 'shutdown -h +1',
    restart: 'shutdown -r +1',
    sleep: 'systemctl suspend',
    cancel: 'shutdown -c',
  },
};

const VALID_ACTIONS = ['shutdown', 'restart', 'sleep'];

// ─── Helpers ─────────────────────────────────────────────────────────────────

function send(ws, data) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

/**
 * Execute a system command and return a promise.
 */
function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { timeout: 15000 }, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

// ─── Power action handler ────────────────────────────────────────────────────

async function handlePowerAction(ws, action) {
  const platform = process.platform;
  const commands = POWER_COMMANDS[platform];

  if (!commands) {
    send(ws, {
      type: 'system:power:response',
      success: false,
      action,
      error: `Unsupported platform: ${platform}`,
    });
    return;
  }

  const command = commands[action];
  if (!command) {
    send(ws, {
      type: 'system:power:response',
      success: false,
      action,
      error: `Action "${action}" is not supported on ${platform}`,
    });
    return;
  }

  logger.info('POWER', `Executing ${action} on ${platform}: ${command}`);

  try {
    await runCommand(command);
    logger.success('POWER', `${action} command dispatched successfully`);
    send(ws, {
      type: 'system:power:response',
      success: true,
      action,
      message: `${action} command has been sent to the system`,
    });
  } catch (error) {
    logger.error('POWER', `${action} failed:`, error.message);
    send(ws, {
      type: 'system:power:response',
      success: false,
      action,
      error: error.message,
    });
  }
}

// ─── Cancel handler ──────────────────────────────────────────────────────────

async function handlePowerCancel(ws) {
  const platform = process.platform;
  const commands = POWER_COMMANDS[platform];

  if (!commands) {
    send(ws, {
      type: 'system:power:cancel:response',
      success: false,
      message: `Unsupported platform: ${platform}`,
    });
    return;
  }

  const cancelCommand = commands.cancel;

  if (!cancelCommand) {
    logger.warn('POWER', `Cancel not available on ${platform}`);
    send(ws, {
      type: 'system:power:cancel:response',
      success: false,
      message: `Cancel is not available on ${platform}. The action may have already been initiated.`,
    });
    return;
  }

  logger.info('POWER', `Cancelling scheduled power action on ${platform}: ${cancelCommand}`);

  try {
    await runCommand(cancelCommand);
    logger.success('POWER', 'Power action cancelled successfully');
    send(ws, {
      type: 'system:power:cancel:response',
      success: true,
      message: 'Power action has been cancelled',
    });
  } catch (error) {
    logger.error('POWER', 'Cancel failed:', error.message);
    send(ws, {
      type: 'system:power:cancel:response',
      success: false,
      message: `Failed to cancel: ${error.message}`,
    });
  }
}

// ─── Public handler ──────────────────────────────────────────────────────────

/**
 * Handle power-related WebSocket messages.
 * Supports shutdown, restart, sleep, and cancel actions.
 */
function handlePowerMessage(ws, clientId, message) {
  switch (message.type) {
    case 'system:power': {
      const { action } = message;

      // Validate action
      if (!action || !VALID_ACTIONS.includes(action)) {
        send(ws, {
          type: 'system:power:response',
          success: false,
          action: action || 'unknown',
          error: `Invalid action. Must be one of: ${VALID_ACTIONS.join(', ')}`,
        });
        break;
      }

      handlePowerAction(ws, action);
      break;
    }

    case 'system:power:cancel': {
      handlePowerCancel(ws);
      break;
    }

    default:
      return false;
  }
  return true;
}

module.exports = { handlePowerMessage };
