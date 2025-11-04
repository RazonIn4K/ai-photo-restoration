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

export {
  initializeModels,
  validateModels,
  getDatabaseStats,
  ActionLogModel,
  RequestRecordModel,
  ConsentRecordModel,
  ConfigModel,
  GroupConfigModel
} from './models.js';
