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

## Tasks
T1 (S2) text normalization and TF-IDF math, pure functions | route: inline | status: done, commit 3270978 (RED: missing modules; GREEN 13/13)
T2 (S1, S3, S4) RecommendationService ranking | route: inline | status: done, commit 9ed9ab0 (RED observed; GREEN 19/19)
T3 (S1, S7) controller, module, app wiring, query DTO | route: inline | status: done, commit 9ed9ab0 (RED observed; GREEN 60/60 with src/ai)
T4 (S5) optional MiniMax explanation for top 5 | route: inline | status: done, commit 9ed9ab0 (RED observed; GREEN, prompt/parse/service covered)

Verification: full suite 269/269, eslint 0 problems, tsc --noEmit exit 0. Risk: none (additive endpoint, no migration, no change to existing contracts or guards).
Not verified live: MiniMax explanation against the real API (no key checked in this session; see L4 of ai-resumen-acreditacion).

## Log
L1 Original request (user, verbatim): "haslo y vele que podemos ahcer apra reducir el problema del texto con TF-IDF para el recomendador"
L2 User constraint: Gemini is already used for other features, so the recommender must not depend on it; use a classic math algorithm and MiniMax only afterwards to classify or explain the results.
L3 Decision: no DB cache in this iteration; the ranking is cheap math on each request. Caching the explanation needs a migration and is a separate task.
L4 Evidence: on sample Spanish offers, the modality ("remoto") linked unrelated offers through shared logistics words; removed from the text. Title counted twice; accents, stopwords and light stemming applied (for example "interfaces" in two offers reduces to the shared root "interfac").
L5 Known limit: no synonyms yet (for example "js" vs "javascript"). Candidate next step, cheap and deterministic: a small alias table applied in normalizeText.
