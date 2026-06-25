import type { Message } from '@n8n/ai-node-sdk';

function formatContent(content: Message['content'][number]): string {
  switch (content.type) {
    case 'text':
      return content.text;
    case 'reasoning':
      return content.text;
    case 'tool-call':
      return `Tool call: ${content.toolName}(${content.input})`;
    case 'tool-result':
      return `Tool result (${content.toolCallId}): ${
        typeof content.result === 'string' ? content.result : JSON.stringify(content.result)
      }`;
    case 'invalid-tool-call':
      return `Invalid tool call: ${content.name ?? 'unknown'} ${content.args ?? ''}`.trim();
    case 'file':
      return `[file: ${content.mediaType ?? 'attachment'}]`;
    case 'citation':
      return content.text ?? content.title ?? content.url ?? '';
    default:
      return '';
  }
}

export function messagesToPrompt(messages: Message[]): string {
  return messages
    .map((message) => {
      const body = message.content.map(formatContent).filter(Boolean).join('\n');
      if (!body.trim()) {
        return '';
      }

      return `${message.role.toUpperCase()}: ${body}`;
    })
    .filter(Boolean)
    .join('\n\n');
}
