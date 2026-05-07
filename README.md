# Finnish PRH Open Company Data API

REST wrapper over Finland's Patent and Registration Office (PRH) open company registry. Exposes basic company records sourced from ytj.fi including business ID, names, legal form, registration status, address, and industry classification. Data refreshed from PRH's published change feeds and redistributed under the original open license with attribution.

## Quick start

```bash
curl -H "Authorization: Bearer YOUR_KEY" https://prh-finland-companies.workers.dev/v1/companies
```

## Endpoints

- `GET /healthz` — liveness check (no auth)
- `GET /openapi.json` — machine-readable spec
- `GET /docs` — interactive Swagger UI
- `GET /v1/companies` — list with pagination
- `GET /v1/companies/:id` — single record

Full schema: see `/openapi.json`.

## Pricing

| Tier    | Requests / month | Price |
|---------|------------------|-------|
| Free    | 100              | $0    |
| Starter | 10,000           | $9    |
| Pro     | 100,000          | $29   |

Get a key: https://prh-finland-companies.workers.dev/docs

## Source data

This API is a clean wrapper of the public source at https://avoindata.prh.fi/en.
We refresh the cache on a `0 */6 * * *` schedule.

## License

The wrapped API itself is MIT. Underlying data: see https://avoindata.prh.fi/en.
