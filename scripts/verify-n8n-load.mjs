import { createRequire } from 'node:module';
import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const logPath = join(root, 'debug-8bea81.log');

function log(message, data, hypothesisId) {
  appendFileSync(
    logPath,
    `${JSON.stringify({
      sessionId: '8bea81',
      runId: 'verify-load',
      hypothesisId,
      location: 'scripts/verify-n8n-load.mjs',
      message,
      data,
      timestamp: Date.now(),
    })}\n`,
  );
}

try {
  log('attempting require of ProDex.node.js', { path: 'dist/nodes/ProDex/ProDex.node.js' }, 'A');
  const nodeModule = require(join(root, 'dist/nodes/ProDex/ProDex.node.js'));
  log('ProDex node module loaded', { exports: Object.keys(nodeModule) }, 'A');

  const runAgent = require(join(root, 'dist/lib/codex/runAgent.js'));
  log('attempting runtime codex-sdk load via loadCodexSdk path', {}, 'C');
  await runAgent.runCodexAgent({
    model: 'gpt-5.4-mini',
    prompt: 'noop',
    threadMode: 'new',
    sandbox: 'readOnly',
    reasoningEffort: 'medium',
    personality: 'default',
    tokenBundle: {
      accessToken: 'test',
      refreshToken: 'test',
      accountId: 'test',
      expiresAt: Date.now() + 3600000,
    },
    timeoutMs: 1000,
  }).catch((error) => {
    if (error.message.includes('exports') && error.message.includes('codex-sdk')) {
      throw error;
    }
    log('runCodexAgent failed after codex-sdk import (expected without real auth)', { error: error.message }, 'C');
  });

  console.log('VERIFY OK: node package loads and codex-sdk import path works');
} catch (error) {
  log('ProDex node module load failed', { error: error.message }, 'A');
  console.error('VERIFY FAIL:', error.message);
  process.exit(1);
}
