import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger.ts';

export const logIncomingTraffic = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const { method, originalUrl, headers } = req;
  const traceId = headers['x-trace-id']; // Extract the trace ID
  const startTime = Date.now();

  res.on('finish', () => {
    const { statusCode } = res;
    const responseTime = Date.now() - startTime;

    const logMessage: Record<string, any> = {
      timestamp: new Date().toISOString(),
      method,
      statusCode,
      responseTime: `${responseTime}ms`,
    };

    // Add traceId to the log if present
    if (traceId) {
      logMessage.traceId = traceId;
    }

    // Log the formatted message
    logger.info(`${method} ${originalUrl} -`, logMessage);
  });

  next();
};
