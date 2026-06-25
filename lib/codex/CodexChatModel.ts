import {
  BaseChatModel,
  type ChatModelConfig,
  type GenerateResult,
  type Message,
  type StreamChunk,
} from '@n8n/ai-node-sdk';

import type { CodexTokenBundle, Personality, ReasoningEffort, SandboxMode } from '../types/codex';
import { buildAgentPrompt } from '../skills/buildAgentPrompt';
import { messagesToPrompt } from './messagesToPrompt';
import { runCodexAgent } from './runAgent';

export interface CodexChatModelConfig extends ChatModelConfig {
  tokenBundle: CodexTokenBundle;
  codexHome: string;
  reasoningEffort: ReasoningEffort;
  personality: Personality;
  sandbox: SandboxMode;
  timeoutMs: number;
  systemPrompt?: string;
  staticSkillNames?: string[];
  dynamicSkills?: unknown;
}

function preparePrompt(messages: Message[], config: CodexChatModelConfig): ReturnType<typeof buildAgentPrompt> {
  return buildAgentPrompt({
    userPrompt: messagesToPrompt(messages),
    systemPrompt: config.systemPrompt,
    staticSkillNames: config.staticSkillNames,
    dynamicSkills: config.dynamicSkills,
    codexHome: config.codexHome,
  });
}

export class CodexChatModel extends BaseChatModel<CodexChatModelConfig> {
  constructor(modelId: string, config: CodexChatModelConfig) {
    super('prodex', modelId, config);
  }

  async generate(messages: Message[], config?: CodexChatModelConfig): Promise<GenerateResult> {
    const merged = this.mergeConfig(config) as CodexChatModelConfig;
    const built = preparePrompt(messages, merged);

    const result = await runCodexAgent({
      prompt: built.prompt,
      model: this.modelId,
      reasoningEffort: merged.reasoningEffort,
      personality: merged.personality,
      threadMode: 'new',
      sandbox: merged.sandbox,
      timeoutMs: merged.timeoutMs,
      signal: merged.abortSignal,
      tokenBundle: merged.tokenBundle,
      codexHome: merged.codexHome,
      additionalDirectories: built.additionalDirectories,
    });

    return {
      id: result.threadId ?? undefined,
      finishReason: 'stop',
      message: {
        role: 'assistant',
        content: [{ type: 'text', text: result.output }],
      },
      usage: {
        promptTokens: result.usage?.inputTokens ?? 0,
        completionTokens: result.usage?.outputTokens ?? 0,
        totalTokens: result.usage?.totalTokens ?? 0,
      },
      providerMetadata: {
        model: result.model,
        threadId: result.threadId,
      },
    };
  }

  async *stream(messages: Message[], config?: CodexChatModelConfig): AsyncIterable<StreamChunk> {
    const merged = this.mergeConfig(config) as CodexChatModelConfig;
    const built = preparePrompt(messages, merged);
    const pending: StreamChunk[] = [];
    let notify: (() => void) | undefined;
    let finished = false;
    let failure: Error | undefined;
    let previousText = '';

    const push = (chunk: StreamChunk) => {
      pending.push(chunk);
      notify?.();
    };

    const waitForChunk = () =>
      new Promise<void>((resolve) => {
        notify = resolve;
      });

    const agentPromise = runCodexAgent({
      prompt: built.prompt,
      model: this.modelId,
      reasoningEffort: merged.reasoningEffort,
      personality: merged.personality,
      threadMode: 'new',
      sandbox: merged.sandbox,
      timeoutMs: merged.timeoutMs,
      streamProgress: true,
      onProgress: (text) => {
        const delta = text.slice(previousText.length);
        previousText = text;
        if (delta) {
          push({ type: 'text-delta', delta });
        }
      },
      tokenBundle: merged.tokenBundle,
      codexHome: merged.codexHome,
      additionalDirectories: built.additionalDirectories,
    })
      .then((result) => {
        push({
          type: 'finish',
          finishReason: 'stop',
          usage: {
            promptTokens: result.usage?.inputTokens ?? 0,
            completionTokens: result.usage?.outputTokens ?? 0,
            totalTokens: result.usage?.totalTokens ?? 0,
          },
        });
        return result;
      })
      .catch((error: unknown) => {
        failure = error instanceof Error ? error : new Error(String(error));
      })
      .finally(() => {
        finished = true;
        notify?.();
      });

    while (!finished || pending.length > 0) {
      while (pending.length > 0) {
        yield pending.shift()!;
      }

      if (!finished) {
        await waitForChunk();
      }
    }

    if (failure) {
      throw failure;
    }

    await agentPromise;
  }
}
