import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { homedir, tmpdir } from 'os';
import { delimiter, join } from 'path';

import {
  ensureCodexCommandLaunchers,
  resolveN8nacBinDirectory,
} from '../codex/manageCodexCli';
import { CodexAuthSetupError } from '../errors';
import type { CodexAuthJson, CodexTokenBundle } from '../types/codex';
import { decodeJwtExpiry, extractAccountId, isValidJwt } from './tokenStore';

function isUnderTmp(path: string): boolean {
  const tmp = tmpdir().replace(/\\/g, '/').toLowerCase();
  const normalized = path.replace(/\\/g, '/').toLowerCase();
  return normalized === tmp || normalized.startsWith(`${tmp}/`);
}

function resolvePreferredCodexHome(): string {
  const n8nUserFolder = process.env.N8N_USER_FOLDER?.trim();
  if (n8nUserFolder) {
    return join(n8nUserFolder, 'codex');
  }

  if (existsSync('/home/node/.n8n')) {
    return join('/home/node/.n8n', 'codex');
  }

  const home = homedir();
  if (home && !isUnderTmp(home)) {
    return join(home, '.n8n-codex');
  }

  return join(home || '/home/node', '.n8n-codex');
}

export function resolveCodexHome(): string {
  const preferred = resolvePreferredCodexHome();
  if (existsSync(join(preferred, 'auth.json'))) {
    return preferred;
  }

  const legacy = join(homedir() || '/home/node', '.n8n-codex');
  if (legacy !== preferred && existsSync(join(legacy, 'auth.json'))) {
    return legacy;
  }

  return preferred;
}

export function hasAgentIdentityAuthMaterial(agentIdentity: unknown): boolean {
  if (typeof agentIdentity === 'string') {
    return isValidJwt(agentIdentity);
  }

  if (agentIdentity && typeof agentIdentity === 'object') {
    const record = agentIdentity as Record<string, unknown>;
    const runtimeId =
      typeof record.agent_runtime_id === 'string' ? record.agent_runtime_id.trim() : '';
    const privateKey =
      typeof record.agent_private_key === 'string' ? record.agent_private_key.trim() : '';
    return runtimeId.length > 0 && privateKey.length > 0;
  }

  return false;
}

export function readAuthJson(codexHome = resolveCodexHome()): CodexAuthJson | null {
  const authPath = join(codexHome, 'auth.json');
  if (!existsSync(authPath)) {
    return null;
  }

  try {
    return sanitizeAuthJson(JSON.parse(readFileSync(authPath, 'utf8')) as CodexAuthJson);
  } catch {
    return null;
  }
}

export function hasRunnableAuthTokens(authJson: CodexAuthJson | null): authJson is CodexAuthJson {
  if (!authJson?.tokens?.access_token || !authJson.tokens.refresh_token) {
    return false;
  }

  return isValidJwt(authJson.tokens.access_token) && isValidJwt(authJson.tokens.id_token);
}

export function hasAgentIdentity(authJson: CodexAuthJson | null): boolean {
  return hasAgentIdentityAuthMaterial(authJson?.agent_identity);
}

export function hasCompleteCodexAuth(authJson: CodexAuthJson | null): authJson is CodexAuthJson {
  return hasRunnableAuthTokens(authJson);
}

export function sanitizeAuthJson(authJson: CodexAuthJson): CodexAuthJson {
  const sanitized: CodexAuthJson = {
    ...authJson,
    tokens: { ...authJson.tokens },
  };

  if (
    typeof sanitized.agent_identity === 'string' &&
    !hasAgentIdentityAuthMaterial(sanitized.agent_identity)
  ) {
    delete sanitized.agent_identity;
  }

  return sanitized;
}

export function authJsonToTokenBundle(authJson: CodexAuthJson): CodexTokenBundle {
  const tokens = authJson.tokens;
  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    accountId:
      tokens.account_id ||
      extractAccountId(tokens.access_token) ||
      (tokens.id_token ? extractAccountId(tokens.id_token) : ''),
    expiresAt: new Date(
      (decodeJwtExpiry(tokens.access_token) ?? Math.floor(Date.now() / 1000) + 3600) * 1000,
    ).toISOString(),
  };
}

function mergeAuthJson(existing: CodexAuthJson | null, bundle: CodexTokenBundle): CodexAuthJson {
  const next = buildAuthJson(bundle);
  if (!existing) {
    return sanitizeAuthJson(next);
  }

  return sanitizeAuthJson({
    ...existing,
    ...next,
    auth_mode: 'chatgpt',
    tokens: {
      ...existing.tokens,
      ...next.tokens,
    },
    agent_identity: existing.agent_identity,
  });
}

export function buildAuthJson(bundle: CodexTokenBundle): CodexAuthJson {
  const tokens: CodexAuthJson['tokens'] = {
    access_token: bundle.accessToken,
    refresh_token: bundle.refreshToken,
    account_id: bundle.accountId,
  };

  if (bundle.idToken) {
    tokens.id_token = bundle.idToken;
  }

  return {
    auth_mode: 'chatgpt',
    OPENAI_API_KEY: null,
    tokens,
    last_refresh: new Date().toISOString(),
  };
}

export function assertRunnableTokenBundle(bundle: CodexTokenBundle): void {
  if (!isValidJwt(bundle.accessToken)) {
    throw new CodexAuthSetupError('Access Token is missing or not a valid JWT.');
  }

  if (!bundle.refreshToken.trim()) {
    throw new CodexAuthSetupError('Refresh Token is required.');
  }

  if (!isValidJwt(bundle.idToken)) {
    throw new CodexAuthSetupError(
      'ID Token is missing or invalid. Use the ProDex Setup node to start device login, export credential values, and update your ProDex Auth API credential.',
    );
  }
}

export function updateAuthJsonTokens(
  bundle: CodexTokenBundle,
  codexHome = resolveCodexHome(),
): string {
  assertRunnableTokenBundle(bundle);

  mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  const authPath = join(codexHome, 'auth.json');

  let raw: Record<string, unknown> = {};
  if (existsSync(authPath)) {
    try {
      raw = JSON.parse(readFileSync(authPath, 'utf8')) as Record<string, unknown>;
    } catch {
      raw = {};
    }
  }

  const existingTokens =
    typeof raw.tokens === 'object' && raw.tokens !== null
      ? (raw.tokens as Record<string, unknown>)
      : {};

  raw.auth_mode = 'chatgpt';
  raw.OPENAI_API_KEY = null;
  raw.tokens = {
    ...existingTokens,
    access_token: bundle.accessToken,
    refresh_token: bundle.refreshToken,
    account_id: bundle.accountId,
    ...(bundle.idToken ? { id_token: bundle.idToken } : {}),
  };
  raw.last_refresh = new Date().toISOString();

  writeFileSync(authPath, JSON.stringify(raw, null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });

  return codexHome;
}

export function createCodexHome(bundle: CodexTokenBundle): string {
  const codexHome = resolveCodexHome();
  const authPath = join(codexHome, 'auth.json');

  if (existsSync(authPath)) {
    return updateAuthJsonTokens(bundle, codexHome);
  }

  mkdirSync(codexHome, { recursive: true, mode: 0o700 });
  const existing = readAuthJson(codexHome);
  writeFileSync(authPath, JSON.stringify(mergeAuthJson(existing, bundle), null, 2), {
    encoding: 'utf8',
    mode: 0o600,
  });
  return codexHome;
}

export function buildCodexEnv(codexHome: string): Record<string, string> {
  const env: Record<string, string> = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== undefined) {
      env[key] = value;
    }
  }

  env.CODEX_HOME = codexHome;
  const pathKey =
    process.platform === 'win32'
      ? (Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'Path')
      : 'PATH';
  const n8nacBinDirectory = resolveN8nacBinDirectory();
  const commandBinDirectory = ensureCodexCommandLaunchers(codexHome).binDirectory;
  const pathEntries = (env[pathKey] ?? '')
    .split(delimiter)
    .filter(
      (entry) =>
        entry && entry !== n8nacBinDirectory && entry !== commandBinDirectory,
    );
  env[pathKey] = [commandBinDirectory, n8nacBinDirectory, ...pathEntries].join(delimiter);
  // CODEX_ACCESS_TOKEN is for enterprise Codex access / agent-identity tokens, not
  // OAuth access tokens from ChatGPT device login. Passing OAuth tokens here makes
  // codex exec fail with "agent identity JWT payload is not valid JSON".
  delete env.CODEX_ACCESS_TOKEN;
  return env;
}

export function mapSandboxMode(
  sandbox: 'read_only' | 'workspace_write' | 'full_access',
): 'read-only' | 'workspace-write' | 'danger-full-access' {
  switch (sandbox) {
    case 'read_only':
      return 'read-only';
    case 'workspace_write':
      return 'workspace-write';
    case 'full_access':
      return 'danger-full-access';
    default:
      return 'read-only';
  }
}

export function mapPersonalityConfig(
  personality: 'default' | 'friendly' | 'pragmatic',
): Record<string, string> | undefined {
  if (personality === 'default') {
    return undefined;
  }

  return {
    personality,
  };
}
