import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

import {
  ensurePreinstalledSkills,
  installSkill,
  listInstalledSkills,
  parseSkillMarkdown,
} from '../../lib/skills/skillStore';
import {
  buildAgentPrompt,
  parseStaticSkillNames,
  resolveSkillNames,
} from '../../lib/skills/buildAgentPrompt';

describe('skillStore', () => {
  const codexHome = mkdtempSync(join(tmpdir(), 'codex-skills-'));

  afterEach(() => {
    rmSync(codexHome, { recursive: true, force: true });
  });

  it('parses skill frontmatter', () => {
    const parsed = parseSkillMarkdown(`---
name: demo
description: Demo skill
---

# Body`);
    expect(parsed.name).toBe('demo');
    expect(parsed.description).toBe('Demo skill');
    expect(parsed.body).toContain('# Body');
  });

  it('installs and lists skills', () => {
    installSkill(
      codexHome,
      'release-notes',
      '---\nname: release-notes\ndescription: Write changelogs\n---\n\nSummarize git diff as release notes.',
    );

    const skills = listInstalledSkills(codexHome);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe('release-notes');
    expect(readFileSync(skills[0].path, 'utf8')).toContain('Summarize git diff');
  });

  it('preinstalls the n8n-as-code architect skill idempotently', () => {
    const first = ensurePreinstalledSkills(codexHome);
    const second = ensurePreinstalledSkills(codexHome);
    const skill = listInstalledSkills(codexHome).find((entry) => entry.name === 'n8n-architect');

    expect(first[0].changed).toBe(true);
    expect(second[0].changed).toBe(false);
    expect(skill?.description).toContain('n8n');
    expect(readFileSync(skill!.path, 'utf8')).toContain(
      JSON.stringify(join(codexHome, 'bin', 'n8nac')),
    );
    expect(readFileSync(skill!.path, 'utf8')).not.toContain('{{N8NAC_CMD}}');
  });
});

describe('buildAgentPrompt', () => {
  const codexHome = mkdtempSync(join(tmpdir(), 'codex-prompt-'));

  afterEach(() => {
    rmSync(codexHome, { recursive: true, force: true });
  });

  it('merges static system prompt and installed skills', () => {
    installSkill(
      codexHome,
      'lint-fix',
      '---\nname: lint-fix\ndescription: Fix lint issues\n---\n\nAlways run lint after edits.',
    );

    const built = buildAgentPrompt({
      userPrompt: 'Fix the failing workflow',
      systemPrompt: 'You are an n8n automation expert.',
      staticSkillNames: parseStaticSkillNames('lint-fix'),
      codexHome,
    });

    expect(built.prompt).toContain('You are an n8n automation expert.');
    expect(built.prompt).toContain('Skill: lint-fix');
    expect(built.prompt).toContain('Always run lint after edits.');
    expect(built.prompt).toContain('Fix the failing workflow');
    expect(built.appliedSkills).toEqual(['lint-fix']);
    expect(built.additionalDirectories.length).toBe(1);
  });

  it('supports dynamic inline skills', () => {
    const built = buildAgentPrompt({
      userPrompt: 'Hello',
      dynamicSkills: [{ name: 'temp', content: 'Respond briefly.' }],
      codexHome,
    });

    expect(built.prompt).toContain('Respond briefly.');
    expect(built.appliedSkills).toEqual(['temp (inline)']);
  });

  it('resolves skill names from picker with legacy fallback', () => {
    expect(resolveSkillNames(['docx'], 'legacy-skill')).toEqual(['docx']);
    expect(resolveSkillNames([], 'legacy-skill, other')).toEqual(['legacy-skill', 'other']);
    expect(resolveSkillNames(undefined, '')).toEqual([]);
  });
});
