import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdtemp, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeEach, afterEach, describe, expect, it } from 'vitest';

import { ContentAddressedStorage } from '../../src/storage/content-addressed.js';

function createSampleBuffer(content: string = 'face-restore-ai-test'): Buffer {
  return Buffer.from(content, 'utf-8');
}

describe('ContentAddressedStorage', () => {
  let basePath: string;
  let storage: ContentAddressedStorage;

  beforeEach(async () => {
    basePath = await mkdtemp(join(tmpdir(), 'frai-storage-'));
    storage = new ContentAddressedStorage({ basePath, autoCreateDirs: true });
  });

  afterEach(async () => {
    await rm(basePath, { recursive: true, force: true });
  });

  it('stores and retrieves encrypted content with metadata', async () => {
    const data = createSampleBuffer();
    const metadata = {
      size: data.length,
      mimeType: 'text/plain',
      perceptualHash: 'abcd1234',
      customMetadata: { origin: 'unit-test' }
    } as const;

    const storeResult = await storage.store('originals', data, metadata);

    expect(storeResult.isNew).toBe(true);
    expect(storeResult.metadata.sha256).toEqual(storeResult.sha256);
    expect(storeResult.metadata.size).toBe(metadata.size);
    expect(storeResult.metadata.mimeType).toBe(metadata.mimeType);
    expect(storeResult.metadata.storedAt).toBeInstanceOf(Date);

    // Files are written to disk
    await access(storeResult.encryptedPath, constants.F_OK);
    await access(storeResult.dekPath, constants.F_OK);

    const retrieveResult = await storage.retrieve('originals', storeResult.sha256);

    expect(retrieveResult.data.equals(data)).toBe(true);
    expect(retrieveResult.metadata.sha256).toEqual(storeResult.sha256);
    expect(retrieveResult.metadata.customMetadata).toEqual(metadata.customMetadata);
  });

  it('deduplicates repeated content by hash', async () => {
    const data = createSampleBuffer('duplicate-content');
    const metadata = {
      size: data.length,
      mimeType: 'text/plain'
    };

    const first = await storage.store('originals', data, metadata);
    const second = await storage.store('originals', data, metadata);

    expect(first.isNew).toBe(true);
    expect(second.isNew).toBe(false);
    expect(second.metadata.storedAt.getTime()).toBe(first.metadata.storedAt.getTime());
    expect(second.metadata.sha256).toEqual(first.metadata.sha256);
  });

  it('supports storing in multiple categories', async () => {
    const originalData = createSampleBuffer('original-data');
    const restoredData = createSampleBuffer('restored-data');

    const original = await storage.store('originals', originalData, {
      size: originalData.length,
      mimeType: 'text/plain'
    });

    const restored = await storage.store('restored', restoredData, {
      size: restoredData.length,
      mimeType: 'text/plain'
    });

    expect(original.sha256).not.toEqual(restored.sha256);
    expect(await storage.exists('originals', original.sha256)).toBe(true);
    expect(await storage.exists('restored', restored.sha256)).toBe(true);
  });

  it('performs cryptographic erasure by deleting only the DEK', async () => {
    const data = createSampleBuffer('erase-dek-only');

    const { sha256 } = await storage.store('originals', data, {
      size: data.length,
      mimeType: 'text/plain'
    });

    await storage.delete('originals', sha256, true);

    // Encrypted payload remains, but retrieval should fail due to missing DEK
    await expect(storage.retrieve('originals', sha256)).rejects.toThrow(/DEK not found/);
  });

  it('removes encrypted payload and metadata when eraseDEKOnly is false', async () => {
    const data = createSampleBuffer('erase-all');

    const { sha256 } = await storage.store('originals', data, {
      size: data.length,
      mimeType: 'text/plain'
    });

    await storage.delete('originals', sha256, false);

    expect(await storage.exists('originals', sha256)).toBe(false);
    await expect(storage.retrieve('originals', sha256)).rejects.toThrow(/File not found/);
  });

  it('throws when retrieving unknown content', async () => {
    await expect(storage.retrieve('originals', 'deadbeef')).rejects.toThrow(/File not found/);
  });

  it('computes deterministic SHA-256 hashes for data', () => {
    const data = createSampleBuffer('hash-me');
    const expected = createHash('sha256').update(data).digest('hex');

    expect(storage.computeHash(data)).toEqual(expected);
  });

  it('returns basic storage statistics', async () => {
    const stats = await storage.getStats();
    expect(stats.basePath).toEqual(basePath);
    expect(stats.categories).toEqual(['originals', 'restored', 'keys']);
  });
});
