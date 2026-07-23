import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import { PackageCommandError } from '../../lib/errors';
import { installPackages, runPackageCommand } from '../../lib/dependencies/packageCommands';

describe('packageCommands', () => {
  let codexHome = '';

  afterEach(() => {
    if (codexHome) {
      rmSync(codexHome, { recursive: true, force: true });
      codexHome = '';
    }
  });

  it('runs install and verification blocks in the persistent dependency environment', async () => {
    codexHome = mkdtempSync(join(tmpdir(), 'prodex-dependencies-'));

    const result = await installPackages({
      codexHome,
      installCommand: 'mkdir -p "$PYTHONUSERBASE" && printf installed > "$PYTHONUSERBASE/marker"',
      verificationCommand:
        'test -f "$PYTHONUSERBASE/marker" && printf "verified:%s" "$PRODEX_DEPENDENCIES_HOME"',
    });

    expect(result.install.exitCode).toBe(0);
    expect(result.verification?.stdout).toBe(`verified:${join(codexHome, 'dependencies')}`);
    expect(result.verified).toBe(true);
    expect(readFileSync(join(result.environment.pythonUserBase, 'marker'), 'utf8')).toBe(
      'installed',
    );
    expect(existsSync(result.environment.binDirectory)).toBe(true);
  });

  it('supports a check-only command block', async () => {
    codexHome = mkdtempSync(join(tmpdir(), 'prodex-dependency-check-'));

    const result = await runPackageCommand({
      codexHome,
      command: 'printf "%s" "$NPM_CONFIG_PREFIX"',
      phase: 'check',
    });

    expect(result.stdout).toBe(join(codexHome, 'dependencies', 'npm'));
    expect(result.workingDirectory).toBe(codexHome);
  });

  it('returns command output when verification fails', async () => {
    codexHome = mkdtempSync(join(tmpdir(), 'prodex-dependency-failure-'));

    await expect(
      installPackages({
        codexHome,
        installCommand: 'true',
        verificationCommand: 'printf missing >&2; exit 7',
      }),
    ).rejects.toMatchObject<Partial<PackageCommandError>>({
      name: 'PackageCommandError',
      phase: 'verify',
      exitCode: 7,
      stderr: 'missing',
    });
  });

  it('stops a multiline installation at the first failed command', async () => {
    codexHome = mkdtempSync(join(tmpdir(), 'prodex-dependency-install-failure-'));

    await expect(
      runPackageCommand({
        codexHome,
        command: 'printf before\nfalse\nprintf after',
        phase: 'install',
      }),
    ).rejects.toMatchObject<Partial<PackageCommandError>>({
      phase: 'install',
      stdout: 'before',
      exitCode: 1,
    });
  });

  it('terminates a command block when its timeout expires', async () => {
    codexHome = mkdtempSync(join(tmpdir(), 'prodex-dependency-timeout-'));

    await expect(
      runPackageCommand({
        codexHome,
        command: 'sleep 5',
        phase: 'install',
        timeoutMs: 25,
      }),
    ).rejects.toMatchObject<Partial<PackageCommandError>>({
      name: 'PackageCommandError',
      phase: 'install',
      exitCode: -1,
    });
  });
});
