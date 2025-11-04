import type { AutoEncryptionOptions } from 'mongodb';
import mongoose, { type ConnectOptions, type Connection } from 'mongoose';

import {
  buildAutoEncryptionOptions,
  ensureDefaultDataKey,
  ensureKeyVaultArtifacts
} from './csfle.js';
import { env } from '../config/index.js';
import { logger } from '../lib/logger.js';

const RECONNECT_DELAY_MS = 2_000;
const MAX_RETRIES = 5;

let connectionPromise: Promise<typeof mongoose> | null = null;
let csfleInitialized = false;
let listenersRegistered = false;

function registerConnectionListeners(): void {
  if (listenersRegistered) {
    return;
  }

  const connection = mongoose.connection;

  connection.on('connected', () => {
    logger.info('MongoDB connection established');
  });

  connection.on('reconnected', () => {
    logger.warn('MongoDB connection re-established');
  });

  connection.on('disconnected', () => {
    logger.warn('MongoDB connection lost');
  });

  connection.on('error', error => {
    logger.error({ error }, 'MongoDB connection error');
  });

  listenersRegistered = true;
}

async function connectWithRetry(attempt = 1): Promise<typeof mongoose> {
  registerConnectionListeners();

  const connectOptions: ConnectOptions = {
    autoIndex: false,
    maxPoolSize: env.MONGO_MAX_POOL_SIZE,
    minPoolSize: env.MONGO_MIN_POOL_SIZE,
    serverSelectionTimeoutMS: env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    connectTimeoutMS: env.MONGO_CONNECT_TIMEOUT_MS,
    heartbeatFrequencyMS: env.MONGO_HEARTBEAT_FREQUENCY_MS,
    retryReads: true,
    retryWrites: true
  };

  let autoEncryption: AutoEncryptionOptions | undefined;
  if (!env.MONGO_DISABLE_CSFLE) {
    autoEncryption = buildAutoEncryptionOptions();
    if (autoEncryption) {
      connectOptions.autoEncryption = autoEncryption;
    }
  }

  try {
    await mongoose.connect(env.MONGO_URI, connectOptions);

    if (!csfleInitialized && !env.MONGO_DISABLE_CSFLE) {
      const client = mongoose.connection.getClient();
      await ensureKeyVaultArtifacts(client);
      await ensureDefaultDataKey(client);
      csfleInitialized = true;
    }

    return mongoose;
  } catch (error) {
    logger.error({ attempt, error }, 'MongoDB connection attempt failed');

    if (attempt >= MAX_RETRIES) {
      throw error;
    }

    await new Promise(resolve => setTimeout(resolve, RECONNECT_DELAY_MS * attempt));
    return connectWithRetry(attempt + 1);
  }
}

export async function connectDatabase(): Promise<typeof mongoose> {
  if (mongoose.connection.readyState === 1) {
    return mongoose;
  }

  if (!connectionPromise) {
    connectionPromise = connectWithRetry();
  }

  return connectionPromise;
}

export async function disconnectDatabase(): Promise<void> {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
    connectionPromise = null;
    csfleInitialized = false;
  }
}

export function getDatabaseClient(): Connection {
  return mongoose.connection;
}

export async function checkDatabaseHealth(): Promise<boolean> {
  try {
    const conn = await connectDatabase();
    const db = conn.connection.db;
    if (!db) {
      throw new Error('Database connection not available');
    }
    await db.admin().command({ ping: 1 });
    return true;
  } catch (error) {
    logger.error({ error }, 'MongoDB health check failed');
    return false;
  }
}
