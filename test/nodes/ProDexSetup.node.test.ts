import { describe, expect, it } from 'vitest';

import { ProDexSetup } from '../../nodes/ProDexSetup/ProDexSetup.node';

describe('ProDexSetup node', () => {
  it('exposes runtime management and auth setup operations', () => {
    const node = new ProDexSetup();
    const operation = node.description.properties?.find(
      (property) => property.name === 'operation',
    );
    const values = (operation?.options ?? []).map((option) =>
      typeof option === 'string' ? option : option.value,
    );

    expect(node.description.name).toBe('prodexSetup');
    expect(operation?.type).toBe('options');
    expect(node.description.version).toBe(2);
    expect(values).toEqual([
      'installCodex',
      'runtimeStatus',
      'testN8nConnection',
      'exportCredential',
      'startDeviceLogin',
      'waitForLogin',
    ]);
    expect(
      node.description.properties?.find((property) => property.name === 'codexVersion')?.default,
    ).toBe('latest');
    expect(node.description.credentials?.[0]?.name).toBe('prodexN8nApi');
  });
});
