import { describe, expect, it } from 'vitest';

import { ProDexChatModel } from '../../nodes/ProDexChatModel/ProDexChatModel.node';

describe('ProDexChatModel node', () => {
  it('exposes an AI language model output for AI Agent', () => {
    const node = new ProDexChatModel();

    expect(node.description.name).toBe('prodexChatModel');
    expect(node.description.version).toBe(2);
    expect(node.description.outputs).toEqual(['ai_languageModel']);
    expect(node.supplyData).toBeTypeOf('function');
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

  it('shares the current Codex reasoning enum and n8n skill default', () => {
    const node = new ProDexChatModel();
    const reasoning = node.description.properties?.find(
      (property) => property.name === 'reasoningEffort',
    );
    const skills = node.description.properties?.find((property) => property.name === 'skills');
    const model = node.description.properties?.find((property) => property.name === 'model');

    expect(
      (reasoning?.options ?? []).map((option) =>
        typeof option === 'string' ? option : option.value,
      ),
    ).toEqual(['none', 'minimal', 'low', 'medium', 'high', 'xhigh']);
    expect(skills?.default).toEqual(['n8n-architect']);
    expect(model?.default).toBe('gpt-5.6-sol');
    const options = node.description.properties?.find((property) => property.name === 'options');
    const timeout = options?.options?.find((option) => option.name === 'timeoutSeconds');
    expect(timeout?.default).toBe(900);
  });
});
