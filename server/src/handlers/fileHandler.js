const fs = require('fs');
const path = require('path');
const chokidar = require('chokidar');
const mime = require('mime-types');
const logger = require('../utils/logger');

// Directories/files to ignore when listing/watching
const IGNORED_PATTERNS = [
  'node_modules', '.git', '.expo', 'dist', 'build',
  '__pycache__', '.DS_Store', 'Thumbs.db', '.next',
  '.cache', '.parcel-cache', 'coverage',
];

/**
 * Manages file system operations and watches for changes.
 */
class FileManager {
  constructor() {
    /** @type {Map<string, chokidar.FSWatcher>} path → watcher */
    this.watchers = new Map();
    /** @type {Set<Function>} */
    this.changeListeners = new Set();
  }

  /**
   * Check if a path should be ignored.
   */
  shouldIgnore(filePath) {
    const parts = filePath.split(path.sep);
    return parts.some((part) => IGNORED_PATTERNS.includes(part));
  }

  /**
   * Build a directory tree recursively.
   * @param {string} dirPath - Absolute path
   * @param {number} depth - Max recursion depth
   * @returns {object[]}
   */
  listDirectory(dirPath, depth = 3) {
    try {
      const absolutePath = path.resolve(dirPath);
      if (!fs.existsSync(absolutePath)) {
        return { error: `Path does not exist: ${dirPath}` };
      }

      const stat = fs.statSync(absolutePath);
      if (!stat.isDirectory()) {
        return { error: `Not a directory: ${dirPath}` };
      }

      return {
        path: absolutePath,
        tree: this._buildTree(absolutePath, depth),
      };
    } catch (err) {
      return { error: err.message };
    }
  }

  _buildTree(dirPath, depth) {
    if (depth <= 0) return [];

    let entries;
    try {
      entries = fs.readdirSync(dirPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const result = [];
    for (const entry of entries) {
      if (IGNORED_PATTERNS.includes(entry.name)) continue;
      if (entry.name.startsWith('.') && entry.name !== '.env') continue;

      const fullPath = path.join(dirPath, entry.name);

      if (entry.isDirectory()) {
        result.push({
          name: entry.name,
          type: 'directory',
          path: fullPath,
          children: this._buildTree(fullPath, depth - 1),
        });
      } else if (entry.isFile()) {
        let size = 0;
        try {
          size = fs.statSync(fullPath).size;
        } catch { /* ignore */ }

        result.push({
          name: entry.name,
          type: 'file',
          path: fullPath,
          size,
          language: this._detectLanguage(entry.name),
        });
      }
    }

    // Sort: directories first, then files, alphabetically
    result.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'directory' ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    return result;
  }

  /**
   * Read a file's contents.
   */
  readFile(filePath) {
    try {
      const absolutePath = path.resolve(filePath);
      if (!fs.existsSync(absolutePath)) {
        return { error: `File not found: ${filePath}` };
      }

      const stat = fs.statSync(absolutePath);
      if (stat.isDirectory()) {
        return { error: `Cannot read a directory: ${filePath}` };
      }

      // Check if binary
      const mimeType = mime.lookup(absolutePath) || 'application/octet-stream';
      if (mimeType.startsWith('image/') || mimeType.startsWith('video/') || mimeType.startsWith('audio/')) {
        return {
          path: absolutePath,
          binary: true,
          mimeType,
          size: stat.size,
        };
      }

      // Check file size (don't read files > 2MB as text)
      if (stat.size > 2 * 1024 * 1024) {
        return {
          path: absolutePath,
          tooLarge: true,
          size: stat.size,
        };
      }

      const content = fs.readFileSync(absolutePath, 'utf-8');
      return {
        path: absolutePath,
        content,
        language: this._detectLanguage(absolutePath),
        size: stat.size,
      };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Write content to a file.
   */
  writeFile(filePath, content) {
    try {
      const absolutePath = path.resolve(filePath);
      const dir = path.dirname(absolutePath);

      // Ensure directory exists
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(absolutePath, content, 'utf-8');
      logger.success('FILE', `Written: ${absolutePath}`);
      return { ok: true, path: absolutePath };
    } catch (err) {
      return { error: err.message };
    }
  }

  /**
   * Watch a directory for changes.
   */
  watchDirectory(dirPath, callback) {
    const absolutePath = path.resolve(dirPath);

    if (this.watchers.has(absolutePath)) {
      return; // Already watching
    }

    const watcher = chokidar.watch(absolutePath, {
      ignored: (filePath) => this.shouldIgnore(filePath),
      persistent: true,
      ignoreInitial: true,
      depth: 5,
    });

    watcher.on('change', (filePath) => {
      callback({ changeType: 'modify', path: filePath });
    });

    watcher.on('add', (filePath) => {
      callback({ changeType: 'add', path: filePath });
    });

    watcher.on('unlink', (filePath) => {
      callback({ changeType: 'delete', path: filePath });
    });

    watcher.on('addDir', (dirPath) => {
      callback({ changeType: 'addDir', path: dirPath });
    });

    watcher.on('unlinkDir', (dirPath) => {
      callback({ changeType: 'deleteDir', path: dirPath });
    });

    this.watchers.set(absolutePath, watcher);
    logger.info('FILE', `Watching: ${absolutePath}`);
  }

  /**
   * Stop watching a directory.
   */
  unwatchDirectory(dirPath) {
    const absolutePath = path.resolve(dirPath);
    const watcher = this.watchers.get(absolutePath);
    if (watcher) {
      watcher.close();
      this.watchers.delete(absolutePath);
      logger.info('FILE', `Unwatched: ${absolutePath}`);
    }
  }

  /**
   * Detect programming language from file extension.
   */
  _detectLanguage(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    const langMap = {
      '.js': 'javascript', '.jsx': 'javascript',
      '.ts': 'typescript', '.tsx': 'typescript',
      '.py': 'python',
      '.rb': 'ruby',
      '.go': 'go',
      '.rs': 'rust',
      '.java': 'java',
      '.kt': 'kotlin',
      '.swift': 'swift',
      '.c': 'c', '.h': 'c',
      '.cpp': 'cpp', '.hpp': 'cpp',
      '.cs': 'csharp',
      '.php': 'php',
      '.html': 'html', '.htm': 'html',
      '.css': 'css', '.scss': 'scss', '.less': 'less',
      '.json': 'json',
      '.xml': 'xml',
      '.yaml': 'yaml', '.yml': 'yaml',
      '.md': 'markdown',
      '.sql': 'sql',
      '.sh': 'bash', '.bash': 'bash', '.zsh': 'bash',
      '.ps1': 'powershell',
      '.dockerfile': 'dockerfile',
      '.toml': 'toml',
      '.ini': 'ini',
      '.env': 'plaintext',
      '.txt': 'plaintext',
      '.log': 'plaintext',
    };
    return langMap[ext] || 'plaintext';
  }

  /**
   * Cleanup all watchers.
   */
  cleanup() {
    for (const [dirPath, watcher] of this.watchers) {
      watcher.close();
    }
    this.watchers.clear();
  }
}

// Singleton
const fileManager = new FileManager();

/**
 * Handle file-related WebSocket messages.
 */
function handleFileMessage(ws, clientId, message) {
  switch (message.type) {
    case 'file:list': {
      const result = fileManager.listDirectory(message.path, message.depth);
      ws.send(JSON.stringify({
        type: 'file:list:response',
        ...result,
      }));
      break;
    }

    case 'file:read': {
      const result = fileManager.readFile(message.path);
      ws.send(JSON.stringify({
        type: 'file:read:response',
        ...result,
      }));
      break;
    }

    case 'file:write': {
      const result = fileManager.writeFile(message.path, message.content);
      ws.send(JSON.stringify({
        type: 'file:write:response',
        ...result,
      }));
      break;
    }

    case 'file:watch': {
      fileManager.watchDirectory(message.path, (change) => {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({
            type: 'file:changed',
            ...change,
          }));
        }
      });
      ws.send(JSON.stringify({
        type: 'file:watch:response',
        ok: true,
        path: message.path,
      }));
      break;
    }

    case 'file:unwatch': {
      fileManager.unwatchDirectory(message.path);
      ws.send(JSON.stringify({
        type: 'file:unwatch:response',
        ok: true,
        path: message.path,
      }));
      break;
    }

    default:
      return false;
  }
  return true;
}

module.exports = { handleFileMessage, fileManager };
