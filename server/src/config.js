require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const config = {
  PORT: parseInt(process.env.PORT, 10) || 8765,
  SERVICE_NAME: process.env.SERVICE_NAME || 'pocket-edge',
  SERVICE_TYPE: 'pocketedge',
  HEARTBEAT_INTERVAL: 30000, // 30 seconds between heartbeat checks
  HEARTBEAT_TIMEOUT: 35000,  // 35 seconds before considering client dead

  // Gemini fallback
  GEMINI_API_KEY: process.env.GEMINI_API_KEY || '',
  GEMINI_MODEL: process.env.GEMINI_MODEL || 'gemini-2.0-flash',
};

module.exports = config;
