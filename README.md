<div align="center">

# ProDex Node for Self-Hosted n8n

Run **OpenAI Codex** inside self-hosted n8n workflows — powered by your **Codex subscription**, not pay-per-token API billing.

<br />

[![npm version](https://img.shields.io/npm/v/n8n-nodes-prodex?style=for-the-badge&logo=npm&logoColor=white)](https://www.npmjs.com/package/n8n-nodes-prodex)
[![Releases & Roadmap](https://img.shields.io/badge/Releases_%26_Roadmap-prodex.proday.in-0ea5e9?style=for-the-badge)](https://prodex.proday.in)
[![Portfolio — Nils](https://img.shields.io/badge/✨_Portfolio-nils.proday.in-8b5cf6?style=for-the-badge)](https://nils.proday.in)

<br />

**Built by [Nils](https://nils.proday.in)** · automation, workflows & integrations

[📦 npm](https://www.npmjs.com/package/n8n-nodes-prodex) · [🌐 prodex.proday.in](https://prodex.proday.in) · [💼 nils.proday.in](https://nils.proday.in) · [GitHub](https://github.com/artNcraft/n8n-nodes-prodex)

</div>

---

## 👤 About the author

<table>
<tr>
<td width="60">

**Nils**

</td>
<td>

This project is built and maintained by **[Nils](https://nils.proday.in)**.

→ **Portfolio:** [**nils.proday.in**](https://nils.proday.in) — projects, work & contact  
→ **Release tracker:** [**prodex.proday.in**](https://prodex.proday.in) — changelog, install notes, roadmap  
→ **Questions & feedback:** collegeitpro@gmail.com

</td>
</tr>
</table>

> New versions and release notes land on **[prodex.proday.in](https://prodex.proday.in)** first. Pin package versions in production and check the site before upgrading.

---

## ✨ Features

- **ProDex** root node — prompt in, agent result out
- **ProDex Chat Model** for n8n **AI Agent** (connect to Chat Model input)
- **ProDex Setup** node for browser login and credential export inside n8n
- **Codex runtime manager** — inspect, install, or update to `latest` or an exact CLI version from the setup node
- **Token refresh** at runtime when access tokens expire
- Automatic Codex data directory under n8n's own user folder (no manual env vars)
- Thread modes: new, continue, resume
- **n8n-as-code included** — the `n8nac` CLI is installed with the node and exposed to every Codex run
- **Preinstalled n8n skill** — `n8n-architect` from n8n-as-code is available and selected by default
- **Native n8n management connection** — one encrypted n8n API credential automatically authenticates workflow and Data Tables tooling
- **Native Data Tables CLI** — list/create/rename/delete tables, manage columns, and read/insert/update/upsert/delete rows
- **Skills system** — install additional `SKILL.md` files and reference them in system prompts (static + dynamic)

---

## ⚠️ Important caveat

This package uses Codex through the official `@openai/codex-sdk`, which spawns the Codex CLI and authenticates with ChatGPT subscription tokens. Codex backend endpoints may change without notice. Pin package versions in production.

---

## Requirements

- Self-hosted n8n (not n8n Cloud)
- Node.js 18+
- `@openai/codex` CLI binaries (installed automatically as a dependency on supported platforms)
- A writable n8n user folder if you want setup-node-managed Codex updates

---

## Installation

### Option A: Install from npm (community node UI)

In self-hosted n8n:

1. Open **Settings → Community Nodes**
2. Click **Install**
3. Enter package name:

```
n8n-nodes-prodex
```

4. Accept the risk prompt and install
5. Restart n8n if prompted

### Option B: Custom extensions directory (development)

```bash
git clone https://github.com/artNcraft/n8n-nodes-prodex.git
cd n8n-nodes-prodex
npm install
npm run build

export N8N_CUSTOM_EXTENSIONS="/absolute/path/to/n8n-nodes-prodex"
n8n start
```

The package directory must contain installed dependencies (`@openai/codex`, `@openai/codex-sdk`, and `n8nac`). Running `npm install` in the package folder satisfies that requirement.

For Docker, mount the built package and set `N8N_CUSTOM_EXTENSIONS`. See [`docker/Dockerfile.n8n-codex`](docker/Dockerfile.n8n-codex).

---

## Authentication (entirely inside n8n)

No CLI or manual environment variables are required for users.

### Step 1: Verify or choose the Codex runtime

1. Create a workflow with **Manual Trigger** → **ProDex Setup**
2. Run **Runtime Status**
3. Confirm the output includes `activeCodexVersion`, `n8nacVersion`, and the `n8n-architect` preinstalled skill
4. Optional: choose **Install / Update Codex**, enter `latest` or an exact version such as `0.145.0`, and execute

Managed versions are installed under `{codexHome}/runtime` and override the version bundled with this package for new login and agent runs. The community-node installation itself is not modified, and no n8n restart is required.

### Step 2: Start device login

1. Set operation to **Start Device Login**
2. Execute the workflow
3. Open the returned `verificationUrl` and enter `userCode` in your browser
4. Sign in with your Codex account

### Step 3: Wait for login complete

1. Change the setup node operation to **Wait for Login Complete**
2. Execute again after browser login completes
3. Confirm the output shows `hasCompleteAuth: true`

### Step 4: Run Codex

Add the **ProDex** node and run your workflow. **Do not select credentials** — leave **Use n8n Credentials** off. Auth is read automatically from `auth.json` on disk.

If tokens expire and refresh fails, repeat the setup flow with **ProDex Setup**.

### Optional: store tokens in n8n Credentials

Only needed if you prefer n8n Credentials over disk auth (e.g. multi-worker setups):

1. ProDex Setup → **Export Credential Values**
2. Create **Credentials → ProDex Auth API** and paste the returned fields
3. On the ProDex node, enable **Use n8n Credentials** and select that credential

| Credential field | JSON field from setup node |
| ---------------- | -------------------------- |
| Access Token     | `accessToken`              |
| Refresh Token    | `refreshToken`             |
| ID Token         | `idToken`                  |
| Account ID       | `accountId`                |
| Expires At       | `expiresAt`                |

### Connect Codex to this n8n instance

This is separate from the ChatGPT/Codex login above. It authorizes Codex to manage the n8n instance itself.

1. In n8n, open **Settings → n8n API** and create an API key with workflow and Data Table scopes.
2. Create **Credentials → ProDex N8N API**.
3. Set **n8n Base URL** to a URL reachable from the executing n8n process or worker. For a single-container install, `http://127.0.0.1:5678` is usually correct. In queue mode, use the main n8n service URL.
4. Paste the API key.
5. Optional: run **ProDex Setup → Test N8N Management Connection**.
6. Select the same credential on **ProDex** or **ProDex Chat Model**.

After selection, ProDex automatically:

- creates a persistent n8n-as-code workspace under `{codexHome}/n8n-as-code`;
- supplies the API key to the current process without writing it to `n8nac-config.json`;
- exposes `n8nac` for workflow management;
- exposes `n8n-data-tables` for native Data Tables management;
- switches the Codex run to `danger-full-access` so local n8n networking works and bubblewrap (`bwrap`) is not started.

The Full Access switch is intentional. In many Docker deployments, Codex `read-only` and `workspace-write` modes need unprivileged Linux namespaces, which causes `bwrap: No permissions to create a new namespace`. Only enable the n8n management credential on a trusted self-hosted instance.

---

## Use with n8n AI Agent (Chat Model)

Connect **ProDex Chat Model** to the **Chat Model** input on the **AI Agent** node:

1. Complete setup (Start Device Login → Wait for Login Complete)
2. Add **When chat message received** (or any trigger) → **AI Agent**
3. Add **ProDex Chat Model** as a separate node on the canvas
4. Connect **ProDex Chat Model → Model** to **AI Agent → Chat Model**
5. Execute and chat

Example layout:

```
When chat message received → AI Agent
ProDex Chat Model ──────→ Chat Model (on AI Agent)
```

**Notes:**

- Credentials are optional when `auth.json` is already on the server
- Tool nodes connected to AI Agent have limited support — Codex returns text responses, not native LangChain tool-call payloads. For full coding-agent behavior (sandbox, shell, multi-file edits), use the standalone **ProDex** node
- Default sandbox is **Read Only** for safer chat use

---

## n8n-as-code and skills

Skills are stored as `SKILL.md` files under `{codexHome}/skills/{skill-name}/` (Cursor/Codex-compatible format).

The package pins the published [`n8nac` CLI](https://github.com/EtienneLescot/n8n-as-code/tree/main/packages/cli) as a runtime dependency. Its executable directory is prepended to `PATH` for Codex, so the agent can run `n8nac` without downloading it at execution time.

ProDex also writes stable launchers for `n8nac` and `n8n-data-tables` under `{codexHome}/bin`. This avoids depending on npm's `.bin` symlinks, which may be omitted or hidden by some n8n community-node installation layouts. Every Codex process also receives their absolute paths as `N8NAC_CMD` and `N8N_DATA_TABLES_CMD`; most importantly, the system prompt and preinstalled skill embed the exact absolute executable paths and never rely on `PATH`. The agent is explicitly forbidden from using the much slower `npx --yes n8nac` fallback.

The [`n8n-architect` skill](https://github.com/EtienneLescot/n8n-as-code/tree/main/skills) is copied from the installed n8n-as-code package into `codexHome/skills` automatically. It is refreshed when the packaged source changes and is selected by default in both **ProDex** and **ProDex Chat Model**.

### Install a skill

Use **ProDex** → **Install Skill** to install another skill from GitHub via `npx skills add`.

1. **ProDex** → **Install Skill**
2. Set a repository URL and **Skill Name** (the default points to n8n-as-code / `n8n-architect`)
3. Execute

### List installed skills

**ProDex** → **List Installed Skills** — returns `skillNames` you can copy into the ProDex node.

### Use skills in ProDex

| Field              | Purpose                                                                   |
| ------------------ | ------------------------------------------------------------------------- |
| **System Prompt**  | Static instructions on every run                                          |
| **Skills**         | Installed skills always loaded; `n8n-architect` is selected by default    |
| **Dynamic Skills** | Expression per item — default `={{ $json.skillNames \|\| $json.skills }}` |

Dynamic skills accept:

- Skill names: `"release-notes"` or `["a", "b"]`
- Inline markdown: full SKILL.md text for one-off runs
- Objects: `[{ "name": "temp", "content": "..." }]`

Output includes `appliedSkills` so you can verify what was loaded.

### Workflow and Data Tables commands

With a **ProDex N8N API** credential selected, Codex can use:

```bash
n8nac env status --json
n8nac list --remote --json
n8nac pull WORKFLOW_ID
n8nac push workflows/example.ts

n8n-data-tables data-tables list
n8n-data-tables data-tables create --name Leads --columns '[{"name":"email","type":"string"}]'
n8n-data-tables data-tables columns create TABLE_ID --name score --type number
n8n-data-tables data-tables rows list TABLE_ID --limit 100
n8n-data-tables data-tables rows upsert TABLE_ID --filter '{"type":"and","filters":[{"columnName":"email","condition":"eq","value":"a@example.com"}]}' --data '{"email":"a@example.com","score":10}' --return-data
```

Run `n8n-data-tables --help` for the complete command list. Destructive table, column, clear, and row-delete operations require `--force`; row update/upsert/delete also support `--dry-run` where the n8n API provides it.

---

## Usage

1. Add **ProDex** to your workflow
2. Complete **ProDex Setup** once (device login) — credentials are **not** required by default
3. Leave **Use n8n Credentials** off unless you exported tokens to n8n Credentials on purpose
4. Set prompt (default expression reads `chatInput`, `prompt`, or `text`)
5. Choose model, reasoning effort, sandbox, and thread mode
6. Execute

The Codex reasoning values exposed by both nodes are `none`, `minimal`, `low`, `medium`, `high`, and `xhigh`. `max` and `ultra` are not CLI thread-option values, so they are intentionally not offered here.

The default agent timeout is **600 seconds (10 minutes)**. Longer investigations can use `900` or `1200` seconds under **Options → Timeout (Seconds)**. If the limit is reached, ProDex returns an actionable timeout message instead of the generic `AbortError: The operation was aborted`.

### Output fields

```json
{
  "output": "Agent final response",
  "threadId": "thread_...",
  "items": [],
  "usage": { "inputTokens": 0, "outputTokens": 0, "totalTokens": 0 },
  "model": "gpt-5.6-sol",
  "finishReason": "stop"
}
```

### Thread modes

- **New Thread**: starts fresh each run
- **Continue Previous Thread**: reuses `threadId` stored in node static data
- **Resume Thread By ID**: resumes explicit thread ID (Codex sessions under the n8n-managed Codex home directory)

---

## Manual E2E test

1. Install the node on a self-hosted n8n instance
2. Run **ProDex Setup → Start Device Login**, complete browser auth, then **Export Credential Values**
3. Create the **ProDex Auth API** credential from the exported JSON
4. Build workflow: **Manual Trigger** → **ProDex** → **Set**
5. Prompt: `Reply with the single word OK.`
6. Model: `gpt-5.6-sol`, Sandbox: `Read Only`, Thread Mode: `New Thread`
7. Execute and verify `output` contains `OK` and `threadId` is populated

---

## Development

```bash
npm install
npm run build
npm test
npm run lint
```

---

## Docker example

Build a custom n8n image with Codex preinstalled:

```bash
docker build -f docker/Dockerfile.n8n-codex -t n8n-codex .
docker run -p 5678:5678 -e N8N_CUSTOM_EXTENSIONS=/custom-nodes n8n-codex
```

Codex runtime files, managed CLI versions, and preinstalled skills are stored automatically under n8n's user folder (for example `/home/node/.n8n/codex` in the official Docker image). Mount that folder as a persistent volume if runtime updates and login should survive container replacement.

---

## Security notes

- Treat credential tokens like passwords
- Prefer `read_only` sandbox on shared servers
- Selecting **ProDex N8N API** intentionally enables Full Access for that Codex run; use a least-privilege scoped n8n API key
- The n8n API key is stored by n8n Credentials and never written into `n8nac-config.json`, but it is available to the Codex child process because both CLIs need it
- n8n Chat Hub title generation currently recognizes a hard-coded set of built-in model node type names. A ProDex Chat Model can answer the chat normally, but n8n may log `No supported Model nodes found in workflow for title generation`; this is an upstream n8n limitation and does not indicate a failed ProDex response
- Do not set `OPENAI_API_KEY` in n8n if you want subscription billing; it can override ChatGPT auth in some Codex versions

---

## License

MIT

---

<div align="center">

**[💼 nils.proday.in](https://nils.proday.in)** · **[🌐 prodex.proday.in](https://prodex.proday.in)** · [GitHub](https://github.com/artNcraft/n8n-nodes-prodex) · [npm](https://www.npmjs.com/package/n8n-nodes-prodex)

<br />

Built with care by **[Nils](https://nils.proday.in)**

</div>
