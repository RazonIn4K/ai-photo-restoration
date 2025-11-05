import sharp from 'sharp';
import { describe, it, expect } from 'vitest';

import {
  computePerceptualHash,
  hammingDistance,
  compareSimilarity,
  findSimilar,
  batchComputePerceptualHash,
  detectDuplicates,
  groupBySimilarity
} from '../../src/hash/perceptual.js';

async function createSolidImage(
  color: { r: number; g: number; b: number },
  size = 64
): Promise<Buffer> {
  return sharp({
    create: {
      width: size,
      height: size,
      channels: 3,
      background: color
    }
  })
    .png()
    .toBuffer();
}

describe('Perceptual hashing', () => {
  it('computes a perceptual hash with image metadata', async () => {
    const image = await createSolidImage({ r: 255, g: 0, b: 0 });

    const result = await computePerceptualHash(image);

    expect(result.hash).toHaveLength(64);
    expect(result.width).toBe(64);
    expect(result.height).toBe(64);
    expect(result.format).toBe('png');
  });

  it('produces identical hashes for identical images', async () => {
    const image = await createSolidImage({ r: 200, g: 50, b: 50 });

    const [hashA, hashB] = await batchComputePerceptualHash([image, image]);

    expect(hashA.hash).toEqual(hashB.hash);
    expect(hammingDistance(hashA.hash, hashB.hash)).toBe(0);
  });

  it('detects small differences between similar images', async () => {
    const baseImage = await createSolidImage({ r: 100, g: 120, b: 200 });
    const brightened = await sharp(baseImage).modulate({ brightness: 1.05 }).toBuffer();

    const [baseHash, brightHash] = await batchComputePerceptualHash([baseImage, brightened]);

    const comparison = compareSimilarity(baseHash.hash, brightHash.hash, 40);

    expect(comparison.distance).toBeGreaterThanOrEqual(0);
    expect(comparison.distance).toBeLessThan(64);
    expect(comparison.isSimilar).toBe(true);
  });

  it('marks very different images as not similar', async () => {
    const redImage = await createSolidImage({ r: 255, g: 0, b: 0 });
    const greenImage = await createSolidImage({ r: 0, g: 255, b: 0 });

    const [redHash, greenHash] = await batchComputePerceptualHash([redImage, greenImage]);

    const comparison = compareSimilarity(redHash.hash, greenHash.hash, 5);

    expect(comparison.isSimilar).toBe(false);
    expect(comparison.distance).toBeGreaterThan(0);
  });

  it('finds similar hashes and sorts them by distance', async () => {
    const base = 'ffffffffffffffff';
    const similar = 'ff0fffffffffffff';
    const distant = '0000000000000000';

    const result = findSimilar(base, [similar, distant], 32);

    expect(result).toHaveLength(1);
    expect(result[0].hash).toBe(similar);
  });

  it('detects duplicate hashes', () => {
    const hashes = ['aaaa', 'bbbb', 'aaaa', 'cccc', 'bbbb'];
    const duplicates = detectDuplicates(hashes);

    expect(duplicates.size).toBe(2);
    expect(duplicates.get('aaaa')).toEqual(['aaaa', 'aaaa']);
    expect(duplicates.get('bbbb')).toEqual(['bbbb', 'bbbb']);
  });

  it('groups hashes by similarity threshold', () => {
    const hashes = ['ffff', 'fff0', '0fff', '0000'];
    const groups = groupBySimilarity(hashes, 8);

    expect(groups).toEqual([expect.arrayContaining(['ffff', 'fff0', '0fff']), ['0000']]);
  });

  it('throws when comparing hashes of different length', () => {
    expect(() => hammingDistance('abcd', 'abc')).toThrow('Hash lengths must match');
  });
});
