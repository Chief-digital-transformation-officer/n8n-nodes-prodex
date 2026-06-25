import type { INodeType, INodeTypeDescription, ISupplyDataFunctions } from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { supplyModel } from '@n8n/ai-node-sdk';

import { resolveRunnableAuth } from '../../lib/auth/resolveAuth';
import { CodexChatModel } from '../../lib/codex/CodexChatModel';
import { CodexAuthRefreshError, CodexAuthSetupError } from '../../lib/errors';
import { parseStaticSkillNames } from '../../lib/skills/buildAgentPrompt';
import type { CodexCredentialValues, Personality, ReasoningEffort, SandboxMode } from '../../lib/types/codex';

const DEFAULT_MODELS = [
  { name: 'GPT-5.5', value: 'gpt-5.5' },
  { name: 'GPT-5.4', value: 'gpt-5.4' },
  { name: 'GPT-5.4 Mini', value: 'gpt-5.4-mini' },
];

export class ProDexChatModel implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'ProDex Chat Model',
    name: 'prodexChatModel',
    icon: { light: 'file:../ProDex/prodex.svg', dark: 'file:../ProDex/prodex.svg' },
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["model"]}}',
    description:
      'Use Codex with your ChatGPT subscription as the chat model behind n8n AI Agent and other LangChain nodes.',
    defaults: {
      name: 'ProDex Chat Model',
    },
    documentationUrl: 'https://www.npmjs.com/package/n8n-nodes-prodex',
    codex: {
      categories: ['AI'],
      subcategories: {
        AI: ['Language Models', 'Root Nodes'],
        'Language Models': ['Chat Models (Recommended)'],
      },
    },
    inputs: [],
    outputs: [NodeConnectionTypes.AiLanguageModel],
    outputNames: ['Model'],
    credentials: [
      {
        name: 'prodexAuthApi',
        required: false,
      },
    ],
    properties: [
      {
        displayName:
          'Setup (first time)\n\n1. Run ProDex Setup → Start Device Login.\n2. Complete browser auth.\n3. Run Wait for Login Complete (hasCompleteAuth: true).\n4. Connect this node to the AI Agent Chat Model input.\n\nCredentials are optional when auth.json already exists on the server.',
        name: 'setupGuide',
        type: 'notice',
        default: '',
      },
      {
        displayName:
          'AI Agent usage\n\n• Connect the Model output to AI Agent → Chat Model.\n• Works well with Chat Trigger for subscription-backed chat.\n• Tool nodes on AI Agent are not fully supported — Codex returns text, not native tool-call payloads. Use the standalone ProDex node for full agentic coding with sandbox access.\n• Prefer Read Only sandbox unless you need filesystem writes.',
        name: 'agentGuide',
        type: 'notice',
        default: '',
      },
      {
        displayName: 'Developer contact: collegeitpro@gmail.com',
        name: 'developerContact',
        type: 'notice',
        default: '',
      },
      {
        displayName: 'System Prompt',
        name: 'systemPrompt',
        type: 'string',
        typeOptions: { rows: 4 },
        default: '',
        description: 'Static instructions prepended when AI Agent calls this model',
      },
      {
        displayName: 'Static Skills',
        name: 'staticSkills',
        type: 'string',
        typeOptions: { rows: 2 },
        default: '',
        placeholder: 'my-skill, release-notes',
        description: 'Installed skill names from ProDex Setup',
      },
      {
        displayName: 'Model',
        name: 'model',
        type: 'options',
        options: DEFAULT_MODELS,
        default: 'gpt-5.4',
        description: 'Codex model used when AI Agent invokes the chat model',
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
        displayName: 'Sandbox',
        name: 'sandbox',
        type: 'options',
        options: [
          { name: 'Read Only', value: 'read_only' },
          { name: 'Workspace Write', value: 'workspace_write' },
          { name: 'Full Access', value: 'full_access' },
        ],
        default: 'read_only',
        description: 'Filesystem access when Codex runs behind AI Agent',
      },
      {
        displayName: 'Options',
        name: 'options',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        options: [
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

  async supplyData(this: ISupplyDataFunctions, itemIndex: number) {
    try {
      let credentials: CodexCredentialValues | null = null;
      try {
        credentials = (await this.getCredentials('prodexAuthApi')) as CodexCredentialValues;
      } catch {
        credentials = null;
      }

      const { activeBundle, codexHome } = await resolveRunnableAuth(fetch, credentials);
      const model = this.getNodeParameter('model', itemIndex) as string;
      const reasoningEffort = this.getNodeParameter('reasoningEffort', itemIndex) as ReasoningEffort;
      const personality = this.getNodeParameter('personality', itemIndex) as Personality;
      const sandbox = this.getNodeParameter('sandbox', itemIndex) as SandboxMode;
      const systemPrompt = this.getNodeParameter('systemPrompt', itemIndex, '') as string;
      const staticSkills = parseStaticSkillNames(
        this.getNodeParameter('staticSkills', itemIndex, '') as string,
      );
      const options = this.getNodeParameter('options', itemIndex, {}) as { timeoutSeconds?: number };

      const chatModel = new CodexChatModel(model, {
        tokenBundle: activeBundle,
        codexHome,
        reasoningEffort,
        personality,
        sandbox,
        timeoutMs: (options.timeoutSeconds ?? 300) * 1000,
        systemPrompt,
        staticSkillNames: staticSkills,
      });

      return supplyModel(this, chatModel);
    } catch (error) {
      if (error instanceof CodexAuthRefreshError || error instanceof CodexAuthSetupError) {
        throw new NodeOperationError(
          this.getNode(),
          `${error.message} Re-run ProDex Setup: Start Device Login → Wait for Login Complete.`,
        );
      }

      throw error;
    }
  }
}
