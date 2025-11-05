/**
 * Content-Addressed Storage with Envelope Encryption
 *
 * This module implements a content-addressed storage system where files are:
 * 1. Identified by their SHA-256 hash
 * 2. Organized using directory sharding (first 2 bytes of hash)
 * 3. Encrypted using envelope encryption (AES-256-GCM)
 * 4. Stored with separate DEK files for cryptographic erasure
 *
 * Storage Layout:
 * data/
 * ├── originals/ab/cd/abcd1234...sha256.enc
 * ├── restored/ef/gh/efgh5678...sha256.enc
 * └── keys/ab/cd/abcd1234...sha256.dek.enc
 */

import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { mkdir, writeFile, readFile, unlink, access } from 'node:fs/promises';
import { join, dirname } from 'node:path';

import {
  envelopeEncrypt,
  envelopeDecrypt,
  serializeEncryptedData,
  deserializeEncryptedData,
  serializeEncryptedDEK,
  deserializeEncryptedDEK,
} from '../crypto/envelope.js';

/**
 * Storage categories for organizing files
 */
export type StorageCategory = 'originals' | 'restored' | 'keys';

/**
 * File metadata stored alongside encrypted files
 */
export interface FileMetadata {
  /** SHA-256 hash of the original file */
  sha256: string;
  /** File size in bytes (original, before encryption) */
  size: number;
  /** MIME type */
  mimeType: string;
  /** When the file was stored */
  storedAt: Date;
  /** Perceptual hash (for images) */
  perceptualHash?: string;
  /** Optional custom metadata */
  customMetadata?: Record<string, unknown>;
}

/**
 * Result of storing a file
 */
export interface StoreResult {
  /** SHA-256 hash (content address) */
  sha256: string;
  /** Full path to encrypted file */
  encryptedPath: string;
  /** Full path to encrypted DEK */
  dekPath: string;
  /** File metadata */
  metadata: FileMetadata;
  /** Whether this was a new file (false if deduplicated) */
  isNew: boolean;
}

/**
 * Result of retrieving a file
 */
export interface RetrieveResult {
  /** Decrypted file data */
  data: Buffer;
  /** File metadata */
  metadata: FileMetadata;
}

/**
 * Configuration for content-addressed storage
 */
export interface StorageConfig {
  /** Base directory for all storage */
  basePath: string;
  /** Whether to create directories automatically */
  autoCreateDirs?: boolean;
}

/**
 * Default storage configuration
 */
const DEFAULT_STORAGE_PATH = join(process.cwd(), 'data');

/**
 * Content-Addressed Storage Manager
 */
export class ContentAddressedStorage {
  private config: Required<StorageConfig>;

  constructor(config?: Partial<StorageConfig>) {
    this.config = {
      basePath: config?.basePath ?? DEFAULT_STORAGE_PATH,
      autoCreateDirs: config?.autoCreateDirs ?? true,
    };
  }

  /**
   * Compute SHA-256 hash of data
   */
  public computeHash(data: Buffer): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Get directory sharding path from hash
   * First 2 bytes (4 hex chars) → ab/cd/
   */
  private getShardPath(hash: string): string {
    if (hash.length < 4) {
      throw new Error('Hash too short for sharding');
    }
    const byte1 = hash.substring(0, 2);
    const byte2 = hash.substring(2, 4);
    return join(byte1, byte2);
  }

  /**
   * Get full path for a file based on category and hash
   */
  private getFilePath(category: StorageCategory, hash: string, extension: string = '.enc'): string {
    const shardPath = this.getShardPath(hash);
    const filename = `${hash}${extension}`;
    return join(this.config.basePath, category, shardPath, filename);
  }

  /**
   * Get path for encrypted DEK
   */
  private getDEKPath(hash: string): string {
    return this.getFilePath('keys', hash, '.dek.enc');
  }

  /**
   * Get path for metadata JSON
   */
  private getMetadataPath(category: StorageCategory, hash: string): string {
    return this.getFilePath(category, hash, '.meta.json');
  }

  /**
   * Ensure directory exists
   */
  private async ensureDirectory(path: string): Promise<void> {
    if (this.config.autoCreateDirs) {
      await mkdir(dirname(path), { recursive: true });
    }
  }

  /**
   * Check if file exists
   */
  private async fileExists(path: string): Promise<boolean> {
    try {
      await access(path, constants.F_OK);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Store a file with envelope encryption
   *
   * @param category - Storage category (originals/restored)
   * @param data - File data to store
   * @param metadata - File metadata
   * @returns Store result with paths and deduplication info
   */
  public async store(
    category: Exclude<StorageCategory, 'keys'>,
    data: Buffer,
    metadata: Omit<FileMetadata, 'sha256' | 'storedAt'>
  ): Promise<StoreResult> {
    // Compute content hash
    const sha256 = this.computeHash(data);

    // Get file paths
    const encryptedPath = this.getFilePath(category, sha256);
    const dekPath = this.getDEKPath(sha256);
    const metadataPath = this.getMetadataPath(category, sha256);

    // Check for deduplication
    const exists = await this.fileExists(encryptedPath);
    if (exists) {
      // File already exists, load existing metadata
      const existingMetadata = await this.loadMetadata(category, sha256);
      return {
        sha256,
        encryptedPath,
        dekPath,
        metadata: existingMetadata,
        isNew: false,
      };
    }

    // Ensure directories exist
    await this.ensureDirectory(encryptedPath);
    await this.ensureDirectory(dekPath);

    // Encrypt data with envelope encryption
    const { encryptedData, encryptedDEK } = envelopeEncrypt(data);

    // Serialize for storage
    const encryptedBuffer = serializeEncryptedData(encryptedData);
    const dekBuffer = serializeEncryptedDEK(encryptedDEK);

    // Write encrypted file and DEK
    await writeFile(encryptedPath, encryptedBuffer);
    await writeFile(dekPath, dekBuffer);

    // Create and store metadata
    const fullMetadata: FileMetadata = {
      sha256,
      storedAt: new Date(),
      ...metadata,
    };
    await writeFile(metadataPath, JSON.stringify(fullMetadata, null, 2));

    return {
      sha256,
      encryptedPath,
      dekPath,
      metadata: fullMetadata,
      isNew: true,
    };
  }

  /**
   * Retrieve and decrypt a file
   *
   * @param category - Storage category
   * @param sha256 - Content hash
   * @returns Decrypted file data and metadata
   */
  public async retrieve(category: Exclude<StorageCategory, 'keys'>, sha256: string): Promise<RetrieveResult> {
    const encryptedPath = this.getFilePath(category, sha256);
    const dekPath = this.getDEKPath(sha256);

    // Check if file exists
    if (!(await this.fileExists(encryptedPath))) {
      throw new Error(`File not found: ${sha256}`);
    }

    if (!(await this.fileExists(dekPath))) {
      throw new Error(`DEK not found for file: ${sha256}`);
    }

    // Read encrypted data and DEK
    const encryptedBuffer = await readFile(encryptedPath);
    const dekBuffer = await readFile(dekPath);

    // Deserialize
    const encryptedData = deserializeEncryptedData(encryptedBuffer);
    const encryptedDEK = deserializeEncryptedDEK(dekBuffer);

    // Decrypt
    const data = envelopeDecrypt(encryptedData, encryptedDEK);

    // Verify hash
    const computedHash = this.computeHash(data);
    if (computedHash !== sha256) {
      throw new Error(`Hash mismatch: expected ${sha256}, got ${computedHash}`);
    }

    // Load metadata
    const metadata = await this.loadMetadata(category, sha256);

    return {
      data,
      metadata,
    };
  }

  /**
   * Load metadata for a file
   */
  private async loadMetadata(category: Exclude<StorageCategory, 'keys'>, sha256: string): Promise<FileMetadata> {
    const metadataPath = this.getMetadataPath(category, sha256);

    if (!(await this.fileExists(metadataPath))) {
      throw new Error(`Metadata not found for file: ${sha256}`);
    }

    const metadataJson = await readFile(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataJson) as FileMetadata;

    // Parse date
    metadata.storedAt = new Date(metadata.storedAt);

    return metadata;
  }

  /**
   * Delete a file and its DEK (cryptographic erasure)
   *
   * @param category - Storage category
   * @param sha256 - Content hash
   * @param eraseDEKOnly - If true, only delete DEK (data becomes unrecoverable)
   */
  public async delete(
    category: Exclude<StorageCategory, 'keys'>,
    sha256: string,
    eraseDEKOnly: boolean = false
  ): Promise<void> {
    const encryptedPath = this.getFilePath(category, sha256);
    const dekPath = this.getDEKPath(sha256);
    const metadataPath = this.getMetadataPath(category, sha256);

    // Always delete DEK (this makes data unrecoverable)
    if (await this.fileExists(dekPath)) {
      await unlink(dekPath);
    }

    // Optionally delete encrypted data and metadata
    if (!eraseDEKOnly) {
      if (await this.fileExists(encryptedPath)) {
        await unlink(encryptedPath);
      }

      if (await this.fileExists(metadataPath)) {
        await unlink(metadataPath);
      }
    }
  }

  /**
   * Check if a file exists in storage
   */
  public async exists(category: Exclude<StorageCategory, 'keys'>, sha256: string): Promise<boolean> {
    const encryptedPath = this.getFilePath(category, sha256);
    return this.fileExists(encryptedPath);
  }

  /**
   * Get storage statistics
   */
  public async getStats(): Promise<{
    basePath: string;
    categories: StorageCategory[];
  }> {
    return {
      basePath: this.config.basePath,
      categories: ['originals', 'restored', 'keys'],
    };
  }
}

/**
 * Default storage instance
 */
export const storage = new ContentAddressedStorage();
