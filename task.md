# Checklist: AgencyOS Production Start Hardening Pass

- `[x]` **Standby Timezone & NextRun Alignment**
  - `[x]` Update `vercel.json` schedule to trigger at `05:00 UTC` (08:00 TR)
  - `[x]` Maintain consistent `nextRun` response copy in daily scan endpoint
  - `[x]` Verify that daily scan GET endpoint gracefully enters standby before June 1, 2026

- `[x]` **Dynamic Evidence Resolution & Pain Verification**
  - `[x]` Update `/api/cron/daily-scan` to run full dynamic `runEvidenceEngine` logic
  - `[x]` Remove hardcoded WhatsApp and online booking assumptions
  - `[x]` Update `buildPainAndProof` in `evidenceEngine.ts` to skip unverified feature pains on slow/dead websites
  - `[x]` Modify `hasATierDigitalProblem` in `highQualityLeadEngine.ts` to require at least 1 fully verified digital pain signal
  - `[x]` Update `/api/cron/daily-scan` to map `why_now` dynamically to `evidence.why_now` rather than hardcoded fallbacks
  - `[x]` Require `pain_signals.length > 0` for any lead to be accepted into daily list, otherwise reject with `"Doğrulanmış acil problem sinyali yok."`
  - `[x]` Filter out any leads with boilerplate/generic `"sağlam bir temele sahip"` descriptions

- `[x]` **Standby Dashboard UX ("Temiz Başlangıç Hazır")**
  - `[x]` Render a premium, green-bordered bento card on `/dashboard` when database is clean before June 1st
  - `[x]` Add a interactive "Dry-run Testi Yap" button trigger directly on the dashboard
  - `[x]` Verify clean empty states for Map and Pipeline screens prior to launch

- `[x]` **Final Verification Checks**
  - `[x]` Run `npm run lint` and verify exactly 0 errors, 0 warnings
  - `[x]` Run `npm run build` and verify exactly 0 TypeScript errors or static generation warnings
  - `[x]` Run `npm run daily:scan -- --dryRun` and assert exactly 5 candidates with zero database insertions
  - `[x]` Run `npm run clean:daily-start -- --confirm` to secure absolute clean launch posture
