import { afterEach, describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  buildInstallSkillCommand,
  normalizeRepoUrl,
  syncCliSkillToCodexHome,
} from '../../lib/skills/installSkillCli';
import { listInstalledSkills } from '../../lib/skills/skillStore';

describe('installSkillCli', () => {
  let codexHome = '';

  afterEach(() => {
    if (codexHome) {
      rmSync(codexHome, { recursive: true, force: true });
      codexHome = '';
    }
  });

  it('normalizes GitHub URLs and owner/repo shorthand', () => {
    expect(normalizeRepoUrl('https://github.com/anthropics/skills/')).toBe(
      'https://github.com/anthropics/skills',
    );
    expect(normalizeRepoUrl('anthropics/skills')).toBe('https://github.com/anthropics/skills');
  });

  it('builds npx install command', () => {
    const { command, args } = buildInstallSkillCommand({
      codexHome: '/tmp/codex',
      packageManager: 'npx',
      repoUrl: 'https://github.com/anthropics/skills',
      skillName: 'docx',
    });

    expect(command).toBe('npx');
    expect(args).toEqual([
      '--yes',
      'skills',
      'add',
      'https://github.com/anthropics/skills',
      '--skill',
      'docx',
      '-a',
      'codex',
      '-y',
    ]);
    expect(args).not.toContain('-g');
  });

  it('syncs CLI-installed skills into codexHome/skills', () => {
    codexHome = mkdtempSync(join(tmpdir(), 'codex-sync-'));

    const cliSkillDir = join(codexHome, '.agents', 'skills', 'amo-crm-api');
    mkdirSync(cliSkillDir, { recursive: true });
    writeFileSync(
      join(cliSkillDir, 'SKILL.md'),
      '---\nname: amo-crm-api\ndescription: AmoCRM API\n---\n\nUse the API.',
      'utf8',
    );
    writeFileSync(join(cliSkillDir, 'helper.txt'), 'extra files', 'utf8');

    expect(syncCliSkillToCodexHome(codexHome, 'amo-crm-api')).toBe(true);

    const skills = listInstalledSkills(codexHome);
    expect(skills.map((skill) => skill.name)).toContain('amo-crm-api');
    expect(skills.find((skill) => skill.name === 'amo-crm-api')?.description).toBe('AmoCRM API');
  });

  it('builds pnpm dlx install command', () => {
    const { command, args } = buildInstallSkillCommand({
      codexHome: '/tmp/codex',
      packageManager: 'pnpm',
      repoUrl: 'anthropics/skills',
      skillName: 'docx',
    });

    expect(command).toBe('pnpm');
    expect(args[0]).toBe('dlx');
    expect(args).toContain('docx');
    expect(args).toContain('-a');
    expect(args).toContain('codex');
  });
});
