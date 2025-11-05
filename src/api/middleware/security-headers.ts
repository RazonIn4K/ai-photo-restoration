import type { NextFunction, Request, Response } from 'express';

/**
 * Additional security headers middleware
 * Supplements Helmet with COOP, COEP, and CORP headers
 */
export function securityHeaders(req: Request, res: Response, next: NextFunction): void {
  // Cross-Origin-Opener-Policy
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');

  // Cross-Origin-Embedder-Policy
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');

  // Cross-Origin-Resource-Policy
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');

  // Permissions-Policy (formerly Feature-Policy)
  res.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  );

  // Validate Sec-Fetch-* headers (if present)
  const secFetchSite = req.get('sec-fetch-site');
  const secFetchMode = req.get('sec-fetch-mode');

  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'same-site') {
    // Log suspicious cross-origin requests
    const secFetchDest = req.get('sec-fetch-dest');
    if (secFetchMode !== 'cors' && secFetchDest !== 'script') {
      // This might be a CSRF attempt
      res.status(403).json({
        error: 'Forbidden',
        message: 'Cross-origin requests not allowed for this resource'
      });
      return;
    }
  }

  next();
}
