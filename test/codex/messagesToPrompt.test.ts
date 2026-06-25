import { describe, expect, it } from 'vitest';

import { messagesToPrompt } from '../../lib/codex/messagesToPrompt';

describe('messagesToPrompt', () => {
  it('formats user and assistant messages', () => {
    const prompt = messagesToPrompt([
      {
        role: 'user',
        content: [{ type: 'text', text: 'Hello' }],
      },
      {
        role: 'assistant',
        content: [{ type: 'text', text: 'Hi there' }],
      },
    ]);

    expect(prompt).toBe('USER: Hello\n\nASSISTANT: Hi there');
  });

  it('includes tool call and tool result context', () => {
    const prompt = messagesToPrompt([
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolName: 'search',
            input: '{"q":"n8n"}',
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'call-1',
            result: { ok: true },
          },
        ],
      },
    ]);

    expect(prompt).toContain('Tool call: search');
    expect(prompt).toContain('Tool result (call-1)');
  });
});
