import type { Request, Response } from 'express';
import { ZodError } from 'zod';

import { logger } from '../../lib/logger.js';

/**
 * Standard error response format
 */
export interface ErrorResponse {
  error: string;
  message: string;
  details?: unknown;
  timestamp: string;
  path: string;
}

/**
 * Global error handling middleware
 * Must be registered last in the middleware chain
 */
export function errorHandler(err: Error, req: Request, res: Response): void {
  // Log the error
  logger.error(
    {
      error: err.message,
      stack: err.stack,
      method: req.method,
      url: req.url
    },
    'Request error'
  );

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const response: ErrorResponse = {
      error: 'Validation Error',
      message: 'Invalid request data',
      details: err.errors,
      timestamp: new Date().toISOString(),
      path: req.path
    };
    res.status(400).json(response);
    return;
  }

  // Handle known application errors
  if ('statusCode' in err && typeof err.statusCode === 'number') {
    const response: ErrorResponse = {
      error: err.name,
      message: err.message,
      timestamp: new Date().toISOString(),
      path: req.path
    };
    res.status(err.statusCode).json(response);
    return;
  }

  // Handle unknown errors (don't leak details in production)
  const response: ErrorResponse = {
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    timestamp: new Date().toISOString(),
    path: req.path
  };

  res.status(500).json(response);
}
