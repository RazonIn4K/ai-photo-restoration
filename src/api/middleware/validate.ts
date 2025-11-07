import type { NextFunction, Request, Response } from 'express';
import type { AnyZodObject } from 'zod';
import { ZodError } from 'zod';

/**
 * Validation middleware factory
 * Creates middleware that validates request data against a Zod schema
 */
export function validateRequest(schema: AnyZodObject) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      // Validate request data (body, params, query)
      await schema.parseAsync({
        body: req.body,
        params: req.params,
        query: req.query
      });

      next();
    } catch (error) {
      // Handle Zod validation errors directly
      if (error instanceof ZodError) {
        res.status(400).json({
          success: false,
          error: 'Validation failed',
          details: error.errors
        });
        return;
      }

      // Pass other errors to error handler
      next(error);
    }
  };
}
