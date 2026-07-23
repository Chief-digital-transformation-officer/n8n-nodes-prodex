import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { ensureCodexCommandLaunchers } from '../codex/manageCodexCli';

export interface N8nApiCredentialValues {
  baseUrl: string;
  apiKey: string;
}

export interface PreparedN8nManagement {
  baseUrl: string;
  workingDirectory: string;
  environment: Record<string, string>;
  workflowCli: string;
  dataTablesCli: string;
  prompt: string;
}

interface N8nacConfig {
  version?: number;
  activeEnvironmentId?: string;
  environmentTargets?: Array<{
    id?: string;
    name?: string;
    kind?: string;
    url?: string;
  }>;
  environments?: Array<{
    id?: string;
    name?: string;
    environmentTargetId?: string;
    projectId?: string;
    projectName?: string;
    workflowsPath?: string;
    folderSync?: boolean;
  }>;
}

function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/g, '').replace(/\/api\/v1$/i, '');
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    // This framework-agnostic helper is wrapped in NodeOperationError at the node boundary.
    // eslint-disable-next-line @n8n/community-nodes/require-node-api-error
    throw new Error('ProDex n8n API Base URL must be a valid absolute HTTP(S) URL.');
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('ProDex n8n API Base URL must use HTTP or HTTPS.');
  }

  return trimmed;
}

function envSlug(value: string): string {
  return value.replace(/[^a-zA-Z0-9]/g, '_').toUpperCase();
}

function defaultConfig(baseUrl: string): N8nacConfig {
  return {
    version: 4,
    activeEnvironmentId: 'prodex-env',
    environmentTargets: [
      {
        id: 'prodex-target',
        name: 'ProDex',
        kind: 'external-instance',
        url: baseUrl,
      },
    ],
    environments: [
      {
        id: 'prodex-env',
        name: 'ProDex',
        environmentTargetId: 'prodex-target',
        projectId: 'personal',
        projectName: 'Personal',
        workflowsPath: 'workflows',
        folderSync: false,
      },
    ],
  };
}

function readConfig(configPath: string): N8nacConfig | null {
  if (!existsSync(configPath)) return null;
  try {
    return JSON.parse(readFileSync(configPath, 'utf8')) as N8nacConfig;
  } catch {
    // This framework-agnostic helper is wrapped in NodeOperationError at the node boundary.
    // eslint-disable-next-line @n8n/community-nodes/require-node-api-error
    throw new Error(`Invalid n8nac configuration: ${configPath}`);
  }
}

function addCredentialEnvironmentVariables(
  environment: Record<string, string>,
  config: N8nacConfig,
  apiKey: string,
): void {
  const activeEnvironment = config.environments?.find(
    (candidate) => candidate.id === config.activeEnvironmentId,
  );
  const target = config.environmentTargets?.find(
    (candidate) => candidate.id === activeEnvironment?.environmentTargetId,
  );

  for (const value of [activeEnvironment?.id, activeEnvironment?.name]) {
    if (value) environment[`N8NAC_ENV_${envSlug(value)}_API_KEY`] = apiKey;
  }
  for (const value of [target?.id, target?.name]) {
    if (value) environment[`N8NAC_TARGET_${envSlug(value)}_API_KEY`] = apiKey;
  }
}

export function prepareN8nManagement(
  codexHome: string,
  credentials: N8nApiCredentialValues,
  requestedWorkingDirectory?: string,
): PreparedN8nManagement {
  const baseUrl = normalizeBaseUrl(credentials.baseUrl);
  const apiKey = credentials.apiKey.trim();
  if (!apiKey) throw new Error('ProDex n8n API key is empty.');

  const workingDirectory = resolve(
    requestedWorkingDirectory?.trim() || join(codexHome, 'n8n-as-code'),
  );
  const launchers = ensureCodexCommandLaunchers(codexHome);
  mkdirSync(workingDirectory, { recursive: true, mode: 0o700 });
  mkdirSync(join(workingDirectory, 'workflows'), { recursive: true, mode: 0o700 });

  const configPath = join(workingDirectory, 'n8nac-config.json');
  let config = readConfig(configPath);
  if (!config) {
    config = defaultConfig(baseUrl);
    writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
  }

  const environment: Record<string, string> = {
    N8N_HOST: baseUrl,
    N8N_API_KEY: apiKey,
    PRODEX_N8N_BASE_URL: baseUrl,
    N8NAC_CMD: launchers.n8nacCommand,
    N8N_DATA_TABLES_CMD: launchers.dataTablesCommand,
  };
  addCredentialEnvironmentVariables(environment, config, apiKey);
  const workflowCommand = JSON.stringify(launchers.n8nacCommand);
  const dataTablesCommand = JSON.stringify(launchers.dataTablesCommand);

  return {
    baseUrl,
    workingDirectory,
    environment,
    workflowCli: launchers.n8nacCommand,
    dataTablesCli: launchers.dataTablesCommand,
    prompt: [
      `The n8n instance at ${baseUrl} is already authenticated for this run.`,
      `The exact workflow CLI command is ${workflowCommand}. Always invoke this absolute command; do not rely on PATH lookup. N8NAC_CMD points to the same executable for diagnostics only.`,
      `The exact Data Tables CLI command is ${dataTablesCommand}. Always invoke this absolute command. N8N_DATA_TABLES_CMD points to the same executable for diagnostics only.`,
      'Performance rule: never run n8nac through npx, npm exec, pnpm dlx, bunx, or a package installer. ProDex already provides the optimized executable.',
      `If ${workflowCommand} cannot start, report a ProDex launcher failure immediately instead of downloading another copy or retrying through npx.`,
      `Use ${workflowCommand} for workflow discovery, pull, edit, push, activation, execution inspection, and validation.`,
      `Use ${dataTablesCommand} for native Data Tables CRUD; run ${dataTablesCommand} --help for exact commands.`,
      `Start with ${workflowCommand} env status --json when workflow context is needed. Do not run ${workflowCommand} update-ai unless the user asks to regenerate AI context.`,
      'Never print, echo, or expose n8n API-key environment variables.',
    ].join('\n'),
  };
}
