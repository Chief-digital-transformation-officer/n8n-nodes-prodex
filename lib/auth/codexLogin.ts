import { spawn } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
  closeSync,
} from 'node:fs';
import { join } from 'node:path';

import { CodexAuthSetupError } from '../errors';
import { prependRuntimePath, resolveActiveCodexRuntime } from '../codex/manageCodexCli';
import type { CodexAuthJson, CodexCredentialValues } from '../types/codex';
import {
  buildCodexEnv,
  hasAgentIdentity,
  hasCompleteCodexAuth,
  hasRunnableAuthTokens,
  readAuthJson,
  resolveCodexHome,
} from './codexEnv';
import { decodeJwtExpiry, extractAccountId, isValidJwt } from './tokenStore';

const CODEX_DEVICE_URL = 'https://auth.openai.com/codex/device';
const DEVICE_LOGIN_TIMEOUT_MS = 60_000;
const DEFAULT_AGENT_IDENTITY_WAIT_MS = 180_000;
const AGENT_IDENTITY_POLL_MS = 2_000;
const LOGIN_PID_FILE = 'login.pid';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isLoginProcessRunning(codexHome: string): boolean {
  const pidPath = join(codexHome, LOGIN_PID_FILE);
  if (!existsSync(pidPath)) {
    return false;
  }

  try {
    const pid = Number.parseInt(readFileSync(pidPath, 'utf8').trim(), 10);
    if (!Number.isFinite(pid) || pid <= 0) {
      return false;
    }

    process.kill(pid, 0);
    return true;
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    if (err.code === 'ESRCH') {
      clearLoginPid(codexHome);
    }
    return false;
  }
}

function writeLoginPid(codexHome: string, pid: number): void {
  writeFileSync(join(codexHome, LOGIN_PID_FILE), String(pid), 'utf8');
}

function clearLoginPid(codexHome: string): void {
  const pidPath = join(codexHome, LOGIN_PID_FILE);
  if (existsSync(pidPath)) {
    unlinkSync(pidPath);
  }
}

function loginLogPath(codexHome: string): string {
  return join(codexHome, 'login.log');
}

function readLoginLog(codexHome: string): string {
  const logPath = loginLogPath(codexHome);
  if (!existsSync(logPath)) {
    return '';
  }

  return stripAnsi(readFileSync(logPath, 'utf8'));
}

function loginLogIndicatesSuccess(codexHome: string): boolean {
  const log = readLoginLog(codexHome);
  return /Successfully logged in/i.test(log) && /Codex login process exited with code 0/i.test(log);
}

export function stripAnsi(text: string): string {
  return text.replace(/\u001b\[[0-9;]*m/g, '');
}

export function parseDeviceLoginOutput(
  output: string,
): { userCode: string; verificationUrl: string } | null {
  const text = stripAnsi(output);
  const codeMatch = text.match(/\b([A-Z0-9]{3,8}-[A-Z0-9]{3,8})\b/);
  if (!codeMatch) {
    return null;
  }

  return {
    userCode: codeMatch[1],
    verificationUrl: CODEX_DEVICE_URL,
  };
}

export interface DeviceLoginInstructions {
  verificationUrl: string;
  userCode: string;
  codexHome: string;
  instructions: string;
}

export async function startDeviceLogin(): Promise<DeviceLoginInstructions> {
  const codexHome = resolveCodexHome();
  const runtime = resolveActiveCodexRuntime(codexHome);
  mkdirSync(codexHome, { recursive: true });

  const logPath = loginLogPath(codexHome);
  writeFileSync(logPath, `Starting Codex device login at ${new Date().toISOString()}\n`, 'utf8');
  const logFd = openSync(logPath, 'a');

  const child = spawn(runtime.executablePath, ['login', '--device-auth'], {
    env: prependRuntimePath(buildCodexEnv(codexHome), runtime.pathDirectories),
    stdio: ['ignore', logFd, logFd],
    shell: false,
    detached: true,
  });
  closeSync(logFd);
  child.unref();

  if (child.pid) {
    writeLoginPid(codexHome, child.pid);
  }

  child.on('close', (code) => {
    writeFileSync(logPath, `Codex login process exited with code ${code ?? 'unknown'}\n`, {
      flag: 'a',
    });
    clearLoginPid(codexHome);
  });

  child.on('error', (error) => {
    writeFileSync(logPath, `Codex login process error: ${error.message}\n`, { flag: 'a' });
  });

  const deadline = Date.now() + DEVICE_LOGIN_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const log = existsSync(logPath) ? readFileSync(logPath, 'utf8') : '';
    const parsed = parseDeviceLoginOutput(log);
    if (parsed) {
      return {
        verificationUrl: parsed.verificationUrl,
        userCode: parsed.userCode,
        codexHome,
        instructions: `Open ${parsed.verificationUrl}, enter code ${parsed.userCode}, sign in with ChatGPT, then run "Wait for Login Complete". Login log: ${logPath}`,
      };
    }

    await sleep(500);
  }

  const partialLog = existsSync(logPath)
    ? stripAnsi(readFileSync(logPath, 'utf8')).slice(-400)
    : '';
  throw new CodexAuthSetupError(
    `Timed out waiting for Codex device login output after ${DEVICE_LOGIN_TIMEOUT_MS / 1000}s. ` +
      `Ensure @openai/codex is installed or run ProDex Setup → Install / Update Codex. Log: ${logPath}. Partial output: ${partialLog}`,
  );
}

export async function waitForAgentIdentity(
  maxWaitMs = DEFAULT_AGENT_IDENTITY_WAIT_MS,
): Promise<CodexAuthJson> {
  const codexHome = resolveCodexHome();
  const deadline = Date.now() + maxWaitMs;
  const logPath = loginLogPath(codexHome);

  while (Date.now() < deadline) {
    const authJson = readAuthJson(codexHome);
    if (hasCompleteCodexAuth(authJson)) {
      clearLoginPid(codexHome);
      return authJson!;
    }

    if (
      hasRunnableAuthTokens(authJson) &&
      loginLogIndicatesSuccess(codexHome) &&
      !isLoginProcessRunning(codexHome)
    ) {
      clearLoginPid(codexHome);
      return authJson!;
    }

    if (hasRunnableAuthTokens(authJson) && isLoginProcessRunning(codexHome)) {
      await sleep(AGENT_IDENTITY_POLL_MS);
      continue;
    }

    await sleep(AGENT_IDENTITY_POLL_MS);
  }

  const authJson = readAuthJson(codexHome);
  if (hasCompleteCodexAuth(authJson)) {
    return authJson!;
  }

  if (
    hasRunnableAuthTokens(authJson) &&
    loginLogIndicatesSuccess(codexHome) &&
    !isLoginProcessRunning(codexHome)
  ) {
    return authJson!;
  }

  const partialLog = readLoginLog(codexHome).slice(-500);
  const loginStillRunning = isLoginProcessRunning(codexHome);
  const tokenStatus = hasRunnableAuthTokens(authJson)
    ? 'OAuth tokens are saved, but login has not finished writing auth.json yet.'
    : 'OAuth tokens are not saved yet.';
  throw new CodexAuthSetupError(
    `Login is not complete yet. Finish browser auth after "Start Device Login", wait for the login process to exit successfully, then run "Wait for Login Complete" again. ` +
      `${tokenStatus} Codex home: ${codexHome}. Login process running: ${loginStillRunning ? 'yes' : 'no'}. Login log: ${logPath}. ${partialLog ? `Recent log: ${partialLog}` : ''}`,
  );
}

export async function exportCredentialValuesWithWait(
  maxWaitMs = 0,
): Promise<CodexCredentialValues & { hasAgentIdentity: boolean; hasCompleteAuth: boolean }> {
  if (maxWaitMs > 0) {
    await waitForAgentIdentity(maxWaitMs);
  }

  const credential = exportCredentialValues();
  const authJson = readAuthJson(resolveCodexHome());
  return {
    ...credential,
    hasAgentIdentity: hasAgentIdentity(authJson),
    hasCompleteAuth: hasCompleteCodexAuth(authJson),
  };
}

function authJsonToCredential(authJson: CodexAuthJson): CodexCredentialValues {
  const tokens = authJson.tokens;
  if (!tokens?.access_token || !tokens.refresh_token) {
    throw new CodexAuthSetupError(
      'Codex auth file does not contain ChatGPT tokens yet. Complete device login first.',
    );
  }

  if (!isValidJwt(tokens.id_token)) {
    throw new CodexAuthSetupError(
      'Codex auth file is missing a valid ID Token. Complete device login again using the ProDex Setup node.',
    );
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    idToken: tokens.id_token,
    accountId:
      tokens.account_id ||
      extractAccountId(tokens.access_token) ||
      extractAccountId(tokens.id_token),
    expiresAt: new Date(
      (decodeJwtExpiry(tokens.access_token) ?? Math.floor(Date.now() / 1000) + 3600) * 1000,
    ).toISOString(),
  };
}

export function exportCredentialValues(): CodexCredentialValues {
  const authPath = join(resolveCodexHome(), 'auth.json');
  if (!existsSync(authPath)) {
    throw new CodexAuthSetupError(
      'No Codex auth file found yet. Complete browser login after "Start Device Login", wait ~30 seconds, then run "Export Credential Values".',
    );
  }

  const authJson = JSON.parse(readFileSync(authPath, 'utf8')) as CodexAuthJson;
  return authJsonToCredential(authJson);
}
