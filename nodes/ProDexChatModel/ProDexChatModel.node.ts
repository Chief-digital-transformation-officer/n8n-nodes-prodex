import type {
  ILoadOptionsFunctions,
  INodeType,
  INodeTypeDescription,
  ISupplyDataFunctions,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';
import { supplyModel } from '@n8n/ai-node-sdk';

import { resolveRunnableAuth } from '../../lib/auth/resolveAuth';
import { CodexChatModel } from '../../lib/codex/CodexChatModel';
import {
  CODEX_MODEL_OPTIONS,
  CODEX_REASONING_EFFORT_OPTIONS,
  DEFAULT_CODEX_MODEL,
} from '../../lib/codex/options';
import {
  CodexAuthRefreshError,
  CodexAuthSetupError,
  CodexRuntimeInstallError,
} from '../../lib/errors';
import {
  prepareN8nManagement,
  type N8nApiCredentialValues,
} from '../../lib/n8n/management';
import { resolveSkillNames } from '../../lib/skills/buildAgentPrompt';
import { getInstalledSkillLoadOptions } from '../../lib/skills/skillLoadOptions';
import { ensurePreinstalledSkills } from '../../lib/skills/skillStore';
import type {
  CodexCredentialValues,
  Personality,
  ReasoningEffort,
  SandboxMode,
} from '../../lib/types/codex';

export class ProDexChatModel implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'ProDex Chat Model',
    name: 'prodexChatModel',
    icon: { light: 'file:../ProDex/prodex.svg', dark: 'file:../ProDex/prodex.dark.svg' },
    group: ['transform'],
    version: 2,
    subtitle: '={{$parameter["model"]}}',
    description:
      'Use Codex with your ChatGPT subscription as the chat model behind n8n AI Agent and other LangChain nodes.',
    defaults: {
      name: 'ProDex Chat Model',
    },
    documentationUrl: 'https://prodex.proday.in',
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
        displayName: 'ProDex Auth API',
        required: true,
        displayOptions: {
          show: {
            useN8nCredentials: [true],
          },
        },
      },
      {
        name: 'prodexN8nApi',
        displayName: 'ProDex N8N API',
        required: false,
      },
    ],
    properties: [
      {
        displayName:
          'Setup (first time)\n\n1. Run ProDex Setup → Start Device Login.\n2. Complete browser auth.\n3. Run Wait for Login Complete (hasCompleteAuth: true).\n4. Connect this node to the AI Agent Chat Model input.\n\nNo credential selection is needed — leave "Use n8n Credentials" off. Install skills with ProDex → Install Skill, then pick them here.',
        name: 'setupGuide',
        type: 'notice',
        default: '',
      },
      {
        displayName:
          'AI Agent usage\n\n• Connect the Model output to AI Agent → Chat Model.\n• Works well with Chat Trigger for subscription-backed chat.\n• Select a ProDex n8n API credential to let Codex manage workflows and Data Tables in this n8n. Connected n8n management forces Full Access to avoid bwrap/local-network restrictions in containers.\n• Tool nodes on AI Agent are not fully supported — Codex returns text, not native tool-call payloads. Use the standalone ProDex node for full agentic coding with sandbox access.\n• Prefer Read Only sandbox unless you need filesystem writes.',
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
        displayName: 'Use n8n Credentials',
        name: 'useN8nCredentials',
        type: 'boolean',
        default: false,
        description:
          'Off by default. When off, auth is read from auth.json after ProDex Setup login — no credential picker needed.',
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
        displayName: 'Skills',
        name: 'skills',
        type: 'multiOptions',
        typeOptions: {
          loadOptionsMethod: 'getInstalledSkills',
        },
        default: ['n8n-architect'],
        description: 'Installed skills to apply when AI Agent invokes this model',
      },
      {
        displayName: 'Model',
        name: 'model',
        type: 'options',
        options: CODEX_MODEL_OPTIONS,
        default: DEFAULT_CODEX_MODEL,
        description: 'Codex model used when AI Agent invokes the chat model',
      },
      {
        displayName: 'Reasoning Effort',
        name: 'reasoningEffort',
        type: 'options',
        options: CODEX_REASONING_EFFORT_OPTIONS,
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

  methods = {
    loadOptions: {
      async getInstalledSkills(this: ILoadOptionsFunctions) {
        return getInstalledSkillLoadOptions();
      },
    },
  };

  async supplyData(this: ISupplyDataFunctions, itemIndex: number) {
    try {
      const useN8nCredentials = this.getNodeParameter(
        'useN8nCredentials',
        itemIndex,
        false,
      ) as boolean;
      let credentials: CodexCredentialValues | null = null;
      if (useN8nCredentials) {
        try {
          credentials = (await this.getCredentials('prodexAuthApi')) as CodexCredentialValues;
        } catch {
          throw new NodeOperationError(
            this.getNode(),
            'Use n8n Credentials is enabled but no ProDex Auth API credential is selected. Select a credential or turn the toggle off to use disk auth from ProDex Setup.',
          );
        }
      }

      const { activeBundle, codexHome } = await resolveRunnableAuth(fetch, credentials);
      ensurePreinstalledSkills(codexHome);
      let n8nCredentials: N8nApiCredentialValues | null = null;
      try {
        n8nCredentials = (await this.getCredentials(
          'prodexN8nApi',
        )) as unknown as N8nApiCredentialValues;
      } catch {
        n8nCredentials = null;
      }
      const n8nManagement = n8nCredentials
        ? prepareN8nManagement(codexHome, n8nCredentials)
        : null;
      const model = this.getNodeParameter('model', itemIndex) as string;
      const reasoningEffort = this.getNodeParameter(
        'reasoningEffort',
        itemIndex,
      ) as ReasoningEffort;
      const personality = this.getNodeParameter('personality', itemIndex) as Personality;
      const sandbox = this.getNodeParameter('sandbox', itemIndex) as SandboxMode;
      const effectiveSandbox: SandboxMode = n8nManagement ? 'full_access' : sandbox;
      const configuredSystemPrompt = this.getNodeParameter(
        'systemPrompt',
        itemIndex,
        '',
      ) as string;
      const systemPrompt = [configuredSystemPrompt, n8nManagement?.prompt]
        .filter(Boolean)
        .join('\n\n');
      const skills = resolveSkillNames(this.getNodeParameter('skills', itemIndex, []) as string[]);
      const options = this.getNodeParameter('options', itemIndex, {}) as {
        timeoutSeconds?: number;
      };

      const chatModel = new CodexChatModel(model, {
        tokenBundle: activeBundle,
        codexHome,
        reasoningEffort,
        personality,
        sandbox: effectiveSandbox,
        timeoutMs: (options.timeoutSeconds ?? 300) * 1000,
        systemPrompt,
        staticSkillNames: skills,
        workingDirectory: n8nManagement?.workingDirectory,
        environment: n8nManagement?.environment,
      });

      return supplyModel(this, chatModel);
    } catch (error) {
      if (error instanceof CodexAuthRefreshError || error instanceof CodexAuthSetupError) {
        throw new NodeOperationError(
          this.getNode(),
          `${error.message} Re-run ProDex Setup: Start Device Login → Wait for Login Complete.`,
        );
      }

      if (error instanceof CodexRuntimeInstallError) {
        throw new NodeOperationError(
          this.getNode(),
          `${error.message} Run ProDex Setup → Runtime Status or Install / Update Codex.`,
        );
      }

      throw error;
    }
  }
}
