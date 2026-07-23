import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { prepareN8nManagement } from '../../lib/n8n/management';

describe('prepareN8nManagement', () => {
  it('creates a persistent n8nac workspace without persisting the API key', () => {
    const codexHome = mkdtempSync(join(tmpdir(), 'prodex-n8n-'));
    const prepared = prepareN8nManagement(codexHome, {
      baseUrl: 'https://n8n.example.com/api/v1/',
      apiKey: 'secret-api-key',
    });
    const config = readFileSync(join(prepared.workingDirectory, 'n8nac-config.json'), 'utf8');

    expect(prepared.baseUrl).toBe('https://n8n.example.com');
    expect(prepared.environment.N8N_HOST).toBe('https://n8n.example.com');
    expect(prepared.environment.N8N_API_KEY).toBe('secret-api-key');
    expect(prepared.environment.N8NAC_ENV_PRODEX_API_KEY).toBe('secret-api-key');
    expect(config).toContain('n8n.example.com');
    expect(config).not.toContain('secret-api-key');
  });

  it('uses the active environment names from an existing n8nac config', () => {
    const workspace = mkdtempSync(join(tmpdir(), 'prodex-existing-'));
    writeFileSync(
      join(workspace, 'n8nac-config.json'),
      JSON.stringify({
        version: 4,
        activeEnvironmentId: 'production',
        environmentTargets: [{ id: 'main-target', name: 'Main n8n' }],
        environments: [
          {
            id: 'production',
            name: 'Production EU',
            environmentTargetId: 'main-target',
          },
        ],
      }),
      'utf8',
    );

    const prepared = prepareN8nManagement(
      '/unused',
      { baseUrl: 'https://n8n.example.com', apiKey: 'key' },
      workspace,
    );

    expect(prepared.environment.N8NAC_ENV_PRODUCTION_API_KEY).toBe('key');
    expect(prepared.environment.N8NAC_ENV_PRODUCTION_EU_API_KEY).toBe('key');
    expect(prepared.environment.N8NAC_TARGET_MAIN_TARGET_API_KEY).toBe('key');
  });
});
