import { BullMQAdapter, router as bullBoardRouter, setQueues } from 'bull-board';
import type { Express, NextFunction, Request, Response } from 'express';

import { getQueueAdapters, initializeQueues } from './manager.js';
import { env } from '../config/index.js';
import { logger } from '../lib/logger.js';

let dashboardInitialized = false;

function queueDashboardAuth(req: Request, res: Response, next: NextFunction): void {
  const authorization = req.headers.authorization;

  if (!authorization || !authorization.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
    res.sendStatus(401);
    return;
  }

  const credentials = Buffer.from(authorization.replace('Basic ', ''), 'base64')
    .toString()
    .split(':');

  const [username, password] = credentials;

  if (username === env.BULL_BOARD_USERNAME && password === env.BULL_BOARD_PASSWORD) {
    next();
    return;
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="Queue Dashboard"');
  res.sendStatus(401);
}

export async function registerQueueDashboard(app: Express): Promise<void> {
  await initializeQueues();

  if (!dashboardInitialized) {
    const { classificationQueue, restorationQueue, deadLetterQueue } = getQueueAdapters();

    const adapters = [
      new BullMQAdapter(classificationQueue, { readOnlyMode: false }),
      new BullMQAdapter(restorationQueue, { readOnlyMode: false }),
      new BullMQAdapter(deadLetterQueue, { readOnlyMode: true })
    ] as unknown as Parameters<typeof setQueues>[0];

    setQueues(adapters);

    dashboardInitialized = true;
    logger.info({ path: env.BULL_BOARD_BASE_PATH }, 'Bull Board dashboard registered');
  }

  bullBoardRouter.locals.basePath = env.BULL_BOARD_BASE_PATH;
  app.use(env.BULL_BOARD_BASE_PATH, queueDashboardAuth, bullBoardRouter);
}
