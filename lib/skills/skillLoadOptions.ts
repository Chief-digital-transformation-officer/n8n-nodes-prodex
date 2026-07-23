import { resolveCodexHome } from '../auth/codexEnv';
import { ensurePreinstalledSkills, listInstalledSkills } from './skillStore';

export function getInstalledSkillLoadOptions(
  codexHome?: string,
): Array<{ name: string; value: string }> {
  const home = codexHome ?? resolveCodexHome();
  ensurePreinstalledSkills(home);
  return listInstalledSkills(home).map((skill) => ({
    name: skill.description ? `${skill.name} — ${skill.description}` : skill.name,
    value: skill.name,
  }));
}
