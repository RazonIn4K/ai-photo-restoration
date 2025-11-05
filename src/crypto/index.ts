/**
 * Crypto module - Envelope encryption and key management
 *
 * This module provides envelope encryption capabilities using AES-256-GCM.
 * Each data asset is encrypted with its own Data Encryption Key (DEK),
 * and the DEK is encrypted with a Master Key (KEK).
 */

export {
  // Types
  type EncryptedData,
  type EncryptedDEK,
  // Core encryption functions
  generateDEK,
  encrypt,
  decrypt,
  encryptDEK,
  decryptDEK,
  // High-level envelope encryption API
  envelopeEncrypt,
  envelopeDecrypt,
  // Key management
  getMasterKey,
  zeroizeKey,
  // Serialization helpers
  serializeEncryptedData,
  deserializeEncryptedData,
  serializeEncryptedDEK,
  deserializeEncryptedDEK,
} from './envelope.js';
