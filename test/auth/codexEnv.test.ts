import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildAuthJson,
  buildCodexEnv,
  createCodexHome,
  hasAgentIdentity,
  hasCompleteCodexAuth,
  resolveCodexHome,
} from '../../lib/auth/codexEnv';
import { isValidJwt } from '../../lib/auth/tokenStore';

const sampleJwt =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

describe('codexEnv', () => {
  const originalN8nUserFolder = process.env.N8N_USER_FOLDER;

  afterEach(() => {
    if (originalN8nUserFolder === undefined) {
      delete process.env.N8N_USER_FOLDER;
    } else {
      process.env.N8N_USER_FOLDER = originalN8nUserFolder;
    }
  });

  it('stores codex data under n8n user folder when available', () => {
    process.env.N8N_USER_FOLDER = '/home/node/.n8n';
    expect(resolveCodexHome()).toBe(join('/home/node/.n8n', 'codex'));
  });

  it('prefers docker n8n codex home before generic fallback', () => {
    delete process.env.N8N_USER_FOLDER;
    const home = resolveCodexHome();
    if (existsSync('/home/node/.n8n')) {
      expect(home).toBe(join('/home/node/.n8n', 'codex'));
    } else {
      expect(home).toContain('.n8n-codex');
    }
  });

  it('omits empty id_token from auth.json', () => {
    const authJson = buildAuthJson({
      accessToken: sampleJwt,
      refreshToken: 'refresh',
      accountId: 'acct',
      expiresAt: '2999-01-01T00:00:00.000Z',
    });

    expect(authJson.tokens.id_token).toBeUndefined();
    expect(authJson.tokens.access_token).toBe(sampleJwt);
  });

  it('includes id_token when provided', () => {
    const authJson = buildAuthJson({
      accessToken: sampleJwt,
      refreshToken: 'refresh',
      accountId: 'acct',
      expiresAt: '2999-01-01T00:00:00.000Z',
      idToken: sampleJwt,
    });

    expect(authJson.tokens.id_token).toBe(sampleJwt);
  });

  it('preserves agent_identity when createCodexHome updates tokens', () => {
    const n8nFolder = mkdtempSync(join(tmpdir(), 'n8n-test-'));
    process.env.N8N_USER_FOLDER = n8nFolder;
    const codexHome = join(n8nFolder, 'codex');
    mkdirSync(codexHome, { recursive: true });
    const agentJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZ2VudCJ9.x';

    writeFileSync(
      join(codexHome, 'auth.json'),
      JSON.stringify({
        auth_mode: 'chatgpt',
        OPENAI_API_KEY: null,
        agent_identity: agentJwt,
        tokens: {
          access_token: sampleJwt,
          refresh_token: 'refresh-old',
          id_token: sampleJwt,
          account_id: 'acct',
        },
      }),
      'utf8',
    );

    createCodexHome({
      accessToken: sampleJwt,
      refreshToken: 'refresh-new',
      accountId: 'acct',
      expiresAt: '2999-01-01T00:00:00.000Z',
      idToken: sampleJwt,
    });

    const parsed = JSON.parse(readFileSync(join(resolveCodexHome(), 'auth.json'), 'utf8'));
    expect(parsed.agent_identity).toBe(agentJwt);
    expect(parsed.tokens.refresh_token).toBe('refresh-new');
    expect(hasAgentIdentity(parsed)).toBe(true);
    expect(hasCompleteCodexAuth(parsed)).toBe(true);

    rmSync(n8nFolder, { recursive: true, force: true });
  });

  it('preserves object agent_identity when createCodexHome updates tokens', () => {
    const n8nFolder = mkdtempSync(join(tmpdir(), 'n8n-test-'));
    process.env.N8N_USER_FOLDER = n8nFolder;
    const codexHome = join(n8nFolder, 'codex');
    mkdirSync(codexHome, { recursive: true });
    const agentRecord = {
      agent_runtime_id: 'agent-runtime-123',
      agent_private_key: 'private-key',
      account_id: 'acct',
      task_id: 'task-123',
    };

    writeFileSync(
      join(codexHome, 'auth.json'),
      JSON.stringify({
        auth_mode: 'chatgpt',
        OPENAI_API_KEY: null,
        agent_identity: agentRecord,
        tokens: {
          access_token: sampleJwt,
          refresh_token: 'refresh-old',
          id_token: sampleJwt,
          account_id: 'acct',
        },
      }),
      'utf8',
    );

    createCodexHome({
      accessToken: sampleJwt,
      refreshToken: 'refresh-new',
      accountId: 'acct',
      expiresAt: '2999-01-01T00:00:00.000Z',
      idToken: sampleJwt,
    });

    const parsed = JSON.parse(readFileSync(join(resolveCodexHome(), 'auth.json'), 'utf8'));
    expect(parsed.agent_identity).toEqual(agentRecord);
    expect(parsed.tokens.refresh_token).toBe('refresh-new');
    expect(hasAgentIdentity(parsed)).toBe(true);
    expect(hasCompleteCodexAuth(parsed)).toBe(true);

    rmSync(n8nFolder, { recursive: true, force: true });
  });

  it('treats valid chatgpt tokens as complete auth even without agent_identity', () => {
    const authJson = {
      auth_mode: 'chatgpt' as const,
      OPENAI_API_KEY: null,
      tokens: {
        access_token: sampleJwt,
        refresh_token: 'refresh',
        id_token: sampleJwt,
        account_id: 'acct',
      },
    };

    expect(hasCompleteCodexAuth(authJson)).toBe(true);
    expect(hasAgentIdentity(authJson)).toBe(false);
  });

  it('does not pass OAuth access tokens via CODEX_ACCESS_TOKEN', () => {
    process.env.CODEX_ACCESS_TOKEN = sampleJwt;
    process.env.PATH = '/usr/bin';

    const env = buildCodexEnv('/tmp/codex-home');
    expect(env.CODEX_HOME).toBe('/tmp/codex-home');
    expect(env.CODEX_ACCESS_TOKEN).toBeUndefined();
    expect(env.PATH).toContain('/tmp/codex-home/bin');
    expect(env.PATH).toContain('/tmp/codex-home/dependencies/python/bin');
    expect(env.PATH).toContain('node_modules/.bin');
    expect(env.PATH).toContain('/usr/bin');
    expect(env.PRODEX_DEPENDENCIES_HOME).toBe('/tmp/codex-home/dependencies');
    expect(env.PYTHONUSERBASE).toBe('/tmp/codex-home/dependencies/python');
    expect(env.NPM_CONFIG_PREFIX).toBe('/tmp/codex-home/dependencies/npm');
    expect(env.UV_PYTHON_INSTALL_DIR).toBe('/tmp/codex-home/dependencies/uv/python');
    expect(env.UV_PYTHON_BIN_DIR).toBe('/tmp/codex-home/dependencies/bin');
    expect(env.LD_LIBRARY_PATH).toContain('/tmp/codex-home/dependencies/lib');
    expect(env.CPATH).toContain('/tmp/codex-home/dependencies/include');
    expect(env.PKG_CONFIG_PATH).toContain('/tmp/codex-home/dependencies/lib/pkgconfig');
    expect(env.CMAKE_PREFIX_PATH).toContain('/tmp/codex-home/dependencies');
    expect(env.N8NAC_CMD).toBe('/tmp/codex-home/bin/n8nac');
    expect(env.N8N_DATA_TABLES_CMD).toBe('/tmp/codex-home/bin/n8n-data-tables');

    delete process.env.CODEX_ACCESS_TOKEN;
  });
});

describe('isValidJwt', () => {
  it('rejects empty and malformed tokens', () => {
    expect(isValidJwt('')).toBe(false);
    expect(isValidJwt('not-a-jwt')).toBe(false);
  });

  it('accepts jwt payloads that decode to json', () => {
    expect(isValidJwt(sampleJwt)).toBe(true);
  });
});
