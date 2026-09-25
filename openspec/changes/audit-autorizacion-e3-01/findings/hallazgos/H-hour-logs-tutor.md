---
id: H-hour-logs-tutor
epic: yura:backlog:E3-01
title: "Revisión de hour-logs — guard de tutor asignado"
severidad: CRITICAL
hallazgos_cubiertos: [H-07]
dependencias: []
bloquea: []
evidencia: findings/curls.md#h-07
---

# Revisión de hour-logs — guard de tutor asignado

## Historia

Como **equipo de desarrollo**, quiero que `PATCH
/api/hour-logs/:id/review` solo permita al **tutor asignado al
placement** aprobar o rechazar registros de horas, para que ningún
tutor pueda afectar la evaluación académica de estudiantes que no
están bajo su supervisión.

## Contexto

**H-07**: `HourLogController.review` está restringido a `@Roles(TUTOR)`.
`HourLogService.review` (líneas 95-111 de
`src/hour-log/hour-log.service.ts`) carga el hour-log, verifica que
esté en `SUBMITTED`, y actualiza el estado. **No carga el placement
ni compara `placement.tutorId === user.id`**.

Cualquier TUTOR puede aprobar o rechazar horas de cualquier
placement. Esto compromete la integridad de la evaluación académica
porque afecta el cómputo final de horas acreditadas. Hallazgo
clasificado como **CRITICAL**.

Adicionalmente, la UI (`ReviewHoursPage` en el front) no protege
contra esto: `RequireRole roles={['TUTOR']}` solo chequea rol, no
que el placement sea del tutor.

## Criterios de aceptación

- [ ] `PATCH /api/hour-logs/:id/review` rechaza con 403 si el
      `placement.tutorId` no coincide con `user.id`.
- [ ] COORDINATOR sigue pudiendo revisar (bypass explícito).
- [ ] Test que reproduzca el curl de `findings/curls.md` (H-07) y
      verifique que devuelve 403 cuando el tutor no es el asignado.
- [ ] (Opcional, recomendado) Gate de UI: `RequirePlacementTutor`
      en el front que oculte la ruta `/practicantes/:id/horas` si
      el placement no pertenece al tutor autenticado.

## Notas técnicas

- Patrón: guard reutilizable `@HourLogForPlacementOwnedByTutor()`
  que carga el hour-log, hace `include: { placement: true }`, y
  compara `placement.tutorId === user.id` (con bypass para
  COORDINATOR).
- Alternativa más simple: en `HourLogService.review`, agregar la
  carga de `placement.tutorId` y la comparación. Menos reutilizable
  pero más directo.
- Archivo a tocar: `src/hour-log/hour-log.controller.ts` +
  `src/hour-log/hour-log.service.ts` + tests.

## Definición de terminado

- El curl de `findings/curls.md` (H-07) devuelve 403 cuando se
  ejecuta siendo un TUTOR distinto al asignado al placement.
- COORDINATOR sigue revisando hour-logs sin cambios.
- La UI deja de mostrar la ruta de revisión para placements que no
  son del tutor (defensa en profundidad).

<!-- yura:backlog:E3-01 -->
