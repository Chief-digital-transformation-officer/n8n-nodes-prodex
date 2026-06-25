import { describe, expect, it } from 'vitest';

import { ProDexChatModel } from '../../nodes/ProDexChatModel/ProDexChatModel.node';

describe('ProDexChatModel node', () => {
  it('exposes an AI language model output for AI Agent', () => {
    const node = new ProDexChatModel();

    expect(node.description.name).toBe('prodexChatModel');
    expect(node.description.outputs).toEqual(['ai_languageModel']);
    expect(node.supplyData).toBeTypeOf('function');
  });
});
