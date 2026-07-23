import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { delimiter, dirname, join } from 'node:path';

import { CodexRuntimeInstallError } from '../errors';

const nodeRequire = createRequire(__filename);
const DEFAULT_INSTALL_TIMEOUT_MS = 300_000;
const CODEX_VERSION_PATTERN = /^(?:latest|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?)$/;

interface PlatformRuntime {
  packageName: string;
  targetTriple: string;
  executableName: string;
}

export interface CodexRuntime {
  executablePath: string;
  version: string;
  source: 'bundled' | 'managed';
  pathDirectories: string[];
}

export interface CodexRuntimeStatus {
  active: CodexRuntime;
  bundledVersion: string;
  managedVersion?: string;
  managedRuntimeHome: string;
  n8nacVersion: string;
  n8nacBinDirectory: string;
}

export interface InstallCodexCliResult extends CodexRuntimeStatus {
  requestedVersion: string;
  previousActiveVersion: string;
  command: string;
  stdout: string;
  stderr: string;
}

function getPlatformRuntime(platform = process.platform, arch = process.arch): PlatformRuntime {
  const executableName = platform === 'win32' ? 'codex.exe' : 'codex';
  const key = `${platform}-${arch}`;
  const supported: Record<string, Omit<PlatformRuntime, 'executableName'>> = {
    'darwin-arm64': {
      packageName: '@openai/codex-darwin-arm64',
      targetTriple: 'aarch64-apple-darwin',
    },
    'darwin-x64': {
      packageName: '@openai/codex-darwin-x64',
      targetTriple: 'x86_64-apple-darwin',
    },
    'linux-arm64': {
      packageName: '@openai/codex-linux-arm64',
      targetTriple: 'aarch64-unknown-linux-musl',
    },
    'linux-x64': {
      packageName: '@openai/codex-linux-x64',
      targetTriple: 'x86_64-unknown-linux-musl',
    },
    'win32-arm64': {
      packageName: '@openai/codex-win32-arm64',
      targetTriple: 'aarch64-pc-windows-msvc',
    },
    'win32-x64': {
      packageName: '@openai/codex-win32-x64',
      targetTriple: 'x86_64-pc-windows-msvc',
    },
  };
  const runtime = supported[key];
  if (!runtime) {
    throw new CodexRuntimeInstallError(`Unsupported Codex platform: ${platform} (${arch}).`, {
      command: '',
      stdout: '',
      stderr: '',
      exitCode: 1,
    });
  }
  return { ...runtime, executableName };
}

function readPackageVersion(packageJsonPath: string): string {
  const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as { version?: string };
  if (!parsed.version) {
    throw new Error(`Package version is missing in ${packageJsonPath}.`);
  }
  return parsed.version;
}

function findRuntimeInNodeModules(
  nodeModulesDirectory: string,
  version: string,
  source: CodexRuntime['source'],
): CodexRuntime | null {
  const platform = getPlatformRuntime();
  const platformPackageRoot = join(nodeModulesDirectory, ...platform.packageName.split('/'));
  const targetRoot = join(platformPackageRoot, 'vendor', platform.targetTriple);
  const candidates = [
    {
      executablePath: join(targetRoot, 'bin', platform.executableName),
      pathDirectory: join(targetRoot, 'codex-path'),
    },
    {
      executablePath: join(targetRoot, 'codex', platform.executableName),
      pathDirectory: join(targetRoot, 'path'),
    },
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate.executablePath)) {
      return {
        executablePath: candidate.executablePath,
        version,
        source,
        pathDirectories: existsSync(candidate.pathDirectory) ? [candidate.pathDirectory] : [],
      };
    }
  }
  return null;
}

export function resolveManagedRuntimeHome(codexHome: string): string {
  return join(codexHome, 'runtime');
}

export function resolveManagedCodexRuntime(codexHome: string): CodexRuntime | null {
  const runtimeHome = resolveManagedRuntimeHome(codexHome);
  const packageJsonPath = join(runtimeHome, 'node_modules', '@openai', 'codex', 'package.json');
  if (!existsSync(packageJsonPath)) {
    return null;
  }
  return findRuntimeInNodeModules(
    join(runtimeHome, 'node_modules'),
    readPackageVersion(packageJsonPath),
    'managed',
  );
}

export function resolveBundledCodexRuntime(): CodexRuntime {
  const packageJsonPath = nodeRequire.resolve('@openai/codex/package.json');
  const nodeModulesDirectory = dirname(dirname(dirname(packageJsonPath)));
  const version = readPackageVersion(packageJsonPath);
  const runtime = findRuntimeInNodeModules(nodeModulesDirectory, version, 'bundled');
  if (!runtime) {
    throw new CodexRuntimeInstallError(
      'Bundled Codex CLI binary is missing. Reinstall n8n-nodes-prodex with optional dependencies enabled.',
      { command: '', stdout: '', stderr: '', exitCode: 1 },
    );
  }
  return runtime;
}

export function resolveActiveCodexRuntime(codexHome: string): CodexRuntime {
  return resolveManagedCodexRuntime(codexHome) ?? resolveBundledCodexRuntime();
}

function resolveN8nacPackageJson(): string {
  return nodeRequire.resolve('n8nac/package.json');
}

export function resolveN8nacBinDirectory(): string {
  return join(dirname(resolveN8nacPackageJson()), '..', '.bin');
}

export function prependRuntimePath(
  env: Record<string, string>,
  pathDirectories: string[],
): Record<string, string> {
  const pathKey =
    process.platform === 'win32'
      ? (Object.keys(env).find((key) => key.toLowerCase() === 'path') ?? 'Path')
      : 'PATH';
  const existing = (env[pathKey] ?? '')
    .split(delimiter)
    .filter((entry) => entry && !pathDirectories.includes(entry));
  env[pathKey] = [...pathDirectories, ...existing].join(delimiter);
  return env;
}

export function getCodexRuntimeStatus(codexHome: string): CodexRuntimeStatus {
  const managed = resolveManagedCodexRuntime(codexHome);
  let bundled: CodexRuntime | null = null;
  let bundledVersion = 'unavailable';
  try {
    const bundledPackageJson = nodeRequire.resolve('@openai/codex/package.json');
    bundledVersion = readPackageVersion(bundledPackageJson);
    bundled = resolveBundledCodexRuntime();
  } catch {
    // A managed runtime can repair or replace an installation whose optional
    // platform package was omitted by the package manager.
  }
  const active = managed ?? bundled;
  if (!active) {
    throw new CodexRuntimeInstallError(
      'No runnable Codex CLI binary was found. Run ProDex Setup → Install / Update Codex.',
      { command: '', stdout: '', stderr: '', exitCode: 1 },
    );
  }
  const n8nacPackageJson = resolveN8nacPackageJson();
  return {
    active,
    bundledVersion,
    managedVersion: managed?.version,
    managedRuntimeHome: resolveManagedRuntimeHome(codexHome),
    n8nacVersion: readPackageVersion(n8nacPackageJson),
    n8nacBinDirectory: resolveN8nacBinDirectory(),
  };
}

export function normalizeCodexVersion(version: string): string {
  const normalized = version.trim();
  if (!CODEX_VERSION_PATTERN.test(normalized)) {
    throw new CodexRuntimeInstallError(
      'Codex version must be "latest" or an exact semver such as 0.145.0 or 0.146.0-alpha.4.',
      { command: '', stdout: '', stderr: '', exitCode: 1 },
    );
  }
  return normalized;
}

export function buildCodexInstallCommand(
  codexHome: string,
  version: string,
): { command: string; args: string[]; runtimeHome: string } {
  const normalizedVersion = normalizeCodexVersion(version);
  const runtimeHome = resolveManagedRuntimeHome(codexHome);
  return {
    command: process.platform === 'win32' ? 'npm.cmd' : 'npm',
    args: [
      'install',
      '--prefix',
      runtimeHome,
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '--save-exact',
      `@openai/codex@${normalizedVersion}`,
    ],
    runtimeHome,
  };
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      env: process.env,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const commandLine = [command, ...args].join(' ');
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(
        new CodexRuntimeInstallError(`Codex install timed out after ${timeoutMs / 1000}s.`, {
          command: commandLine,
          stdout,
          stderr,
          exitCode: -1,
        }),
      );
    }, timeoutMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      reject(
        new CodexRuntimeInstallError(`Failed to run npm: ${error.message}`, {
          command: commandLine,
          stdout,
          stderr,
          exitCode: -1,
        }),
      );
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 1 });
    });
  });
}

export async function installCodexCli(
  codexHome: string,
  requestedVersion: string,
  timeoutMs = DEFAULT_INSTALL_TIMEOUT_MS,
): Promise<InstallCodexCliResult> {
  const version = normalizeCodexVersion(requestedVersion);
  let previousActiveVersion = 'unavailable';
  try {
    previousActiveVersion = resolveActiveCodexRuntime(codexHome).version;
  } catch {
    // Installing a managed runtime is also the recovery path when the bundled
    // optional platform binary was not installed.
  }
  const { command, args, runtimeHome } = buildCodexInstallCommand(codexHome, version);
  mkdirSync(runtimeHome, { recursive: true, mode: 0o700 });
  const runtimePackageJson = join(runtimeHome, 'package.json');
  if (!existsSync(runtimePackageJson)) {
    writeFileSync(
      runtimePackageJson,
      `${JSON.stringify({ name: 'prodex-managed-codex', private: true }, null, 2)}\n`,
      { encoding: 'utf8', mode: 0o600 },
    );
  }

  const commandLine = [command, ...args].join(' ');
  const result = await runCommand(command, args, runtimeHome, timeoutMs);
  if (result.exitCode !== 0) {
    throw new CodexRuntimeInstallError(
      `Codex install failed (exit ${result.exitCode}). ${result.stderr.trim() || result.stdout.trim() || 'No npm output.'}`,
      { command: commandLine, ...result },
    );
  }

  const status = getCodexRuntimeStatus(codexHome);
  if (status.active.source !== 'managed') {
    throw new CodexRuntimeInstallError(
      'npm completed, but the managed Codex binary was not found.',
      {
        command: commandLine,
        ...result,
      },
    );
  }

  return {
    ...status,
    requestedVersion: version,
    previousActiveVersion,
    command: commandLine,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
