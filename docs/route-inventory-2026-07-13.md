# API Route Envanteri — 2026-07-13 (Faz 0)

Toplam route: 77

| Route | Methods | M/R | Auth sınıfı | Origin | Zod/Body |
|---|---|---|---|---|---|
| /api/admin/lead-intel-comparison | GET | R | requireApiAccess | - | OK |
| /api/admin/seed-playbooks | POST+PUT | M | requireApiAccess | OK | - |
| /api/admin/seed-service-catalog | POST | M | requireApiAccess | OK | - |
| /api/agents/[key]/chat | POST | M | requireApiAccess | OK | - |
| /api/agents/directive | POST | M | requireApiAccess | OK | - |
| /api/agents | GET | R | requireApiAccess | - | - |
| /api/ai/command-center/action | POST | M | requireApiAccess | - | OK |
| /api/ai/command-center | DELETE+POST | M | requireApiAccess | - | - |
| /api/ai/library-advice | POST | M | requireApiAccess | OK | - |
| /api/ai/mentor | POST | M | requireApiAccess | - | OK |
| /api/approvals/[id] | POST | M | requireApiAccess | OK | OK |
| /api/approvals | GET | R | requireApiAccess | - | - |
| /api/assistant/settings | GET+POST | M | requireApiAccess | OK | OK |
| /api/auth/login | POST | M | PUBLIC | - | - |
| /api/auth/logout | POST | M | PUBLIC | - | - |
| /api/council | GET+PATCH+POST | M | requireApiAccess | OK | - |
| /api/cron/agent-tick | GET+POST | M | CRON_SECRET | - | - |
| /api/cron/daily-scan | GET+POST | M | CRON_SECRET | - | - |
| /api/cron/job-scan | GET+POST | M | CRON_SECRET | - | - |
| /api/cron/model-health-check | GET | R | CRON_SECRET | - | - |
| /api/cron/opportunity-scan | GET | R | CRON_SECRET | - | - |
| /api/cron/orchestrator | GET | R | CRON_SECRET | - | - |
| /api/cron/person-scan | GET+POST | M | CRON_SECRET | - | - |
| /api/cron/weekly-retro | GET | R | CRON_SECRET | - | - |
| /api/db/[table] | DELETE+GET+PATCH+POST | M | requireApiUser | OK | OK |
| /api/enrichment/apollo | GET+POST | M | requireApiAccess | OK | - |
| /api/flags | GET | R | requireApiAccess | - | - |
| /api/health/config | GET | R | requireApiAccess | - | - |
| /api/integrations/feed-the-goat/snapshot | GET | R | PUBLIC | - | - |
| /api/jarvis | POST | M | requireApiAccess | OK | - |
| /api/jarvis/stream | POST | M | requireApiAccess | OK | - |
| /api/jobs/[id]/draft | POST | M | requireApiAccess | OK | - |
| /api/jobs/ingest | POST | M | requireApiAccess | OK | - |
| /api/jobs | GET+PATCH | M | requireApiAccess | OK | - |
| /api/jobs/scan | POST | M | requireApiAccess | OK | - |
| /api/knowledge | GET | R | requireApiAccess | - | - |
| /api/leads/[id]/action | POST | M | requireApiUser | OK | OK |
| /api/leads/[id]/audit | POST | M | requireApiAccess | OK | OK |
| /api/leads/[id]/cold-email | GET+POST | M | requireApiAccess | OK | - |
| /api/leads/[id]/contacts | GET+POST | M | requireApiUser | OK | OK |
| /api/leads/[id]/feedback | POST | M | requireApiUser | OK | OK |
| /api/leads/[id]/proposal | GET | R | requireApiAccess | - | - |
| /api/leads/[id]/risk | POST | M | requireApiAccess | OK | - |
| /api/leads/[id]/sequence | GET+POST | M | requireApiAccess | OK | - |
| /api/leads/analyze | POST | M | requireApiAccess | OK | - |
| /api/leads/backfill | GET+POST | M | requireApiAccess | OK | - |
| /api/leads/batch-analyze | POST | M | requireApiAccess | OK | - |
| /api/leads/daily-opportunities | GET | R | requireApiUser | - | OK |
| /api/leads/scan | POST | M | requireApiAccess | OK | - |
| /api/leads/stale | GET | R | requireApiAccess | - | - |
| /api/memory/learn | POST | M | requireApiAccess | OK | - |
| /api/memory | GET+POST | M | requireApiAccess | OK | - |
| /api/metrics/ai-cost | GET | R | requireApiUser | - | - |
| /api/metrics/funnel | GET | R | requireApiAccess | - | - |
| /api/opportunities/signals | GET+POST | M | requireApiAccess | OK | - |
| /api/orchestrator/reminders | GET | R | requireApiAccess | - | - |
| /api/orchestrator/state | GET | R | requireApiAccess | - | - |
| /api/outreach/[id]/reconcile | POST | M | requireApiAccess | OK | OK |
| /api/outreach/[id]/request-send | POST | M | requireApiAccess | OK | OK |
| /api/outreach/[id]/send-gmail | POST | M | requireApiAccess | OK | - |
| /api/outreach/[id]/send-status | GET | R | requireApiAccess | - | - |
| /api/outreach/metrics | GET | R | requireApiAccess | - | - |
| /api/outreach | GET+POST | M | requireApiAccess | OK | - |
| /api/outreach/send | POST | M | requireApiUser | OK | OK |
| /api/person-leads/scan | POST | M | requireApiAccess | OK | - |
| /api/registry | GET | R | requireApiAccess | - | - |
| /api/runs/[id] | GET | R | requireApiAccess | - | - |
| /api/runs | GET | R | requireApiAccess | - | - |
| /api/sectors/opportunities | GET | R | requireApiAccess | - | - |
| /api/services/[id]/pricing | PATCH | M | requireApiAccess | OK | OK |
| /api/services | GET | R | requireApiAccess | - | - |
| /api/tasks | GET | R | requireApiAccess | - | - |
| /api/telegram/diag | GET | R | CRON_SECRET | - | - |
| /api/telegram/diagnostics | GET | R | requireApiAccess | - | - |
| /api/telegram/health | GET | R | PUBLIC | - | - |
| /api/telegram | POST | M | TELEGRAM_SECRET | - | OK |
| /api/telegram/setup | GET+POST | M | requireApiUser | OK | - |

Mutasyon route: 48 - originsiz mutasyon: 10 - Zod'suz mutasyon: 34

## Originsiz mutasyonlar
- /api/ai/command-center/action
- /api/ai/command-center
- /api/ai/mentor
- /api/auth/login
- /api/auth/logout
- /api/cron/agent-tick
- /api/cron/daily-scan
- /api/cron/job-scan
- /api/cron/person-scan
- /api/telegram

## Zod/body-dogrulamasiz mutasyonlar
- /api/admin/seed-playbooks
- /api/admin/seed-service-catalog
- /api/agents/[key]/chat
- /api/agents/directive
- /api/ai/command-center
- /api/ai/library-advice
- /api/auth/login
- /api/auth/logout
- /api/council
- /api/cron/agent-tick
- /api/cron/daily-scan
- /api/cron/job-scan
- /api/cron/person-scan
- /api/enrichment/apollo
- /api/jarvis
- /api/jarvis/stream
- /api/jobs/[id]/draft
- /api/jobs/ingest
- /api/jobs
- /api/jobs/scan
- /api/leads/[id]/cold-email
- /api/leads/[id]/risk
- /api/leads/[id]/sequence
- /api/leads/analyze
- /api/leads/backfill
- /api/leads/batch-analyze
- /api/leads/scan
- /api/memory/learn
- /api/memory
- /api/opportunities/signals
- /api/outreach/[id]/send-gmail
- /api/outreach
- /api/person-leads/scan
- /api/telegram/setup

## PUBLIC (auth'suz) routelar
- /api/auth/login
- /api/auth/logout
- /api/integrations/feed-the-goat/snapshot
- /api/telegram/health

Not: E2E yetkisiz-erisim kapsami: mutation-guards.spec (401/403) + telegram-auth.spec (8 senaryo) + send-flow; literal surulen route ~21. Kalan routelar icin yetkisiz-test genisletmesi sonraki faz isi.

## Originsiz mutasyon GEREKÇELERİ (inceleme 2026-07-13)
- /api/telegram — Telegram sunucuları cross-origin POST eder; auth = secret_token header (tasarım gereği origin'siz).
- /api/cron/* — Vercel cron tetikler (cross-origin); auth = CRON_SECRET Bearer.
- /api/auth/login|logout — oturum ÖNCESİ uçlar; same-origin çerez bağımlılığı kurulamaz (login public by-design, rate-limit önerisi açık kalem).
- /api/ai/command-center* — INLINE isSameOrigin(req) kullanıyor (grep desenim kaçırdı — kod içinde mevcut); mentor için ekleme adayı.
