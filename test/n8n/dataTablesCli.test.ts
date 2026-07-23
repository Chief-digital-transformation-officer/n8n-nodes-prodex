import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const cliPath = join(process.cwd(), 'scripts', 'n8n-data-tables.mjs');

describe('n8n-data-tables CLI', () => {
  it('documents table, column, and row operations', async () => {
    const result = await execFileAsync(process.execPath, [cliPath, '--help']);

    expect(result.stdout).toContain('data-tables create');
    expect(result.stdout).toContain('data-tables columns update');
    expect(result.stdout).toContain('data-tables rows upsert');
  });

  it('requires explicit confirmation for destructive commands', async () => {
    await expect(
      execFileAsync(process.execPath, [cliPath, 'data-tables', 'delete', 'table-id'], {
        env: {
          ...process.env,
          N8N_HOST: 'http://127.0.0.1:5678',
          N8N_API_KEY: 'test-key',
        },
      }),
    ).rejects.toMatchObject({ stderr: expect.stringContaining('requires --force') });
  });

  it('uses the public Data Tables API and API-key header', async () => {
    let receivedPath = '';
    let receivedApiKey = '';
    const server = createServer((request, response) => {
      receivedPath = request.url ?? '';
      receivedApiKey = String(request.headers['x-n8n-api-key'] ?? '');
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify({ data: [{ id: 'table-1', name: 'Leads' }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));

    try {
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Test server did not bind.');
      const result = await execFileAsync(
        process.execPath,
        [cliPath, 'data-tables', 'list', '--limit', '1'],
        {
          env: {
            ...process.env,
            N8N_HOST: `http://127.0.0.1:${address.port}`,
            N8N_API_KEY: 'scoped-key',
          },
        },
      );

      expect(JSON.parse(result.stdout)).toEqual([{ id: 'table-1', name: 'Leads' }]);
      expect(receivedPath).toBe('/api/v1/data-tables?limit=1');
      expect(receivedApiKey).toBe('scoped-key');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((error) => (error ? reject(error) : resolve())),
      );
    }
  });
});
