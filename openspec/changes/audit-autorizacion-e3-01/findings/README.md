# Inventario de autorización (E3-01)

Tabla viva: una fila por endpoint del back, con roles permitidos y si el
handler **comprueba pertenencia** además de rol. La columna "Pertenencia"
referencia `archivo:línea` cuando el check existe; cuando falta, dice
`NO` y la historia hija correspondiente (en `hallazgos/H-NN.md`) lo
detalla.

Auditoría realizada contra `develop` con back levantado en
`http://localhost:3000` y seed del repo. **8 agujeros confirmados con
curl real** — ver `curls.md` (PR 2). Resumen al final.

## Tabla inventario — backend

Convención de la columna "Pertenencia":

- `SÍ (filtro)` — el handler filtra por `user.id`/`user.companyId` en el
  `where` de Prisma.
- `SÍ (assert)` — el handler compara `user.id`/`user.role` contra el
  recurso cargado.
- `SÍ (implícito)` — el handler usa `req.user.sub` como FK del nuevo
  registro, así que solo el dueño puede crearlo.
- `NO` — el handler no compara; la acción cruza límites de pertenencia.
- `n/a` — no aplica (público, o solo accesible por un rol sin concepto
  de dueño).

| # | Método | Ruta | Controller / handler | Roles | Pertenencia | Evidencia |
|---|--------|------|----------------------|-------|-------------|-----------|
| 1 | POST | `/api/auth/login` | `AuthController.login` | público | n/a | `src/auth/auth.controller.ts:9` |
| 2 | GET | `/api/companies` | `CompanyController.findAll` | todos los autenticados | **NO** | `src/company/company.service.ts:13-15` — `findMany()` sin filtro |
| 3 | POST | `/api/companies` | `CompanyController.create` | COORDINATOR | n/a | `src/company/company.service.ts:9-11` |
| 4 | GET | `/api/offers` | `OfferController.findAll` | todos los autenticados | n/a (catálogo público de publicadas) | `src/offer/offer.service.ts:14-20` filtra `status: PUBLISHED` |
| 5 | GET | `/api/offers/me` | `OfferController.findMine` | COMPANY | **SÍ (filtro)** | `src/offer/offer.service.ts:32-40` — `where: { companyId: user.companyId }` |
| 6 | GET | `/api/offers/:id` | `OfferController.findOne` | todos los autenticados | **NO** | `src/offer/offer.service.ts:22-26` — solo verifica existencia |
| 7 | POST | `/api/offers` | `OfferController.create` | COMPANY, COORDINATOR | **NO** | `src/offer/offer.service.ts:10-12` — `companyId` viene del DTO sin sobreescribir |
| 8 | PATCH | `/api/offers/:id/publish` | `OfferController.publish` | COMPANY, COORDINATOR | **NO** | `src/offer/offer.service.ts:42-52` — solo verifica estado, no dueño |
| 9 | PATCH | `/api/offers/:id/close` | `OfferController.close` | COMPANY, COORDINATOR | **NO** | `src/offer/offer.service.ts:54-61` — solo verifica estado, no dueño |
| 10 | POST | `/api/applications` | `ApplicationController.apply` | STUDENT | **SÍ (implícito)** | `src/application/application.controller.ts:17-18` — `studentId = req.user.sub` |
| 11 | GET | `/api/offers/:offerId/applications` | `ApplicationController.listByOffer` | COMPANY, COORDINATOR | **NO** | `src/application/application.service.ts:30-41` — no filtra por `companyId` |
| 12 | GET | `/api/applications/me` | `ApplicationController.findMine` | STUDENT | **SÍ (filtro)** | `src/application/application.service.ts:21-27` — `where: { studentId }` |
| 13 | PATCH | `/api/applications/:id/decide` | `ApplicationController.decide` | COMPANY, COORDINATOR | **NO** | `src/application/application.service.ts:43-62` — no chequea dueño de la oferta |
| 14 | GET | `/api/placements/accreditation` | `PlacementController.accreditation` | COORDINATOR | n/a | `src/placement/placement.controller.ts:22-26` |
| 15 | POST | `/api/placements` | `PlacementController.create` | COORDINATOR | n/a | `src/placement/placement.controller.ts:28-32` |
| 16 | GET | `/api/placements/me` | `PlacementController.findMine` | STUDENT | **SÍ (filtro)** | `src/placement/placement.service.ts:64-75` — `where: { studentId }` |
| 17 | PATCH | `/api/placements/:id/activate` | `PlacementController.activate` | COORDINATOR | n/a (solo COORDINATOR) | `src/placement/placement.service.ts:41-62` |
| 18 | POST | `/api/placements/:id/documents` | `PlacementController.addDocument` | STUDENT, COORDINATOR | **SÍ (assert)** | `src/placement/placement.service.ts:77-87` — `placement.studentId === uploadedById` o COORDINATOR |
| 19 | POST | `/api/hour-logs` | `HourLogController.create` | STUDENT | **SÍ (assert)** | `src/hour-log/hour-log.service.ts:30-63` — `placement.studentId === studentId` |
| 20 | GET | `/api/placements/:id/hour-logs` | `HourLogController.listForPlacement` | todos los autenticados | **SÍ (assert)** | `src/hour-log/hour-log.service.ts:74-79` — `assertPlacementAccess` |
| 21 | GET | `/api/placements/:id/progress` | `HourLogController.progress` | todos los autenticados | **SÍ (assert)** | `src/hour-log/hour-log.service.ts:74-79` — `assertPlacementAccess` |
| 22 | PATCH | `/api/hour-logs/:id/review` | `HourLogController.review` | TUTOR | **NO** | `src/hour-log/hour-log.service.ts:95-111` — solo verifica `status === SUBMITTED` |
| 23 | POST | `/api/evaluations` | `EvaluationController.submit` | TUTOR, COMPANY, STUDENT | **SÍ (assert)** | `src/evaluation/evaluation.service.ts:11-64` — `assertCanSubmit` por rol y dueño |
| 24 | GET | `/api/placements/:id/evaluations` | `EvaluationController.listForPlacement` | todos los autenticados | **SÍ (assert)** | `src/evaluation/evaluation.service.ts:66-77` — `placement.studentId/tutorId` o COORDINATOR |
| 25 | GET | `/api/sync/pull` | `SyncController.pull` | todos los autenticados | **SÍ (implícito)** | `src/sync/sync.service.ts` — filtra por `userId` |
| 26 | POST | `/api/sync/push` | `SyncController.push` | todos los autenticados | **SÍ (implícito)** | `src/sync/sync.service.ts` — opera con `userId` |

### Conteo por controller

| Controller | Endpoints | Chequean pertenencia | NO chequean | Endpoints sin `:id` en ruta |
|------------|-----------|----------------------|-------------|------------------------------|
| `AuthController` | 1 | 0 | 0 | 1 |
| `CompanyController` | 2 | 0 | 1 | 2 |
| `OfferController` | 6 | 1 | 4 | 3 |
| `ApplicationController` | 4 | 2 | 2 | 2 |
| `PlacementController` | 5 | 2 | 0 | 3 |
| `HourLogController` | 4 | 3 | 1 | 1 |
| `EvaluationController` | 2 | 2 | 0 | 1 |
| `SyncController` | 2 | 2 | 0 | 0 |
| **TOTAL** | **26** | **12** | **8** | **13** |

## Hallazgos explotables — los 8 confirmados con curl

Severidad asignada con el back levantado:

| ID | Endpoint | Roles | Vector | Severidad |
|----|----------|-------|--------|-----------|
| H-01 | `POST /api/offers` | COMPANY | Crea oferta con `companyId` de otra empresa | **HIGH** |
| H-02 | `PATCH /api/offers/:id/publish` | COMPANY | Publica oferta DRAFT ajena | **HIGH** |
| H-03 | `PATCH /api/offers/:id/close` | COMPANY | Cierra oferta PUBLISHED ajena | **HIGH** |
| H-04 | `GET /api/offers/:id` | todos | Ve detalle + taxId + contactEmail de cualquier oferta, incluidas DRAFT/CLOSED | **MEDIUM** |
| H-05 | `GET /api/offers/:offerId/applications` | COMPANY | Lista postulaciones + PII de estudiantes de ofertas ajenas | **HIGH** |
| H-06 | `PATCH /api/applications/:id/decide` | COMPANY | Decide (ACCEPT/REJECT/INTERVIEW) postulaciones de ofertas ajenas | **HIGH** |
| H-07 | `PATCH /api/hour-logs/:id/review` | TUTOR | Aprueba/rechaza hour-logs de placements tutorizados por OTRO tutor | **CRITICAL** |
| H-08 | `GET /api/companies` | todos | Lista todas las empresas con RUC + contactEmail, sin filtro de visibilidad | **MEDIUM** |

Cada uno tiene un curl ejecutable en `curls.md` (PR 2) y una historia
hija en `hallazgos/H-NN.md` (PR 3).

## Endpoints que ya validan pertenencia (referencia, sin hallazgo)

Sirve como evidencia de "el patrón existe, hay que extenderlo, no
inventarlo":

- `GET /api/offers/me` (filtro por `companyId`).
- `GET /api/applications/me` (filtro por `studentId`).
- `GET /api/placements/me` (filtro por `studentId`).
- `POST /api/placements/:id/documents` (assert `studentId` o COORDINATOR).
- `POST /api/hour-logs` (assert `placement.studentId === studentId`).
- `GET /api/placements/:id/hour-logs`, `/progress` (`assertPlacementAccess`).
- `POST /api/evaluations` (`assertCanSubmit` por rol y dueño).
- `GET /api/placements/:id/evaluations` (assert por rol).
- `GET /api/sync/pull`, `POST /api/sync/push` (filtro por `userId`).

## Auditoría de uso en el front

Mapa por rol: qué endpoints consume cada rol desde la UI
(`src/pages/*.tsx`, `src/api/*.ts`, `src/offline/sync/*.ts`).
Relevante para la historia porque el front también acota la
superficie: si un endpoint no se llama desde la UI, el agujero es
"deeper" pero igual accesible vía curl/Postman.

### STUDENT

| Ruta UI | Página | Endpoint consumido |
|---------|--------|--------------------|
| `/ofertas` | `OffersPage.tsx` | `GET /api/offers` |
| `/ofertas/:id` | `OfferDetailPage.tsx` | `GET /api/offers/:id`, `POST /api/applications`, `GET /api/applications/me` |
| `/postulaciones` | `MyApplicationsPage.tsx` | `GET /api/applications/me` |
| `/mi-practica` | `MyPlacementPage.tsx` | `GET /api/placements/me` |
| `/horas` | `HourLogsPage.tsx` | `GET /api/placements/:id/hour-logs`, `POST /api/hour-logs`, `GET /api/sync/pull` (offline) |
| `/documentos` | `DocumentsPage.tsx` | `POST /api/placements/:id/documents` |
| (offline) | `src/offline/sync/pull.ts`, `push.ts` | `GET /api/sync/pull`, `POST /api/sync/push` |

Notas: STUDENT **no consume** `POST /api/offers` ni ningún endpoint
de patch. La superficie desde la UI es la del propio estudiante + el
catálogo. Pero el agujero H-04 le permite ver ofertas en DRAFT/CLOSED
de cualquier empresa vía curl (no implementado en UI hoy; igual es
PII que se filtra si alguien prueba).

### TUTOR

| Ruta UI | Página | Endpoint consumido |
|---------|--------|--------------------|
| `/practicantes` | `MyStudentsPage.tsx` | (asume `GET /api/placements?` — confirmar) |
| `/practicantes/:id/horas` | `ReviewHoursPage.tsx` | `GET /api/placements/:id/hour-logs`, `PATCH /api/hour-logs/:id/review` |
| `/practicantes/:id/evaluar` | `EvaluatePage.tsx` | `POST /api/evaluations` |

Notas: H-07 es crítico porque la UI permite directamente a cualquier
TUTOR entrar a `/practicantes/:id/horas` (mientras conozca un
placementId válido) y revisar hour-logs. **El guard de ruta no
existe**: `RequireRole roles={['TUTOR']}` solo chequea rol, no si el
placement es del tutor.

### COMPANY

| Ruta UI | Página | Endpoint consumido |
|---------|--------|--------------------|
| `/ofertas-empresa` | `CompanyOffersPage.tsx` | `GET /api/offers/me`, `GET /api/companies`, `POST /api/offers`, `PATCH /api/offers/:id/publish`, `PATCH /api/offers/:id/close` |
| `/ofertas-empresa/:id/postulaciones` | `OfferApplicationsPage.tsx` | `GET /api/offers/:id`, `GET /api/offers/:offerId/applications`, `PATCH /api/applications/:id/decide` |

Notas: el front sí itera sobre `myOffers` antes de mostrar los
botones "publicar/cerrar", así que en el flujo UI un COMPANY no
dispara H-02/H-03 con un id ajeno. **Pero un curl directo sí lo
logra** (verificado). El guard faltante está en el back, no en el
front.

### COORDINATOR

| Ruta UI | Página | Endpoint consumido |
|---------|--------|--------------------|
| `/acreditacion` | `AccreditationPage.tsx` | `GET /api/placements/accreditation` |

Notas: el front no expone los flujos administrativos
(`POST /api/placements`, `PATCH /api/placements/:id/activate`,
`POST /api/companies`). Existen en el back, son COORDINATOR-only y
no son agujeros por sí solos, pero conviene recordar que la
"superficie de ataque" desde la UI es solo una fracción de la
superficie real.

### Guard de ruta del front

`src/auth/RequireRole.tsx:12` solo chequea `roles.includes(role)`. No
hay guard de pertenencia en el front — la UI confía en que el back
rechace. **Eso significa que si el back no rechaza (los 8 agujeros),
la UI tampoco.**

### Endpoints del back NO consumidos por el front (pero expuestos)

- `GET /api/companies` — existe en `src/api/companies.ts:54` pero solo
  `CompanyOffersPage` lo llama para el header. **No hay gating**: cualquier
  STUDENT logueado que tenga acceso a DevTools puede listar las 12 empresas.
  (H-08)
- `POST /api/placements`, `PATCH /api/placements/:id/activate` —
  COORDINATOR-only, sin UI; accesible solo desde curl.

## Resumen

**8 agujeros explotables confirmados** sobre 26 endpoints (≈31% del
back). El equipo sabe exactamente cuántos hay y cuáles duelen; el
backlog de remediación vive en `hallazgos/H-01.md` ... `H-08.md`.

| Severidad | Cantidad |
|-----------|----------|
| CRITICAL | 1 (H-07) |
| HIGH | 5 (H-01, H-02, H-03, H-05, H-06) |
| MEDIUM | 2 (H-04, H-08) |
| **TOTAL** | **8** |
