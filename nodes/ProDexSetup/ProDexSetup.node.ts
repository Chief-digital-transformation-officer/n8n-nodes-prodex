import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
  exportCredentialValuesWithWait,
  startDeviceLogin,
  waitForAgentIdentity,
} from '../../lib/auth/codexLogin';
import {
  hasAgentIdentity,
  hasCompleteCodexAuth,
  readAuthJson,
  resolveCodexHome,
} from '../../lib/auth/codexEnv';
import { getCodexRuntimeStatus, installCodexCli } from '../../lib/codex/manageCodexCli';
import { CodexAuthSetupError, CodexRuntimeInstallError } from '../../lib/errors';
import {
  prepareN8nManagement,
  type N8nApiCredentialValues,
} from '../../lib/n8n/management';
import { ensurePreinstalledSkills, resolveSkillsHome } from '../../lib/skills/skillStore';

export class ProDexSetup implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'ProDex Setup',
    name: 'prodexSetup',
    icon: { light: 'file:../ProDex/prodex.svg', dark: 'file:../ProDex/prodex.dark.svg' },
    group: ['transform'],
    version: 2,
    subtitle: '={{$parameter["operation"]}}',
    description:
      'Set up ChatGPT login, inspect the preinstalled n8n-as-code tooling, and install or update the Codex CLI version used by ProDex.',
    defaults: {
      name: 'ProDex Setup',
    },
    documentationUrl: 'https://prodex.proday.in',
    codex: {
      categories: ['AI'],
      subcategories: {
        AI: ['Agents'],
      },
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
    credentials: [
      {
        name: 'prodexN8nApi',
        displayName: 'ProDex N8N API',
        required: true,
        displayOptions: {
          show: {
            operation: ['testN8nConnection'],
          },
        },
      },
    ],
    properties: [
      {
        displayName:
          'Setup guide (first time)\n\n1. Run Runtime Status to verify Codex, n8nac, and the n8n-architect skill.\n2. Optional: use Install / Update Codex to select latest or an exact CLI version.\n3. Run Start Device Login and complete browser auth.\n4. Run Wait for Login Complete and confirm hasCompleteAuth: true.\n5. Add ProDex — n8n-architect is preselected and n8nac is available to Codex on PATH.\n\nExport Credential Values is only needed when you explicitly use n8n Credentials.',
        name: 'setupGuide',
        type: 'notice',
        default: '',
      },
      {
        displayName:
          'Known issues & watchouts\n\n• Self-hosted n8n only — not supported on n8n Cloud.\n• The n8n process needs network access and write access to codexHome/runtime to install or update Codex.\n• hasAgentIdentity: false is normal for ChatGPT device login; hasCompleteAuth: true is what matters.\n• Do not set CODEX_ACCESS_TOKEN to a ChatGPT OAuth token.\n• Auth, the managed Codex runtime, and skills are stored under codexHome.\n• Exact Codex versions are recommended for reproducible production deployments.',
        name: 'knownIssues',
        type: 'notice',
        default: '',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Install / Update Codex',
            value: 'installCodex',
            description:
              'Install latest or an exact Codex CLI version in the persistent ProDex runtime',
            action: 'Install or update Codex',
          },
          {
            name: 'Runtime Status',
            value: 'runtimeStatus',
            description: 'Show active Codex, bundled Codex, n8nac, and preinstalled skill status',
            action: 'Get runtime status',
          },
          {
            name: 'Test N8N Management Connection',
            value: 'testN8nConnection',
            description:
              'Verify workflow and native Data Tables API access and prepare the n8n-as-code workspace',
            action: 'Test N8N management connection',
          },
          {
            name: 'Export Credential Values',
            value: 'exportCredential',
            description:
              'Optional backup — read tokens from auth.json after login (credentials not required to run ProDex)',
            action: 'Export credential values',
          },
          {
            name: 'Start Device Login',
            value: 'startDeviceLogin',
            description:
              'Step 1 — start ChatGPT device login and return the verification URL and code',
            action: 'Start device login',
          },
          {
            name: 'Wait for Login Complete',
            value: 'waitForLogin',
            description:
              'Step 2 — wait until OAuth tokens are saved and login process exits successfully',
            action: 'Wait for login complete',
          },
        ],
        default: 'runtimeStatus',
      },
      {
        displayName: 'Codex Version',
        name: 'codexVersion',
        type: 'string',
        default: 'latest',
        placeholder: '0.145.0',
        required: true,
        description:
          'Use latest or an exact published semver. The version is installed under codexHome/runtime and becomes active immediately for new runs.',
        displayOptions: {
          show: {
            operation: ['installCodex'],
          },
        },
      },
      {
        displayName:
          'The managed runtime overrides the Codex CLI bundled with this community package. It does not modify the package installation and can persist on a mounted n8n user folder.',
        name: 'codexVersionNotice',
        type: 'notice',
        default: '',
        displayOptions: {
          show: {
            operation: ['installCodex'],
          },
        },
      },
      {
        displayName: 'Wait Time (Seconds)',
        name: 'waitSeconds',
        type: 'number',
        default: 180,
        description:
          'How long to wait for auth.json tokens after browser login. Increase if your container is slow.',
        displayOptions: {
          show: {
            operation: ['exportCredential', 'waitForLogin'],
          },
        },
      },
      {
        displayName:
          'After Start Device Login: complete browser auth, then run Wait for Login Complete until hasCompleteAuth is true.',
        name: 'waitReminder',
        type: 'notice',
        default: '',
        displayOptions: {
          show: {
            operation: ['waitForLogin', 'exportCredential'],
          },
        },
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const operation = this.getNodeParameter('operation', 0) as string;

    try {
      const codexHome = resolveCodexHome();
      const preinstalledSkills = ensurePreinstalledSkills(codexHome);

      if (operation === 'runtimeStatus') {
        const runtime = getCodexRuntimeStatus(codexHome);
        return [
          [
            {
              json: {
                operation,
                codexHome,
                activeCodexVersion: runtime.active.version,
                activeCodexSource: runtime.active.source,
                bundledCodexVersion: runtime.bundledVersion,
                managedCodexVersion: runtime.managedVersion ?? null,
                managedRuntimeHome: runtime.managedRuntimeHome,
                n8nacVersion: runtime.n8nacVersion,
                n8nacBinDirectory: runtime.n8nacBinDirectory,
                skillsHome: resolveSkillsHome(codexHome),
                preinstalledSkills,
              },
            },
          ],
        ];
      }

      if (operation === 'testN8nConnection') {
        const credentials = (await this.getCredentials(
          'prodexN8nApi',
        )) as unknown as N8nApiCredentialValues;
        const management = prepareN8nManagement(codexHome, credentials);
        const headers = {
          Accept: 'application/json',
          'X-N8N-API-KEY': credentials.apiKey,
        };
        const [workflowsResponse, dataTablesResponse] = await Promise.all([
          fetch(`${management.baseUrl}/api/v1/workflows?limit=1`, { headers }),
          fetch(`${management.baseUrl}/api/v1/data-tables?limit=1`, { headers }),
        ]);

        if (!workflowsResponse.ok || !dataTablesResponse.ok) {
          const failures = [
            !workflowsResponse.ok
              ? `workflows API: ${workflowsResponse.status} ${workflowsResponse.statusText}`
              : '',
            !dataTablesResponse.ok
              ? `Data Tables API: ${dataTablesResponse.status} ${dataTablesResponse.statusText}`
              : '',
          ].filter(Boolean);
          throw new NodeOperationError(
            this.getNode(),
            `n8n management connection failed (${failures.join('; ')}). Check the base URL, API-key scopes, and n8n version.`,
          );
        }

        return [
          [
            {
              json: {
                operation,
                connected: true,
                baseUrl: management.baseUrl,
                n8nAsCodeWorkspace: management.workingDirectory,
                workflowsApi: 'available',
                dataTablesApi: 'available',
                workflowCli: 'n8nac',
                dataTablesCli: 'n8n-data-tables',
                sandbox: 'full_access',
                instructions:
                  'Connection is ready. Select this same ProDex n8n API credential on ProDex or ProDex Chat Model; Codex will be connected automatically.',
              },
            },
          ],
        ];
      }

      if (operation === 'installCodex') {
        const version = this.getNodeParameter('codexVersion', 0, 'latest') as string;
        const result = await installCodexCli(codexHome, version);
        return [
          [
            {
              json: {
                operation,
                codexHome,
                requestedVersion: result.requestedVersion,
                previousActiveVersion: result.previousActiveVersion,
                activeCodexVersion: result.active.version,
                activeCodexSource: result.active.source,
                bundledCodexVersion: result.bundledVersion,
                managedRuntimeHome: result.managedRuntimeHome,
                n8nacVersion: result.n8nacVersion,
                preinstalledSkills,
                command: result.command,
                stdout: result.stdout,
                stderr: result.stderr,
                instructions:
                  'Codex is ready. New ProDex runs use this managed CLI version immediately.',
              },
            },
          ],
        ];
      }

      if (operation === 'startDeviceLogin') {
        const login = await startDeviceLogin();
        return [
          [
            {
              json: {
                verificationUrl: login.verificationUrl,
                userCode: login.userCode,
                codexHome: login.codexHome,
                instructions: login.instructions,
              },
            },
          ],
        ];
      }

      if (operation === 'waitForLogin') {
        const waitSeconds = this.getNodeParameter('waitSeconds', 0, 180) as number;
        const authJson = await waitForAgentIdentity(Math.max(waitSeconds, 1) * 1000);
        return [
          [
            {
              json: {
                codexHome,
                hasAgentIdentity: hasAgentIdentity(authJson),
                hasCompleteAuth: hasCompleteCodexAuth(authJson),
                accountId: authJson.tokens.account_id,
                instructions:
                  'Login is complete. Add or run the ProDex node — credentials are optional. Note: hasAgentIdentity may be false; that is normal for ChatGPT device login.',
              },
            },
          ],
        ];
      }

      if (operation === 'exportCredential') {
        const waitSeconds = this.getNodeParameter('waitSeconds', 0, 180) as number;
        const credential = await exportCredentialValuesWithWait(waitSeconds * 1000);
        const authJson = readAuthJson(codexHome);
        const complete = hasCompleteCodexAuth(authJson);
        return [
          [
            {
              json: {
                ...credential,
                codexHome,
                hasAgentIdentity: hasAgentIdentity(authJson),
                hasCompleteAuth: complete,
                instructions: complete
                  ? 'Login is complete. Run the ProDex node — credentials are optional. hasAgentIdentity may be false; that is normal.'
                  : 'Login is not complete yet. Finish browser auth, then run Wait for Login Complete.',
              },
            },
          ],
        ];
      }

      throw new NodeOperationError(this.getNode(), `Unsupported operation: ${operation}`);
    } catch (error) {
      if (error instanceof CodexAuthSetupError || error instanceof CodexRuntimeInstallError) {
        throw new NodeOperationError(this.getNode(), error.message);
      }
      throw error;
    }
  }
}
