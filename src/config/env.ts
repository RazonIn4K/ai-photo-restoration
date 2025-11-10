import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

const logLevels = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent'
] as const;

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z
    .string()
    .default('4000')
    .transform(value => Number(value))
    .pipe(
      z
        .number()
        .int()
        .min(1)
        .max(65535)
        .describe('PORT must be a valid port number')
    ),
  LOG_LEVEL: z.enum(logLevels).default('info'),
  MONGO_URI: z
    .string()
    .url('MONGO_URI must be a valid connection string')
    .default('mongodb://admin:changeme@localhost:27017/face_restore?authSource=admin'),
  MONGO_MAX_POOL_SIZE: z
    .string()
    .default('20')
    .transform(value => Number(value))
    .pipe(z.number().int().min(1).max(500).describe('MONGO_MAX_POOL_SIZE must be within 1-500')),
  MONGO_MIN_POOL_SIZE: z
    .string()
    .default('5')
    .transform(value => Number(value))
    .pipe(z.number().int().min(0).max(500).describe('MONGO_MIN_POOL_SIZE must be within 0-500')),
  MONGO_CONNECT_TIMEOUT_MS: z
    .string()
    .default('10000')
    .transform(value => Number(value))
    .pipe(z.number().int().min(1000).describe('MONGO_CONNECT_TIMEOUT_MS must be >= 1000ms')),
  MONGO_SERVER_SELECTION_TIMEOUT_MS: z
    .string()
    .default('5000')
    .transform(value => Number(value))
    .pipe(z.number().int().min(1000).describe('MONGO_SERVER_SELECTION_TIMEOUT_MS must be >= 1000ms')),
  MONGO_HEARTBEAT_FREQUENCY_MS: z
    .string()
    .default('10000')
    .transform(value => Number(value))
    .pipe(z.number().int().min(1000).describe('MONGO_HEARTBEAT_FREQUENCY_MS must be >= 1000ms')),
  MONGO_KEY_VAULT_NAMESPACE: z
    .string()
    .default('encryption.__keyVault'),
  MONGO_CSFLE_KMS_PROVIDER: z
    .enum(['local', 'aws'])
    .default('local'),
  MONGO_DISABLE_CSFLE: z
    .string()
    .default('false')
    .transform(value => value === 'true'),
  MONGO_CRYPT_SHARED_LIB_PATH: z.string().optional(),
  MONGO_LOCAL_MASTER_KEY_BASE64: z
    .string()
    .optional()
    .describe('Base64 encoded 96-byte master key for local KMS provider'),
  MONGO_AWS_KMS_KEY_ID: z.string().optional(),
  MONGO_AWS_KMS_ACCESS_KEY_ID: z.string().optional(),
  MONGO_AWS_KMS_SECRET_ACCESS_KEY: z.string().optional(),
  MONGO_AWS_KMS_REGION: z.string().optional(),
  REDIS_URL: z
    .string()
    .url('REDIS_URL must be a valid connection string')
    .default('redis://localhost:6379'),
  METRICS_PORT: z
    .string()
    .default('9464')
    .transform(value => Number(value))
    .pipe(
      z
        .number()
        .int()
        .min(1)
        .max(65535)
        .describe('METRICS_PORT must be a valid port number')
    ),
  // Zyte API configuration (optional, disabled if ZYTE_API_KEY not provided)
  ZYTE_API_KEY: z
    .string()
    .optional()
    .describe('Zyte API key for web scraping service'),
  ZYTE_API_URL: z
    .string()
    .url('ZYTE_API_URL must be a valid URL')
    .default('https://api.zyte.com/v1/extract'),
  ZYTE_RATE_LIMIT_PER_MINUTE: z
    .string()
    .default('60')
    .transform(value => Number(value))
    .pipe(
      z
        .number()
        .int()
        .min(1)
        .max(1000)
        .describe('ZYTE_RATE_LIMIT_PER_MINUTE must be within 1-1000')
    ),
  ZYTE_RETRY_MAX_ATTEMPTS: z
    .string()
    .default('3')
    .transform(value => Number(value))
    .pipe(
      z
        .number()
        .int()
        .min(1)
        .max(10)
        .describe('ZYTE_RETRY_MAX_ATTEMPTS must be within 1-10')
    ),
  ZYTE_TIMEOUT_MS: z
    .string()
    .default('30000')
    .transform(value => Number(value))
    .pipe(
      z
        .number()
        .int()
        .min(1000)
        .max(120000)
        .describe('ZYTE_TIMEOUT_MS must be within 1000-120000ms')
    )
});

const parseResult = envSchema.safeParse(process.env);

if (!parseResult.success) {
  const formatted = parseResult.error.flatten();
  const errors = Object.entries(formatted.fieldErrors)
    .map(([field, messages]) => `${field}: ${messages?.join(', ')}`)
    .join('\n');

  throw new Error(`Environment validation failed:\n${errors}`);
}

const data = parseResult.data;

if (!data.MONGO_DISABLE_CSFLE) {
  if (
    data.MONGO_CSFLE_KMS_PROVIDER === 'local' &&
    (!data.MONGO_LOCAL_MASTER_KEY_BASE64 || data.MONGO_LOCAL_MASTER_KEY_BASE64.length === 0)
  ) {
    throw new Error(
      'Environment validation failed:\nMONGO_LOCAL_MASTER_KEY_BASE64 is required when using the local KMS provider.'
    );
  }

  if (data.MONGO_CSFLE_KMS_PROVIDER === 'aws') {
    const missingAwsFields = [
      'MONGO_AWS_KMS_KEY_ID',
      'MONGO_AWS_KMS_ACCESS_KEY_ID',
      'MONGO_AWS_KMS_SECRET_ACCESS_KEY',
      'MONGO_AWS_KMS_REGION'
    ].filter(field => !data[field as keyof typeof data]);

    if (missingAwsFields.length > 0) {
      throw new Error(
        `Environment validation failed:\nMissing AWS KMS configuration fields: ${missingAwsFields.join(', ')}`
      );
    }
  }
}

export const env = {
  ...data,
  isDevelopment: data.NODE_ENV === 'development',
  isProduction: data.NODE_ENV === 'production',
  isTest: data.NODE_ENV === 'test'
};

export type AppEnvironment = typeof env;
