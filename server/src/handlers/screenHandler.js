const { exec, spawn } = require('child_process');
const logger = require('../utils/logger');

// ─── Active screen streams (clientId → stream state) ─────────────────────────

const activeStreams = new Map();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function send(ws, data) {
  if (ws.readyState === 1) {
    ws.send(JSON.stringify(data));
  }
}

/**
 * Check if FFmpeg is available on this system.
 * @returns {Promise<boolean>}
 */
function checkFFmpeg() {
  return new Promise((resolve) => {
    exec('ffmpeg -version', { timeout: 5000 }, (error) => {
      resolve(!error);
    });
  });
}

/**
 * Build the FFmpeg command arguments for the current platform.
 * Captures screen at 1280x720 @ 1fps as MJPEG to stdout (screenshot mode).
 */
function getFFmpegArgs() {
  const platform = process.platform;

  const commonArgs = [
    '-vf', 'scale=1280:720,fps=1',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-q:v', '2',
    '-'
  ];

  switch (platform) {
    case 'win32':
      return ['-f', 'gdigrab', '-i', 'desktop', ...commonArgs];
    case 'darwin':
      return ['-f', 'avfoundation', '-i', '1', ...commonArgs];
    case 'linux':
      return ['-f', 'x11grab', '-i', ':0.0', ...commonArgs];
    default:
      return null;
  }
}

/**
 * Extract complete JPEG frames from a buffer.
 * JPEG files start with SOI marker (0xFF 0xD8) and end with EOI marker (0xFF 0xD9).
 * Returns { frames: Buffer[], remainder: Buffer }
 */
function extractJPEGFrames(buffer) {
  const frames = [];
  let offset = 0;

  while (offset < buffer.length - 1) {
    // Find the start of a JPEG (SOI: 0xFF 0xD8)
    let soiIndex = -1;
    for (let i = offset; i < buffer.length - 1; i++) {
      if (buffer[i] === 0xFF && buffer[i + 1] === 0xD8) {
        soiIndex = i;
        break;
      }
    }

    if (soiIndex === -1) break;

    // Find the end of the JPEG (EOI: 0xFF 0xD9)
    let eoiIndex = -1;
    for (let i = soiIndex + 2; i < buffer.length - 1; i++) {
      if (buffer[i] === 0xFF && buffer[i + 1] === 0xD9) {
        eoiIndex = i + 2; // Include the EOI marker
        break;
      }
    }

    if (eoiIndex === -1) {
      // Incomplete frame — return remainder from soiIndex onward
      return { frames, remainder: buffer.slice(soiIndex) };
    }

    // Extract complete frame
    frames.push(buffer.slice(soiIndex, eoiIndex));
    offset = eoiIndex;
  }

  // Everything after the last complete frame (or all data if no frames found)
  const remainder = offset < buffer.length ? buffer.slice(offset) : Buffer.alloc(0);
  return { frames, remainder };
}

// ─── Cleanup ─────────────────────────────────────────────────────────────────

function cleanupClient(clientId) {
  const stream = activeStreams.get(clientId);
  if (stream) {
    if (stream.process && !stream.process.killed) {
      stream.process.kill('SIGTERM');
      // Force kill after 2 seconds if still alive
      setTimeout(() => {
        if (stream.process && !stream.process.killed) {
          stream.process.kill('SIGKILL');
        }
      }, 2000);
    }
    activeStreams.delete(clientId);
    logger.info('SCREEN', `Cleaned up stream for client ${clientId.slice(0, 8)}...`);
  }
}

// ─── Screen stream manager ───────────────────────────────────────────────────

const screenManager = {
  /**
   * Kill all active screen streams. Called during graceful shutdown.
   */
  killAll() {
    for (const [clientId] of activeStreams) {
      cleanupClient(clientId);
    }
    logger.info('SCREEN', 'All screen streams terminated');
  },
};

// ─── Start stream handler ────────────────────────────────────────────────────

async function handleScreenStart(ws, clientId) {
  // Kill any existing stream for this client first
  cleanupClient(clientId);

  // Check if FFmpeg is available
  const ffmpegAvailable = await checkFFmpeg();
  if (!ffmpegAvailable) {
    logger.warn('SCREEN', 'FFmpeg is not installed or not in PATH');
    send(ws, {
      type: 'screen:error',
      reason: 'ffmpeg_not_found',
      message: 'FFmpeg is required for screen streaming. Install it from https://ffmpeg.org and make sure it is in your system PATH, then restart the server.',
    });
    return;
  }

  // Get platform-specific FFmpeg arguments
  const args = getFFmpegArgs();
  if (!args) {
    send(ws, {
      type: 'screen:error',
      reason: 'unsupported_platform',
      message: `Screen capture is not supported on platform: ${process.platform}`,
    });
    return;
  }

  logger.info('SCREEN', `Starting screen capture for client ${clientId.slice(0, 8)}...`);
  logger.info('SCREEN', `Command: ffmpeg ${args.join(' ')}`);

  // Spawn FFmpeg process
  const ffmpegProcess = spawn('ffmpeg', args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });

  let dataBuffer = Buffer.alloc(0);
  let frameCount = 0;
  let firstStderrLogged = false;

  // Store stream state
  activeStreams.set(clientId, {
    process: ffmpegProcess,
    startedAt: Date.now(),
  });

  // Send initial metadata to the client
  send(ws, {
    type: 'screen:started',
    width: 1280,
    height: 720,
    fps: 1,
  });

  // Handle FFmpeg stdout (MJPEG frame data)
  ffmpegProcess.stdout.on('data', (chunk) => {
    // Concatenate incoming data with the buffer
    dataBuffer = Buffer.concat([dataBuffer, chunk]);

    // Extract complete JPEG frames
    const { frames, remainder } = extractJPEGFrames(dataBuffer);
    dataBuffer = remainder;

    for (const frame of frames) {
      frameCount++;

      // Send frame as base64-encoded JSON for ConnectionContext compatibility
      send(ws, {
        type: 'screen:frame',
        data: frame.toString('base64'),
        frameNumber: frameCount,
      });
    }
  });

  // Handle FFmpeg stderr (log output — don't spam, only first line)
  ffmpegProcess.stderr.on('data', (data) => {
    if (!firstStderrLogged) {
      const firstLine = data.toString().split('\n')[0].trim();
      if (firstLine) {
        logger.info('SCREEN', `FFmpeg: ${firstLine}`);
        firstStderrLogged = true;
      }
    }
  });

  // Handle FFmpeg exit
  ffmpegProcess.on('close', (code, signal) => {
    logger.info('SCREEN', `FFmpeg exited with code ${code}, signal ${signal} (${frameCount} frames sent)`);
    activeStreams.delete(clientId);
    send(ws, { type: 'screen:stopped' });
  });

  ffmpegProcess.on('error', (err) => {
    logger.error('SCREEN', `FFmpeg process error: ${err.message}`);
    activeStreams.delete(clientId);
    send(ws, {
      type: 'screen:error',
      reason: 'process_error',
      message: err.message,
    });
  });

  // Kill FFmpeg if the WebSocket disconnects
  ws.on('close', () => {
    cleanupClient(clientId);
  });
}

// ─── Stop stream handler ─────────────────────────────────────────────────────

function handleScreenStop(ws, clientId) {
  cleanupClient(clientId);
  send(ws, { type: 'screen:stopped' });
}

// ─── Public handler ──────────────────────────────────────────────────────────

/**
 * Handle screen-streaming WebSocket messages.
 * Streams laptop screen as MJPEG frames via FFmpeg.
 */
function handleScreenMessage(ws, clientId, message) {
  switch (message.type) {
    case 'screen:start': {
      handleScreenStart(ws, clientId);
      break;
    }

    case 'screen:stop': {
      handleScreenStop(ws, clientId);
      break;
    }

    default:
      return false;
  }
  return true;
}

module.exports = { handleScreenMessage, screenManager };
