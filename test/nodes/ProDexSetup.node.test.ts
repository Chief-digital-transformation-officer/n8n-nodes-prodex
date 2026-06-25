import { describe, expect, it } from 'vitest';

import { ProDexSetup } from '../../nodes/ProDexSetup/ProDexSetup.node';

describe('ProDexSetup node', () => {
  it('exposes setup operations', () => {
    const node = new ProDexSetup();
    const operation = node.description.properties?.find((property) => property.name === 'operation');

    expect(node.description.name).toBe('prodexSetup');
    expect(operation?.type).toBe('options');
  });
});
