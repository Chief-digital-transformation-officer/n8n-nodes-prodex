import { describe, expect, it } from 'vitest';

import {
  buildCodexProcessConfig,
  parseEnvironmentVariableNames,
} from '../../lib/codex/shellEnvironment';

describe('shellEnvironment', () => {
  it('parses comma, whitespace, and newline separated variable names', () => {
    expect(parseEnvironmentVariableNames('AMOCRM_SUBDOMAIN, AMOCRM_TOKEN\nCUSTOM_API_KEY')).toEqual(
      ['AMOCRM_SUBDOMAIN', 'AMOCRM_TOKEN', 'CUSTOM_API_KEY'],
    );
  });

  it('rejects values and shell expressions', () => {
    expect(() => parseEnvironmentVariableNames('AMOCRM_TOKEN=secret')).toThrow(
      'Invalid environment variable name',
    );
    expect(() => parseEnvironmentVariableNames('$AMOCRM_TOKEN')).toThrow(
      'Invalid environment variable name',
    );
  });

  it('disables login shells and pins the persistent dependency environment', () => {
    const config = buildCodexProcessConfig({
      env: {
        PATH: '/codex/dependencies/bin:/usr/bin',
        CODEX_HOME: '/codex',
        PRODEX_DEPENDENCIES_HOME: '/codex/dependencies',
        PYTHONUSERBASE: '/codex/dependencies/python',
      },
    });
    const policy = config.shell_environment_policy as Record<string, unknown>;

    expect(config.allow_login_shell).toBe(false);
    expect(policy.inherit).toBe('all');
    expect(policy.set).toEqual({
      PATH: '/codex/dependencies/bin:/usr/bin',
      CODEX_HOME: '/codex',
      PRODEX_DEPENDENCIES_HOME: '/codex/dependencies',
      PYTHONUSERBASE: '/codex/dependencies/python',
    });
    expect(policy.ignore_default_excludes).toBeUndefined();
  });

  it('passes only explicitly allowed secrets without serializing their values into config', () => {
    const config = buildCodexProcessConfig({
      env: {
        PATH: '/codex/dependencies/bin:/usr/bin',
        AMOCRM_TOKEN: 'super-secret-token',
        N8N_API_KEY: 'super-secret-n8n-key',
      },
      allowedEnvironmentVariables: ['AMOCRM_SUBDOMAIN', 'AMOCRM_TOKEN'],
      suppliedEnvironmentVariables: ['N8N_API_KEY'],
    });
    const policy = config.shell_environment_policy as Record<string, unknown>;
    const includeOnly = policy.include_only as string[];

    expect(policy.ignore_default_excludes).toBe(true);
    expect(includeOnly).toContain('AMOCRM_SUBDOMAIN');
    expect(includeOnly).toContain('AMOCRM_TOKEN');
    expect(includeOnly).toContain('N8N_API_KEY');
    expect(JSON.stringify(config)).not.toContain('super-secret-token');
    expect(JSON.stringify(config)).not.toContain('super-secret-n8n-key');
  });
});
