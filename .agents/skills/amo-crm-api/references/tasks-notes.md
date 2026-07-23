# Tasks and notes

Both attach to a parent entity (lead, contact, company, customer). Tasks have
a deadline; notes are timeline events.

Read [conventions.md](conventions.md) first.

## Tasks

### Endpoints

| Method | Path |
|---|---|
| `GET` | `/api/v4/tasks` |
| `GET` | `/api/v4/tasks/{id}` |
| `POST` | `/api/v4/tasks` (array) |
| `PATCH` | `/api/v4/tasks/{id}` (object) |
| `PATCH` | `/api/v4/tasks` (array, bulk) |
| `DELETE` | `/api/v4/tasks/{id}` |

### Task object shape

```json
{
  "id": 555,
  "entity_type": "leads",
  "entity_id": 12345,
  "task_type_id": 1,
  "text": "Call back about the proposal",
  "complete_till": 1714694400,
  "is_completed": false,
  "responsible_user_id": 42,
  "result": null,
  "created_at": 1714521600,
  "updated_at": 1714521600
}
```

### Built-in task types

| `task_type_id` | Meaning |
|---|---|
| 1 | Связаться (call/contact) |
| 2 | Встреча (meeting) |
| 3 | Письмо (email) |

Custom types: see [dictionaries.md](dictionaries.md) — `GET /api/v4/account?with=task_types`.

### Create a task

`complete_till` is a Unix timestamp (seconds). amoCRM rounds it to the nearest
30-minute slot for built-in types, except `task_type_id: 4+` (custom).

```bash
python scripts/api_call.py --method POST --url "/api/v4/tasks" --body '[
  {
    "entity_type": "leads",
    "entity_id": 12345,
    "task_type_id": 1,
    "text": "Call Ivanov to confirm the meeting",
    "complete_till": 1714694400,
    "responsible_user_id": 42
  }
]'
```

### List tasks

```bash
# All open tasks for one user
python scripts/api_call.py --method GET --url "/api/v4/tasks" --params '{
  "filter[responsible_user_id]": "42",
  "filter[is_completed]": "0"
}'

# Tasks attached to a specific lead
python scripts/api_call.py --method GET --url "/api/v4/tasks" --params '{
  "filter[entity_type]": "leads",
  "filter[entity_id]": "12345"
}'

# Tasks due today
python scripts/api_call.py --method GET --url "/api/v4/tasks" --params '{
  "filter[is_completed]": "0",
  "filter[updated_at][from]": "1714521600",
  "filter[updated_at][to]": "1714608000"
}'
```

### Close a task

```bash
python scripts/api_call.py --method PATCH --url "/api/v4/tasks/555" --body '{
  "is_completed": true,
  "result": {"text": "Called, agreed to meet on Friday"}
}'
```

The `result.text` field is required by amoCRM when closing a task — don't omit
it. Even an empty string works, but a one-line summary is what the UI shows.

## Notes

Notes are typed timeline entries on an entity. Common types are free text;
others (calls, attachments) carry structured `params`.

### Endpoints

| Method | Path |
|---|---|
| `GET` | `/api/v4/{entity}/{id}/notes` |
| `GET` | `/api/v4/{entity}/notes` (across all entities of a type) |
| `POST` | `/api/v4/{entity}/{id}/notes` |
| `PATCH` | `/api/v4/{entity}/{id}/notes/{note_id}` |
| `DELETE` | `/api/v4/{entity}/{id}/notes/{note_id}` |

`{entity}` is one of `leads`, `contacts`, `companies`, `customers`.

### Note types

| `note_type` | Used for | `params` shape |
|---|---|---|
| `common` | Free text | `{"text": "..."}` |
| `call_in` | Inbound call log | `{"phone": "...", "duration": 120, "source": "asterisk"}` |
| `call_out` | Outbound call log | same as above |
| `service_message` | System log | `{"text": "..."}` |
| `extended_service_message` | System with formatting | `{"text": "...", "service": "..."}` |
| `attachment` | File link | `{"file_uuid": "...", "version_uuid": "...", "file_name": "..."}` |
| `geolocation` | Coordinates | `{"address": "...", "latitude": ..., "longitude": ...}` |

### Add a free-text note

```bash
python scripts/api_call.py --method POST --url "/api/v4/leads/12345/notes" --body '[
  {
    "note_type": "common",
    "params": {"text": "Customer asked to call back next week"}
  }
]'
```

### Log a call

```bash
python scripts/api_call.py --method POST --url "/api/v4/contacts/7777/notes" --body '[
  {
    "note_type": "call_in",
    "params": {
      "phone": "+79991234567",
      "duration": 180,
      "source": "manual"
    }
  }
]'
```

### List notes for an entity

```bash
python scripts/api_call.py --method GET --url "/api/v4/leads/12345/notes" \
  --params '{"limit":"50","order[updated_at]":"desc"}'
```
