import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import fs from 'fs';

const LOG_DIR = path.join(process.cwd(), 'logs');

const isVercel = process.env.VERCEL === 'true' || !!process.env.VERCEL;

// Ensure log directory exists (Only if not running on Vercel)
if (!isVercel && !fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const customFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.splat(),
  winston.format.json()
);

const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    if (stack) {
      return `[${timestamp}] ${level}: ${message}\nStack: ${stack}`;
    }
    return `[${timestamp}] ${level}: ${message}`;
  })
);

// Daily Rotate File Transports (Only if not running on Vercel)
const transports = [
  new winston.transports.Console({
    format: consoleFormat,
  })
];

if (!isVercel) {
  transports.push(
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
    }),
    new DailyRotateFile({
      filename: path.join(LOG_DIR, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
    })
  );
}

export const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
  format: customFormat,
  transports: transports,
});

// If in development, also log to the console
if (process.env.NODE_ENV === 'development') {
  logger.add(new winston.transports.Console({
    format: consoleFormat,
  }));
}

// Redirect console.log and console.error to winston
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => {
  logger.info(args.join(' '));
  originalLog.apply(console, args);
};

console.error = (...args) => {
  logger.error(args.join(' '));
  originalError.apply(console, args);
};

console.warn = (...args) => {
  logger.warn(args.join(' '));
  originalWarn.apply(console, args);
};

export default logger;
