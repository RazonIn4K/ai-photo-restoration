import { Router } from 'express';
import { z } from 'zod';

import { validateRequest } from '../middleware/validate.js';
import {
  generateRegistrationOptionsHandler,
  verifyRegistrationHandler,
  generateAuthenticationOptionsHandler,
  verifyAuthenticationHandler,
  requireAuth,
  getCurrentUser,
  logoutUser
} from '../middleware/webauthn.js';

/**
 * Authentication router
 */
export const authRouter = Router();

// Validation schemas
const registrationBeginSchema = z.object({
  body: z.object({
    username: z.string().min(1).max(50),
    displayName: z.string().min(1).max(100)
  })
});

const authenticationBeginSchema = z.object({
  body: z.object({
    username: z.string().min(1).max(50)
  })
});

const credentialSchema = z.object({
  body: z.object({
    credential: z.object({
      id: z.string(),
      rawId: z.string(),
      response: z.object({
        clientDataJSON: z.string(),
        attestationObject: z.string().optional(),
        authenticatorData: z.string().optional(),
        signature: z.string().optional(),
        userHandle: z.string().optional(),
        transports: z.array(z.string()).optional()
      }),
      type: z.literal('public-key'),
      clientExtensionResults: z.object({}).optional(),
      authenticatorAttachment: z.string().optional()
    })
  })
});

// Registration endpoints
authRouter.post(
  '/register/begin',
  validateRequest(registrationBeginSchema),
  generateRegistrationOptionsHandler
);

authRouter.post(
  '/register/complete/:userId',
  validateRequest(credentialSchema),
  verifyRegistrationHandler
);

// Authentication endpoints
authRouter.post(
  '/authenticate/begin',
  validateRequest(authenticationBeginSchema),
  generateAuthenticationOptionsHandler
);

authRouter.post(
  '/authenticate/complete/:challengeId',
  validateRequest(credentialSchema),
  verifyAuthenticationHandler
);

// Protected endpoints
authRouter.get('/me', requireAuth, getCurrentUser);
authRouter.post('/logout', requireAuth, logoutUser);
