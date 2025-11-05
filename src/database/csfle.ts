import type { AutoEncryptionOptions, KMSProviders } from 'mongodb';
import { MongoClient } from 'mongodb';

import { env } from '../config/index.js';
import { logger } from '../lib/logger.js';

const keyVaultNamespace = env.MONGO_KEY_VAULT_NAMESPACE;
const defaultKeyAltName = 'face-restore-ai-data-key';

const [keyVaultDatabase, keyVaultCollection] = keyVaultNamespace.split('.');

function buildKmsProviders(): KMSProviders {
  if (env.MONGO_DISABLE_CSFLE) {
    return {};
  }

  if (env.MONGO_CSFLE_KMS_PROVIDER === 'local') {
    const encodedKey = env.MONGO_LOCAL_MASTER_KEY_BASE64;
    if (!encodedKey) {
      throw new Error('MONGO_LOCAL_MASTER_KEY_BASE64 must be provided when CSFLE is enabled');
    }

    const key = Buffer.from(encodedKey, 'base64');

    if (key.length !== 96) {
      throw new Error(
        'Local master key must be 96 bytes. Generate via `openssl rand -base64 96` and set MONGO_LOCAL_MASTER_KEY_BASE64.'
      );
    }

    return {
      local: {
        key
      }
    };
  }

  return {
    aws: {
      accessKeyId: env.MONGO_AWS_KMS_ACCESS_KEY_ID!,
      secretAccessKey: env.MONGO_AWS_KMS_SECRET_ACCESS_KEY!,
      region: env.MONGO_AWS_KMS_REGION!
    }
  } as KMSProviders;
}

export function buildAutoEncryptionOptions(
  schemaMap: AutoEncryptionOptions['schemaMap'] = {}
): AutoEncryptionOptions | undefined {
  if (env.MONGO_DISABLE_CSFLE) {
    logger.warn('CSFLE is disabled via environment configuration.');
    return undefined;
  }

  const extraOptions: AutoEncryptionOptions['extraOptions'] = {};

  if (env.MONGO_CRYPT_SHARED_LIB_PATH) {
    extraOptions.cryptSharedLibPath = env.MONGO_CRYPT_SHARED_LIB_PATH;
    extraOptions.cryptSharedLibRequired = false;
  }

  return {
    keyVaultNamespace,
    kmsProviders: buildKmsProviders(),
    extraOptions,
    schemaMap
  };
}

type ClientEncryptionOptions = {
  keyVaultNamespace: string;
  kmsProviders: KMSProviders;
  keyVaultClient?: MongoClient;
  [key: string]: unknown;
};

type ClientEncryptionInstance = {
  createDataKey: (provider: string, options: { keyAltNames: string[] }) => Promise<Buffer>;
  close?: () => Promise<void | undefined>;
};

type ClientEncryptionConstructor = new (
  client: MongoClient,
  options: ClientEncryptionOptions
) => ClientEncryptionInstance;

async function loadClientEncryption(): Promise<ClientEncryptionConstructor> {
  const importedModule = (await import('mongodb-client-encryption')) as unknown;

  let ClientEncryption: ClientEncryptionConstructor | undefined;

  if (typeof importedModule === 'function') {
    ClientEncryption = importedModule as ClientEncryptionConstructor;
  } else if (
    typeof importedModule === 'object' &&
    importedModule !== null &&
    'ClientEncryption' in importedModule &&
    typeof (importedModule as Record<string, unknown>).ClientEncryption === 'function'
  ) {
    ClientEncryption = (importedModule as { ClientEncryption: ClientEncryptionConstructor })
      .ClientEncryption;
  } else if (
    typeof importedModule === 'object' &&
    importedModule !== null &&
    'default' in importedModule
  ) {
    const defaultExport = (importedModule as { default: unknown }).default;

    if (typeof defaultExport === 'function') {
      ClientEncryption = defaultExport as ClientEncryptionConstructor;
    } else if (
      typeof defaultExport === 'object' &&
      defaultExport !== null &&
      'ClientEncryption' in defaultExport &&
      typeof (defaultExport as Record<string, unknown>).ClientEncryption === 'function'
    ) {
      ClientEncryption = (defaultExport as { ClientEncryption: ClientEncryptionConstructor })
        .ClientEncryption;
    }
  }

  if (!ClientEncryption) {
    throw new Error('ClientEncryption is not available in mongodb-client-encryption module');
  }

  return ClientEncryption;
}

export async function ensureKeyVaultArtifacts(client: MongoClient): Promise<void> {
  if (env.MONGO_DISABLE_CSFLE) {
    return;
  }

  if (!keyVaultDatabase || !keyVaultCollection) {
    throw new Error(
      `Invalid key vault namespace "${keyVaultNamespace}". Expected format <database>.<collection>.`
    );
  }

  const keyVault = client.db(keyVaultDatabase).collection(keyVaultCollection);

  await keyVault.createIndex(
    { keyAltNames: 1 },
    {
      unique: true,
      partialFilterExpression: { keyAltNames: { $exists: true } },
      name: 'keyAltNames_unique'
    }
  );
}

export async function ensureDefaultDataKey(client: MongoClient): Promise<string | undefined> {
  if (env.MONGO_DISABLE_CSFLE) {
    return undefined;
  }

  if (!keyVaultDatabase || !keyVaultCollection) {
    throw new Error(
      `Invalid key vault namespace "${keyVaultNamespace}". Expected format <database>.<collection>.`
    );
  }

  const keyVault = client.db(keyVaultDatabase).collection(keyVaultCollection);

  const existingKey = await keyVault.findOne({ keyAltNames: defaultKeyAltName });
  if (existingKey?._id) {
    return existingKey._id.toString('base64');
  }

  const ClientEncryption = await loadClientEncryption();

  const encryption = new ClientEncryption(client, {
    keyVaultNamespace,
    kmsProviders: buildKmsProviders()
  });

  try {
    const keyId = await encryption.createDataKey(env.MONGO_CSFLE_KMS_PROVIDER, {
      keyAltNames: [defaultKeyAltName]
    });
    logger.info({ keyAltName: defaultKeyAltName }, 'Created new CSFLE data key');
    return keyId.toString('base64');
  } finally {
    if (typeof encryption.close === 'function') {
      await encryption.close();
    }
  }
}

export function getKeyVaultNamespace(): { db: string; collection: string } {
  if (!keyVaultDatabase || !keyVaultCollection) {
    throw new Error(
      `Invalid key vault namespace "${keyVaultNamespace}". Expected format <database>.<collection>.`
    );
  }

  return { db: keyVaultDatabase, collection: keyVaultCollection };
}
