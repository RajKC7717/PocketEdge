const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
};

function timestamp() {
  return new Date().toLocaleTimeString('en-US', { hour12: false });
}

const logger = {
  info(tag, ...args) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.blue}[${tag}]${COLORS.reset}`,
      ...args
    );
  },

  success(tag, ...args) {
    console.log(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.green}[${tag}]${COLORS.reset}`,
      ...args
    );
  },

  warn(tag, ...args) {
    console.warn(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.yellow}[${tag}]${COLORS.reset}`,
      ...args
    );
  },

  error(tag, ...args) {
    console.error(
      `${COLORS.gray}${timestamp()}${COLORS.reset} ${COLORS.red}[${tag}]${COLORS.reset}`,
      ...args
    );
  },
};

module.exports = logger;
