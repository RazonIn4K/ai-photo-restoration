/**
 * Envelope Encryption Implementation
 *
 * This module implements envelope encryption with AES-256-GCM for data encryption.
 * Each piece of data is encrypted with its own Data Encryption Key (DEK),
 * and the DEK is encrypted with a Master Key (KEK - Key Encryption Key).
 *
 * Architecture:
 * - Master Key (KEK): Stored in environment variable (MONGO_LOCAL_MASTER_KEY_BASE64)
 * - Data Encryption Key (DEK): Generated per-asset, encrypted with KEK
 * - Data: Encrypted with DEK using AES-256-GCM
 *
 * Benefits:
 * - Fast encryption/decryption (symmetric AES-256-GCM)
 * - Easy key rotation (only need to re-encrypt DEKs, not data)
 * - Cryptographic erasure (delete DEK to make data unrecoverable)
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { env } from '../config/index.js';

// AES-256-GCM parameters
const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits (recommended for GCM)

/**
 * Encrypted data structure
 */
export interface EncryptedData {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  salt?: Buffer; // Optional salt for key derivation
}

/**
 * Encrypted DEK structure
 */
export interface EncryptedDEK {
  encryptedKey: Buffer;
  iv: Buffer;
  authTag: Buffer;
}

/**
 * Get the master key (KEK) from environment configuration
 */
export function getMasterKey(): Buffer {
  const base64Key = env.MONGO_LOCAL_MASTER_KEY_BASE64;

  if (!base64Key || base64Key.length === 0) {
    throw new Error('Master key not configured. Set MONGO_LOCAL_MASTER_KEY_BASE64 in environment.');
  }

  const key = Buffer.from(base64Key, 'base64');

  // Validate key length (should be 96 bytes as per MongoDB CSFLE requirements)
  if (key.length < KEY_LENGTH) {
    throw new Error(
      `Master key too short. Expected at least ${KEY_LENGTH} bytes, got ${key.length}.`
    );
  }

  // Use first 32 bytes for AES-256
  return key.subarray(0, KEY_LENGTH);
}

/**
 * Generate a new Data Encryption Key (DEK)
 */
export function generateDEK(): Buffer {
  return randomBytes(KEY_LENGTH);
}

/**
 * Encrypt a Data Encryption Key (DEK) with the Master Key (KEK)
 */
export function encryptDEK(dek: Buffer, kek?: Buffer): EncryptedDEK {
  const masterKey = kek || getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, iv);

  const encryptedKey = Buffer.concat([cipher.update(dek), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    encryptedKey,
    iv,
    authTag
  };
}

/**
 * Decrypt a Data Encryption Key (DEK) using the Master Key (KEK)
 */
export function decryptDEK(encryptedDEK: EncryptedDEK, kek?: Buffer): Buffer {
  const masterKey = kek || getMasterKey();

  const decipher = createDecipheriv(ALGORITHM, masterKey, encryptedDEK.iv);
  decipher.setAuthTag(encryptedDEK.authTag);

  return Buffer.concat([decipher.update(encryptedDEK.encryptedKey), decipher.final()]);
}

/**
 * Encrypt data using AES-256-GCM with a Data Encryption Key
 */
export function encrypt(data: Buffer, dek: Buffer): EncryptedData {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, dek, iv);

  const ciphertext = Buffer.concat([cipher.update(data), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext,
    iv,
    authTag
  };
}

/**
 * Decrypt data using AES-256-GCM with a Data Encryption Key
 */
export function decrypt(encryptedData: EncryptedData, dek: Buffer): Buffer {
  const decipher = createDecipheriv(ALGORITHM, dek, encryptedData.iv);
  decipher.setAuthTag(encryptedData.authTag);

  return Buffer.concat([decipher.update(encryptedData.ciphertext), decipher.final()]);
}

/**
 * Securely zero out a key in memory
 * This helps prevent key material from lingering in memory
 */
export function zeroizeKey(key: Buffer): void {
  if (key && key.length > 0) {
    key.fill(0);
  }
}

/**
 * High-level API: Encrypt data with envelope encryption
 *
 * This function:
 * 1. Generates a new DEK
 * 2. Encrypts the data with the DEK
 * 3. Encrypts the DEK with the KEK
 * 4. Returns both encrypted data and encrypted DEK
 *
 * @param data - Data to encrypt
 * @returns Object containing encrypted data and encrypted DEK
 */
export function envelopeEncrypt(data: Buffer): {
  encryptedData: EncryptedData;
  encryptedDEK: EncryptedDEK;
} {
  // Generate a new DEK for this data
  const dek = generateDEK();

  try {
    // Encrypt the data with the DEK
    const encryptedData = encrypt(data, dek);

    // Encrypt the DEK with the master key
    const encryptedDEK = encryptDEK(dek);

    return {
      encryptedData,
      encryptedDEK
    };
  } finally {
    // Always zeroize the DEK after use
    zeroizeKey(dek);
  }
}

/**
 * High-level API: Decrypt data with envelope encryption
 *
 * This function:
 * 1. Decrypts the DEK using the KEK
 * 2. Decrypts the data using the DEK
 * 3. Zeroizes the DEK from memory
 *
 * @param encryptedData - Encrypted data
 * @param encryptedDEK - Encrypted DEK
 * @returns Decrypted data
 */
export function envelopeDecrypt(encryptedData: EncryptedData, encryptedDEK: EncryptedDEK): Buffer {
  // Decrypt the DEK using the master key
  const dek = decryptDEK(encryptedDEK);

  try {
    // Decrypt the data using the DEK
    return decrypt(encryptedData, dek);
  } finally {
    // Always zeroize the DEK after use
    zeroizeKey(dek);
  }
}

/**
 * Serialize encrypted data to a single Buffer for storage
 *
 * Format:
 * - IV length (1 byte)
 * - Auth tag length (1 byte)
 * - IV (variable)
 * - Auth tag (variable)
 * - Ciphertext (remaining bytes)
 */
export function serializeEncryptedData(encryptedData: EncryptedData): Buffer {
  const { iv, authTag, ciphertext } = encryptedData;

  const buffer = Buffer.allocUnsafe(2 + iv.length + authTag.length + ciphertext.length);

  let offset = 0;

  // Write lengths
  buffer.writeUInt8(iv.length, offset++);
  buffer.writeUInt8(authTag.length, offset++);

  // Write IV
  iv.copy(buffer, offset);
  offset += iv.length;

  // Write auth tag
  authTag.copy(buffer, offset);
  offset += authTag.length;

  // Write ciphertext
  ciphertext.copy(buffer, offset);

  return buffer;
}

/**
 * Deserialize encrypted data from a Buffer
 */
export function deserializeEncryptedData(buffer: Buffer): EncryptedData {
  let offset = 0;

  // Read lengths
  const ivLength = buffer.readUInt8(offset++);
  const authTagLength = buffer.readUInt8(offset++);

  // Read IV
  const iv = buffer.subarray(offset, offset + ivLength);
  offset += ivLength;

  // Read auth tag
  const authTag = buffer.subarray(offset, offset + authTagLength);
  offset += authTagLength;

  // Read ciphertext (remaining bytes)
  const ciphertext = buffer.subarray(offset);

  return {
    iv,
    authTag,
    ciphertext
  };
}

/**
 * Serialize encrypted DEK to a single Buffer for storage
 */
export function serializeEncryptedDEK(encryptedDEK: EncryptedDEK): Buffer {
  const { iv, authTag, encryptedKey } = encryptedDEK;

  const buffer = Buffer.allocUnsafe(2 + iv.length + authTag.length + encryptedKey.length);

  let offset = 0;

  // Write lengths
  buffer.writeUInt8(iv.length, offset++);
  buffer.writeUInt8(authTag.length, offset++);

  // Write IV
  iv.copy(buffer, offset);
  offset += iv.length;

  // Write auth tag
  authTag.copy(buffer, offset);
  offset += authTag.length;

  // Write encrypted key
  encryptedKey.copy(buffer, offset);

  return buffer;
}

/**
 * Deserialize encrypted DEK from a Buffer
 */
export function deserializeEncryptedDEK(buffer: Buffer): EncryptedDEK {
  let offset = 0;

  // Read lengths
  const ivLength = buffer.readUInt8(offset++);
  const authTagLength = buffer.readUInt8(offset++);

  // Read IV
  const iv = buffer.subarray(offset, offset + ivLength);
  offset += ivLength;

  // Read auth tag
  const authTag = buffer.subarray(offset, offset + authTagLength);
  offset += authTagLength;

  // Read encrypted key (remaining bytes)
  const encryptedKey = buffer.subarray(offset);

  return {
    iv,
    authTag,
    encryptedKey
  };
}
