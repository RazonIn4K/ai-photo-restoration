import type { NextFunction, Request, Response } from 'express';

import { logger } from '../../lib/logger.js';

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Log request
  logger.info(
    {
      method: req.method,
      url: req.url,
      userAgent: req.get('user-agent'),
      ip: req.ip
    },
    'Incoming request'
  );

  // Log response when finished
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.info(
      {
        method: req.method,
        url: req.url,
        statusCode: res.statusCode,
        duration
      },
      'Request completed'
    );
  });

  next();
}
