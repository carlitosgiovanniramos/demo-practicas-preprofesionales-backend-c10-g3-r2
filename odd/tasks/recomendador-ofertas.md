Feature: recomendador-ofertas (prototype, no ML training, no embeddings)
Branch: feat/recomendador-ofertas (from feat/ai-resumen-acreditacion). Delivery: one PR, small enough for review.
Test runner: pnpm test (vitest). Ranking is pure math (TF-IDF + cosine); MiniMax only explains the top 5 on request.

## Specs
S1 GET /recommendations/offers?limit=N (STUDENT only). Returns published offers the student has not applied to, ranked by cosine similarity between the offer's TF-IDF vector and the student's profile. The profile is the mean of the normalized vectors of the offers the student applied to.
S2 Text reduction before TF-IDF: lowercase, remove accents, remove Spanish stopwords, drop tokens shorter than 3 characters, light Spanish suffix stemming, title counted twice. IDF is computed over the published offers plus the student's applied offers.
S3 Cold start: a student with no applications gets the most recent published offers with score 0 and an empty matchedTerms list. No model call.
S4 Transparency: each result includes score (0..1, 3 decimals) and matchedTerms (up to 3 shared terms that drove the score).
S5 Optional explanation: GET .../offers?explain=true calls MiniMax (classification provider) once, for at most the top 5 results, and returns a short Spanish reason per offer. The model only narrates the ranking; it never changes the order or invents offers. If the model fails or returns invalid JSON, respond 503 with the provider message.
S6 Out of scope: no database table or cache in this iteration, no embeddings, no batch over all students, no automatic run, no category field on Offer.
S7 Limit: default 10, min 1, max 50.
S8 Company metric: GET /recommendations/offers/:offerId/insights (COMPANY or COORDINATOR). Same ownership rule as GET /offers/:id/applications (OfferService.assertOfferOwnership): a company only measures its own offers.
S9 Insights content: applicantCount (applications to the offer), withHistoryCount (applicants with at least one other application), averageFit (mean cosine between each applicant's profile and the offer, 0..1, 3 decimals, null when withHistoryCount is 0), strongFitCount (applicants with fit >= 0.3), topTerms (up to 5 terms shared by the offer and the mean profile of applicants with history). The profile of an applicant excludes the measured offer. Same TF-IDF as S1-S2; no model call; nothing is persisted.
S10 Student UI: the offers page shows "Recomendadas para ti" with up to 3 results from GET /recommendations/offers?limit=3, score as percentage and matchedTerms. Hidden when every score is 0 (no applications, cold start). A "Por qué" action calls ?explain=true and shows the reason per offer, or the provider message on 503.
S11 Company UI: the applications page of an offer shows the panel "Afinidad de postulantes" with the S9 metrics; without applicants with history it shows "Sin datos suficientes para medir afinidad".

## Tasks
T1 (S2) text normalization and TF-IDF math, pure functions | route: inline | status: done, commit 3270978 (RED: missing modules; GREEN 13/13)
T2 (S1, S3, S4) RecommendationService ranking | route: inline | status: done, commit 9ed9ab0 (RED observed; GREEN 19/19)
T3 (S1, S7) controller, module, app wiring, query DTO | route: inline | status: done, commit 9ed9ab0 (RED observed; GREEN 60/60 with src/ai)
T4 (S5) optional MiniMax explanation for top 5 | route: inline | status: done, commit 9ed9ab0 (RED observed; GREEN, prompt/parse/service covered)
T5 (S8, S9) RecommendationService.offerInsights + GET /recommendations/offers/:offerId/insights | route: inline | status: done, commit 7ca1195 (RED observed: 6 failing; GREEN 39/39 recommendation, full suite 275/275, tsc 0)
T6 (S10) frontend student panel "Recomendadas para ti" with explain | route: inline | status: done, commit a9e6615 in frontend repo (RED observed: 3 suites missing; GREEN, frontend suite 224/224)
T7 (S11) frontend company panel "Afinidad de postulantes" | route: inline | status: done, commit a9e6615 in frontend repo (same commit; covered by OfferAffinityPanel.spec, 3 cases)

Verification: full suite 269/269, eslint 0 problems, tsc --noEmit exit 0. Risk: none (additive endpoint, no migration, no change to existing contracts or guards).
Not verified live: MiniMax explanation against the real API (no key checked in this session; see L4 of ai-resumen-acreditacion).

## Log
L1 Original request (user, verbatim): "haslo y vele que podemos ahcer apra reducir el problema del texto con TF-IDF para el recomendador"
L2 User constraint: Gemini is already used for other features, so the recommender must not depend on it; use a classic math algorithm and MiniMax only afterwards to classify or explain the results.
L3 Decision: no DB cache in this iteration; the ranking is cheap math on each request. Caching the explanation needs a migration and is a separate task.
L4 Evidence: on sample Spanish offers, the modality ("remoto") linked unrelated offers through shared logistics words; removed from the text. Title counted twice; accents, stopwords and light stemming applied (for example "interfaces" in two offers reduces to the shared root "interfac").
L5 Known limit: no synonyms yet (for example "js" vs "javascript"). Candidate next step, cheap and deterministic: a small alias table applied in normalizeText.
L6 User request (verbatim): "ya ahora si continuemos con la aprte del sistema de reocmendacion que falta para que quede funcional y tambien implementar para la empresa la aprte donde se peude ver  un apartado que tenga ue ver con alguna metrica importante que se peuda sacar del recomendador."
L7 Decision: the frontend never consumed the recommender. Added S10 (student panel) and S8-S9, S11 (company metric). The company metric is the affinity of applicants to the offer: it answers whether applicants match the offer, with no new table.
L8 Verification: backend tsc exit 0, full suite 275/275, eslint 0 errors (2 pre-existing warnings in src/ai). Frontend tsc exit 0, suite 224/224, eslint 0 errors. Not verified in a browser against a live API.
