---
id: H-ofertas-company
epic: yura:backlog:E3-01
title: "Ofertas — guard de ownership de COMPANY"
severidad: HIGH
hallazgos_cubiertos: [H-01, H-02, H-03]
dependencias: []
bloquea: [H-applications-list, H-applications-decide]
evidencia: findings/curls.md#h-01
---

# Ofertas — guard de ownership de COMPANY

## Historia

Como **equipo de desarrollo**, quiero que un COMPANY solo pueda crear,
publicar y cerrar **sus propias** ofertas, para que ninguna empresa
pueda sabotear o suplantar las ofertas de otras.

## Contexto

`OfferController` tiene 3 endpoints que aceptan COMPANY pero no
validan que la oferta le pertenezca al usuario autenticado. El
`RolesGuard` solo verifica `user.role`, no `user.companyId`. En
paralelo, `OfferService.create` recibe `companyId` del DTO sin
sobrescribirlo con `user.companyId`, lo que permite a una COMPANY
crear ofertas para otra empresa. Hallazgos:

- **H-01**: `POST /offers` acepta `companyId` del DTO.
- **H-02**: `PATCH /offers/:id/publish` no chequea dueño.
- **H-03**: `PATCH /offers/:id/close` no chequea dueño.

## Criterios de aceptación

- [ ] `POST /api/offers` con `companyId` distinto al `companyId` del
      usuario autenticado devuelve 403.
- [ ] `PATCH /api/offers/:id/publish` rechaza con 403 si la oferta
      no pertenece a la `companyId` del usuario.
- [ ] `PATCH /api/offers/:id/close` rechaza con 403 si la oferta
      no pertenece a la `companyId` del usuario.
- [ ] COORDINATOR sigue pudiendo gestionar cualquier oferta (sin
      cambio de comportamiento para ese rol).
- [ ] Tests unitarios + e2e que reproduzcan los 3 curls de
      `findings/curls.md` (H-01, H-02, H-03).

## Notas técnicas

- Patrón recomendado: un guard reutilizable `@OfferOwnedByCompany()`
  que carga la oferta por `:id` y compara `offer.companyId ===
  user.companyId` (con bypass para COORDINATOR). Mismo guard cubre
  `publish`, `close` y futuros endpoints de offers.
- Para `POST /offers`, el handler debe sobreescribir `companyId` del
  DTO con `user.companyId` antes de persistir (o rechazar si el DTO
  trae un `companyId` distinto — más estricto).
- Archivos a tocar:
  - `src/auth/guards/offer-owned-by-company.guard.ts` (nuevo).
  - `src/offer/offer.controller.ts` (decorar endpoints).
  - `src/offer/offer.service.ts` (sobreescribir `companyId` en
    `create`).
  - Tests asociados.

## Definición de terminado

- Los 3 curls de `findings/curls.md` (H-01, H-02, H-03) devuelven
  403 cuando se ejecutan siendo un COMPANY distinto al dueño.
- COORDINATOR puede seguir operando cualquier oferta sin cambios.
- PR con su propio plan, sus tests, su verify.

<!-- yura:backlog:E3-01 -->
