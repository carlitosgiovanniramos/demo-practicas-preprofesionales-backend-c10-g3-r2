# Revisión de campos de usuario en las respuestas

Historia: *Revisar que ninguna respuesta filtre datos sensibles.*

Revisa los 26 endpoints del inventario (`README.md`) y anota cuáles
devuelven datos de una persona (`User`) y qué campos salen. Fecha de la
revisión: 2026-10-14, sobre `develop` después del #20.

## Qué se considera sensible

Del modelo `User` (`prisma/schema.prisma`):

| Campo | ¿Puede salir? | Motivo |
|-------|---------------|--------|
| `id` | Sí | Identificador; el front lo usa para enlazar. |
| `fullName` | Sí | Es lo que muestran las pantallas. |
| `email` | Sí, cuando hace falta contactar | La empresa contacta al candidato; el estudiante, a su tutor. |
| `role`, `companyId` | Solo al propio usuario (login) | El front arma la sesión con ellos. |
| `password` | **Nunca** | Hash de la credencial. |
| `createdAt` | No | Campo interno, ninguna pantalla lo usa. |

`refreshTokenHash` (tabla de sesiones que añade el #18) tampoco puede salir
nunca. El test lo vigila desde ya.

La forma pública está en `src/common/public-user.ts` (`PUBLIC_USER`:
`id`, `fullName`, `email`).

## Endpoints que devuelven datos de usuario

| Ruta | Quién | Campos de usuario en la respuesta | Cómo se acota |
|------|-------|-----------------------------------|---------------|
| `POST /api/auth/login` | público | `user`: `id`, `email`, `fullName`, `role`, `companyId` | La respuesta se arma campo a campo. La consulta lee `password` para compararlo, ahora con `select` explícito (`src/auth/auth.service.ts`). |
| `GET /api/offers/:offerId/applications` | COMPANY dueña, COORDINATOR | `student`: `id`, `fullName`, `email` | `PUBLIC_USER` (`src/application/application.service.ts`, `listByOffer`). |
| `GET /api/placements/me` | STUDENT | `tutor`: `id`, `fullName`, `email` | `PUBLIC_USER` (`src/placement/placement.service.ts`, `findForStudent`). |
| `GET /api/placements/accreditation` | COORDINATOR | `studentName` (solo el nombre) | La respuesta se arma a mano; la consulta pasa de `student: true` a `select: { fullName: true }` (`src/placement/accreditation.service.ts`). |

## Endpoints que no devuelven usuarios

Devuelven solo ids de personas (`studentId`, `tutorId`, `evaluatorId`,
`reviewedById`, `uploadedById`), nunca la fila del usuario:

- Empresas: `GET /api/companies`, `POST /api/companies`.
- Ofertas: `GET /api/offers`, `GET /api/offers/me`, `GET /api/offers/:id`,
  `POST /api/offers`, `PATCH /api/offers/:id/publish`, `PATCH /api/offers/:id/close`.
- Postulaciones: `POST /api/applications`, `GET /api/applications/me`,
  `PATCH /api/applications/:id/decide`.
- Placements: `POST /api/placements`, `PATCH /api/placements/:id/activate`,
  `POST /api/placements/:id/documents`.
- Horas: `POST /api/hour-logs`, `GET /api/placements/:id/hour-logs`,
  `GET /api/placements/:id/progress`, `PATCH /api/hour-logs/:id/review`.
- Evaluaciones: `POST /api/evaluations`, `GET /api/placements/:id/evaluations`.
- Sync: `GET /api/sync/pull`, `POST /api/sync/push`.

## Consultas internas acotadas

No llegan a la respuesta, pero también cargaban la fila entera del usuario:

- `EvaluationService.assertCompanyEvaluation`: ahora `select: { companyId: true }`.

Las demás lecturas de `user` ya pedían solo `companyId`
(`ApplicationService.assertOfferAccess`, `OfferService.create`, `OfferService.findMine`).

## Pendiente fuera de esta historia

- **#18 (sesiones), `AuthService.refresh`**: hace `include: { user: true }`.
  No lo devuelve, pero lee el hash a memoria sin necesidad. Al entrar el #18
  debería quedar como `include: { user: { select: { id: true, email: true, role: true } } }`.
- **`GET /api/placements/me`, `company: true`**: al estudiante le llegan el
  RUC (`taxId`) y el `contactEmail` de su empresa. No es un dato de usuario,
  pero es el mismo patrón que H-04. Antes de cambiarlo a `PUBLIC_COMPANY` hay
  que confirmar si el front usa el correo de contacto.
- **`GET /api/placements/me`, `documents: true`**: devuelve `storageKey`, la
  ruta interna del archivo. Conviene revisar si el front la necesita.

## Cómo se protege la regresión

`src/common/sensitive-fields.http.spec.ts` levanta los controllers con los
guards reales y un Prisma falso que proyecta como el real: con `select`
devuelve solo lo pedido y con `include: { x: true }` la fila completa,
`password` incluido. Recorre la respuesta de cada endpoint de la tabla y
falla si aparece `password` o `refreshTokenHash` a cualquier profundidad.

Se comprobó que el test muerde: con `tutor: true` en `findForStudent` falla
con `expected [ '$.tutor.password' ] to deeply equal []`.

Al añadir un endpoint que devuelva personas, añádelo a esta tabla y al
`it.each` del test.
