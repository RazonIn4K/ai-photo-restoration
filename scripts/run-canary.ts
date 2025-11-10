
#!/usr/bin/env tsx

/**
 * Canary Test Runner
 *
 * Executes canary test suites with proper logging, metrics, and exit codes.
 * Designed for CI/CD pipelines with fork safety and observability in mind.
 *
 * Usage:
 *   tsx scripts/run-canary.ts <suite>
 *
 * Suites:
 *   smoke  - Fast integration tests (storage, basic API)
 *   meta   - Metadata processing tests (EXIF, C2PA, embedding)
 *   visual - Perceptual hash and image processing tests
 */

import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface CanaryConfig {
  suite: string;
  testPattern: string;
  timeout: number;
  description: string;
}

const CANARY_CONFIGS: Record<string, CanaryConfig> = {
  smoke: {
    suite: 'smoke',
    testPattern: 'tests/integration/**/*.test.ts',
    timeout: 30000,
    description: 'Fast integration smoke tests',
  },
  meta: {
    suite: 'meta',
    testPattern: 'tests/metadata/**/*.test.ts',
    timeout: 60000,
    description: 'Metadata processing tests (EXIF, C2PA, embedding)',
  },
  visual: {
    suite: 'visual',
    testPattern: 'tests/hash/**/*.test.ts',
    timeout: 90000,
    description: 'Perceptual hash and image processing tests',
  },
};

// Structured logging for observability
class CanaryLogger {
  private startTime: number;

  constructor() {
    this.startTime = Date.now();
  }

  info(message: string, metadata?: Record<string, unknown>) {
    console.log(JSON.stringify({
      level: 'info',
      timestamp: new Date().toISOString(),
      message,
      ...metadata,
    }));
  }

  error(message: string, error?: Error, metadata?: Record<string, unknown>) {
    console.error(JSON.stringify({
      level: 'error',
      timestamp: new Date().toISOString(),
      message,
      error: error?.message,
      stack: error?.stack,
      ...metadata,
    }));
  }

  metric(name: string, value: number, labels?: Record<string, string>) {
    console.log(JSON.stringify({
      level: 'metric',
      timestamp: new Date().toISOString(),
      metric: name,
      value,
      labels,
    }));
  }

  getDuration(): number {
    return Date.now() - this.startTime;
  }
}

function validateEnvironment(logger: CanaryLogger): void {
  const requiredVars = ['NODE_ENV'];
  const missing = requiredVars.filter(v => !process.env[v]);

  if (missing.length > 0) {
    logger.info('Setting default environment variables', { missing });
    process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  }

  logger.info('Environment validated', {
    nodeVersion: process.version,
    nodeEnv: process.env.NODE_ENV,
    ci: process.env.CI || 'false',
  });
}

function runCanary(config: CanaryConfig, logger: CanaryLogger): void {
  logger.info('Starting canary test suite', {
    suite: config.suite,
    description: config.description,
    pattern: config.testPattern,
    timeout: config.timeout,
  });

  const vitestArgs = [
    'vitest',
    'run',
    '--reporter=verbose',
    '--reporter=json',
    '--outputFile=canary-results.json',
    `--testTimeout=${config.timeout}`,
    config.testPattern,
  ].join(' ');

  try {
    logger.info('Executing vitest', { command: vitestArgs });

    const output = execSync(`npx ${vitestArgs}`, {
      encoding: 'utf-8',
      stdio: ['inherit', 'pipe', 'pipe'],
      env: {
        ...process.env,
        FORCE_COLOR: '1',
      },
    });

    console.log(output);

    logger.info('Canary tests passed', {
      suite: config.suite,
      duration_ms: logger.getDuration(),
    });

    logger.metric('canary_test_duration_ms', logger.getDuration(), {
      suite: config.suite,
      status: 'success',
    });

    logger.metric('canary_test_result', 1, {
      suite: config.suite,
      status: 'pass',
    });

  } catch (error) {
    const execError = error as { status?: number; stdout?: Buffer; stderr?: Buffer };

    // Log test output even on failure
    if (execError.stdout) {
      console.log(execError.stdout.toString());
    }
    if (execError.stderr) {
      console.error(execError.stderr.toString());
    }

    logger.error('Canary tests failed', error as Error, {
      suite: config.suite,
      duration_ms: logger.getDuration(),
      exitCode: execError.status,
    });

    logger.metric('canary_test_duration_ms', logger.getDuration(), {
      suite: config.suite,
      status: 'failure',
    });

    logger.metric('canary_test_result', 0, {
      suite: config.suite,
      status: 'fail',
    });

    process.exit(execError.status || 1);
  }
}

function generateArtifacts(config: CanaryConfig, logger: CanaryLogger): void {
  const artifactsDir = join(process.cwd(), 'canary-artifacts');

  if (!existsSync(artifactsDir)) {
    mkdirSync(artifactsDir, { recursive: true });
  }

  const metadata = {
    suite: config.suite,
    timestamp: new Date().toISOString(),
    duration_ms: logger.getDuration(),
    nodeVersion: process.version,
    ci: process.env.CI || 'false',
    gitRef: process.env.GITHUB_REF || 'unknown',
    gitSha: process.env.GITHUB_SHA || 'unknown',
  };

  const metadataPath = join(artifactsDir, `${config.suite}-metadata.json`);
  writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

  logger.info('Artifacts generated', { path: artifactsDir });
}

function main() {
  const logger = new CanaryLogger();

  const suite = process.argv[2];

  if (!suite) {
    console.error('Usage: tsx scripts/run-canary.ts <suite>');
    console.error('Available suites:', Object.keys(CANARY_CONFIGS).join(', '));
    process.exit(1);
  }

  const config = CANARY_CONFIGS[suite];

  if (!config) {
    logger.error(`Unknown canary suite: ${suite}`, undefined, {
      available: Object.keys(CANARY_CONFIGS),
    });
    process.exit(1);
  }

  validateEnvironment(logger);
  runCanary(config, logger);
  generateArtifacts(config, logger);

  logger.info('Canary execution completed successfully', {
    suite: config.suite,
    total_duration_ms: logger.getDuration(),
  });
}

main();
