# Tasks: audit-autorizacion-e3-01

## Review Workload Forecast

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: stacked-to-main
400-line budget risk: High

Delivery `ask-on-risk` aplicado: el total pasa las 400 líneas, se
opta por **3 PRs encadenados** con la siguiente estrategia.

### Suggested Work Units

| Unit | Goal | Focused test | Runtime harness | Rollback |
|------|------|--------------|-----------------|----------|
| WU-1 | `proposal.md` (proposal OpenSpec adaptado a auditoría) | n/a (doc) | n/a | `proposal.md` revert |
| WU-2 | `tasks.md` (este archivo) | n/a (doc) | n/a | `tasks.md` revert |
| WU-3 | `findings/README.md` (tabla inventario + auditoría front) | n/a (doc) | n/a | `README.md` revert |
| WU-4 | `findings/curls.md` (8 curls con salida literal) | re-ejecutable a mano contra el seed | docker compose + pnpm dev | `curls.md` revert |
| WU-5 | `findings/hallazgos/H-01.md` ... `H-08.md` (8 historias hijas) | n/a (doc) | n/a | carpeta `hallazgos/` revert |

Dependency: `WU-1 → WU-2 → WU-3 → WU-4 → WU-5`. Un commit por WU,
tres PRs encadenados según se describe abajo.

### Chained PR plan

| PR | Contenido | Líneas | Target | Notas |
|----|-----------|--------|--------|-------|
| 1a | WU-1 + WU-2 (proposal + tasks) | ~250 | `develop` | Base: proposal + plan. |
| 1b | WU-3 (findings/README inventario + front) | ~200 | `audit/E3-01-inventario-autorizacion` (cabeza de PR 1a) | Inventario + auditoría front. |
| 2 | WU-4 (findings/curls.md con 8 hallazgos) | ~280 | `audit/E3-01-inventario-autorizacion` (cabeza de PR 1b) | Pruebas de explotación. |
| 3 | WU-5 (8 historias hijas en hallazgos/) | ~260 | `audit/E3-01-inventario-autorizacion` (cabeza de PR 2) | Backlog de remediación. |

Rama de trabajo: `audit/E3-01-inventario-autorizacion`, creada desde
`develop`. Cada PR targetea la cabeza del anterior (stacked).

## Phase 1: Inventario — PR 1a (base)

- [ ] 1.1 **WU-1** Redactar `proposal.md` con Why / What Changes /
      Impact / Capabilities / Approach / Out of Scope / Risks /
      Acceptance / Rollback, adaptado al caso de auditoría.
- [ ] 1.2 **WU-2** Redactar `tasks.md` con el plan de chained PRs
      (este archivo).
- [ ] 1.3 `git diff` solo toca `openspec/changes/audit-autorizacion-e3-01/`.

## Phase 1b: Inventario tabla — PR 1b (encadenado)

- [ ] 1.4 **WU-3** Redactar `findings/README.md`:
  - Tabla inventario (26 filas: una por endpoint del back, con método,
    ruta, roles, pertenencia, evidencia).
  - Sección "Auditoría de uso en el front": endpoints consumidos por
    cada rol, con archivo y nombre de página.
  - Resumen "Cuántos agujeros hay" (los 8 hallazgos).
- [ ] 1.5 PR 1b targetea la cabeza de PR 1a.

## Phase 2: Pruebas de explotación (PR 2 — encadenado)

- [ ] 2.1 **WU-4** Redactar `findings/curls.md` con 8 secciones
      (H-01..H-08), cada una con:
  - bloque `curl` ejecutable,
  - salida literal del servidor (`STATUS: 200` y body),
  - veredicto (`EXPLOTABLE` con severidad).
- [ ] 2.2 Re-ejecutable a mano: levantar back con `docker compose up -d
      postgres && pnpm db:migrate --skip-seed && pnpm db:seed && pnpm dev`
      y correr cada curl.
- [ ] 2.3 PR 2 targetea la rama del PR 1.

## Phase 3: Historias hijas (PR 3 — encadenado)

- [ ] 3.1 **WU-5** Redactar 8 archivos `findings/hallazgos/H-NN.md`
      con el formato de la historia original:
      `Como / quiero / para` + criterios + notas + DoD +
      frontmatter con id, severidad, dependencias.
- [ ] 3.2 Cada historia referencia el bloque de curl en `curls.md` que
      demuestra la explotabilidad.
- [ ] 3.3 Mapa de dependencias en este `tasks.md` (abajo) — verificable
      a simple vista.
- [ ] 3.4 PR 3 targetea la rama del PR 2.

## Dependencias entre hallazgos

- **H-01, H-02, H-03** comparten patrón "ownership de offer en handler
  de COMPANY" → guard reusable `@OfferOwnedByCompany`.
- **H-05, H-06** comparten patrón "ownership de offer aplicado a
  applications" → mismo guard + filtro `where.companyId`.
- **H-07** (hour-logs/review por tutor ajeno) — INDEPENDIENTE.
- **H-04, H-08** — INDEPENDIENTES entre sí y del resto (cambios de
  visibilidad/control de acceso, no de guard).

Decisión técnica propuesta (a confirmar en PR 3): un guard
reusable de pertenencia (`@OfferOwnedByCompany`, `@PlacementOwnedByTutor`,
`@HourLogForPlacementOwnedByTutor`) cubriría H-01..H-03 + H-05, H-06 +
H-07 con un solo helper de "load + assert". H-04 y H-08 son cambios
de visibilidad/control de acceso, no de guard — se resuelven a nivel
de controller con un cambio en `@Roles(...)` + un `select` que oculte
campos sensibles.

Severidad (validada con curls reales):

| Hallazgo | Severidad | Tipo de fix |
|----------|-----------|-------------|
| H-01 POST /offers con companyId ajeno | HIGH | Guard `OfferOwnedByCompany` |
| H-02 PATCH /offers/:id/publish ajeno | HIGH | Guard `OfferOwnedByCompany` |
| H-03 PATCH /offers/:id/close ajeno | HIGH | Guard `OfferOwnedByCompany` |
| H-04 GET /offers/:id expone PII | MEDIUM | `@Roles` + `select` filtrado |
| H-05 GET /offers/:offerId/applications ajeno | HIGH | Guard + filtro `where.companyId` |
| H-06 PATCH /applications/:id/decide ajeno | HIGH | Guard + filtro `where.companyId` |
| H-07 PATCH /hour-logs/:id/review por tutor ajeno | **CRITICAL** | Guard `HourLogForPlacementOwnedByTutor` |
| H-08 GET /companies expone PII a todos | MEDIUM | `@Roles(COORDINATOR)` + visibilidad |

## Forecast

```json
{"wu_estimates":{"WU-1":95,"WU-2":75,"WU-3":195,"WU-4":280,"WU-5":260},"total_estimate":905,"under_400":false,"needs_split_or_exception":true}
```

Estrategia acordada: **3 PRs encadenados** (ver "Chained PR plan"
arriba). Cada PR individual queda bajo o cerca de 400 líneas.

## Out of Scope

- Implementar los fixes. Esta historia solo documenta.
- Refactor de `HourLogService` (`KNOWN_ISSUES.md` D-02).
- Endpoints que ya validan pertenencia (registrados como "OK" en la
  tabla inventario, no requieren acción).
