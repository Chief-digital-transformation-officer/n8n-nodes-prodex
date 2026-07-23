import { describe, expect, it } from 'vitest';

import {
  buildCodexInstallCommand,
  getCodexRuntimeStatus,
  normalizeCodexVersion,
  resolveBundledCodexRuntime,
} from '../../lib/codex/manageCodexCli';

describe('manageCodexCli', () => {
  it('accepts latest and exact Codex versions only', () => {
    expect(normalizeCodexVersion(' latest ')).toBe('latest');
    expect(normalizeCodexVersion('0.145.0')).toBe('0.145.0');
    expect(normalizeCodexVersion('0.146.0-alpha.4')).toBe('0.146.0-alpha.4');
    expect(() => normalizeCodexVersion('latest; rm -rf /')).toThrow(/exact semver/i);
    expect(() => normalizeCodexVersion('^0.145.0')).toThrow(/exact semver/i);
  });

  it('builds an isolated npm install command', () => {
    const built = buildCodexInstallCommand('/tmp/prodex-codex', '0.145.0');

    expect(built.args).toEqual([
      'install',
      '--prefix',
      '/tmp/prodex-codex/runtime',
      '--omit=dev',
      '--no-audit',
      '--no-fund',
      '--save-exact',
      '@openai/codex@0.145.0',
    ]);
  });

  it('resolves the bundled native Codex binary and n8nac package', () => {
    const runtime = resolveBundledCodexRuntime();
    const status = getCodexRuntimeStatus('/tmp/prodex-no-managed-runtime');

    expect(runtime.source).toBe('bundled');
    expect(runtime.version).toMatch(/^\d+\.\d+\.\d+/);
    expect(runtime.executablePath).toContain('codex');
    expect(status.active.source).toBe('bundled');
    expect(status.n8nacVersion).toMatch(/^\d+\.\d+\.\d+/);
    expect(status.n8nacBinDirectory).toContain('node_modules/.bin');
  });
});
