import { describe, expect, it } from 'vitest';

import { ProDex } from '../../nodes/ProDex/ProDex.node';

describe('ProDex node', () => {
  it('exposes expected metadata', () => {
    const node = new ProDex();

    expect(node.description.name).toBe('prodex');
    expect(node.description.displayName).toBe('ProDex');
    expect(node.description.credentials?.[0]?.name).toBe('prodexAuthApi');
    expect(node.description.usableAsTool).toBe(true);
  });
});
