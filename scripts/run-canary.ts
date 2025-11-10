import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const suiteArg = process.argv[2] ?? 'smoke';
const suiteMap: Record<string, string> = {
  smoke: 'tests/canary/smoke',
  meta: 'tests/canary/meta',
  visual: 'tests/canary/visual'
};

if (!suiteMap[suiteArg]) {
  console.error(`Unknown suite "${suiteArg}". Choose one of: ${Object.keys(suiteMap).join(', ')}`);
  process.exit(1);
}

const artifactsDir = resolve('artifacts/canary');
await mkdir(artifactsDir, { recursive: true });
const reportPath = join(artifactsDir, `canary-${suiteArg}-${Date.now()}.json`);

const reporterArg = `list,json=${reportPath}`;
const browserProject = process.env.CANARY_BROWSER ?? 'chromium';

const args = [
  'playwright',
  'test',
  suiteMap[suiteArg],
  '--config=playwright.config.ts',
  `--project=${browserProject}`,
  `--reporter=${reporterArg}`
];

const exitCode = await runCommand(args);

if (existsSync(reportPath)) {
  const summary = await summarizeReport(reportPath, suiteArg);
  console.log(JSON.stringify({ type: 'canary_summary', ...summary }));
} else {
  console.warn(`Canary report not found at ${reportPath}`);
}

process.exit(exitCode);

async function runCommand(args: string[]): Promise<number> {
  return await new Promise(resolvePromise => {
    const runner = spawn(process.platform === 'win32' ? 'npx.cmd' : 'npx', args, {
      stdio: 'inherit',
      env: process.env
    });

    runner.on('close', code => {
      resolvePromise(code ?? 1);
    });
  });
}

interface PlaywrightTestResult {
  status: string;
  duration: number;
}

interface PlaywrightTestEntry {
  title: string;
  outcome: string;
  results: PlaywrightTestResult[];
}

interface PlaywrightSuiteEntry {
  title: string;
  fileId?: string;
  suites?: PlaywrightSuiteEntry[];
  tests?: PlaywrightTestEntry[];
}

interface PlaywrightJsonReport {
  suites?: PlaywrightSuiteEntry[];
}

async function summarizeReport(reportPath: string, suite: string) {
  const raw = await readFile(reportPath, 'utf8');
  const data = JSON.parse(raw) as PlaywrightJsonReport;
  const summary = {
    suite,
    totalTests: 0,
    failedTests: 0,
    skippedTests: 0,
    passedTests: 0,
    totalDurationMs: 0
  };

  function walkSuite(entry?: PlaywrightSuiteEntry) {
    if (!entry) return;
    entry.tests?.forEach(testEntry => {
      summary.totalTests += 1;
      const status = normalizeOutcome(testEntry.outcome, testEntry.results);
      if (status === 'failed') {
        summary.failedTests += 1;
      } else if (status === 'skipped') {
        summary.skippedTests += 1;
      } else {
        summary.passedTests += 1;
      }
      summary.totalDurationMs += testEntry.results.reduce(
        (acc, result) => acc + (result.duration ?? 0),
        0
      );
    });

    entry.suites?.forEach(walkSuite);
  }

  data.suites?.forEach(walkSuite);
  return summary;
}

function normalizeOutcome(
  outcome: string,
  results: PlaywrightTestResult[]
): 'passed' | 'failed' | 'skipped' {
  if (outcome === 'skipped') {
    return 'skipped';
  }
  if (outcome === 'unexpected') {
    return 'failed';
  }
  const hasFailure = results.some(result => result.status && result.status !== 'passed');
  return hasFailure ? 'failed' : 'passed';
}
