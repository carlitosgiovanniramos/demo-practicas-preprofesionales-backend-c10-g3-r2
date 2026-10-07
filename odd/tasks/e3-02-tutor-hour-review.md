# E3-02 — Restrict tutor hour reviews to assigned placements

Objective: A tutor may approve or reject submitted hours only for their assigned placement. An unrelated tutor receives HTTP 403; preserve the existing coordinator permissions.

Problem/evidence: `PATCH /hour-logs/:id/review` checks `Role.TUTOR` but `HourLogService.review` previously checked only the hour-log state before updating. `Placement.tutorId` is already modeled. The README states that only the assigned tutor approves hours. No E3-01 inventory artifact was found in this backend checkout; inspect analogous tutor endpoints within the available code rather than assume an unseen list.

Scope: Backend review authorization and regression tests. No new coordinator privilege, schema migration, unrelated company authorization fix, or frontend changes. Preserve pre-existing untracked `.codegraph/`.

Branch: `fix/E3-02-tutor-hour-review` from updated `develop` (`1177949`); local `main` updated to `a5c5be0`. Target PR branch: `develop`; do not push or open PR without user direction.

TDD mode: No explicit project/session mode located; reproduce with a failing test before changing behavior as requested by the user. Runner: `pnpm test -- src/hour-log/hour-log.service.spec.ts`; then `pnpm test`, `pnpm typecheck` and `pnpm lint` if dependencies available.

Delivery strategy: ask-on-risk. Forecast: about 100 authored changed lines, one cohesive work-unit commit. Runtime curl verified against a disposable isolated service/database; its volume remains stopped for later inspection.

## Tasks
- [x] E3-02-1 (verified; baseline lint remains failing): Reproduce a foreign tutor approving/rejecting a submitted hour (RED); enforce assigned tutor authorization and verify denied/allowed cases, coordinator regression, and analogous tutor endpoints. Route: delegated `gentle-ai-worker` (service + spec, multi-file writer trigger); separate verification according to native risk assessment. Checks: focused RED/GREEN, full test suite, typecheck/lint, runtime curl if the stack can be started. Commit behavior and tests together as `fix(auth): restrict hour reviews to assigned tutor`.

## Evidence and next step
- RED: `pnpm test -- src/hour-log/hour-log.service.spec.ts` failed in both new foreign-tutor APPROVED/REJECTED cases before the fix because review resolved instead of rejecting.
- GREEN: `pnpm test` passed (54 passed, 3 skipped); `pnpm typecheck` and `git diff --check` passed. Parent reran the focused command (Vitest still ran the full suite): 54 passed, 3 skipped. Denied tests assert status 403 and no update; assigned tutor tests cover approval and rejection.
- Runtime: isolated PostgreSQL `yura_e302_check` with `pnpm dev` and seeded accounts; real `curl` returned 403 for foreign tutor reviewing hour log 36, 200 for assigned tutor approving 36 and rejecting 38, and 403 for coordinator reviewing 37. SQL confirmed 37 stayed SUBMITTED. API and isolated DB container stopped; isolated volume retained. First attempt using `tsx src/main.ts` failed at login with missing Nest decorator metadata; retry via documented Nest CLI succeeded.
- Inventory audit: tutor evaluation service already checks `placement.tutorId`; no other analogous tutor write endpoint found in this checkout. No E3-01 inventory artifact available locally. Coordinator role remains excluded at route level.
- Failed check: `pnpm lint` reports 6 errors and 1 warning at unchanged pre-existing lines in `hour-log.service.ts` and `placement/accreditation.ts`; no lint-clean baseline is claimed. Sync integration tests: 3 skipped by existing suite.
- Rollback boundary: only `src/hour-log/hour-log.service.ts` and `src/hour-log/hour-log.service.spec.ts` implement the fix; preserve `.codegraph/` and the separate retained isolated PostgreSQL volume.
- Work-unit commit: `e9357ba1a1802c0d2ab2b68896afcc1ef8a32cb1` (`fix(auth): restrict hour reviews to assigned tutor`).
- Next: optional PR into `develop` after user approval; separately address existing lint debt if a lint-clean repository is required. No push or PR performed.
