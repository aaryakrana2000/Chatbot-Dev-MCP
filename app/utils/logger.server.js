import fs from 'fs';
import path from 'path';

/**
 * Server-side logging utility
 * Writes all logs to a log file
 */
class Logger {
  constructor() {
    // Create logs directory if it doesn't exist
    this.logDir = path.join(process.cwd(), 'logs');
    if (!fs.existsSync(this.logDir)) {
      fs.mkdirSync(this.logDir, { recursive: true });
    }

    // Log file path with date
    const date = new Date().toISOString().split('T')[0];
    this.logFile = path.join(this.logDir, `app-${date}.log`);

    // Store original console methods
    this.originalConsole = {
      log: console.log,
      error: console.error,
      warn: console.warn,
      info: console.info,
      debug: console.debug
    };

    // Intercept console methods
    this.interceptConsole();
  }

  /**
   * Format log message with timestamp
   */
  formatMessage(level, ...args) {
    const timestamp = new Date().toISOString();
    const message = args.map(arg => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    }).join(' ');

    return `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  }

  /**
   * Write to log file
   */
  writeToFile(level, ...args) {
    try {
      const logMessage = this.formatMessage(level, ...args);
      fs.appendFileSync(this.logFile, logMessage, 'utf8');
    } catch (error) {
      // Fallback to original console if file write fails
      this.originalConsole.error('Failed to write to log file:', error);
    }
  }

  /**
   * Intercept console methods and log to file
   */
  interceptConsole() {
    // Override console.log
    console.log = (...args) => {
      this.originalConsole.log(...args);
      this.writeToFile('LOG', ...args);
    };

    // Override console.error
    console.error = (...args) => {
      this.originalConsole.error(...args);
      this.writeToFile('ERROR', ...args);
    };

    // Override console.warn
    console.warn = (...args) => {
      this.originalConsole.warn(...args);
      this.writeToFile('WARN', ...args);
    };

    // Override console.info
    console.info = (...args) => {
      this.originalConsole.info(...args);
      this.writeToFile('INFO', ...args);
    };

    // Override console.debug
    console.debug = (...args) => {
      this.originalConsole.debug(...args);
      this.writeToFile('DEBUG', ...args);
    };
  }

  /**
   * Manual log method for explicit logging
   */
  log(level, ...args) {
    this.writeToFile(level, ...args);
    const originalMethod = this.originalConsole[level] || this.originalConsole.log;
    originalMethod(...args);
  }

  /**
   * Log client-side message
   */
  logClient(level, message, metadata = {}) {
    const clientLog = {
      source: 'client',
      level,
      message,
      ...metadata,
      timestamp: new Date().toISOString()
    };

    const logMessage = this.formatMessage(`CLIENT-${level}`, JSON.stringify(clientLog));
    try {
      fs.appendFileSync(this.logFile, logMessage, 'utf8');
    } catch (error) {
      this.originalConsole.error('Failed to write client log:', error);
    }
  }
}

// Create singleton instance
let loggerInstance = null;

/**
 * Initialize logger (should be called once at app startup)
 */
export function initLogger() {
  if (!loggerInstance) {
    loggerInstance = new Logger();
  }
  return loggerInstance;
}

/**
 * Get logger instance
 */
export function getLogger() {
  if (!loggerInstance) {
    return initLogger();
  }
  return loggerInstance;
}

/**
 * Export default logger instance
 */
export default getLogger();
