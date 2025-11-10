import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { logger } from '../../lib/logger.js';

const mockBaseDir = join(process.cwd(), 'data', 'mock');
const mockRequestsPath = join(mockBaseDir, 'mock-requests.json');
const mockImagesDir = join(mockBaseDir, 'images');

export interface MockRequestRecord {
  requestId: string;
  status: string;
  posterName: string;
  facebookPostUrl?: string;
  originalImageHash: string;
  restoredImageHash?: string;
  altText?: string;
  perceptualHashDistance?: number;
  contentSafety?: {
    isNSFW?: boolean;
    requiresBlur?: boolean;
  };
  createdAt?: string;
  updatedAt?: string;
}

interface MockRequestFile {
  requests: MockRequestRecord[];
}

let cache: MockRequestRecord[] | null = null;

export async function loadMockRequests(): Promise<MockRequestRecord[]> {
  if (cache) {
    return cache;
  }

  try {
    const contents = await readFile(mockRequestsPath, 'utf8');
    const parsed = JSON.parse(contents) as MockRequestFile;
    cache = parsed.requests ?? [];
    return cache;
  } catch (error) {
    logger.warn({ error }, 'Unable to load mock requests file');
    return [];
  }
}

export function invalidateMockRequestCache(): void {
  cache = null;
}

export function resolveMockImagePath(filename: string): string {
  return join(mockImagesDir, filename);
}
