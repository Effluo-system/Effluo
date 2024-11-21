import winston from 'winston';

const logFormat = winston.format.printf(({ timestamp, level, message }) => {
  return `${timestamp} [${level}]: ${message}`;
});

const colorizeMessage = winston.format((info) => {
  if (typeof info.message === 'string') {
    info.message = winston.format.colorize().colorize(info.level, info.message);
    info.level = winston.format.colorize().colorize(info.level, info.level);
  }
  return info;
});

export const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    logFormat,
    colorizeMessage()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
    new winston.transports.File({
      filename: 'logs/application.log',
      level: 'info',
    }),
  ],
});
