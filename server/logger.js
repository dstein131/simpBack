// server/logger.js

const { createLogger, format, transports } = require('winston');
const path = require('path');
const fs = require('fs');

// Define log directory and file paths
const logDir = path.join(__dirname, 'logs');

// Ensure log directory exists
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Create a Winston logger instance
const logger = createLogger({
  level: 'info', // Default logging level
  format: format.combine(
    format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss',
    }),
    format.errors({ stack: true }), // Include stack trace in logs
    format.splat(),
    format.json() // Log in JSON format
  ),
  transports: [
    // Write all logs with level `error` and below to `error.log`
    new transports.File({ filename: path.join(logDir, 'error.log'), level: 'error' }),
    
    // Write all logs with level `info` and below to `combined.log`
    new transports.File({ filename: path.join(logDir, 'combined.log') }),
  ],
});

// If we're not in production, also log to the `console` with simple format
if (process.env.NODE_ENV !== 'production') {
  logger.add(new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple()
    ),
  }));
}

module.exports = logger;
