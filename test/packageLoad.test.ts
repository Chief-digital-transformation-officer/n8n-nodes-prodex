import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);

describe('n8n package load', () => {
  it('loads the compiled node module without requiring ESM-only codex-sdk at import time', () => {
    expect(() => require('../dist/nodes/ProDex/ProDex.node.js')).not.toThrow();
  });

  it('loads the setup node module', () => {
    expect(() => require('../dist/nodes/ProDexSetup/ProDexSetup.node.js')).not.toThrow();
  });

  it('loads the chat model node module', () => {
    expect(() => require('../dist/nodes/ProDexChatModel/ProDexChatModel.node.js')).not.toThrow();
  });

  it('loads the n8n management credential', () => {
    expect(() => require('../dist/credentials/ProDexN8nApi.credentials.js')).not.toThrow();
  });
});
