---
id: H-applications-decide
epic: yura:backlog:E3-01
title: "Decisión de postulación — filtro por company"
severidad: HIGH
hallazgos_cubiertos: [H-06]
dependencias: [H-applications-list]
bloquea: []
evidencia: findings/curls.md#h-06
---

# Decisión de postulación — filtro por company

## Historia

Como **equipo de desarrollo**, quiero que `PATCH
/api/applications/:id/decide` solo permita a la COMPANY dueña de la
oferta aceptar, rechazar o marcar como `INTERVIEW` una postulación,
para que ninguna empresa pueda sabotear procesos de selección de
otras.

## Contexto

**H-06**: `ApplicationController.decide` permite COMPANY y
COORDINATOR. `ApplicationService.decide` (líneas 43-62 de
`src/application/application.service.ts`) carga la postulación,
verifica que esté en `SUBMITTED` o `INTERVIEW`, y cambia el estado.
**No carga la oferta ni compara `offer.companyId === user.companyId`**.

Cualquier COMPANY puede tomar decisiones sobre postulaciones de ofertas
ajenas. En producción esto significa sabotaje de selección.

## Criterios de aceptación

- [ ] `PATCH /api/applications/:id/decide` rechaza con 403 si la
      oferta de la postulación no pertenece a la `companyId` del
      usuario.
- [ ] COORDINATOR sigue pudiendo decidir cualquier postulación.
- [ ] Test que reproduzca el curl de `findings/curls.md` (H-06).

## Notas técnicas

- Mismo guard `@OfferOwnedByCompany()` que `H-ofertas-company` y
  `H-applications-list`, aplicado al `:id` de la postulación (cargar
  la postulación, luego la oferta, comparar `companyId`).
- Alternativa: en `ApplicationService.decide`, cargar la oferta con
  `application.offer` (incluir relación) y comparar antes de
  actualizar.
- Depende de `H-applications-list` porque comparten el mismo patrón
  y probablemente el mismo guard. Se puede hacer independiente, pero
  la consistencia del fix es mejor si van juntos.
- Archivo a tocar: `src/application/application.controller.ts` +
  `src/application/application.service.ts`.

## Definición de terminado

- El curl de `findings/curls.md` (H-06) devuelve 403 cuando se
  ejecuta siendo un COMPANY distinto al dueño de la oferta.
- COORDINATOR sigue decidiendo cualquier postulación sin cambios.

<!-- yura:backlog:E3-01 -->
