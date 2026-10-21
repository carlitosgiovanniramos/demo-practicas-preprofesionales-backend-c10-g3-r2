# Prácticas Preprofesionales — Backend

> API de gestión de prácticas preprofesionales: ofertas, postulaciones, libro de horas y acreditación.

Template oficial de Yura para el dominio **Prácticas Preprofesionales**. API REST en
**NestJS + Prisma + PostgreSQL** con autenticación JWT, cuatro roles y sincronización
offline para registro de horas en campo.

**Problema que resuelve:** las unidades de vinculación llevan las prácticas en hojas de
cálculo y correos. Los estudiantes registran horas en papel, muchas veces sin señal en el
sitio donde practican. Esta API digitaliza el ciclo completo y funciona sin conexión.

## Setup

Requisitos: Node 24+, pnpm 10+, Docker.

```bash
pnpm install
cp .env.example .env
# Genera un JWT_SECRET y pégalo en .env (ver "Variables de entorno")
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
docker compose up -d
pnpm db:deploy
pnpm db:seed
pnpm dev
```

La API queda en `http://localhost:3000/api`. Si el puerto 5432 ya está ocupado en tu
máquina, cambia `POSTGRES_PORT` y `DATABASE_URL` en `.env` antes de `docker compose up`.

## Variables de entorno

| Variable | Valor por defecto | Descripción |
|---|---|---|
| `DATABASE_URL` | (requerido) | Cadena de conexión PostgreSQL |
| `JWT_SECRET` | (requerido) | Secreto para firmar JWTs |
| `JWT_ACCESS_TTL_SECONDS` | `900` | Vida corta del token de acceso, en segundos (1–3600) |
| `JWT_REFRESH_TTL_DAYS` | `7` | Vida sin actividad de la sesión renovable, en días (1–365) |
| `PORT` | `3000` | Puerto donde escucha la API |
| `CORS_ORIGIN` | `http://localhost:5173` | Origen permitido para requests desde el navegador (frontend Vite) |
| `INSTITUTION_TIME_ZONE` | `America/Guayaquil` | Zona IANA de la institución para validar el día actual de las jornadas; una zona inválida impide el arranque |

### Fecha de las jornadas: día calendario

`HourLog.date` representa el **día elegido**, no el instante en que se trabajó ni el
reloj del teléfono. HTTP y sync (crear y editar) reciben `YYYY-MM-DD` y lo normalizan
en el servidor como `YYYY-MM-DDT00:00:00.000Z`. Esa medianoche UTC es una codificación
del día para conservar el esquema y la respuesta existentes; no debe convertirse a
hora local para mostrarlo. El formulario actual ya envía `YYYY-MM-DD`.

Por compatibilidad se acepta también esa codificación ISO de medianoche UTC (con o
sin `.000`), por ejemplo al reenviar una fila recibida del servidor. Otros timestamps,
offsets y horas sin zona se rechazan con un error de formato: convertirlos podría
cambiar el día que quiso elegir el estudiante. El cliente debe enviar la selección
del calendario, sin convertirla con `new Date(...).toISOString()` en su zona local.

El servidor valida fechas reales (incluidos años bisiestos), el periodo inclusivo
`Placement.startDate`–`endDate` y que el día no supere **hoy en la zona institucional**.
El periodo también se interpreta por su día UTC almacenado. Por ejemplo, a las
`2026-04-02T02:00:00Z`, en Guayaquil todavía es `2026-04-01`; registrar el día 2 se
rechaza aunque el dispositivo ya esté en ese día. Una fecha fuera de periodo informa
ambos límites. HTTP devuelve 400; sync devuelve `rejected` con el mismo motivo.
El servidor no puede adivinar otro día pasado si el estudiante lo eligió por error.

**Datos existentes y despliegue:** no hay migración ni actualización masiva de filas,
ni cambio de esquema o de la zona del proceso/PostgreSQL. Las lecturas, el pull y el
CSV conservan sus valores y días. **Cambio visible en el resumen semanal:** antes,
`weeklySummary` agrupaba con la zona local del servidor; en un servidor con zona negativa
(por ejemplo America/Guayaquil) las filas del lunes caían en la semana anterior. Ahora usa
los componentes UTC del día, así que en servidores no UTC esas filas pueden cambiar de
semana en informes ya generados. Ningún dato se reescribe. Los reintentos de operaciones ya
aplicadas siguen devolviendo la respuesta guardada sin revalidar ni reescribir la fila.
Una edición nueva sí valida la fecha; para corregir un timestamp histórico no canónico,
el cliente debe enviar explícitamente `YYYY-MM-DD`. No se reinterpretan automáticamente
esas horas antiguas como instantes de la zona institucional. El rollback consiste en
revertir el código: no hay transformación de datos que deshacer. Cualquier futura
corrección de datos históricos requerirá una migración separada con respaldo y reversión.

**Outbox offline y fechas no canónicas:** una operación de sync cuya fecha no es
`YYYY-MM-DD` ni el ISO de medianoche UTC (por ejemplo, un timestamp con hora u offset que
quedó en un outbox creado por una versión previa del cliente) se responde como `rejected`
con el mensaje de formato y no escribe la fila. El rechazo es determinista: un reintento con
el mismo `clientOpId` devuelve el mismo motivo guardado en `sync_operations`. El cliente
quita la operación de la cola y marca el registro local como `failed` con ese motivo en
`syncNote`; el estudiante debe volver a elegir el día en el calendario y guardarlo. Solo este
rechazo de fecha se persiste así. Otros `BadRequestException` durante la aplicación son fallos
de infraestructura: no se cachean y el reintento vuelve a aplicar la operación.

### `JWT_SECRET`

No tiene valor por defecto: si falta o está vacía, la API **no arranca** y el error dice
`Falta la variable de entorno JWT_SECRET`. Quien conozca el secreto puede firmarse tokens
con cualquier rol, así que:

- Usa un valor aleatorio de al menos 32 bytes, generado con un CSPRNG:

  ```bash
  node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
  # o, si tienes OpenSSL:
  openssl rand -base64 48
  ```

- Genera uno distinto por entorno (local, CI, staging, producción). En producción guárdalo
  en el gestor de secretos de la plataforma, nunca en el repo.
- Cambiarlo invalida todos los tokens emitidos: los usuarios tendrán que volver a loguearse.

El access token expira en 15 minutos por defecto. La sesión se renueva con un refresh token
aleatorio, de un solo uso, guardado en una cookie `HttpOnly`; su hash es el único valor persistido.
Cada renovación invalida el token anterior. Ajusta `JWT_ACCESS_TTL_SECONDS` y
`JWT_REFRESH_TTL_DAYS` según el entorno.

Usuarios del seed (contraseña `yura1234` para todos):

| Rol | Email |
|---|---|
| Coordinador | `coordinador@miyura.com` |
| Tutor | `tutor0@miyura.com` … `tutor7@miyura.com` |
| Empresa | `empresa0@miyura.com` … `empresa11@miyura.com` |
| Estudiante | `estudiante0@miyura.com` … `estudiante199@miyura.com` |

## Architecture

```
src/
├── main.ts              bootstrap NestJS, prefijo /api
├── app.module.ts        módulo raíz
├── common/              filtro de excepciones
├── prisma/              PrismaService global
├── auth/                login JWT, JwtAuthGuard, RolesGuard
├── company/             empresas
├── offer/               ofertas, publicar, cerrar, cupos
├── application/         postulaciones y decisión
├── placement/           plazas, documentos, acreditación
├── hour-log/            libro de horas
├── evaluation/          evaluaciones de tutor y empresa
└── sync/                pull y push para el cliente offline
```

Modelo de datos:

```
User (STUDENT | TUTOR | COMPANY | COORDINATOR)

Company ──< Offer ──< Application >── User(student)
                          │
                          └── Placement ◆ ──< HourLog ◆
                                         ├──< Evaluation ◆
                                         └──< Document ◆
```

Los modelos marcados ◆ son sincronizables offline: llevan `version`, `updatedAt` y
`deletedAt`.

Máquinas de estado:

| Entidad | Transiciones |
|---|---|
| `Application` | `SUBMITTED → INTERVIEW → ACCEPTED \| REJECTED \| WITHDRAWN` |
| `Placement` | `PENDING_DOCS → ACTIVE → COMPLETED \| ABANDONED \| SUSPENDED` |
| `HourLog` | `DRAFT → SUBMITTED → APPROVED \| REJECTED` |

Reglas de negocio que el dominio sostiene:

- Las postulaciones aceptadas de una oferta no superan sus `seats`.
- Un estudiante tiene como máximo un `Placement` en `ACTIVE`.
- Un `Placement` solo pasa a `ACTIVE` con convenio y seguro validados.
- Un `Placement` debería pasar a `COMPLETED` cuando las horas aprobadas alcancen
  `requiredHours` — esa transición es la regla de negocio prevista, pero todavía no hay
  código que la implemente.
- Solo el tutor asignado aprueba las horas de su placement.

### Sincronización offline

El cliente mantiene una copia local en IndexedDB y reconcilia contra dos endpoints:

- `GET /api/sync/pull?since=<cursor>&limit=200` — devuelve los cambios posteriores al
  checkpoint. Los borrados viajan como tombstones (`deletedAt != null`). `limit` se acota
  a 500 en el servidor.
- `POST /api/sync/push` — recibe operaciones del outbox, cada una con su `clientOpId`.

**Respuesta de `pull`:**

```json
{
  "changes": {
    "placements": [{ "id": 1, "studentId": 5, "tutorId": 7, "status": "ACTIVE", "updatedAt": "2026-04-01T12:00:00.000Z" }],
    "hourLogs": [{ "id": 99, "placementId": 1, "status": "SUBMITTED", "updatedAt": "2026-04-01T12:00:00.000Z" }],
    "documents": [],
    "evaluations": []
  },
  "checkpoint": "eyJ2IjoyLCJwbGFjZW1lbnQiOnsidXBkYXRlZEF0IjoiMjAyNi0wNC0wMVQxMjowMDowMC4wMDBaIiwiaWQiOjk5fSwiaG91ckxvZyI6bnVsbCwiZG9jdW1lbnQiOm51bGwsImV2YWx1YXRpb24iOm51bGx9",
  "hasMore": false
}
```

`checkpoint` es opaco (base64 del payload versionado `v: 2`); el cliente solo lo
reenvía tal cual en el siguiente `since`. La forma interna actual tiene cuatro
sub-cursores, uno por entidad sincronizable, así una entidad rápida no
saltea a una lenta:

```json
{
  "v": 2,
  "placement":  { "updatedAt": "2026-04-01T12:00:00.000Z", "id": 99 },
  "hourLog":    { "updatedAt": "2026-04-02T08:00:00.000Z", "id": 14 },
  "document":   null,
  "evaluation": null
}
```

**Versionado y migración desde `v1`:** los cursores `v: 1` (un solo par
`{ updatedAt, id }`) siguen siendo aceptados; `decodeCheckpoint` los levanta
(promueve) a `v: 2` replicando el par en los cuatro slots, así un cliente
con un cursor viejo no necesita re-entrenar tras el deploy. Cursor basura,
no-base64 o no-JSON devuelve `null` y el servidor trata la siguiente página
como la primera.

**Body de `push`:**

```json
{
  "ops": [
    {
      "clientOpId": "11111111-1111-4111-8111-111111111111",
      "entity": "hourLog",
      "op": "create",
      "baseVersion": null,
      "payload": { "placementId": 1, "date": "2026-04-02", "startTime": "08:00", "endTime": "12:00", "hours": 4, "activity": "Soporte" }
    }
  ]
}
```

**Respuesta de `push`:**

```json
{
  "results": [
    { "clientOpId": "11111111-1111-4111-8111-111111111111", "status": "applied", "server": { "id": 77 }, "reason": null }
  ]
}
```

`status` puede ser `applied`, `conflict` o `rejected`. `entity` acepta cuatro valores en el
DTO (`hourLog`, `placement`, `document`, `evaluation`), pero **hoy solo `hourLog` se aplica**:
cualquier otra entidad vuelve con `status: 'rejected'`.

**Resolución de conflictos:** el servidor es la autoridad sobre el estado. Si un `HourLog`
ya pasó a `APPROVED` o `REJECTED`, la edición offline del estudiante se rechaza y se le
muestra. Si ambos lados están en `DRAFT` o `SUBMITTED`, gana el más reciente.

## Onboarding

Si es tu primer día en este proyecto:

1. Levanta el stack y confirma que `GET /api/offers` responde con las ofertas del seed.
   Todos los endpoints salvo `POST /api/auth/login` exigen JWT: loguéate con un usuario
   del seed y manda el `accessToken` como `Authorization: Bearer <token>`.
2. **Lee `KNOWN_ISSUES.md` completo.** El equipo anterior dejó problemas conocidos
   documentados ahí. No todos están documentados.
3. Todavía no hay un backlog público de épicas: prioriza según lo que bloquee tu propio
   trabajo, empezando por la deuda listada en `KNOWN_ISSUES.md`.
4. Empieza por el Sprint 0: reproduce tres de los issues conocidos y escribe tests de
   caracterización que capturen el comportamiento actual antes de cambiar nada.
5. Toda contribución entra por Pull Request **contra `develop`**, nunca contra `main`, y
   nunca por push directo. Yura evalúa tus PRs automáticamente.

## CI y evaluación

Dos workflows, con propósitos distintos:

- `ci.yml` — corre en cada push. Migra, typechequea, linta, testea con cobertura y
  construye. Publica `coverage/lcov.info`, `eslint-report.json` y el reporte de jscpd como
  artefactos; el grader de Yura los lee para las métricas absolutas del proyecto.
- `yura-quality.yml` — corre en cada PR. Llama al workflow reutilizable de Yura, que hace
  análisis **del diff**: cobertura de las líneas nuevas (`diff-cover`) y hallazgos nuevos de
  seguridad (Semgrep con baseline). Por eso `base_ref` es `develop`: sin esa rama el análisis
  no tiene contra qué comparar y el check queda colgado.
