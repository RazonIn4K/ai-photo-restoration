import type { Request, Response } from 'express';
import { lookup as lookupMimeType } from 'mime-types';
import { createReadStream } from 'node:fs';
import { access } from 'node:fs/promises';

import { resolveMockImagePath } from './mock-data.js';
import { env } from '../../config/env.js';
import { logger } from '../../lib/logger.js';

export async function getImageHandler(req: Request, res: Response): Promise<void> {
  const { type, hash } = req.params as { type: 'original' | 'restored'; hash: string };

  if (!env.useMockDashboard) {
    res.status(501).json({
      success: false,
      error: 'Image streaming is only supported in mock dashboard mode for now'
    });
    return;
  }

  try {
    const filename = hash;
    const path = resolveMockImagePath(filename);
    await access(path);

    const mimeType = lookupMimeType(filename) || 'application/octet-stream';
    res.setHeader('Content-Type', mimeType);

    const stream = createReadStream(path);
    stream.on('error', error => {
      logger.error({ error }, 'Failed to stream mock image');
      res.status(500).end();
    });
    stream.pipe(res);
  } catch (error) {
    logger.warn({ error, type, hash }, 'Mock image not found');
    res.status(404).json({ success: false, error: 'Image not found' });
  }
}
