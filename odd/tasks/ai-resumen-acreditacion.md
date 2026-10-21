Feature: ai-resumen-acreditacion (prototype, demo data only)
Branch: feat/ai-resumen-acreditacion (from origin/develop). Delivery: chained PRs of about 400 authored lines.
Test runner: pnpm test (vitest). Provider: Gemini API, free tier, model from GEMINI_MODEL.

## Specs
S1 Gemini text provider behind an interface; API key from GEMINI_API_KEY; model from GEMINI_MODEL (default gemini-2.5-flash-lite). Missing key -> 503, never a fake answer.
S2 Weekly report draft for one placement: GET /placements/:id/weekly-summary?weekStart=YYYY-MM-DD. Student owner, tutor and coordinator may read (canAccessPlacement). Draft is generated only from that week's hour logs; the model must not invent activities.
S3 Accreditation explanation for the coordinator: GET /placements/:id/accreditation-explanation?period=AAAA-1|AAAA-2. The level and reasons come from calculateAccreditationStatus; the model only narrates them.
S4 Batch over all placements of a period, labelled simulated: POST /ai/simulated-batch?period=AAAA-1|AAAA-2 (coordinator). Response marks simulated: true. No fabricated metrics.
S5 Demo data only; no real student data is sent. Free tier is acceptable for this prototype.

## Tasks
T1 (S1) provider + module + env | route: inline | status: in progress
T2 (S2) weekly summary endpoint | route: inline | status: pending
T3 (S3, S4) accreditation explanation + simulated batch | route: inline | status: pending

## Log
L1 Original request (user, verbatim): "haslo y trata de aprovechar la ventana que hay para las lineas maximas para cada pr encadenado porque esta implementacion si sera medio grande"
L2 Product decision: privacy not a blocker (example data, prototype for sale). Use the free tier.
