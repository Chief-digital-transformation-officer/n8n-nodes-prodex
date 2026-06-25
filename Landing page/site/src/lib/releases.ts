export type ReleaseTag = "feature" | "fix" | "docs";

export type Release = {
  version: string;
  date: string;
  tags: ReleaseTag[];
  items: string[];
};

export const releases: Release[] = [
  {
    version: "v0.4.0",
    date: "25 Jun 2026",
    tags: ["feature"],
    items: [
      "Rebranded to ProDex — package n8n-nodes-prodex with prodex, prodexSetup, and prodexChatModel node types.",
      "Updated icons, credentials (prodexAuthApi), and documentation across all nodes.",
    ],
  },
  {
    version: "v0.3.0",
    date: "25 Jun 2026",
    tags: ["feature", "docs"],
    items: [
      "Skills system — install SKILL.md files and reference them statically or dynamically in system prompts.",
      "Setup operations: Install Skill and List Installed Skills.",
      "Output field appliedSkills shows which skills were loaded per run.",
    ],
  },
  {
    version: "v0.2.0",
    date: "25 Jun 2026",
    tags: ["feature"],
    items: [
      "ProDex Chat Model — connect to n8n AI Agent's Chat Model input.",
      "Subscription-backed chat via Chat Trigger workflows.",
      "Uses @n8n/ai-node-sdk (BaseChatModel + supplyModel pattern).",
    ],
  },
  {
    version: "v0.1.12–13",
    date: "25 Jun 2026",
    tags: ["fix", "docs"],
    items: [
      "Fixed exec failure: stopped passing OAuth tokens via CODEX_ACCESS_TOKEN.",
      "Login completes when tokens exist + CLI reports success.",
      "In-node setup guides and known-issues notices on all nodes.",
    ],
  },
  {
    version: "v0.1.11",
    date: "25 Jun 2026",
    tags: ["fix"],
    items: [
      "Preserve object-form agent_identity in auth.json (Codex 0.142 format).",
      "Token refresh no longer strips agent identity fields from disk.",
      "Prefer Docker codex home at /home/node/.n8n/codex when available.",
    ],
  },
  {
    version: "v0.1.6–10",
    date: "24 Jun 2026",
    tags: ["fix", "feature"],
    items: [
      "Device login parsing fixed for current Codex CLI output.",
      "Detached login process with log file polling — Setup no longer hangs.",
      "Wait for Login Complete operation with login.log status.",
    ],
  },
  {
    version: "v0.1.0–5",
    date: "24 Jun 2026",
    tags: ["feature"],
    items: [
      "Initial ProDex agent node via @openai/codex-sdk.",
      "ProDex Setup — device login entirely inside n8n.",
      "ChatGPT subscription auth, token refresh, sandbox modes.",
    ],
  },
];
