---
id: H-visibilidad-pii
epic: yura:backlog:E3-01
title: "Visibilidad — oferta por id y listado de companies"
severidad: MEDIUM
hallazgos_cubiertos: [H-04, H-08]
dependencias: []
bloquea: []
evidencia: findings/curls.md#h-04
---

# Visibilidad — oferta por id y listado de companies

## Historia

Como **equipo de desarrollo**, quiero que `GET /api/offers/:id` solo
sea visible para la COMPANY dueña (o COORDINATOR) y que
`GET /api/companies` no exponga el RUC ni el email de todas las
empresas a cualquier usuario autenticado, para no filtrar PII
innecesaria.

## Contexto

Dos endpoints exponen información que el usuario no necesita ver:

- **H-04**: `GET /api/offers/:id` está abierto a cualquier usuario
  autenticado, incluyendo `taxId` y `contactEmail` de la empresa
  dueña. Funciona también para ofertas en `DRAFT`/`CLOSED`.
- **H-08**: `GET /api/companies` lista las 12 empresas con `taxId`
  (RUC) y `contactEmail` completos a cualquier usuario logueado. Lo
  usa solo `CompanyOffersPage` para mostrar el header de la empresa
  del usuario; un STUDENT logueado con DevTools ve todo.

## Criterios de aceptación

- [ ] `GET /api/offers/:id` rechaza con 403 si el caller no es
      COORDINATOR ni la COMPANY dueña de la oferta.
- [ ] Para ofertas en `PUBLISHED`, STUDENT puede seguir accediendo
      (catálogo público).
- [ ] `GET /api/companies` rechaza con 403 si el caller no es
      COORDINATOR.
- [ ] `CompanyOffersPage` sigue funcionando (la COMPANY dueña ve su
      propia empresa en el header).
- [ ] Tests que reproduzcan los 2 curls de `findings/curls.md`
      (H-04, H-08).

## Notas técnicas

- H-04: o bien se cambia el `@Roles` a `[COMPANY, COORDINATOR]` con
  assert de dueño, o bien se mantiene abierto y se filtra el body
  con un `select` que omita `taxId`/`contactEmail` para usuarios
  que no son la COMPANY dueña ni COORDINATOR. La primera opción es
  más segura; la segunda preserva el catálogo público.
- H-08: cambiar `@Roles` a `[COORDINATOR]` y exponer la empresa
  propia del usuario COMPANY por otro endpoint (`GET
  /api/companies/me` por ejemplo) o por `AuthUser.companyId` que ya
  viaja en el login.
- Archivos a tocar:
  - `src/offer/offer.controller.ts` (H-04).
  - `src/offer/offer.service.ts` (H-04, filtro de campos sensibles).
  - `src/company/company.controller.ts` (H-08).
  - `src/company/company.service.ts` (H-08, separación de
    visibilidad).

## Definición de terminado

- Los 2 curls de `findings/curls.md` (H-04, H-08) devuelven 403 o
  respuesta sin PII sensible para STUDENT / COMPANY ajena.
- COORDINATOR sigue viendo todas las empresas y todas las ofertas.
- STUDENT sigue viendo el catálogo de ofertas publicadas (sin PII
  sensible de empresa).

<!-- yura:backlog:E3-01 -->
