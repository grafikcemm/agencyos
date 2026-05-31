-- Apollo pilot enrichment tracking table
CREATE TABLE IF NOT EXISTS apollo_enrichments (
  lead_id UUID PRIMARY KEY REFERENCES leads(id) ON DELETE CASCADE,
  domain TEXT,
  org_name TEXT,
  org_industry TEXT,
  org_employee_count INTEGER,
  org_linkedin TEXT,
  raw_org JSONB,
  confidence DOUBLE PRECISION DEFAULT 1.0,
  enriched_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for high-speed foreign key lookups
CREATE INDEX IF NOT EXISTS idx_apollo_enrichments_lead_id ON apollo_enrichments(lead_id);
