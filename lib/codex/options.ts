import type { INodePropertyOptions } from 'n8n-workflow';

export const DEFAULT_CODEX_MODEL = 'gpt-5.6-sol';

export const CODEX_MODEL_OPTIONS: INodePropertyOptions[] = [
  { name: 'GPT-5.6 Sol', value: 'gpt-5.6-sol' },
  { name: 'GPT-5.6 Terra', value: 'gpt-5.6-terra' },
  { name: 'GPT-5.6 Luna', value: 'gpt-5.6-luna' },
  { name: 'GPT-5.5', value: 'gpt-5.5' },
  { name: 'GPT-5.4', value: 'gpt-5.4' },
  { name: 'GPT-5.4 Mini', value: 'gpt-5.4-mini' },
];

export const CODEX_REASONING_EFFORT_OPTIONS: INodePropertyOptions[] = [
  { name: 'None', value: 'none' },
  { name: 'Minimal', value: 'minimal' },
  { name: 'Low', value: 'low' },
  { name: 'Medium', value: 'medium' },
  { name: 'High', value: 'high' },
  { name: 'Extra High', value: 'xhigh' },
];
