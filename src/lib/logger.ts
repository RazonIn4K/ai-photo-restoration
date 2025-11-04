import pinoLogger from 'pino';

import { env } from '../config/index.js';

const redactPaths: string[] = [
  'password',
  'authorization',
  'headers.authorization',
  '*.password',
  '*.secret'
];

const transport = env.isDevelopment
  ? {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        singleLine: true
      }
    }
  : undefined;

export const logger = pinoLogger({
  level: env.LOG_LEVEL,
  base: {
    app: 'face-restore-ai',
    env: env.NODE_ENV
  },
  transport,
  redact: {
    paths: redactPaths,
    remove: true
  }
});
