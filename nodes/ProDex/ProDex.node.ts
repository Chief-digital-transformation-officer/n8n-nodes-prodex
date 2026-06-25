import type {
  IDataObject,
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  JsonObject,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeApiError, NodeOperationError } from 'n8n-workflow';

import { resolveRunnableAuth } from '../../lib/auth/resolveAuth';
import { runCodexAgent } from '../../lib/codex/runAgent';
import { CodexAuthRefreshError, CodexAuthSetupError } from '../../lib/errors';
import { buildAgentPrompt, parseStaticSkillNames } from '../../lib/skills/buildAgentPrompt';
import type { CodexCredentialValues, Personality, ReasoningEffort, SandboxMode, ThreadMode } from '../../lib/types/codex';

const DEFAULT_MODELS = [
  { name: 'GPT-5.5', value: 'gpt-5.5' },
  { name: 'GPT-5.4', value: 'gpt-5.4' },
  { name: 'GPT-5.4 Mini', value: 'gpt-5.4-mini' },
];

export class ProDex implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'ProDex',
    name: 'prodex',
    icon: { light: 'file:prodex.svg', dark: 'file:prodex.svg' },
    group: ['transform'],
    version: 1,
    usableAsTool: true,
    subtitle: '={{$parameter["model"]}}',
    description:
      'Run OpenAI Codex as an autonomous agent using your ChatGPT subscription. Complete ProDex Setup once before first use.',
    defaults: {
      name: 'ProDex',
    },
    documentationUrl: 'https://www.npmjs.com/package/n8n-nodes-prodex',
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
        name: 'prodexAuthApi',
        required: false,
      },
    ],
    properties: [
      {
        displayName:
          'Before first run\n\nComplete setup once with the ProDex Setup node:\n1. Start Device Login\n2. Sign in in the browser\n3. Wait for Login Complete (hasCompleteAuth: true)\n\nFor AI Agent workflows, use the ProDex Chat Model node connected to Chat Model instead of this node.',
        name: 'prerequisiteNotice',
        type: 'notice',
        default: '',
      },
      {
        displayName:
          'Known issues & watchouts\n\n• Requires self-hosted n8n and @openai/codex CLI binaries (installed with this package).\n• Use package version 0.1.12 or newer.\n• Never set CODEX_ACCESS_TOKEN to an OAuth access token — it breaks Codex exec.\n• Prefer Read Only sandbox on shared servers unless you trust full filesystem access.\n• Continue Previous Thread stores threadId in node static data between runs.\n• If auth errors appear, re-run ProDex Setup (Start Device Login → Wait for Login Complete).\n• Codex uses your ChatGPT subscription, not pay-per-token API billing.',
        name: 'knownIssues',
        type: 'notice',
        default: '',
      },
      {
        displayName:
          'Developer contact: collegeitpro@gmail.com — questions, bugs, and feature requests welcome.',
        name: 'developerContact',
        type: 'notice',
        default: '',
      },
      {
        displayName: 'System Prompt',
        name: 'systemPrompt',
        type: 'string',
        typeOptions: {
          rows: 5,
        },
        default: '',
        description: 'Static instructions prepended to every run (always applied)',
      },
      {
        displayName: 'Static Skills',
        name: 'staticSkills',
        type: 'string',
        typeOptions: {
          rows: 3,
        },
        default: '',
        placeholder: 'my-skill, release-notes',
        description:
          'Comma- or newline-separated installed skill names from ProDex Setup → List Installed Skills',
      },
      {
        displayName: 'Dynamic Skills',
        name: 'dynamicSkills',
        type: 'string',
        typeOptions: {
          rows: 3,
        },
        default: '={{ $json.skillNames || $json.skills }}',
        description:
          'Expression for per-run skills: skill names (array/string), inline markdown, or [{ name, content }]',
      },
      {
        displayName: 'Prompt',
        name: 'prompt',
        type: 'string',
        typeOptions: {
          rows: 6,
        },
        default: '={{ $json.chatInput || $json.prompt || $json.text }}',
        required: true,
        description: 'Instruction for the Codex agent',
      },
      {
        displayName: 'Model',
        name: 'model',
        type: 'options',
        options: DEFAULT_MODELS,
        default: 'gpt-5.4',
      },
      {
        displayName: 'Reasoning Effort',
        name: 'reasoningEffort',
        type: 'options',
        options: [
          { name: 'Extra High', value: 'xhigh' },
          { name: 'High', value: 'high' },
          { name: 'Low', value: 'low' },
          { name: 'Medium', value: 'medium' },
        ],
        default: 'medium',
      },
      {
        displayName: 'Personality',
        name: 'personality',
        type: 'options',
        options: [
          { name: 'Default', value: 'default' },
          { name: 'Friendly', value: 'friendly' },
          { name: 'Pragmatic', value: 'pragmatic' },
        ],
        default: 'default',
      },
      {
        displayName: 'Thread Mode',
        name: 'threadMode',
        type: 'options',
        options: [
          { name: 'Continue Previous Thread', value: 'continue' },
          { name: 'New Thread', value: 'new' },
          { name: 'Resume Thread By ID', value: 'resume' },
        ],
        default: 'new',
      },
      {
        displayName: 'Thread ID',
        name: 'threadId',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            threadMode: ['resume'],
          },
        },
      },
      {
        displayName: 'Sandbox',
        name: 'sandbox',
        type: 'options',
        options: [
          { name: 'Full Access', value: 'full_access' },
          { name: 'Read Only', value: 'read_only' },
          { name: 'Workspace Write', value: 'workspace_write' },
        ],
        default: 'read_only',
        description: 'Filesystem access level for Codex tool use',
      },
      {
        displayName: 'Working Directory',
        name: 'workingDirectory',
        type: 'string',
        default: '',
        placeholder: '/data/project',
        description: 'Optional directory Codex should treat as its workspace',
      },
      {
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        options: [
          {
            displayName: 'Structured Output JSON Schema',
            name: 'outputSchema',
            type: 'json',
            default: '',
            description: 'Optional JSON schema for structured agent output',
          },
          {
            displayName: 'Stream Progress To Execution Log',
            name: 'streamProgress',
            type: 'boolean',
            default: false,
          },
          {
            displayName: 'Timeout (Seconds)',
            name: 'timeoutSeconds',
            type: 'number',
            default: 300,
            typeOptions: {
              minValue: 30,
            },
          },
        ],
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        let credentials: CodexCredentialValues | null = null;
        try {
          credentials = (await this.getCredentials('prodexAuthApi')) as CodexCredentialValues;
        } catch {
          credentials = null;
        }

        const { activeBundle, codexHome } = await resolveRunnableAuth(fetch, credentials);

        const prompt = this.getNodeParameter('prompt', itemIndex) as string;
        const systemPrompt = this.getNodeParameter('systemPrompt', itemIndex, '') as string;
        const staticSkills = parseStaticSkillNames(
          this.getNodeParameter('staticSkills', itemIndex, '') as string,
        );
        const dynamicSkills = this.getNodeParameter('dynamicSkills', itemIndex, '') as unknown;
        const builtPrompt = buildAgentPrompt({
          userPrompt: prompt,
          systemPrompt,
          staticSkillNames: staticSkills,
          dynamicSkills,
          codexHome,
        });
        const model = this.getNodeParameter('model', itemIndex) as string;
        const reasoningEffort = this.getNodeParameter('reasoningEffort', itemIndex) as ReasoningEffort;
        const personality = this.getNodeParameter('personality', itemIndex) as Personality;
        const threadMode = this.getNodeParameter('threadMode', itemIndex) as ThreadMode;
        const sandbox = this.getNodeParameter('sandbox', itemIndex) as SandboxMode;
        const workingDirectory = this.getNodeParameter('workingDirectory', itemIndex, '') as string;
        const options = this.getNodeParameter('options', itemIndex, {}) as {
          outputSchema?: string | IDataObject;
          streamProgress?: boolean;
          timeoutSeconds?: number;
        };

        let threadId = this.getNodeParameter('threadId', itemIndex, '') as string;
        const staticData = this.getWorkflowStaticData('node');
        if (threadMode === 'continue' && staticData.threadId && typeof staticData.threadId === 'string') {
          threadId = staticData.threadId;
        }

        const outputSchema =
          typeof options.outputSchema === 'string'
            ? options.outputSchema
              ? JSON.parse(options.outputSchema)
              : undefined
            : options.outputSchema;

        const codexHomePath = codexHome;
        const result = await runCodexAgent({
          prompt: builtPrompt.prompt,
          model,
          reasoningEffort,
          personality,
          threadMode,
          threadId: threadId || undefined,
          sandbox,
          workingDirectory: workingDirectory || undefined,
          outputSchema,
          timeoutMs: (options.timeoutSeconds ?? 300) * 1000,
          streamProgress: options.streamProgress ?? false,
          onProgress: (message) => {
            this.logger.info(`ProDex: ${message}`);
          },
          tokenBundle: activeBundle,
          codexHome: codexHomePath,
          additionalDirectories: builtPrompt.additionalDirectories,
        });

        if (threadMode === 'continue' && result.threadId) {
          staticData.threadId = result.threadId;
        }

        returnData.push({
          json: {
            output: result.output,
            threadId: result.threadId,
            items: result.items,
            usage: result.usage,
            model: result.model,
            finishReason: result.finishReason,
            appliedSkills: builtPrompt.appliedSkills,
          },
          pairedItem: { item: itemIndex },
        });
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: error instanceof Error ? error.message : String(error),
            },
            pairedItem: { item: itemIndex },
          });
          continue;
        }

        if (error instanceof CodexAuthRefreshError || error instanceof CodexAuthSetupError) {
          throw new NodeOperationError(
            this.getNode(),
            `${error.message} Re-run ProDex Setup: Start Device Login → complete browser auth → Wait for Login Complete.`,
            { itemIndex },
          );
        }

        if (error instanceof Error && /Codex CLI binaries/i.test(error.message)) {
          throw new NodeOperationError(
            this.getNode(),
            'Codex CLI is not available in this environment. Install @openai/codex in your n8n container or host.',
            { itemIndex },
          );
        }

        throw new NodeApiError(this.getNode(), error as JsonObject, { itemIndex });
      }
    }

    return [returnData];
  }
}
