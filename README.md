# AgencyOS

AgencyOS is Grafikcem's internal AI agency operating system.

It supports daily sales execution, high-quality local lead discovery, JARVIS-assisted outreach, digital product planning, and weekly market intelligence.

## Core Systems

- Daily lead scan: finds 5 high-quality local business leads per day.
- Evidence engine: explains why a business should pay for AI agency help now.
- Quality engine: ranks leads by conversion probability and action priority.
- Pipeline: separates call-now leads from mini-audit and warm-up work.
- JARVIS: routes sales, lead, pitch, and opportunity questions into tool-backed answers.
- Apollo pilot: optional enrichment flow when `APOLLO_API_KEY` is configured.
- Opportunity Intelligence OS: monitors product and market signals for Grafikcem digital products.

## Current Product Focus

The current passive-income sprint is intentionally narrow:

1. Grafikcem website sales infrastructure
2. Grafikcem Prompt Kitapçığı at `$4.99`
3. Tasarımcılar İçin AI Agent Paketi
4. Mini AI Creative Operations Eğitimi
5. AgencyOS Lite as a later validated template product

Trend signals should support existing products, not create distracting new work.

## Local Commands

```bash
npm run dev
npm run lint
npm run build
npm run daily:scan
npm run opportunity:seed
npm run opportunity:scan -- --dryRun
npm run opportunity:scan
```

## Environment Variables

Required for production use:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `CRON_SECRET`
- `GOOGLE_MAPS_KEY`
- `OPENROUTER_API_KEY`

Optional:

- `APOLLO_API_KEY`
- `SERPAPI_KEY` or `SERPAPI_API_KEY`
- `TAVILY_API_KEY`
- `EXA_API_KEY`

Never commit `.env.local`.

## Deployment

Production is deployed on Vercel from the `main` branch.

Cron jobs:

- `/api/cron/daily-scan` at `05:00 UTC` daily
- `/api/cron/opportunity-scan` at `06:00 UTC` every Monday

Both cron routes require `CRON_SECRET`.
