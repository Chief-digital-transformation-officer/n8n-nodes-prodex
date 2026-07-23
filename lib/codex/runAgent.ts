import type { CodexAgentResult, RunCodexAgentParams } from '../types/codex';
import {
  buildCodexEnv,
  createCodexHome,
  mapPersonalityConfig,
  mapSandboxMode,
} from '../auth/codexEnv';
import { prependRuntimePath, resolveActiveCodexRuntime } from './manageCodexCli';

type CodexSdkModule = typeof import('@openai/codex-sdk');

async function loadCodexSdk(): Promise<CodexSdkModule> {
  const importModule = new Function('specifier', 'return import(specifier)') as (
    specifier: string,
  ) => Promise<CodexSdkModule>;
  return importModule('@openai/codex-sdk');
}

export function parseAgentResult(
  result: {
    finalResponse: string;
    items: unknown[];
    usage: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
      inputTokens?: number;
      outputTokens?: number;
      totalTokens?: number;
    } | null;
  },
  threadId: string | null,
  model: string,
): CodexAgentResult {
  const usage = result.usage;
  return {
    output: result.finalResponse,
    threadId,
    items: result.items,
    usage: usage
      ? {
          inputTokens: usage.inputTokens ?? usage.input_tokens,
          outputTokens: usage.outputTokens ?? usage.output_tokens,
          totalTokens: usage.totalTokens ?? usage.total_tokens,
        }
      : null,
    model,
    finishReason: 'stop',
  };
}

export async function runCodexAgent(params: RunCodexAgentParams): Promise<CodexAgentResult> {
  const { Codex } = await loadCodexSdk();
  const codexHome = params.codexHome || createCodexHome(params.tokenBundle);
  const runtime = resolveActiveCodexRuntime(codexHome);
  const env = prependRuntimePath(buildCodexEnv(codexHome), runtime.pathDirectories);
  Object.assign(env, params.environment);
  const personalityConfig = mapPersonalityConfig(params.personality);

  const codex = new Codex({
    codexPathOverride: runtime.executablePath,
    env,
    config: personalityConfig,
  });

  const threadOptions = {
    model: params.model,
    sandboxMode: mapSandboxMode(params.sandbox),
    workingDirectory: params.workingDirectory,
    skipGitRepoCheck: true,
    modelReasoningEffort: params.reasoningEffort,
    approvalPolicy: 'never' as const,
    additionalDirectories: params.additionalDirectories,
  };

  let thread;
  if (params.threadMode === 'resume' && params.threadId) {
    thread = codex.resumeThread(params.threadId, threadOptions);
  } else if (params.threadMode === 'continue' && params.threadId) {
    thread = codex.resumeThread(params.threadId, threadOptions);
  } else {
    thread = codex.startThread(threadOptions);
  }

  const controller = new AbortController();
  const timeout = params.timeoutMs ?? 300_000;
  const timeoutHandle = setTimeout(() => controller.abort(), timeout);

  if (params.signal) {
    if (params.signal.aborted) {
      controller.abort();
    } else {
      params.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  try {
    if (params.streamProgress) {
      const streamed = await thread.runStreamed(params.prompt, {
        outputSchema: params.outputSchema,
        signal: controller.signal,
      });

      let finalResponse = '';
      for await (const event of streamed.events) {
        if (event.type === 'item.completed' && event.item.type === 'agent_message') {
          finalResponse = event.item.text;
          params.onProgress?.(event.item.text);
        } else if (event.type === 'turn.failed') {
          throw new Error(event.error.message);
        }
      }

      return parseAgentResult(
        {
          finalResponse,
          items: [],
          usage: null,
        },
        thread.id,
        params.model,
      );
    }

    const result = await thread.run(params.prompt, {
      outputSchema: params.outputSchema,
      signal: controller.signal,
    });

    return parseAgentResult(result, thread.id, params.model);
  } finally {
    clearTimeout(timeoutHandle);
  }
}
