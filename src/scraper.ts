import type { D1Database } from "@cloudflare/workers-types";

interface Env {
  DB: D1Database;
}

interface PrhAddress {
  street?: string | null;
  postCode?: string | null;
  city?: string | null;
  type?: number | null;
  registrationDate?: string | null;
  endDate?: string | null;
}

interface PrhBusinessLine {
  code?: string | null;
  name?: string | null;
  registrationDate?: string | null;
  endDate?: string | null;
}

interface PrhCompanyForm {
  name?: string | null;
  type?: string | null;
  registrationDate?: string | null;
  endDate?: string | null;
}

interface PrhName {
  name?: string | null;
  registrationDate?: string | null;
  endDate?: string | null;
}

interface PrhContact {
  type?: string | null;
  value?: string | null;
  endDate?: string | null;
}

interface PrhRegisteredOffice {
  name?: string | null;
  endDate?: string | null;
}

interface PrhCompany {
  businessId?: string | { value?: string | null } | null;
  name?: string | null;
  names?: PrhName[];
  companyForm?: string | null;
  companyForms?: PrhCompanyForm[];
  status?: string | null;
  registrationDate?: string | null;
  mainBusinessLine?: PrhBusinessLine | null;
  businessLines?: PrhBusinessLine[];
  registeredOffice?: string | null;
  registeredOffices?: PrhRegisteredOffice[];
  addresses?: PrhAddress[];
  website?: string | null;
  contactDetails?: PrhContact[];
  lastModified?: string | null;
  endDate?: string | null;
}

interface PrhResponse {
  companies?: PrhCompany[];
  results?: PrhCompany[];
  next?: string | null;
  nextPage?: string | null;
  totalResults?: number;
}

interface CompanyRow {
  business_id: string;
  name: string | null;
  company_form: string | null;
  status: string | null;
  registration_date: string | null;
  main_business_line: string | null;
  municipality: string | null;
  postal_address: string | null;
  website: string | null;
  last_modified: string | null;
}

const BASE_URL = "https://avoindata.prh.fi/opendata-ytj-api/v3/companies";
const MAX_PAGES = 50;
const PAGE_SIZE = 100;

function pickBusinessId(c: PrhCompany): string | null {
  if (typeof c.businessId === "string") return c.businessId;
  if (c.businessId && typeof c.businessId === "object") {
    return c.businessId.value ?? null;
  }
  return null;
}

function pickCurrent<T extends { endDate?: string | null }>(
  items: T[] | undefined,
): T | null {
  if (!items || items.length === 0) return null;
  const active = items.find((i) => !i.endDate);
  return active ?? items[0] ?? null;
}

function pickName(c: PrhCompany): string | null {
  if (typeof c.name === "string" && c.name.trim()) return c.name.trim();
  const cur = pickCurrent(c.names);
  return cur?.name ?? null;
}

function pickCompanyForm(c: PrhCompany): string | null {
  if (typeof c.companyForm === "string" && c.companyForm.trim()) {
    return c.companyForm.trim();
  }
  const cur = pickCurrent(c.companyForms);
  return cur?.type ?? cur?.name ?? null;
}

function pickStatus(c: PrhCompany): string | null {
  if (typeof c.status === "string" && c.status.trim()) return c.status.trim();
  if (c.endDate) return "dissolved";
  return "active";
}

function pickMainBusinessLine(c: PrhCompany): string | null {
  if (c.mainBusinessLine?.code) return c.mainBusinessLine.code;
  const cur = pickCurrent(c.businessLines);
  return cur?.code ?? null;
}

function pickMunicipality(c: PrhCompany): string | null {
  if (typeof c.registeredOffice === "string" && c.registeredOffice.trim()) {
    return c.registeredOffice.trim();
  }
  const cur = pickCurrent(c.registeredOffices);
  return cur?.name ?? null;
}

function pickPostalAddress(c: PrhCompany): string | null {
  const cur = pickCurrent(c.addresses);
  if (!cur) return null;
  const parts = [cur.street, cur.postCode, cur.city].filter(
    (p): p is string => typeof p === "string" && p.trim().length > 0,
  );
  return parts.length > 0 ? parts.join(", ") : null;
}

function pickWebsite(c: PrhCompany): string | null {
  if (typeof c.website === "string" && c.website.trim()) return c.website.trim();
  if (!c.contactDetails) return null;
  const active = c.contactDetails.filter((d) => !d.endDate);
  const site = active.find(
    (d) =>
      typeof d.type === "string" &&
      /website|www|homepage|kotisivu/i.test(d.type) &&
      typeof d.value === "string" &&
      d.value.trim().length > 0,
  );
  return site?.value ?? null;
}

function toRow(c: PrhCompany): CompanyRow | null {
  const businessId = pickBusinessId(c);
  if (!businessId) return null;
  return {
    business_id: businessId,
    name: pickName(c),
    company_form: pickCompanyForm(c),
    status: pickStatus(c),
    registration_date: c.registrationDate ?? null,
    main_business_line: pickMainBusinessLine(c),
    municipality: pickMunicipality(c),
    postal_address: pickPostalAddress(c),
    website: pickWebsite(c),
    last_modified: c.lastModified ?? null,
  };
}

async function fetchPage(url: string): Promise<PrhResponse | null> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "untapped-arbitrage-prh-scraper/1.0",
      },
    });
    if (!res.ok) {
      console.error(`PRH fetch failed ${res.status} ${res.statusText} for ${url}`);
      return null;
    }
    return (await res.json()) as PrhResponse;
  } catch (err) {
    console.error(`PRH fetch error for ${url}:`, err);
    return null;
  }
}

function rowsEqual(a: CompanyRow, b: Record<string, unknown>): boolean {
  const keys: (keyof CompanyRow)[] = [
    "name",
    "company_form",
    "status",
    "registration_date",
    "main_business_line",
    "municipality",
    "postal_address",
    "website",
    "last_modified",
  ];
  for (const k of keys) {
    const av = a[k];
    const bv = b[k];
    if ((av ?? null) !== (bv ?? null)) return false;
  }
  return true;
}

export async function runScraper(env: Env): Promise<void> {
  let fetched = 0;
  let upserted = 0;
  let changed = 0;

  const sinceCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let nextUrl: string | null =
    `${BASE_URL}?siirtopaivamaara=${sinceCutoff}&resultsFrom=0&totalResults=true`;

  for (let page = 0; page < MAX_PAGES && nextUrl; page++) {
    const data = await fetchPage(nextUrl);
    if (!data) break;

    const companies = data.companies ?? data.results ?? [];
    fetched += companies.length;

    for (const c of companies) {
      const row = toRow(c);
      if (!row) continue;

      try {
        const existing = await env.DB.prepare(
          `SELECT name, company_form, status, registration_date, main_business_line,
                  municipality, postal_address, website, last_modified
             FROM companies WHERE business_id = ?1`,
        )
          .bind(row.business_id)
          .first<Record<string, unknown>>();

        const isChange = !existing || !rowsEqual(row, existing);

        await env.DB.prepare(
          `INSERT INTO companies (
              business_id, name, company_form, status, registration_date,
              main_business_line, municipality, postal_address, website, last_modified
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
            ON CONFLICT(business_id) DO UPDATE SET
              name = excluded.name,
              company_form = excluded.company_form,
              status = excluded.status,
              registration_date = excluded.registration_date,
              main_business_line = excluded.main_business_line,
              municipality = excluded.municipality,
              postal_address = excluded.postal_address,
              website = excluded.website,
              last_modified = excluded.last_modified`,
        )
          .bind(
            row.business_id,
            row.name,
            row.company_form,
            row.status,
            row.registration_date,
            row.main_business_line,
            row.municipality,
            row.postal_address,
            row.website,
            row.last_modified,
          )
          .run();

        upserted += 1;
        if (isChange) changed += 1;
      } catch (err) {
        console.error(`D1 upsert failed for ${row.business_id}:`, err);
      }
    }

    if (data.next && typeof data.next === "string") {
      nextUrl = data.next;
    } else if (data.nextPage && typeof data.nextPage === "string") {
      nextUrl = data.nextPage;
    } else if (companies.length >= PAGE_SIZE) {
      const u = new URL(nextUrl);
      const from = Number(u.searchParams.get("resultsFrom") ?? "0") + companies.length;
      u.searchParams.set("resultsFrom", String(from));
      nextUrl = u.toString();
    } else {
      nextUrl = null;
    }
  }

  console.log(
    `PRH scraper summary: fetched=${fetched} upserted=${upserted} changed=${changed}`,
  );
}