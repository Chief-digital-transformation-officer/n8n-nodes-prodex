#!/usr/bin/env node

const HELP = `n8n-data-tables — manage native n8n Data Tables through the public API

Connection is read from N8N_HOST and N8N_API_KEY (injected by ProDex).

Commands:
  data-tables list [--limit N] [--filter JSON] [--sort-by FIELD:DIRECTION]
  data-tables get TABLE_ID
  data-tables create --name NAME --columns JSON
  data-tables update TABLE_ID --name NAME
  data-tables delete TABLE_ID --force
  data-tables columns list TABLE_ID
  data-tables columns create TABLE_ID --name NAME --type string|number|boolean|date|json
  data-tables columns update TABLE_ID COLUMN_ID [--name NAME] [--index N]
  data-tables columns delete TABLE_ID COLUMN_ID --force
  data-tables rows list TABLE_ID [--limit N] [--filter JSON] [--sort-by FIELD:DIRECTION] [--search TEXT]
  data-tables rows insert TABLE_ID --data JSON [--return-type count|id|all]
  data-tables rows update TABLE_ID --filter JSON --data JSON [--return-data] [--dry-run]
  data-tables rows upsert TABLE_ID --filter JSON --data JSON [--return-data] [--dry-run]
  data-tables rows delete TABLE_ID --filter JSON [--return-data] [--dry-run] --force
  data-tables rows clear TABLE_ID --force

Examples:
  n8n-data-tables data-tables list
  n8n-data-tables data-tables create --name Leads --columns '[{"name":"email","type":"string"}]'
  n8n-data-tables data-tables rows insert TABLE_ID --data '[{"email":"a@example.com"}]' --return-type all
`;

function fail(message, exitCode = 1) {
  process.stderr.write(`n8n-data-tables: ${message}\n`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const positional = [];
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith('--')) {
      positional.push(value);
      continue;
    }
    const name = value.slice(2);
    if (['force', 'return-data', 'dry-run', 'help'].includes(name)) {
      options[name] = true;
      continue;
    }
    const next = argv[index + 1];
    if (next === undefined || next.startsWith('--')) fail(`missing value for --${name}`);
    options[name] = next;
    index += 1;
  }
  return { positional, options };
}

function required(value, label) {
  if (value === undefined || value === '') fail(`${label} is required`);
  return value;
}

function parseJson(value, label) {
  try {
    return JSON.parse(required(value, label));
  } catch (error) {
    fail(`${label} must be valid JSON: ${error.message}`);
  }
}

function connection() {
  const rawBaseUrl = process.env.PRODEX_N8N_BASE_URL || process.env.N8N_HOST || '';
  const apiKey = process.env.N8N_API_KEY || '';
  if (!rawBaseUrl.trim()) fail('N8N_HOST is not set; select a ProDex n8n API credential');
  if (!apiKey.trim()) fail('N8N_API_KEY is not set; select a ProDex n8n API credential');

  let baseUrl;
  try {
    baseUrl = new URL(rawBaseUrl.trim().replace(/\/+$/g, '').replace(/\/api\/v1$/i, ''));
  } catch {
    fail('N8N_HOST must be a valid absolute URL');
  }
  if (!['http:', 'https:'].includes(baseUrl.protocol)) fail('N8N_HOST must use HTTP or HTTPS');
  return { apiBase: `${baseUrl.toString().replace(/\/+$/g, '')}/api/v1`, apiKey };
}

async function request(method, path, body) {
  const { apiBase, apiKey } = connection();
  const response = await fetch(`${apiBase}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-N8N-API-KEY': apiKey,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  if (!response.ok) {
    const detail =
      payload && typeof payload === 'object'
        ? payload.message || payload.error || JSON.stringify(payload)
        : payload;
    fail(`n8n API ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
  }
  return payload;
}

function queryPath(base, options, names) {
  const query = new URLSearchParams();
  for (const [optionName, queryName] of names) {
    if (options[optionName] !== undefined) query.set(queryName, options[optionName]);
  }
  const suffix = query.toString();
  return suffix ? `${base}?${suffix}` : base;
}

async function listAll(base, options, names) {
  const collected = [];
  let cursor;
  do {
    const pageOptions = { ...options, limit: options.limit || '250', cursor };
    const payload = await request(
      'GET',
      queryPath(base, pageOptions, [...names, ['cursor', 'cursor']]),
    );
    if (Array.isArray(payload)) return payload;
    collected.push(...(payload?.data || []));
    cursor = payload?.nextCursor;
  } while (cursor);
  const limit = options.limit ? Number.parseInt(options.limit, 10) : undefined;
  return limit && limit > 0 ? collected.slice(0, limit) : collected;
}

function output(payload) {
  process.stdout.write(`${JSON.stringify(payload ?? { success: true }, null, 2)}\n`);
}

async function main() {
  const { positional, options } = parseArgs(process.argv.slice(2));
  if (options.help || positional.length === 0 || positional[0] === 'help') {
    process.stdout.write(HELP);
    return;
  }
  if (positional[0] !== 'data-tables') fail('expected data-tables command; use --help');

  if (positional[1] === 'list') {
    output(
      await listAll('/data-tables', options, [
        ['limit', 'limit'],
        ['filter', 'filter'],
        ['sort-by', 'sortBy'],
      ]),
    );
    return;
  }
  if (positional[1] === 'get') {
    output(await request('GET', `/data-tables/${encodeURIComponent(required(positional[2], 'TABLE_ID'))}`));
    return;
  }
  if (positional[1] === 'create') {
    output(
      await request('POST', '/data-tables', {
        name: required(options.name, '--name'),
        columns: parseJson(options.columns, '--columns'),
      }),
    );
    return;
  }
  if (positional[1] === 'update') {
    const id = encodeURIComponent(required(positional[2], 'TABLE_ID'));
    output(await request('PATCH', `/data-tables/${id}`, { name: required(options.name, '--name') }));
    return;
  }
  if (positional[1] === 'delete') {
    if (!options.force) fail('table deletion requires --force');
    const id = encodeURIComponent(required(positional[2], 'TABLE_ID'));
    output(await request('DELETE', `/data-tables/${id}`));
    return;
  }

  if (positional[1] === 'columns') {
    const action = required(positional[2], 'column action');
    const tableId = encodeURIComponent(required(positional[3], 'TABLE_ID'));
    const columnsPath = `/data-tables/${tableId}/columns`;
    if (action === 'list') {
      output(await request('GET', columnsPath));
      return;
    }
    if (action === 'create') {
      output(
        await request('POST', columnsPath, {
          name: required(options.name, '--name'),
          type: required(options.type, '--type'),
        }),
      );
      return;
    }
    const columnId = encodeURIComponent(required(positional[4], 'COLUMN_ID'));
    if (action === 'update') {
      if (options.name === undefined && options.index === undefined) {
        fail('columns update requires --name and/or --index');
      }
      const body = {};
      if (options.name !== undefined) body.name = options.name;
      if (options.index !== undefined) body.index = Number.parseInt(options.index, 10);
      output(await request('PATCH', `${columnsPath}/${columnId}`, body));
      return;
    }
    if (action === 'delete') {
      if (!options.force) fail('column deletion requires --force');
      output(await request('DELETE', `${columnsPath}/${columnId}`));
      return;
    }
    fail('unknown column action; use --help');
  }

  if (positional[1] !== 'rows') fail('unknown data-tables command; use --help');
  const action = required(positional[2], 'row action');
  const tableId = encodeURIComponent(required(positional[3], 'TABLE_ID'));
  const rowsPath = `/data-tables/${tableId}/rows`;

  if (action === 'list') {
    output(
      await listAll(rowsPath, options, [
        ['limit', 'limit'],
        ['filter', 'filter'],
        ['sort-by', 'sortBy'],
        ['search', 'search'],
      ]),
    );
    return;
  }
  if (action === 'insert') {
    const data = parseJson(options.data, '--data');
    if (!Array.isArray(data)) fail('--data must be a JSON array for rows insert');
    output(
      await request('POST', rowsPath, {
        data,
        returnType: options['return-type'] || 'count',
      }),
    );
    return;
  }
  if (action === 'update' || action === 'upsert') {
    const body = {
      filter: parseJson(options.filter, '--filter'),
      data: parseJson(options.data, '--data'),
      returnData: Boolean(options['return-data']),
      dryRun: Boolean(options['dry-run']),
    };
    output(
      await request(action === 'update' ? 'PATCH' : 'POST', `${rowsPath}/${action}`, body),
    );
    return;
  }
  if (action === 'delete') {
    if (!options.force && !options['dry-run']) fail('row deletion requires --force');
    const query = new URLSearchParams({ filter: JSON.stringify(parseJson(options.filter, '--filter')) });
    if (options['return-data']) query.set('returnData', 'true');
    if (options['dry-run']) query.set('dryRun', 'true');
    output(await request('DELETE', `${rowsPath}/delete?${query.toString()}`));
    return;
  }
  if (action === 'clear') {
    if (!options.force) fail('clearing all rows requires --force');
    output(await request('DELETE', `${rowsPath}/clear`));
    return;
  }

  fail('unknown row action; use --help');
}

main().catch((error) => fail(error instanceof Error ? error.message : String(error)));
