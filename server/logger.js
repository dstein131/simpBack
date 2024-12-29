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

// Determine the logging level based on environment
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = isProduction ? 'info' : 'debug';

// Create a Winston logger instance
const logger = createLogger({
  level: logLevel, // Dynamic logging level
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
    
    // Write all logs with level `debug` and below to `debug.log` (only in non-production)
    ...(!isProduction ? [
      new transports.File({ filename: path.join(logDir, 'debug.log'), level: 'debug' }),
    ] : []),
  ],
});

// If we're not in production, also log to the `console` with detailed format
if (!isProduction) {
  logger.add(new transports.Console({
    level: 'debug', // Ensure console captures debug logs
    format: format.combine(
      format.colorize(),
      format.printf(({ timestamp, level, message, stack }) => {
        return stack
          ? `[${timestamp}] ${level}: ${message} - ${stack}`
          : `[${timestamp}] ${level}: ${message}`;
      })
    ),
  }));
}

// Handle uncaught exceptions and unhandled rejections
logger.exceptions.handle(
  new transports.File({ filename: path.join(logDir, 'exceptions.log') }),
  new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple()
    ),
  })
);

logger.rejections.handle(
  new transports.File({ filename: path.join(logDir, 'rejections.log') }),
  new transports.Console({
    format: format.combine(
      format.colorize(),
      format.simple()
    ),
  })
);

module.exports = logger;
