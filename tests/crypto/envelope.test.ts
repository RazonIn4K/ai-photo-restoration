import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateDEK,
  encrypt,
  decrypt,
  encryptDEK,
  decryptDEK,
  envelopeEncrypt,
  envelopeDecrypt,
  getMasterKey,
  zeroizeKey,
  serializeEncryptedData,
  deserializeEncryptedData,
  serializeEncryptedDEK,
  deserializeEncryptedDEK,
  type EncryptedData,
  type EncryptedDEK,
} from '../../src/crypto/envelope.js';

describe('Envelope Encryption', () => {
  describe('generateDEK', () => {
    it('should generate a 32-byte DEK', () => {
      const dek = generateDEK();
      expect(dek).toBeInstanceOf(Buffer);
      expect(dek.length).toBe(32);
    });

    it('should generate unique DEKs', () => {
      const dek1 = generateDEK();
      const dek2 = generateDEK();
      expect(dek1.equals(dek2)).toBe(false);
    });
  });

  describe('encrypt/decrypt', () => {
    it('should encrypt and decrypt data correctly', () => {
      const originalData = Buffer.from('Hello, World!', 'utf-8');
      const dek = generateDEK();

      const encryptedData = encrypt(originalData, dek);
      expect(encryptedData.ciphertext).toBeInstanceOf(Buffer);
      expect(encryptedData.iv).toBeInstanceOf(Buffer);
      expect(encryptedData.authTag).toBeInstanceOf(Buffer);
      expect(encryptedData.iv.length).toBe(12); // GCM IV is 12 bytes
      expect(encryptedData.authTag.length).toBe(16); // GCM auth tag is 16 bytes

      const decryptedData = decrypt(encryptedData, dek);
      expect(decryptedData.toString('utf-8')).toBe('Hello, World!');
    });

    it('should fail decryption with wrong DEK', () => {
      const originalData = Buffer.from('Secret data', 'utf-8');
      const correctDEK = generateDEK();
      const wrongDEK = generateDEK();

      const encryptedData = encrypt(originalData, correctDEK);

      expect(() => decrypt(encryptedData, wrongDEK)).toThrow();
    });

    it('should fail decryption with tampered ciphertext', () => {
      const originalData = Buffer.from('Secret data', 'utf-8');
      const dek = generateDEK();

      const encryptedData = encrypt(originalData, dek);

      // Tamper with ciphertext
      encryptedData.ciphertext[0] ^= 0xFF;

      expect(() => decrypt(encryptedData, dek)).toThrow();
    });

    it('should fail decryption with tampered auth tag', () => {
      const originalData = Buffer.from('Secret data', 'utf-8');
      const dek = generateDEK();

      const encryptedData = encrypt(originalData, dek);

      // Tamper with auth tag
      encryptedData.authTag[0] ^= 0xFF;

      expect(() => decrypt(encryptedData, dek)).toThrow();
    });

    it('should encrypt empty data', () => {
      const originalData = Buffer.from('', 'utf-8');
      const dek = generateDEK();

      const encryptedData = encrypt(originalData, dek);
      const decryptedData = decrypt(encryptedData, dek);

      expect(decryptedData.length).toBe(0);
    });

    it('should encrypt large data', () => {
      const originalData = Buffer.alloc(1024 * 1024, 'A'); // 1 MB
      const dek = generateDEK();

      const encryptedData = encrypt(originalData, dek);
      const decryptedData = decrypt(encryptedData, dek);

      expect(decryptedData.equals(originalData)).toBe(true);
    });
  });

  describe('encryptDEK/decryptDEK', () => {
    it('should encrypt and decrypt DEK correctly', () => {
      const dek = generateDEK();
      const kek = getMasterKey();

      const encryptedDEK = encryptDEK(dek, kek);
      expect(encryptedDEK.encryptedKey).toBeInstanceOf(Buffer);
      expect(encryptedDEK.iv).toBeInstanceOf(Buffer);
      expect(encryptedDEK.authTag).toBeInstanceOf(Buffer);

      const decryptedDEK = decryptDEK(encryptedDEK, kek);
      expect(decryptedDEK.equals(dek)).toBe(true);
    });

    it('should use getMasterKey by default', () => {
      const dek = generateDEK();

      const encryptedDEK = encryptDEK(dek);
      const decryptedDEK = decryptDEK(encryptedDEK);

      expect(decryptedDEK.equals(dek)).toBe(true);
    });

    it('should fail decryption with wrong KEK', () => {
      const dek = generateDEK();
      const correctKEK = getMasterKey();
      const wrongKEK = generateDEK(); // Wrong key

      const encryptedDEK = encryptDEK(dek, correctKEK);

      expect(() => decryptDEK(encryptedDEK, wrongKEK)).toThrow();
    });
  });

  describe('envelopeEncrypt/envelopeDecrypt', () => {
    it('should perform complete envelope encryption and decryption', () => {
      const originalData = Buffer.from('Sensitive information', 'utf-8');

      const { encryptedData, encryptedDEK } = envelopeEncrypt(originalData);

      expect(encryptedData.ciphertext).toBeInstanceOf(Buffer);
      expect(encryptedDEK.encryptedKey).toBeInstanceOf(Buffer);

      const decryptedData = envelopeDecrypt(encryptedData, encryptedDEK);
      expect(decryptedData.toString('utf-8')).toBe('Sensitive information');
    });

    it('should produce different encrypted data for same input', () => {
      const originalData = Buffer.from('Test data', 'utf-8');

      const result1 = envelopeEncrypt(originalData);
      const result2 = envelopeEncrypt(originalData);

      // Different IVs and DEKs should produce different ciphertext
      expect(result1.encryptedData.iv.equals(result2.encryptedData.iv)).toBe(false);
      expect(result1.encryptedData.ciphertext.equals(result2.encryptedData.ciphertext)).toBe(false);
      expect(result1.encryptedDEK.encryptedKey.equals(result2.encryptedDEK.encryptedKey)).toBe(false);

      // But both should decrypt to the same original data
      const decrypted1 = envelopeDecrypt(result1.encryptedData, result1.encryptedDEK);
      const decrypted2 = envelopeDecrypt(result2.encryptedData, result2.encryptedDEK);

      expect(decrypted1.toString('utf-8')).toBe('Test data');
      expect(decrypted2.toString('utf-8')).toBe('Test data');
    });

    it('should fail with wrong encrypted DEK', () => {
      const originalData = Buffer.from('Test data', 'utf-8');

      const result1 = envelopeEncrypt(originalData);
      const result2 = envelopeEncrypt(originalData);

      // Try to decrypt result1's data with result2's DEK
      expect(() => envelopeDecrypt(result1.encryptedData, result2.encryptedDEK)).toThrow();
    });
  });

  describe('zeroizeKey', () => {
    it('should zero out key buffer', () => {
      const key = Buffer.from([1, 2, 3, 4, 5]);
      zeroizeKey(key);

      expect(key.every(byte => byte === 0)).toBe(true);
    });

    it('should handle empty buffer', () => {
      const key = Buffer.alloc(0);
      expect(() => zeroizeKey(key)).not.toThrow();
    });

    it('should handle null/undefined gracefully', () => {
      // TypeScript would catch this, but test runtime behavior
      expect(() => zeroizeKey(null as any)).not.toThrow();
      expect(() => zeroizeKey(undefined as any)).not.toThrow();
    });
  });

  describe('getMasterKey', () => {
    it('should return a 32-byte key', () => {
      const kek = getMasterKey();
      expect(kek).toBeInstanceOf(Buffer);
      expect(kek.length).toBe(32);
    });

    it('should return the same key on multiple calls', () => {
      const kek1 = getMasterKey();
      const kek2 = getMasterKey();
      expect(kek1.equals(kek2)).toBe(true);
    });
  });

  describe('serialization', () => {
    describe('serializeEncryptedData/deserializeEncryptedData', () => {
      it('should serialize and deserialize encrypted data', () => {
        const originalData = Buffer.from('Test data', 'utf-8');
        const dek = generateDEK();
        const encryptedData = encrypt(originalData, dek);

        const serialized = serializeEncryptedData(encryptedData);
        expect(serialized).toBeInstanceOf(Buffer);

        const deserialized = deserializeEncryptedData(serialized);
        expect(deserialized.iv.equals(encryptedData.iv)).toBe(true);
        expect(deserialized.authTag.equals(encryptedData.authTag)).toBe(true);
        expect(deserialized.ciphertext.equals(encryptedData.ciphertext)).toBe(true);

        // Verify decryption still works
        const decrypted = decrypt(deserialized, dek);
        expect(decrypted.toString('utf-8')).toBe('Test data');
      });

      it('should handle empty ciphertext', () => {
        const originalData = Buffer.from('', 'utf-8');
        const dek = generateDEK();
        const encryptedData = encrypt(originalData, dek);

        const serialized = serializeEncryptedData(encryptedData);
        const deserialized = deserializeEncryptedData(serialized);

        const decrypted = decrypt(deserialized, dek);
        expect(decrypted.length).toBe(0);
      });
    });

    describe('serializeEncryptedDEK/deserializeEncryptedDEK', () => {
      it('should serialize and deserialize encrypted DEK', () => {
        const dek = generateDEK();
        const encryptedDEK = encryptDEK(dek);

        const serialized = serializeEncryptedDEK(encryptedDEK);
        expect(serialized).toBeInstanceOf(Buffer);

        const deserialized = deserializeEncryptedDEK(serialized);
        expect(deserialized.iv.equals(encryptedDEK.iv)).toBe(true);
        expect(deserialized.authTag.equals(encryptedDEK.authTag)).toBe(true);
        expect(deserialized.encryptedKey.equals(encryptedDEK.encryptedKey)).toBe(true);

        // Verify decryption still works
        const decryptedDEK = decryptDEK(deserialized);
        expect(decryptedDEK.equals(dek)).toBe(true);
      });
    });

    describe('round-trip with serialization', () => {
      it('should encrypt, serialize, deserialize, and decrypt correctly', () => {
        const originalData = Buffer.from('Complete round-trip test', 'utf-8');

        // Envelope encrypt
        const { encryptedData, encryptedDEK } = envelopeEncrypt(originalData);

        // Serialize (as would be done for storage)
        const serializedData = serializeEncryptedData(encryptedData);
        const serializedDEK = serializeEncryptedDEK(encryptedDEK);

        // Deserialize (as would be done when retrieving from storage)
        const deserializedData = deserializeEncryptedData(serializedData);
        const deserializedDEK = deserializeEncryptedDEK(serializedDEK);

        // Envelope decrypt
        const decryptedData = envelopeDecrypt(deserializedData, deserializedDEK);

        expect(decryptedData.toString('utf-8')).toBe('Complete round-trip test');
      });
    });
  });

  describe('cryptographic properties', () => {
    it('should produce different IVs for each encryption', () => {
      const data = Buffer.from('Same data', 'utf-8');
      const dek = generateDEK();

      const encrypted1 = encrypt(data, dek);
      const encrypted2 = encrypt(data, dek);

      expect(encrypted1.iv.equals(encrypted2.iv)).toBe(false);
      expect(encrypted1.ciphertext.equals(encrypted2.ciphertext)).toBe(false);
    });

    it('should use authenticated encryption (tamper detection)', () => {
      const data = Buffer.from('Protected data', 'utf-8');
      const dek = generateDEK();

      const encrypted = encrypt(data, dek);

      // Tamper with a single bit in ciphertext
      encrypted.ciphertext[0] ^= 0x01;

      // Should fail authentication
      expect(() => decrypt(encrypted, dek)).toThrow();
    });

    it('should protect DEK encryption with authentication', () => {
      const dek = generateDEK();
      const kek = getMasterKey();

      const encryptedDEK = encryptDEK(dek, kek);

      // Tamper with encrypted DEK
      encryptedDEK.encryptedKey[0] ^= 0x01;

      // Should fail authentication
      expect(() => decryptDEK(encryptedDEK, kek)).toThrow();
    });
  });

  describe('integration scenarios', () => {
    it('should support cryptographic erasure workflow', () => {
      const sensitiveData = Buffer.from('Highly sensitive information', 'utf-8');

      // Encrypt with envelope encryption
      const { encryptedData, encryptedDEK } = envelopeEncrypt(sensitiveData);

      // Store encrypted data and encrypted DEK separately
      const storedData = serializeEncryptedData(encryptedData);
      const storedDEK = serializeEncryptedDEK(encryptedDEK);

      // Later: retrieve and decrypt
      const retrievedData = deserializeEncryptedData(storedData);
      const retrievedDEK = deserializeEncryptedDEK(storedDEK);
      const decrypted = envelopeDecrypt(retrievedData, retrievedDEK);

      expect(decrypted.toString('utf-8')).toBe('Highly sensitive information');

      // Cryptographic erasure: delete/zero the DEK
      // Now the data is permanently unrecoverable
      const dek = decryptDEK(retrievedDEK);
      zeroizeKey(dek);

      expect(dek.every(byte => byte === 0)).toBe(true);
      // Without the DEK, the encrypted data cannot be decrypted
    });

    it('should support key rotation workflow', () => {
      const data = Buffer.from('User data', 'utf-8');

      // Initial encryption with KEK v1
      const dek = generateDEK();
      const encryptedData = encrypt(data, dek);
      const oldKEK = getMasterKey();
      const encryptedDEKv1 = encryptDEK(dek, oldKEK);

      // Key rotation: decrypt DEK with old KEK, re-encrypt with new KEK
      const decryptedDEK = decryptDEK(encryptedDEKv1, oldKEK);
      const newKEK = generateDEK(); // In practice, this would be a new master key
      const encryptedDEKv2 = encryptDEK(decryptedDEK, newKEK);

      // Data remains unchanged, only DEK encryption changed
      const finalDEK = decryptDEK(encryptedDEKv2, newKEK);
      const finalData = decrypt(encryptedData, finalDEK);

      expect(finalData.toString('utf-8')).toBe('User data');
      expect(decryptedDEK.equals(finalDEK)).toBe(true);

      // Clean up
      zeroizeKey(decryptedDEK);
      zeroizeKey(finalDEK);
    });

    it('should handle multiple assets with separate DEKs', () => {
      const asset1 = Buffer.from('Asset 1 data', 'utf-8');
      const asset2 = Buffer.from('Asset 2 data', 'utf-8');
      const asset3 = Buffer.from('Asset 3 data', 'utf-8');

      // Each asset gets its own DEK
      const result1 = envelopeEncrypt(asset1);
      const result2 = envelopeEncrypt(asset2);
      const result3 = envelopeEncrypt(asset3);

      // All DEKs should be different
      const dek1 = decryptDEK(result1.encryptedDEK);
      const dek2 = decryptDEK(result2.encryptedDEK);
      const dek3 = decryptDEK(result3.encryptedDEK);

      expect(dek1.equals(dek2)).toBe(false);
      expect(dek2.equals(dek3)).toBe(false);
      expect(dek1.equals(dek3)).toBe(false);

      // Each asset can be decrypted independently
      const decrypted1 = envelopeDecrypt(result1.encryptedData, result1.encryptedDEK);
      const decrypted2 = envelopeDecrypt(result2.encryptedData, result2.encryptedDEK);
      const decrypted3 = envelopeDecrypt(result3.encryptedData, result3.encryptedDEK);

      expect(decrypted1.toString('utf-8')).toBe('Asset 1 data');
      expect(decrypted2.toString('utf-8')).toBe('Asset 2 data');
      expect(decrypted3.toString('utf-8')).toBe('Asset 3 data');

      // Clean up
      zeroizeKey(dek1);
      zeroizeKey(dek2);
      zeroizeKey(dek3);
    });
  });
});
