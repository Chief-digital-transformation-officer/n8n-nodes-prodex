import { describe, expect, it } from 'vitest';

import { buildAuthJson, mapSandboxMode } from '../../lib/auth/codexEnv';
import { isTokenExpired, mergeTokenRefresh, normalizeTokenBundle } from '../../lib/auth/tokenStore';
import { CodexAgentTimeoutError } from '../../lib/errors';
import {
  DEFAULT_CODEX_AGENT_TIMEOUT_MS,
  parseAgentResult,
} from '../../lib/codex/runAgent';

describe('tokenStore', () => {
  it('detects expired tokens', () => {
    const bundle = normalizeTokenBundle({
      accessToken: 'token',
      refreshToken: 'refresh',
      expiresAt: '2020-01-01T00:00:00.000Z',
    });

    expect(isTokenExpired(bundle)).toBe(true);
  });

  it('merges refresh responses', () => {
    const merged = mergeTokenRefresh(
      {
        accessToken: 'old',
        refreshToken: 'old-refresh',
        accountId: 'acct',
        expiresAt: '2020-01-01T00:00:00.000Z',
      },
      {
        access_token: 'new',
        refresh_token: 'new-refresh',
        expires_in: 7200,
      },
    );

    expect(merged.accessToken).toBe('new');
    expect(merged.refreshToken).toBe('new-refresh');
  });
});

describe('codexEnv', () => {
  it('builds auth json for chatgpt mode', () => {
    const authJson = buildAuthJson({
      accessToken: 'access',
      refreshToken: 'refresh',
      accountId: 'acct',
      expiresAt: '2999-01-01T00:00:00.000Z',
    });

    expect(authJson.auth_mode).toBe('chatgpt');
    expect(authJson.tokens.access_token).toBe('access');
  });

  it('maps sandbox modes', () => {
    expect(mapSandboxMode('read_only')).toBe('read-only');
    expect(mapSandboxMode('workspace_write')).toBe('workspace-write');
    expect(mapSandboxMode('full_access')).toBe('danger-full-access');
  });
});

describe('parseAgentResult', () => {
  it('normalizes usage and output fields', () => {
    const parsed = parseAgentResult(
      {
        finalResponse: 'Done',
        items: [{ type: 'agent_message' }],
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          total_tokens: 15,
        },
      },
      'thread_123',
      'gpt-5.4',
    );

    expect(parsed.output).toBe('Done');
    expect(parsed.threadId).toBe('thread_123');
    expect(parsed.usage?.totalTokens).toBe(15);
  });
});

describe('Codex timeout', () => {
  it('uses an agentic default and reports an actionable error', () => {
    expect(DEFAULT_CODEX_AGENT_TIMEOUT_MS).toBe(600_000);
    expect(new CodexAgentTimeoutError(DEFAULT_CODEX_AGENT_TIMEOUT_MS).message).toContain(
      'Timeout (Seconds)',
    );
  });
});
