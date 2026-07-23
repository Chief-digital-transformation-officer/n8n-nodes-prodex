# Contacts and companies

Both entities have nearly identical APIs. This file covers them together.

Read [conventions.md](conventions.md) first.

## Endpoints

| Method | Contacts | Companies |
|---|---|---|
| List | `GET /api/v4/contacts` | `GET /api/v4/companies` |
| Get one | `GET /api/v4/contacts/{id}` | `GET /api/v4/companies/{id}` |
| Create | `POST /api/v4/contacts` | `POST /api/v4/companies` |
| Update one | `PATCH /api/v4/contacts/{id}` | `PATCH /api/v4/companies/{id}` |
| Update bulk | `PATCH /api/v4/contacts` | `PATCH /api/v4/companies` |
| Link | `POST /api/v4/contacts/{id}/link` | `POST /api/v4/companies/{id}/link` |
| Unlink | `POST /api/v4/contacts/{id}/unlink` | `POST /api/v4/companies/{id}/unlink` |

## CRITICAL: phone and email are custom fields

This is the #1 trap with amoCRM. There is no `phone` or `email` property on a
contact. Both live inside `custom_fields_values` with `field_code: "PHONE"`
and `field_code: "EMAIL"`. They have built-in `enum_code` values: `WORK`,
`MOB`, `WORKDD`, `WORKFAX`, `FAX`, `HOME`, `OTHER`, `WORKPHONE`.

Set them on creation:

```bash
python scripts/api_call.py --method POST --url "/api/v4/contacts" --body '[
  {
    "name": "Иван Иванов",
    "first_name": "Иван",
    "last_name": "Иванов",
    "responsible_user_id": 42,
    "custom_fields_values": [
      {"field_code": "PHONE", "values": [{"value": "+79991234567", "enum_code": "WORK"}]},
      {"field_code": "EMAIL", "values": [{"value": "ivanov@example.com", "enum_code": "WORK"}]}
    ]
  }
]'
```

Find a contact by phone:

```bash
python scripts/api_call.py --method GET --url "/api/v4/contacts" --params '{
  "filter[custom_fields_values][0][field_code]": "PHONE",
  "filter[custom_fields_values][0][values][0][value]": "+79991234567"
}'
```

Or by exact full-text:

```bash
python scripts/api_call.py --method GET --url "/api/v4/contacts" \
  --params '{"filter[query]": "+79991234567"}'
```

`filter[query]` searches across phone, email, name, and any indexable custom
fields — easier but less precise.

## Contact object shape

```json
{
  "id": 7777,
  "name": "Иван Иванов",
  "first_name": "Иван",
  "last_name": "Иванов",
  "responsible_user_id": 42,
  "is_main_contact": true,
  "custom_fields_values": [
    {"field_code": "PHONE", "values": [{"value": "+79991234567", "enum_code": "WORK"}]}
  ],
  "_embedded": {
    "tags": [],
    "leads": [{"id": 12345}],
    "companies": [{"id": 8888}]
  }
}
```

## Company object shape

```json
{
  "id": 8888,
  "name": "ООО Ромашка",
  "responsible_user_id": 42,
  "custom_fields_values": [
    {"field_code": "PHONE", "values": [{"value": "+74951234567", "enum_code": "WORK"}]},
    {"field_code": "EMAIL", "values": [{"value": "info@romashka.ru"}]}
  ],
  "_embedded": {
    "tags": [],
    "contacts": [{"id": 7777}]
  }
}
```

## Listing with `with=`

Available `with` values: `leads`, `customers`, `catalog_elements`. (Companies
also expose `contacts` via `with`.)

```bash
python scripts/api_call.py --method GET --url "/api/v4/contacts" \
  --params '{"with":"leads,companies","limit":"100","order[updated_at]":"desc"}'
```

## Updating

```bash
python scripts/api_call.py --method PATCH --url "/api/v4/contacts/7777" --body '{
  "name": "Иван Сергеевич Иванов",
  "custom_fields_values": [
    {"field_code": "PHONE", "values": [{"value": "+79991111111", "enum_code": "MOB"}]}
  ]
}'
```

When updating `custom_fields_values`, you replace ALL values for the listed
fields. To keep an existing phone and add a new one, fetch the contact first,
merge, then PATCH.

## Linking a contact to a company

```bash
python scripts/api_call.py --method POST --url "/api/v4/contacts/7777/link" --body '[
  {"to_entity_id": 8888, "to_entity_type": "companies"}
]'
```

A contact has at most one main company; multiple companies can be linked, but
the first becomes main by default. (Companies, conversely, can have many
contacts.)

For linking contacts to LEADS — see [leads.md](leads.md).

## Detecting duplicates

amoCRM has a built-in dedupe check, but it's UI-side. Programmatically, search
by phone or email before creating:

```bash
# Try by exact phone first
python scripts/api_call.py --method GET --url "/api/v4/contacts" --params '{
  "filter[custom_fields_values][0][field_code]": "PHONE",
  "filter[custom_fields_values][0][values][0][value]": "+79991234567"
}'

# If empty, try by email
python scripts/api_call.py --method GET --url "/api/v4/contacts" --params '{
  "filter[custom_fields_values][0][field_code]": "EMAIL",
  "filter[custom_fields_values][0][values][0][value]": "ivanov@example.com"
}'
```

If `_embedded.contacts` is non-empty in either response, you have an existing
contact — link it to the new lead instead of creating a duplicate.
