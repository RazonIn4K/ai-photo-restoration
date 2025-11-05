import sharp from 'sharp';
import { describe, expect, it } from 'vitest';

import { readC2paManifest, signBufferWithC2pa } from '../../src/metadata/c2pa.js';

async function createSampleImageBuffer(): Promise<Buffer> {
  return sharp({
    create: {
      width: 32,
      height: 32,
      channels: 3,
      background: { r: 40, g: 80, b: 120 }
    }
  })
    .png()
    .toBuffer();
}

describe('C2PA helpers', () => {
  it('creates and reads manifest data for an asset buffer', async () => {
    const buffer = await createSampleImageBuffer();

    const signed = await signBufferWithC2pa(buffer, {
      title: 'Unit Test Image',
      format: 'image/png'
    });

    expect(Buffer.isBuffer(signed)).toBe(true);
    expect(signed.length).toBeGreaterThan(buffer.length);

    const manifestStore = await readC2paManifest(signed, 'image/png');

    expect(manifestStore).not.toBeNull();
    expect(manifestStore?.manifests).toBeDefined();
  });
});
