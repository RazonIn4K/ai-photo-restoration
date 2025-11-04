export {
  connectDatabase,
  disconnectDatabase,
  getDatabaseClient,
  checkDatabaseHealth
} from './connection.js';

export {
  buildAutoEncryptionOptions,
  ensureDefaultDataKey,
  ensureKeyVaultArtifacts,
  getKeyVaultNamespace
} from './csfle.js';
