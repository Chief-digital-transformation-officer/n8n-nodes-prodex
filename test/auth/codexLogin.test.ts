import { describe, expect, it } from 'vitest';

import { parseDeviceLoginOutput, stripAnsi } from '../../lib/auth/codexLogin';

const sampleCliOutput =
  'WARNING: proceeding...\n\nWelcome to Codex [v\u001b[90m0.142.1\u001b[0m]\n' +
  'Follow these steps to sign in with ChatGPT using device code authorization:\n\n' +
  '1. Open this link in your browser and sign in to your account\n' +
  '   \u001b[94mhttps://auth.openai.com/codex/device\u001b[0m\n\n' +
  '2. Enter this one-time code \u001b[90m(expires in 15 minutes)\u001b[0m\n' +
  '   \u001b[94m6GRA-PKXFF\u001b[0m\n';

describe('codexLogin parsing', () => {
  it('strips ANSI color codes', () => {
    expect(stripAnsi('\u001b[94mhttps://auth.openai.com/codex/device\u001b[0m')).toBe(
      'https://auth.openai.com/codex/device',
    );
  });

  it('parses device code from current Codex CLI output', () => {
    const parsed = parseDeviceLoginOutput(sampleCliOutput);
    expect(parsed).toEqual({
      verificationUrl: 'https://auth.openai.com/codex/device',
      userCode: '6GRA-PKXFF',
    });
  });

  it('returns null when no device code is present', () => {
    expect(parseDeviceLoginOutput('Starting login...')).toBeNull();
  });
});
