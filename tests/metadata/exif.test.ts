import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { afterAll, afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  readExifMetadata,
  removeExifMetadata,
  shutdownExifTool,
  writeExifMetadata
} from '../../src/metadata/exif.js';

async function createSampleImage(path: string): Promise<void> {
  const buffer = await sharp({
    create: {
      width: 64,
      height: 64,
      channels: 3,
      background: { r: 120, g: 180, b: 220 }
    }
  })
    .png()
    .toBuffer();

  await writeFile(path, buffer);
}

describe('EXIF metadata helpers', () => {
  let baseDir: string;
  let imagePath: string;

  beforeEach(async () => {
    baseDir = await mkdtemp(join(tmpdir(), 'frai-exif-'));
    imagePath = join(baseDir, 'sample.png');
    await createSampleImage(imagePath);
  });

  afterEach(async () => {
    await rm(baseDir, { recursive: true, force: true });
  });

  it('writes and reads EXIF metadata', async () => {
    await writeExifMetadata(imagePath, {
      Artist: 'Face Restore AI',
      Title: 'Unit Test'
    });

    const metadata = await readExifMetadata(imagePath);

    expect(metadata.Artist).toBe('Face Restore AI');
    expect(metadata.Title).toBe('Unit Test');
  });

  it('removes EXIF metadata on request', async () => {
    await writeExifMetadata(imagePath, { Artist: 'Remove me' });
    await removeExifMetadata(imagePath);
    const metadata = await readExifMetadata(imagePath);

    expect(metadata.Artist).toBeUndefined();
  });

  afterAll(async () => {
    await shutdownExifTool();
  });
});
