# Change: audit-autorizacion-e3-01

## Why

El backend tiene un único guard de autorización efectivo: `RolesGuard`
(`src/auth/guards/roles.guard.ts`) compara `user.role` contra los roles
declarados en `@Roles(...)`. **No existe un guard de pertenencia**: que un
usuario tenga rol `TUTOR` no significa que sea el tutor *de esa* práctica
en particular; que tenga rol `COMPANY` no implica que la oferta sea de su
empresa; que tenga rol `STUDENT` no garantiza que el placement o el
registro de horas le pertenezca.

Esto sale a la luz al cruzar dos cosas:

1. La historia `<!-- yura:backlog:E3-01 -->` pide explícitamente un
   inventario de "qué rol puede llamar a cada endpoint y sobre qué
   datos" para dimensionar los agujeros antes de arreglarlos uno a uno.
2. Una auditoría manual del código (este PR) encuentra **8 endpoints
   con `:id` en la ruta** (o equivalentes por `:offerId`, `:placementId`)
   donde `@Roles(...)` pasa pero el handler **no compara el recurso
   contra el dueño**, permitiendo acciones cruzadas entre recursos que
   solo se distinguen por pertenencia.

Los 8 agujeros fueron validados con curls reales contra el back
levantado con el seed del repo (`docker compose up -d postgres`,
`pnpm db:seed`, `pnpm dev`). Cada uno está documentado en
`findings/curls.md` (PR 2) con la salida literal del servidor. Las
historias de usuario que surjen como remediación viven en
`findings/hallazgos/H-01.md` ... `H-08.md` (PR 3).

## What Changes

- **`NON-BREAKING`** Documento `findings/README.md` con la tabla
  inventario: una fila por endpoint (método, ruta, roles permitidos,
  ¿chequea pertenencia?, evidencia con `archivo:línea`). Cubre los 8
  controllers del back. Agrega una sección de **auditoría de uso en el
  front** (qué endpoints consume cada rol desde la UI).
- **`NON-BREAKING`** `findings/curls.md` (PR 2): 8 curls de
  explotación con comando ejecutable, respuesta literal del servidor,
  veredicto y severidad.
- **`NON-BREAKING`** `findings/hallazgos/H-NN.md` (PR 3): una
  historia de usuario por agujero, mismo formato que la original, con
  dependencias/bloqueos en el frontmatter.
- **Sin código de runtime tocado.** Esta historia es inventario y
  planeación; los fixes viven en las historias hijas H-01..H-08.

## Impact

| Area | Impact | Description |
|------|--------|-------------|
| `openspec/changes/audit-autorizacion-e3-01/proposal.md` | New | Este archivo. |
| `openspec/changes/audit-autorizacion-e3-01/tasks.md` | New | Work units + chained PR plan. |
| `openspec/changes/audit-autorizacion-e3-01/findings/README.md` | New | Tabla inventario + auditoría front. |
| `openspec/changes/audit-autorizacion-e3-01/findings/curls.md` | New (PR 2) | Pruebas de explotación. |
| `openspec/changes/audit-autorizacion-e3-01/findings/hallazgos/H-NN.md` | New (PR 3) | 8 historias hijas. |
| Runtime code (`src/**`) | None | Esta historia no toca runtime. |

## Capabilities

### New Capabilities

- `auth-inventory`: tabla viva en el repo que documenta, por endpoint,
  los roles permitidos y si el handler compara el recurso contra el
  dueño. Sirve de base para auditorías futuras y para la decisión de
  qué guard de pertenencia (si se introduce uno) debe cubrir cada caso.

### Modified Capabilities

- None. Los agujeros detectados disparan cambios de capacidades
  separados en las historias H-01..H-08 (PR 3).

## Approach

1. Recorrer los 8 controllers + sus servicios + el módulo de auth. Por
   cada endpoint registrar método, ruta, `@Roles(...)`, si el servicio
   compara `user.id` / `user.companyId` / `user.role` contra el dueño.
2. Recorrer el frontend (`App.tsx`, `src/api/*.ts`, páginas que llaman
   a `api(...)`). Documentar qué endpoint consume cada rol.
3. Levantar el backend (`docker compose up -d postgres` +
   `pnpm db:migrate --skip-seed` + `pnpm db:seed` + `pnpm dev`),
   obtener un token por rol, y validar cada agujero con curl.
4. Clasificar por severidad:
   - **CRITICAL** — integridad de evaluaciones académicas
     (`PATCH /hour-logs/:id/review` por tutor ajeno).
   - **HIGH** — suplantación de oferta/postulación entre companies.
   - **MEDIUM** — exposición de PII (RUC, contactEmail).
5. Redactar las historias hijas con dependencias declaradas (H-01..H-03
   y H-05..H-06 comparten un guard reusable; H-04, H-07, H-08 son
   independientes entre sí).

## Out of Scope

- Implementar los fixes. Esta historia solo documenta.
- Endpoints que ya validan pertenencia (placement documents,
  evaluations, hour-logs por student) — están en la tabla como
  evidencia de "esto sí lo cubre el back".
- Refactor de `HourLogService` u otros servicios marcados como
  deuda en `KNOWN_ISSUES.md`. Eso son historias separadas.
- Cambios al modelo de Prisma. La estructura actual es suficiente
  para resolver los agujeros a nivel de servicio.
- Tests automatizados de los 8 agujeros. Cada curl es ejecutable a
  mano y queda en `findings/curls.md`; tests vendrán con cada fix.

## Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Inventario desactualizado al merge. | Medium | La tabla es la fuente de verdad para las historias hijas; cualquier cambio de un endpoint dispara revisión de la fila correspondiente. |
| Curls fallen al re-ejecutar por cambios en seed. | Low | Los curls usan credenciales del seed actual; si cambia el seed, hay que ajustar IDs. Documentado en cada bloque. |
| Severidad subestimada. | Medium | H-07 marcado CRITICAL por afectar integridad de evaluación académica — cualquier reconsideración se discute en review del PR 3. |
| Historias hijas sin dependencias claras. | Low | Las dependencias están en el frontmatter de cada H-NN.md. |

## Acceptance Criteria

- [ ] `findings/README.md` lista los 26 endpoints del back con método,
      ruta, roles y columna de pertenencia.
- [ ] La columna de pertenencia referencia `archivo:línea` cuando el
      check existe, y describe la ausencia cuando no.
- [ ] La sección de auditoría del front enumera los endpoints
      consumidos por cada rol, con archivo y nombre de página.
- [ ] El resumen de "cuántos agujeros" coincide con el conteo de PR 2
      (los 8 hallazgos confirmados con curl).
- [ ] `git diff` no toca archivos fuera de
      `openspec/changes/audit-autorizacion-e3-01/`.

## Rollback Plan

Revertir la PR. No toca runtime, no toca DB, no toca migraciones:
solo docs en `openspec/changes/`. Borrar la carpeta
`openspec/changes/audit-autorizacion-e3-01/` revierte el cambio al 100%.
