# Dictionaries — pipelines, users, custom fields, tags, task types

Look up these IDs BEFORE creating or updating entities. They rarely change
between requests, so cache the result for the session.

## Pipelines and statuses

```bash
# All pipelines (each comes with its statuses inside _embedded)
python scripts/api_call.py --method GET --url "/api/v4/leads/pipelines"

# Statuses of one pipeline
python scripts/api_call.py --method GET --url "/api/v4/leads/pipelines/123/statuses"
```

Pipeline object:

```json
{
  "id": 123,
  "name": "Main pipeline",
  "is_main": true,
  "is_unsorted_on": false,
  "is_archive": false,
  "_embedded": {
    "statuses": [
      {"id": 12001, "name": "New",  "color": "#fffeb2", "type": 0},
      {"id": 142,   "name": "Won",  "color": "#CCFF66", "type": 1},
      {"id": 143,   "name": "Lost", "color": "#D5D8DB", "type": 2}
    ]
  }
}
```

System statuses are present in every pipeline:

| `status_id` | Meaning |
|---|---|
| 142 | Successful (won) |
| 143 | Closed and unsuccessful (lost) — requires `loss_reason_id` |

Won/lost are determined by the **fixed `status_id` 142 / 143**, not by the
`type` field. The `type` field marks special inbox states: `1` = "Неразобранное"
(unsorted inbox), `0` = regular working status (this includes 142/143 in
practice). Always identify won/lost by `status_id == 142` / `status_id == 143`.

## Users

```bash
python scripts/api_call.py --method GET --url "/api/v4/users"
```

User object:

```json
{
  "id": 42,
  "name": "Иван Менеджер",
  "email": "ivan@company.com",
  "lang": "ru",
  "rights": {"is_admin": false, "is_free": false, "is_active": true}
}
```

Use `id` as `responsible_user_id` when creating leads, contacts, tasks.

## Custom fields

Each entity type has its own set of custom fields:

```bash
python scripts/api_call.py --method GET --url "/api/v4/leads/custom_fields"
python scripts/api_call.py --method GET --url "/api/v4/contacts/custom_fields"
python scripts/api_call.py --method GET --url "/api/v4/companies/custom_fields"
python scripts/api_call.py --method GET --url "/api/v4/customers/custom_fields"
```

Custom field object:

```json
{
  "id": 7777,
  "name": "Source",
  "type": "select",
  "code": null,
  "sort": 510,
  "is_api_only": false,
  "enums": [
    {"id": 100, "value": "Webform", "sort": 1},
    {"id": 101, "value": "Phone",   "sort": 2}
  ],
  "is_required": false
}
```

Field types and what to send when writing:

| `type` | Write format |
|---|---|
| `text`, `textarea` | `[{"value": "string"}]` |
| `numeric` | `[{"value": 42}]` |
| `checkbox` | `[{"value": true}]` |
| `select`, `radiobutton` | `[{"enum_id": 100}]` (or `enum_code` if defined) |
| `multiselect` | `[{"enum_id": 100}, {"enum_id": 101}]` |
| `date`, `birthday` | `[{"value": 1714521600}]` (Unix) |
| `url` | `[{"value": "https://..."}]` |
| `monetary` | `[{"value": "100000"}]` |
| `multitext` (PHONE/EMAIL) | `[{"value": "...", "enum_code": "WORK"}]` |
| `tracking_data` | system-managed; usually read-only |

System multitext fields use `field_code` instead of `field_id`:

| `field_code` | On |
|---|---|
| `PHONE` | contacts, companies, customers |
| `EMAIL` | contacts, companies, customers |
| `IM` | contacts |
| `POSITION` | contacts |
| `WEB` | companies |

`enum_code` for PHONE/EMAIL: `WORK`, `MOB`, `WORKDD`, `WORKFAX`, `FAX`,
`HOME`, `OTHER`, `WORKPHONE`.

## Tags

Tags are per-entity-type. List existing or create new ones.

```bash
# List
python scripts/api_call.py --method GET --url "/api/v4/leads/tags"

# Create new tags
python scripts/api_call.py --method POST --url "/api/v4/leads/tags" --body '[
  {"name": "vip"},
  {"name": "urgent"}
]'
```

Apply tags to a lead via the lead PATCH:

```bash
python scripts/api_call.py --method PATCH --url "/api/v4/leads/12345" --body '{
  "_embedded": {"tags": [{"id": 1}, {"id": 2}]}
}'
```

To remove all tags, send `{"_embedded": {"tags": []}}`. Sending a partial list
replaces the whole set — there's no "add one tag" semantics.

Same pattern for contacts and companies (`/contacts/tags`, `/companies/tags`).

## Task types

```bash
python scripts/api_call.py --method GET --url "/api/v4/account?with=task_types"
```

Returns the account object with `_embedded.task_types[]`. Built-in IDs 1, 2, 3
(Связаться/Встреча/Письмо) are always present; 4+ are custom per account.
