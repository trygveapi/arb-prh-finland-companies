import { OpenAPIHono } from "@hono/zod-openapi";
import { swaggerUI } from "@hono/swagger-ui";
import { apiKey } from "./auth";
import { errorHandler, type ApiError } from "./lib/errors";
import { ensureSchema, type Env } from "./lib/db";
// Routes are appended below this line by the Builder agent. Do not edit manually.
import { registerCompaniesRoutes } from "./routes/companies";

const app = new OpenAPIHono<{ Bindings: Env }>();

app.onError((err, c) => errorHandler(err as Error & ApiError, c));

app.get("/healthz", async (c) => {
  await ensureSchema(c.env.DB);
  return c.json({ ok: true, slug: c.env.PRODUCT_SLUG, time: new Date().toISOString() });
});

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: { title: "Finnish PRH Open Company Data API", version: "0.1.0", description: "REST wrapper over Finland's Patent and Registration Office (PRH) open company registry. Exposes basic company records sourced from ytj.fi including business ID, names, legal form, registration status, address, and industry classification. Data refreshed from PRH's published change feeds and redistributed under the original open license with attribution." },
  servers: [{ url: "https://prh-finland-companies.workers.dev" }],
});
app.get("/docs", swaggerUI({ url: "/openapi.json" }));

// Public routes require an API key
app.use("/v1/*", apiKey);

registerCompaniesRoutes(app);

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    // Builder writes the scraper entry here.
    const { runScraper } = await import("./scraper");
    ctx.waitUntil(runScraper(env));
  },
} satisfies ExportedHandler<Env>;
