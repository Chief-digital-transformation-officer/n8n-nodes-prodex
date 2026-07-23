---
name: amo-crm-api
description: Manage amoCRM via REST API v4 — create, search, update leads, contacts, companies, tasks, and notes. Use when the user asks about CRM, sales, deals, customers, or amoCRM.
metadata: {"author":"MissiaL","version":"0.1.2","keywords":["amocrm","crm","sales","leads","contacts","tasks"]}
---

# amo-crm-api

Full CRUD over amoCRM REST API v4 — leads, contacts, companies, tasks, notes,
plus dictionary lookups (pipelines, users, custom fields, tags) and webhook
subscription management.

## Setup

Two environment variables are required:

| Var | Example | Where to get it |
|---|---|---|
| `AMOCRM_SUBDOMAIN` | `mycompany` | The part before `.amocrm.ru` in your account URL |
| `AMOCRM_TOKEN` | `eyJ0eXAi...` | Long-lived token from Settings → Integrations → Create internal integration → Long-lived token |

Sanity-check the setup:

```bash
python scripts/api_call.py --method GET --url "/api/v4/account"
```

A 200 with the account JSON means you're set. A 401 means the token is invalid
or expired.

## HTTP client

All requests go through `scripts/api_call.py`. The script signs every request
with `Authorization: Bearer ${AMOCRM_TOKEN}`, prefixes relative URLs with
`https://${AMOCRM_SUBDOMAIN}.amocrm.ru`, and sends bodies as JSON.

```bash
# GET
python scripts/api_call.py --method GET --url "/api/v4/leads" --params '{"limit":"50"}'

# POST (body is a JSON array even for one object!)
python scripts/api_call.py --method POST --url "/api/v4/leads" \
  --body '[{"name":"Ivanov deal","price":100000}]'

# PATCH single (body is an object)
python scripts/api_call.py --method PATCH --url "/api/v4/leads/12345" \
  --body '{"status_id":42}'

# PATCH bulk (body is an array)
python scripts/api_call.py --method PATCH --url "/api/v4/leads" \
  --body '[{"id":12345,"status_id":42},{"id":12346,"status_id":143}]'
```

`--params`, `--body`, and `--headers` MUST be valid JSON. Don't pass query
strings like `a=1&b=2`. Don't pass form-encoded bodies.

## References map

Load only what you need for the current request:

| File | When to read |
|---|---|
| [references/conventions.md](references/conventions.md) | First, before any work — covers filters, pagination, response shape, error codes |
| [references/leads.md](references/leads.md) | When working with deals (sделки) |
| [references/contacts-companies.md](references/contacts-companies.md) | When working with contacts or companies |
| [references/tasks-notes.md](references/tasks-notes.md) | When creating/closing tasks or adding notes |
| [references/dictionaries.md](references/dictionaries.md) | Before creating/updating entities — to look up pipeline IDs, user IDs, custom field IDs, tag IDs |
| [references/webhooks.md](references/webhooks.md) | When subscribing/unsubscribing a URL to amoCRM events |

## Common workflows

### 1. Create a deal with a new contact

```
1. GET /api/v4/leads/pipelines  → pick pipeline_id and status_id
2. GET /api/v4/users            → pick responsible_user_id
3. POST /api/v4/leads/complex   → creates the lead, contact, and company in one call
```

### 2. Find a customer's deals by name or phone

```
1. GET /api/v4/contacts?filter[query]=Иванов  → find contact_id
2. GET /api/v4/leads?filter[contact_id][]=...  (or use ?with=contacts on /leads)
```

### 3. Move a deal to a different status

```
1. GET /api/v4/leads/pipelines/{pipeline_id}/statuses → confirm target status_id
2. PATCH /api/v4/leads/{lead_id}  with body {"status_id": <new>}
```

### 4. Set and close a task

```
1. POST /api/v4/tasks  body: [{"entity_type":"leads","entity_id":<lead_id>,"text":"...","complete_till":<unix>}]
2. PATCH /api/v4/tasks/{task_id}  body: {"is_completed": true, "result": {"text": "done"}}
```

## Rules

- **All requests through `scripts/api_call.py`** — never invoke `curl` directly.
  The script handles auth, encoding, and error classification for you.
- **Read `references/dictionaries.md` BEFORE creating or updating** entities
  with custom fields, status, pipeline, or responsible user. You need real IDs.
- **amoCRM responses always nest items under `_embedded`** —
  `data["_embedded"]["leads"]`, `data["_embedded"]["contacts"]`, etc. Don't
  guess a different shape.
- **POST bodies are arrays.** Even when creating a single lead, contact,
  company, or task, the body is `[{...}]`. PATCH for a single entity by ID
  (`PATCH /api/v4/leads/{id}`) takes an object; bulk PATCH (`PATCH /api/v4/leads`) takes an array.
- **Phone and email are NOT first-class fields** on contacts/companies — they
  live inside `custom_fields_values` with `field_code: "PHONE"` and
  `field_code: "EMAIL"`. See `references/contacts-companies.md`.
- **On 401, ask the user to refresh `AMOCRM_TOKEN`.** Don't pretend the bot
  can fix it. The token has likely expired or was revoked.
- **On 429, wait the number of seconds in the error message** before retrying.
  amoCRM allows ~7 requests per second per integration.
- **Pagination: `limit` max is 250, default 250.** Use `page=2,3,...` to walk
  results. The response includes `_links.next.href` when more pages exist.
- **Never expose `AMOCRM_TOKEN`** to the user, in logs, or in messages. The
  script already redacts it from output.
