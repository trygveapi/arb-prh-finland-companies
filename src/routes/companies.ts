import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import type { Env } from "../lib/db";

const BusinessIdParamSchema = z.object({
  business_id: z
    .string()
    .regex(/^\d{7}-\d$/)
    .openapi({
      param: { name: "business_id", in: "path" },
      example: "1234567-8",
      description: "Finnish Business ID (Y-tunnus) in NNNNNNN-N format.",
    }),
});

const CompanySchema = z
  .object({
    business_id: z.string().openapi({
      example: "1234567-8",
      description: "Finnish Business ID (Y-tunnus), stable PRH primary key in NNNNNNN-N format.",
    }),
    name: z.string().openapi({
      example: "Example Oy",
      description: "Current registered company name.",
    }),
    company_form: z.string().openapi({
      example: "OY",
      description: "Legal form code (e.g. OY, OYJ, AY, KY, OSK).",
    }),
    status: z.string().openapi({
      example: "active",
      description: "Registration status (active, dissolved, liquidation, bankrupt).",
    }),
    registration_date: z.string().openapi({
      example: "2010-04-15",
      description: "ISO-8601 date the company was first registered with PRH.",
    }),
    main_business_line: z.string().openapi({
      example: "62010",
      description: "Primary TOL 2008 industry code reported to PRH.",
    }),
    municipality: z.string().openapi({
      example: "Helsinki",
      description: "Registered domicile municipality in Finland.",
    }),
    postal_address: z.string().openapi({
      example: "Mannerheimintie 1, 00100 Helsinki",
      description: "Latest registered street address as a single line.",
    }),
    website: z.string().openapi({
      example: "https://example.fi",
      description: "Company website URL if reported to PRH.",
    }),
    last_modified: z.string().openapi({
      example: "2026-04-30T08:15:00Z",
      description: "ISO-8601 timestamp of the most recent PRH change notification for this record.",
    }),
  })
  .openapi("Company");

const CompanyListResponseSchema = z
  .object({
    data: z.array(CompanySchema),
    next_cursor: z.string().nullable().openapi({
      description:
        "Opaque cursor for the next page (the business_id of the last record). Null when no further pages.",
      example: "1234567-8",
    }),
    limit: z.number().int().openapi({ example: 25 }),
  })
  .openapi("CompanyListResponse");

const ErrorEnvelopeSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "not_found" }),
      message: z.string().openapi({ example: "Resource not found." }),
    }),
  })
  .openapi("ErrorEnvelope");

const ListQuerySchema = z.object({
  cursor: z
    .string()
    .optional()
    .openapi({
      param: { name: "cursor", in: "query" },
      description: "Pagination cursor: the business_id of the last record on the previous page.",
      example: "1234567-8",
    }),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(25)
    .openapi({
      param: { name: "limit", in: "query" },
      description: "Maximum number of records to return (1-100, default 25).",
      example: 25,
    }),
  name: z
    .string()
    .optional()
    .openapi({ param: { name: "name", in: "query" }, description: "Case-insensitive substring match on company name." }),
  company_form: z
    .string()
    .optional()
    .openapi({ param: { name: "company_form", in: "query" }, description: "Filter by legal form code." }),
  status: z
    .string()
    .optional()
    .openapi({ param: { name: "status", in: "query" }, description: "Filter by registration status." }),
  municipality: z
    .string()
    .optional()
    .openapi({ param: { name: "municipality", in: "query" }, description: "Filter by domicile municipality." }),
  main_business_line: z
    .string()
    .optional()
    .openapi({
      param: { name: "main_business_line", in: "query" },
      description: "Filter by primary TOL 2008 industry code.",
    }),
  modified_since: z
    .string()
    .optional()
    .openapi({
      param: { name: "modified_since", in: "query" },
      description: "Return only records with last_modified >= this ISO-8601 timestamp.",
    }),
  modified_until: z
    .string()
    .optional()
    .openapi({
      param: { name: "modified_until", in: "query" },
      description: "Return only records with last_modified <= this ISO-8601 timestamp.",
    }),
});

type CompanyRow = z.infer<typeof CompanySchema>;

const listCompaniesRoute = createRoute({
  method: "get",
  path: "/v1/companies",
  tags: ["Companies"],
  summary: "List and filter companies by name, form, status, municipality, industry, or last_modified window.",
  request: { query: ListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of companies.",
      content: { "application/json": { schema: CompanyListResponseSchema } },
    },
    429: {
      description: "Rate limit exceeded.",
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
    },
  },
});

const getCompanyRoute = createRoute({
  method: "get",
  path: "/v1/companies/{business_id}",
  tags: ["Companies"],
  summary: "Fetch a single company by Finnish Business ID (Y-tunnus).",
  request: { params: BusinessIdParamSchema },
  responses: {
    200: {
      description: "The company record.",
      content: { "application/json": { schema: CompanySchema } },
    },
    404: {
      description: "No company exists for the supplied business_id.",
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
    },
    429: {
      description: "Rate limit exceeded.",
      content: { "application/json": { schema: ErrorEnvelopeSchema } },
    },
  },
});

export function registerCompaniesRoutes(app: OpenAPIHono<{ Bindings: Env }>): void {
  app.openapi(listCompaniesRoute, async (c) => {
    const {
      cursor,
      limit,
      name,
      company_form,
      status,
      municipality,
      main_business_line,
      modified_since,
      modified_until,
    } = c.req.valid("query");

    const where: string[] = [];
    const binds: Array<string | number> = [];

    if (cursor) {
      where.push("business_id > ?");
      binds.push(cursor);
    }
    if (name) {
      where.push("LOWER(name) LIKE ?");
      binds.push(`%${name.toLowerCase()}%`);
    }
    if (company_form) {
      where.push("company_form = ?");
      binds.push(company_form);
    }
    if (status) {
      where.push("status = ?");
      binds.push(status);
    }
    if (municipality) {
      where.push("municipality = ?");
      binds.push(municipality);
    }
    if (main_business_line) {
      where.push("main_business_line = ?");
      binds.push(main_business_line);
    }
    if (modified_since) {
      where.push("last_modified >= ?");
      binds.push(modified_since);
    }
    if (modified_until) {
      where.push("last_modified <= ?");
      binds.push(modified_until);
    }

    const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
    const sql = `SELECT business_id, name, company_form, status, registration_date, main_business_line, municipality, postal_address, website, last_modified FROM companies ${whereClause} ORDER BY business_id ASC LIMIT ?`;
    binds.push(limit + 1);

    const stmt = c.env.DB.prepare(sql).bind(...binds);
    const result = await stmt.all<CompanyRow>();
    const rows = result.results ?? [];

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const next_cursor = hasMore ? page[page.length - 1].business_id : null;

    return c.json({ data: page, next_cursor, limit }, 200);
  });

  app.openapi(getCompanyRoute, async (c) => {
    const { business_id } = c.req.valid("param");

    const sql = `SELECT business_id, name, company_form, status, registration_date, main_business_line, municipality, postal_address, website, last_modified FROM companies WHERE business_id = ? LIMIT 1`;
    const row = await c.env.DB.prepare(sql).bind(business_id).first<CompanyRow>();

    if (!row) {
      return c.json(
        {
          error: {
            code: "not_found",
            message: `No company found for business_id '${business_id}'.`,
          },
        },
        404,
      );
    }

    return c.json(row, 200);
  });
}