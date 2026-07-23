# amoCRM API conventions

Read this file ONCE before any other reference. It covers the rules that apply
to every endpoint — auth, pagination, filters, response shape, errors,
rate limits.

## Base URL and auth

All endpoints live under `https://<subdomain>.amocrm.ru/api/v4/...`. Every
request needs `Authorization: Bearer <long-lived-token>`. The HTTP client
(`scripts/api_call.py`) adds both the prefix and the header automatically when
you pass a relative URL like `/api/v4/leads`.

## Response shape

All list endpoints return:

```json
{
  "_page": 1,
  "_links": {
    "self":  { "href": "https://demo.amocrm.ru/api/v4/leads?limit=250&page=1" },
    "next":  { "href": "https://demo.amocrm.ru/api/v4/leads?limit=250&page=2" }
  },
  "_embedded": {
    "leads": [ {...}, {...}, ... ]
  }
}
```

The actual items are always at `data["_embedded"]["<entity>"]`. The presence of
`_links.next` means more pages exist.

For single-entity endpoints (`GET /leads/{id}`) you get the entity object
directly, with related data at `data["_embedded"]` (contacts, tags, etc.).

204 No Content is returned for some DELETE endpoints — `api_call.py` exits 0
with empty stdout.

## Pagination

| Param | Range | Default |
|---|---|---|
| `limit` | 1–250 | 250 |
| `page`  | 1+    | 1 |

Walk results by reading `_links.next.href` and incrementing `page` until
`_links.next` is missing.

## Filters

Filters use bracket-key syntax. Pass them as a JSON object to `--params`;
`api_call.py` URL-encodes them correctly via `urlencode(doseq=True)`.

| Filter | Example value | Notes |
|---|---|---|
| `filter[query]` | `"Иванов"` | Full-text across all searchable fields |
| `filter[name]` | `"ООО Ромашка"` | Exact match on name |
| `filter[id][]` | `["123","456"]` | Array of IDs |
| `filter[updated_at][from]` | `"1714521600"` | Unix timestamp |
| `filter[updated_at][to]` | `"1714608000"` | Unix timestamp |
| `filter[created_at][from]` | `"1714521600"` | Unix timestamp |
| `filter[statuses][N][pipeline_id]` | `"123"` | Pair with `[status_id]` for the same N |
| `filter[statuses][N][status_id]`   | `"456"` | |
| `filter[custom_fields_values][N][field_id]` | `"7777"` | Pair with `[values][0][value]` |
| `filter[custom_fields_values][N][values][0][value]` | `"+79991234567"` | |
| `filter[responsible_user_id]` | `"42"` | |
| `filter[pipeline_id]` | `"123"` | Without status — all statuses in pipeline |

Example — find Cyrillic name within a pipeline:

```bash
python scripts/api_call.py --method GET --url "/api/v4/leads" --params '{
  "filter[query]":"Иванов",
  "filter[statuses][0][pipeline_id]":"123",
  "filter[statuses][0][status_id]":"456",
  "limit":"50"
}'
```

## Sorting

Use `order[<field>]=desc|asc`:

```json
{"order[updated_at]":"desc","order[id]":"asc"}
```

Common fields: `updated_at`, `created_at`, `id`. Per-entity extras documented
in their reference files.

## Expanding related entities (`with=`)

Pass `with` as a CSV string (NOT an array):

```json
{"with":"contacts,companies,catalog_elements"}
```

Available `with` values are entity-specific — see each reference file.

## custom_fields_values format

This is THE shape for reading and writing custom fields on any entity.

**Reading** — every entity object has:

```json
"custom_fields_values": [
  {
    "field_id": 7777,
    "field_name": "Телефон",
    "field_code": "PHONE",
    "field_type": "multitext",
    "values": [{"value": "+79991234567", "enum_code": "WORK", "enum_id": 100}]
  }
]
```

**Writing** — pass the same shape inside the entity body. You only need
`field_id` (or `field_code` for system fields like `PHONE`/`EMAIL`):

```json
{
  "custom_fields_values": [
    {"field_id": 7777, "values": [{"value": "+79991234567"}]},
    {"field_code": "EMAIL", "values": [{"value": "ivanov@example.com", "enum_code": "WORK"}]}
  ]
}
```

For SELECT/MULTISELECT fields, pass `enum_id`:

```json
{"field_id": 8888, "values": [{"enum_id": 12345}]}
```

For DATE fields, pass Unix timestamp.

## Errors

| Status | Meaning | What to do |
|---|---|---|
| 400 | Validation error — body has `validation-errors[]` | Fix the request payload |
| 401 | Token invalid / expired | Ask user to refresh `AMOCRM_TOKEN` |
| 403 | Token has no permission | Check integration scopes in amoCRM |
| 404 | Resource not found | Verify the ID exists |
| 429 | Rate limit hit | Wait `Retry-After` seconds |
| 5xx | Server-side issue | Retry after a short pause |

400 example body:

```json
{
  "validation-errors": [
    {"request_id": "0", "errors": [{"code": "RequiredFilled", "path": "name", "detail": "Field is required"}]}
  ]
}
```

## Rate limits

amoCRM allows **7 requests per second per integration** and up to **50 rps for
the whole account**. The 429 response carries a `Retry-After` header in
seconds. `api_call.py` surfaces it in the error message — wait, then retry the
same call. Repeated violations get the account blocked: every API call then
returns 403 — so back off honestly instead of hammering.

Bulk create/update requests accept at most **250 entities per request**;
amoCRM recommends ≤50 for reliability. On a 504, reduce the batch size and
retry.

## Idempotency for creation

When creating multiple entities in a single POST, you can include
`request_id` in each item. amoCRM echoes it back in the response — useful for
matching response items to your input order, especially when some fail.

```json
[
  {"request_id": "client-1", "name": "Lead 1"},
  {"request_id": "client-2", "name": "Lead 2"}
]
```

## A note on POST bodies

Every POST that creates entities expects an array, even for a single object.
This catches new users every time:

```bash
# Wrong — 400 Bad Request
--body '{"name":"Test"}'

# Right
--body '[{"name":"Test"}]'
```

PATCH on a single entity by ID (`PATCH /leads/{id}`) takes an object. Bulk
PATCH (`PATCH /leads`) takes an array.
