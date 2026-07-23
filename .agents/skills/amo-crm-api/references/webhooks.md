# Webhook subscription management

> **Important: this file covers SUBSCRIPTION MANAGEMENT only.** It teaches
> the agent to register, list, and unregister webhook destinations through
> amoCRM REST API. To actually RECEIVE webhook events you need a separate
> public HTTPS server that accepts POSTs from amoCRM — that is not part of
> this skill, and the skill cannot deliver it.

Read [conventions.md](conventions.md) first.

## Endpoints

| Method | Path | Body |
|---|---|---|
| `GET` | `/api/v4/webhooks` | — |
| `POST` | `/api/v4/webhooks` | `{"destination": "...", "settings": [...]}` |
| `DELETE` | `/api/v4/webhooks` | `{"destination": "..."}` |

Note: `DELETE` carries a body (uncommon for HTTP). `api_call.py` handles it via
`--method DELETE --body '...'`.

## List current subscriptions

```bash
python scripts/api_call.py --method GET --url "/api/v4/webhooks"
```

Response shape:

```json
{
  "_total_items": 2,
  "_embedded": {
    "webhooks": [
      {
        "id": 100500,
        "destination": "https://my-bot.example.com/amo-hook",
        "created_at": 1714521600,
        "updated_at": 1714521600,
        "created_by": 42,
        "sort": 1,
        "disabled": false,
        "settings": ["add_lead", "status_lead"]
      }
    ]
  }
}
```

## Subscribe a URL to events

```bash
python scripts/api_call.py --method POST --url "/api/v4/webhooks" --body '{
  "destination": "https://my-bot.example.com/amo-hook",
  "settings": ["add_lead", "status_lead", "add_contact"]
}'
```

Constraints:
- `destination` MUST be HTTPS.
- The URL must be publicly reachable; amoCRM ping-tests on subscribe.
- `settings` is a flat array of event keys.
- Requires account-admin rights; an account holds at most **100 webhooks**.
- If a webhook with the same `destination` already exists, POST **updates it
  in place** with the new `settings` — no need to DELETE first.

## Available events (`settings[]`)

Event names follow the `<action>_<entity>` convention.

### Leads
- `add_lead`
- `update_lead`
- `delete_lead`
- `restore_lead`
- `status_lead` — status or pipeline changed
- `responsible_lead`

### Contacts
- `add_contact`
- `update_contact`
- `delete_contact`
- `restore_contact`
- `responsible_contact`

### Companies
- `add_company`
- `update_company`
- `delete_company`
- `restore_company`
- `responsible_company`

### Customers (only if customers are enabled in the account)
- `add_customer`
- `update_customer`
- `delete_customer`
- `responsible_customer`

(There is no `restore_customer` or `status_customer` in the official list.)

### Tasks
- `add_task`
- `update_task`
- `delete_task`
- `responsible_task`

### Notes (created on entity)
- `note_lead`
- `note_contact`
- `note_company`
- `note_customer`

### Talks (беседы)
- `add_talk`
- `update_talk`

### Misc
- `add_chat_template_review` — WhatsApp template sent for approval

If an event isn't supported on your account plan, the subscription is silently
ignored for that key but other keys still register.

## Unsubscribe

```bash
python scripts/api_call.py --method DELETE --url "/api/v4/webhooks" --body '{
  "destination": "https://my-bot.example.com/amo-hook"
}'
```

The whole destination is removed — there's no per-event unsubscribe.

## Common workflow: change the event set for a destination

POST with an existing `destination` replaces its `settings`, so a single call
is enough:

```bash
python scripts/api_call.py --method POST --url "/api/v4/webhooks" --body '{
  "destination": "https://my-bot.example.com/amo-hook",
  "settings": ["add_lead", "status_lead", "add_task", "update_task"]
}'
```
