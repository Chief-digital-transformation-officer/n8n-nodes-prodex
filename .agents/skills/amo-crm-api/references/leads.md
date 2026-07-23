# Leads (сделки)

Deals — the main sales entity. Always belong to a pipeline at a status, may
have linked contacts and one company, may carry custom fields and tags.

Read [conventions.md](conventions.md) first for filters, pagination, and
custom_fields_values format.

## Endpoints

| Method | Path | Body |
|---|---|---|
| `GET` | `/api/v4/leads` | — |
| `GET` | `/api/v4/leads/{id}` | — |
| `POST` | `/api/v4/leads` | array of lead objects |
| `POST` | `/api/v4/leads/complex` | array — creates lead + contact + company in one call |
| `PATCH` | `/api/v4/leads` | array (bulk update by id) |
| `PATCH` | `/api/v4/leads/{id}` | object (single update) |
| `POST` | `/api/v4/leads/{id}/link` | array of links |
| `POST` | `/api/v4/leads/{id}/unlink` | array of links |
| `GET` | `/api/v4/leads/pipelines` | — (see [dictionaries.md](dictionaries.md)) |

## Lead object shape

```json
{
  "id": 12345,
  "name": "Deal name",
  "price": 100000,
  "responsible_user_id": 42,
  "pipeline_id": 123,
  "status_id": 456,
  "loss_reason_id": null,
  "created_at": 1714521600,
  "updated_at": 1714608000,
  "closed_at": null,
  "is_deleted": false,
  "custom_fields_values": [...],
  "_embedded": {
    "tags": [{"id": 1, "name": "vip"}],
    "contacts": [{"id": 7777, "is_main": true}],
    "companies": [{"id": 8888}]
  }
}
```

## Listing with filters and `with`

`with` values: `contacts`, `catalog_elements`, `is_price_modified_by_robot`,
`loss_reason`, `only_deleted`.

```bash
python scripts/api_call.py --method GET --url "/api/v4/leads" --params '{
  "with":"contacts,companies",
  "filter[statuses][0][pipeline_id]":"123",
  "filter[statuses][0][status_id]":"456",
  "filter[updated_at][from]":"1714521600",
  "limit":"100",
  "order[updated_at]":"desc"
}'
```

## Get single lead

```bash
python scripts/api_call.py --method GET --url "/api/v4/leads/12345" \
  --params '{"with":"contacts,companies,catalog_elements,loss_reason"}'
```

## Create a single lead

Body MUST be an array.

```bash
python scripts/api_call.py --method POST --url "/api/v4/leads" --body '[
  {
    "name": "Deal: Ivanov website redesign",
    "price": 250000,
    "pipeline_id": 123,
    "status_id": 456,
    "responsible_user_id": 42,
    "custom_fields_values": [
      {"field_id": 7777, "values": [{"value": "Source: webform"}]}
    ]
  }
]'
```

## Create with linked contact + company in ONE call (`/leads/complex`)

This is the cleanest way to onboard a new prospect. amoCRM creates the lead,
contact, and company atomically and returns all three IDs.

```bash
python scripts/api_call.py --method POST --url "/api/v4/leads/complex" --body '[
  {
    "name": "Deal: Ivanov inquiry",
    "price": 100000,
    "pipeline_id": 123,
    "status_id": 456,
    "_embedded": {
      "contacts": [
        {
          "name": "Иван Иванов",
          "custom_fields_values": [
            {"field_code": "PHONE", "values": [{"value": "+79991234567", "enum_code": "WORK"}]},
            {"field_code": "EMAIL", "values": [{"value": "ivanov@example.com", "enum_code": "WORK"}]}
          ]
        }
      ],
      "companies": [{"name": "ООО Ромашка"}]
    }
  }
]'
```

The response body is an array of objects with `id` (lead), `contact_id`,
`company_id`, and `request_id` (echo of what you sent).

## Update a single lead

```bash
# Move to a different status
python scripts/api_call.py --method PATCH --url "/api/v4/leads/12345" \
  --body '{"status_id": 142}'

# Mark as lost (status 143 + loss_reason)
python scripts/api_call.py --method PATCH --url "/api/v4/leads/12345" \
  --body '{"status_id": 143, "loss_reason_id": 99}'

# Update price + custom field
python scripts/api_call.py --method PATCH --url "/api/v4/leads/12345" --body '{
  "price": 300000,
  "custom_fields_values": [{"field_id": 7777, "values": [{"value": "Updated source"}]}]
}'
```

System statuses: `142` = Successful, `143` = Lost. They live in every pipeline.

## Bulk update

```bash
python scripts/api_call.py --method PATCH --url "/api/v4/leads" --body '[
  {"id": 12345, "status_id": 142},
  {"id": 12346, "status_id": 143, "loss_reason_id": 99}
]'
```

## Linking contacts and companies after creation

```bash
# Link an existing contact to a lead
python scripts/api_call.py --method POST --url "/api/v4/leads/12345/link" --body '[
  {"to_entity_id": 7777, "to_entity_type": "contacts", "metadata": {"is_main": true}}
]'

# Link a company
python scripts/api_call.py --method POST --url "/api/v4/leads/12345/link" --body '[
  {"to_entity_id": 8888, "to_entity_type": "companies"}
]'

# Unlink
python scripts/api_call.py --method POST --url "/api/v4/leads/12345/unlink" --body '[
  {"to_entity_id": 7777, "to_entity_type": "contacts"}
]'
```

A lead can have many contacts but only one main contact and one company.
