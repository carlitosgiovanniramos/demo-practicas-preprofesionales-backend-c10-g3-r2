---
id: H-applications-list
epic: yura:backlog:E3-01
title: "Listado de postulaciones — filtro por company"
severidad: HIGH
hallazgos_cubiertos: [H-05]
dependencias: []
bloquea: [H-applications-decide]
evidencia: findings/curls.md#h-05
---

# Listado de postulaciones — filtro por company

## Historia

Como **equipo de desarrollo**, quiero que `GET
/api/offers/:offerId/applications` solo devuelva las postulaciones
de ofertas que pertenezcan a la `companyId` del usuario, para que
ninguna COMPANY vea las postulaciones de otras empresas (incluyendo
PII de los estudiantes).

## Contexto

**H-05**: `ApplicationController.listByOffer` permite COMPANY y
COORDINATOR. `ApplicationService.listByOffer` (líneas 30-41 de
`src/application/application.service.ts`) hace `findMany({ where:
{ offerId } })` sin filtrar por `companyId`. Cualquier COMPANY puede
listar las postulaciones de cualquier oferta. La respuesta incluye
`student.email` y `student.fullName` de cada postulante.

## Criterios de aceptación

- [ ] `GET /api/offers/:offerId/applications` rechaza con 403 si la
      oferta no pertenece a la `companyId` del usuario.
- [ ] COORDINATOR sigue pudiendo listar postulaciones de cualquier
      oferta.
- [ ] Test que reproduzca el curl de `findings/curls.md` (H-05).

## Notas técnicas

- Patrón: reutilizar el guard `@OfferOwnedByCompany()` que propone
  `H-ofertas-company`. Mismo guard, misma mecánica.
- Alternativa: agregar `where: { offer: { companyId: user.companyId
  } }` en `listByOffer`. Más simple pero menos reutilizable.
- Archivo a tocar: `src/application/application.controller.ts` +
  `src/application/application.service.ts`.

## Definición de terminado

- El curl de `findings/curls.md` (H-05) devuelve 403 cuando se
  ejecuta siendo un COMPANY distinto al dueño.
- COORDINATOR sigue viendo las postulaciones de cualquier oferta.

<!-- yura:backlog:E3-01 -->
