import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

import { buildCodexEnv } from '../auth/codexEnv';
import { PackageCommandError } from '../errors';
import { type DependencyEnvironment, resolveDependencyEnvironment } from './dependencyEnvironment';

const DEFAULT_TIMEOUT_MS = 600_000;

export type PackageCommandPhase = 'install' | 'verify' | 'check';

export interface RunPackageCommandParams {
  codexHome: string;
  command: string;
  phase: PackageCommandPhase;
  workingDirectory?: string;
  timeoutMs?: number;
}

export interface PackageCommandResult {
  command: string;
  shell: string;
  workingDirectory: string;
  stdout: string;
  stderr: string;
  exitCode: number;
  durationMs: number;
}

export interface InstallPackagesParams {
  codexHome: string;
  installCommand: string;
  verificationCommand?: string;
  workingDirectory?: string;
  timeoutMs?: number;
}

export interface InstallPackagesResult {
  environment: DependencyEnvironment;
  install: PackageCommandResult;
  verification: PackageCommandResult | null;
  verified: boolean | null;
}

function resolveWorkingDirectory(
  codexHome: string,
  phase: PackageCommandPhase,
  requested?: string,
): string {
  const workingDirectory = requested?.trim() ? resolve(requested.trim()) : codexHome;
  if (!existsSync(workingDirectory) || !statSync(workingDirectory).isDirectory()) {
    throw new PackageCommandError(`Working directory does not exist: ${workingDirectory}`, {
      command: '',
      stdout: '',
      stderr: '',
      exitCode: 1,
      phase,
    });
  }
  return workingDirectory;
}

function resolveShell(): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c'] };
  }
  return { command: '/bin/sh', args: ['-c'] };
}

export async function runPackageCommand(
  params: RunPackageCommandParams,
): Promise<PackageCommandResult> {
  const commandText = params.command.trim();
  if (!commandText) {
    throw new PackageCommandError('Package command cannot be empty.', {
      command: '',
      stdout: '',
      stderr: '',
      exitCode: 1,
      phase: params.phase,
    });
  }

  mkdirSync(params.codexHome, { recursive: true, mode: 0o700 });
  const workingDirectory = resolveWorkingDirectory(
    params.codexHome,
    params.phase,
    params.workingDirectory,
  );
  const env = buildCodexEnv(params.codexHome);
  if (params.phase === 'install') {
    // Plain `pip install` should be persistent and writable without modifying the
    // container's system Python. Explicit flags in the command can override this.
    env.PIP_USER = '1';
    env.PIP_BREAK_SYSTEM_PACKAGES = '1';
  }
  const shell = resolveShell();
  const shellCommand = process.platform === 'win32' ? commandText : `set -e\n${commandText}`;
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new PackageCommandError('Package command timeout must be greater than zero.', {
      command: commandText,
      stdout: '',
      stderr: '',
      exitCode: 1,
      phase: params.phase,
    });
  }
  const startedAt = Date.now();

  return new Promise((resolvePromise, reject) => {
    const child = spawn(shell.command, [...shell.args, shellCommand], {
      cwd: workingDirectory,
      env,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let forceKillTimer: NodeJS.Timeout | undefined;

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
    });

    const timer = setTimeout(() => {
      timedOut = true;
      if (process.platform !== 'win32' && child.pid) {
        try {
          process.kill(-child.pid, 'SIGTERM');
        } catch {
          child.kill('SIGTERM');
        }
      } else {
        child.kill('SIGTERM');
      }
      forceKillTimer = setTimeout(() => {
        if (settled) return;
        if (process.platform !== 'win32' && child.pid) {
          try {
            process.kill(-child.pid, 'SIGKILL');
          } catch {
            child.kill('SIGKILL');
          }
        } else {
          child.kill('SIGKILL');
        }
      }, 5_000);
    }, timeoutMs);

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      reject(
        new PackageCommandError(`Failed to start package command: ${error.message}`, {
          command: commandText,
          stdout,
          stderr,
          exitCode: -1,
          phase: params.phase,
        }),
      );
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (forceKillTimer) clearTimeout(forceKillTimer);
      const exitCode = code ?? 1;
      if (timedOut) {
        reject(
          new PackageCommandError(`Package command timed out after ${timeoutMs / 1000}s.`, {
            command: commandText,
            stdout,
            stderr,
            exitCode: -1,
            phase: params.phase,
          }),
        );
        return;
      }
      if (exitCode !== 0) {
        reject(
          new PackageCommandError(
            `${params.phase === 'verify' ? 'Package verification' : params.phase === 'check' ? 'Package check' : 'Package installation'} failed (exit ${exitCode}). ${stderr.trim() || stdout.trim() || 'No command output.'}`,
            {
              command: commandText,
              stdout,
              stderr,
              exitCode,
              phase: params.phase,
            },
          ),
        );
        return;
      }

      resolvePromise({
        command: commandText,
        shell: shell.command,
        workingDirectory,
        stdout,
        stderr,
        exitCode,
        durationMs: Date.now() - startedAt,
      });
    });
  });
}

export async function installPackages(
  params: InstallPackagesParams,
): Promise<InstallPackagesResult> {
  const install = await runPackageCommand({
    codexHome: params.codexHome,
    command: params.installCommand,
    phase: 'install',
    workingDirectory: params.workingDirectory,
    timeoutMs: params.timeoutMs,
  });
  const verificationCommand = params.verificationCommand?.trim();
  const verification = verificationCommand
    ? await runPackageCommand({
        codexHome: params.codexHome,
        command: verificationCommand,
        phase: 'verify',
        workingDirectory: params.workingDirectory,
        timeoutMs: params.timeoutMs,
      })
    : null;

  return {
    environment: resolveDependencyEnvironment(params.codexHome),
    install,
    verification,
    verified: verification ? true : null,
  };
}
