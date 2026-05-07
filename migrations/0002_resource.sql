CREATE TABLE IF NOT EXISTS companies (
    business_id TEXT,
    name TEXT,
    company_form TEXT,
    status TEXT,
    registration_date TEXT,
    main_business_line TEXT,
    municipality TEXT,
    postal_address TEXT,
    website TEXT,
    last_modified TEXT,
    PRIMARY KEY (business_id)
);
CREATE INDEX IF NOT EXISTS idx_companies_name ON companies(name);
CREATE INDEX IF NOT EXISTS idx_companies_company_form ON companies(company_form);
CREATE INDEX IF NOT EXISTS idx_companies_status ON companies(status);
CREATE INDEX IF NOT EXISTS idx_companies_main_business_line ON companies(main_business_line);
CREATE INDEX IF NOT EXISTS idx_companies_municipality ON companies(municipality);
CREATE INDEX IF NOT EXISTS idx_companies_last_modified ON companies(last_modified);
