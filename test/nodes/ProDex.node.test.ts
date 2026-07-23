import { describe, expect, it } from 'vitest';

import { ProDex } from '../../nodes/ProDex/ProDex.node';

describe('ProDex node', () => {
  it('exposes expected metadata', () => {
    const node = new ProDex();

    expect(node.description.name).toBe('prodex');
    expect(node.description.displayName).toBe('ProDex');
    expect(node.description.version).toBe(2);
    expect(node.description.credentials?.[0]?.name).toBe('prodexAuthApi');
    expect(node.description.usableAsTool).toBe(true);
  });

  it('exposes simplified operation dropdown', () => {
    const node = new ProDex();
    const operation = node.description.properties?.find(
      (property) => property.name === 'operation',
    );
    const values = (operation?.options ?? []).map((option) =>
      typeof option === 'string' ? option : option.value,
    );

    expect(values).toEqual([
      'runAgent',
      'installSkill',
      'listSkills',
      'invokeSkill',
      'mcpTools',
      'plugins',
    ]);
    expect(node.methods?.loadOptions?.getInstalledSkills).toBeTypeOf('function');
    expect(
      node.description.properties?.some((property) => property.name === 'useN8nCredentials'),
    ).toBe(true);
    expect(node.description.credentials?.[0]?.displayOptions?.show?.useN8nCredentials).toEqual([
      true,
    ]);
    expect(node.description.credentials?.[1]?.name).toBe('prodexN8nApi');
    expect(node.description.credentials?.[1]?.required).toBe(false);
  });

  it('uses current Codex models, reasoning enum, and preinstalled n8n skill', () => {
    const node = new ProDex();
    const model = node.description.properties?.find((property) => property.name === 'model');
    const reasoning = node.description.properties?.find(
      (property) => property.name === 'reasoningEffort',
    );
    const skills = node.description.properties?.find((property) => property.name === 'skills');

    expect(model?.default).toBe('gpt-5.6-sol');
    expect(
      (model?.options ?? []).map((option) => (typeof option === 'string' ? option : option.value)),
    ).toEqual([
      'gpt-5.6-sol',
      'gpt-5.6-terra',
      'gpt-5.6-luna',
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-mini',
    ]);
    expect(
      (reasoning?.options ?? []).map((option) =>
        typeof option === 'string' ? option : option.value,
      ),
    ).toEqual(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);
    expect(skills?.default).toEqual(['n8n-architect']);
    const options = node.description.properties?.find((property) => property.name === 'options');
    const timeout = options?.options?.find((option) => option.name === 'timeoutSeconds');
    expect(timeout?.default).toBe(900);
  });
});
