import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import sharp from 'sharp';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';

import { computePerceptualHash } from '../../src/hash/perceptual.js';
import { ContentAddressedStorage } from '../../src/storage/content-addressed.js';

async function createGradient(width = 64, height = 64): Promise<Buffer> {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 128, g: 64, b: 192 }
    }
  })
    .linear(1.2, 0) // adjust brightness slightly for better gradients
    .png()
    .toBuffer();
}

describe('Storage + perceptual hash integration', () => {
  let basePath: string;
  let storage: ContentAddressedStorage;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), 'frai-storage-hash-'));
    storage = new ContentAddressedStorage({ basePath });
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it('stores image with perceptual hash metadata and retrieves it losslessly', async () => {
    const image = await createGradient();
    const phash = await computePerceptualHash(image);

    const storeResult = await storage.store('originals', image, {
      size: image.length,
      mimeType: 'image/png',
      perceptualHash: phash.hash,
      customMetadata: { width: phash.width, height: phash.height }
    });

    const { data, metadata } = await storage.retrieve('originals', storeResult.sha256);

    expect(data.equals(image)).toBe(true);
    expect(metadata.perceptualHash).toBe(phash.hash);
    expect(metadata.customMetadata).toEqual({ width: phash.width, height: phash.height });
  });

  it('recognises duplicates via identical content hashes and perceptual hashes', async () => {
    const baseImage = await createGradient();
    const resized = await sharp(baseImage).resize(60, 60).png().toBuffer();

    const [baseHash, resizedHash] = await Promise.all([
      computePerceptualHash(baseImage),
      computePerceptualHash(resized)
    ]);

    const first = await storage.store('originals', baseImage, {
      size: baseImage.length,
      mimeType: 'image/png',
      perceptualHash: baseHash.hash
    });

    const second = await storage.store('originals', baseImage, {
      size: baseImage.length,
      mimeType: 'image/png',
      perceptualHash: resizedHash.hash
    });

    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(second.metadata.perceptualHash).toBe(baseHash.hash);
  });

  it('performs full erasure workflow for stored images', async () => {
    const image = await createGradient();
    const { sha256 } = await storage.store('restored', image, {
      size: image.length,
      mimeType: 'image/png'
    });

    await storage.delete('restored', sha256);

    await expect(storage.exists('restored', sha256)).resolves.toBe(false);
  });
});
