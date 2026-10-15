# Problemas conocidos

Lo que sabemos que está mal y no alcanzamos a arreglar. Está ordenado por lo que más nos
dolió, no por severidad técnica.

Si encuentras algo que no está acá, agrégalo. Casi seguro hay más.

## D-01 · El sync duplica horas al reintentar — RESUELTO en el back

`src/offline/sync/push.ts` (front) y `src/sync/sync.service.ts` (back).

Si el push se corta a medias y el cliente reintenta, a veces aparecen dos registros de horas
idénticos. Pasa más en la práctica de campo, con señal intermitente. Mandamos un `clientOpId`
en cada operación y guardamos las operaciones en `sync_operations`, pero evidentemente algo
no está cerrando el círculo. No tuvimos tiempo de sentarnos a entenderlo.

`SyncService.push` ahora consulta `sync_operations` por `(userId, clientOpId)` antes de
aplicar, y aplica + registra dentro de una misma transacción para que un choque concurrente en
la PK compuesta (`userId`, `clientOpId`) revierta también la escritura de negocio, no solo el
registro de auditoría.
Tests: `src/sync/sync.service.spec.ts` (mocks) y `src/sync/sync.push.integration.spec.ts`
(Postgres real, secuencial + concurrente).

Sigue pendiente el lado `src/offline/sync/push.ts` del front (repo aparte).

Workaround actual (ya no debería hacer falta para hour logs): el coordinador borra los
duplicados a mano.

## D-02 · `HourLogService` se nos fue de las manos

`src/hour-log/hour-log.service.ts`

Empezó siendo el CRUD de horas y terminó haciendo validación, persistencia, notificación al
tutor y agregación de reportes. Pasa las 300 líneas. Cada vez que hay que tocar algo ahí, hay
que leerlo entero. Habría que partirlo por responsabilidad, pero nunca fue prioridad.

## D-03 · El módulo de evaluaciones no tiene tests

`src/evaluation/`

Cero. Lo hicimos en la última semana y no alcanzamos. Es el módulo que más baja la cobertura
del proyecto. Si vas a tocar rúbricas o scores, escribe los tests primero — nadie sabe qué se
rompe.

## D-04 · La lista de postulaciones va lenta

`src/application/application.service.ts`, método `listByOffer`.

Con menos de 200 postulaciones no se nota. Arriba de eso, la pantalla de la empresa tarda
varios segundos. Sospechamos que es cómo traemos los estudiantes, pero no lo medimos.

## D-05 · `calculateAccreditationStatus` da miedo tocarla

`src/placement/accreditation.ts`

ESLint la marca por complejidad. Son `if` anidados hasta seis niveles con toda la lógica de
acreditación adentro. Funciona — hasta donde sabemos — pero solo hay dos tests, así que
cualquier cambio es a ciegas. Si te toca modificar reglas de acreditación, escribe primero
tests de los casos que hoy funcionan.

## D-06 · La validación de horas está en tres lados

`src/hour-log/dto/create-hour-log.dto.ts`, `src/hour-log/hour-log.service.ts` y el formulario
del frontend.

Y ya divergieron: el DTO acepta hasta 12 horas por registro y el servicio corta en 10. El
formulario tiene su propia versión. Nadie recuerda cuál es la correcta.

## D-07 · `JWT_SECRET` tiene un fallback hardcodeado — RESUELTO

`src/auth/auth.module.ts`

Si la variable de entorno no está, el módulo arranca igual con un secreto por defecto que
está en el código. Lo pusimos para no pelear con el entorno local y se quedó. En producción
esto no puede quedar así.

Ya no hay valor por defecto: `src/auth/jwt-secret.ts` exige `JWT_SECRET` y, si falta o está
vacía, la API no arranca y el error nombra la variable. Cómo generar uno: README, sección
"Variables de entorno". Tests: `src/auth/jwt-secret.spec.ts`.

## D-08 · Se pueden aceptar más postulaciones que cupos — RESUELTO

`src/application/application.service.ts`, método `decide()`, y `src/offer/offer.service.ts`,
método `acceptedCount()`.

Al aceptar una postulación, `decide()` cuenta las aceptadas (línea 77), compara contra `seats`
(línea 78) y después escribe ACCEPTED (línea 81). Entre el conteo y la escritura no hay
transacción, bloqueo ni escritura condicional, y el `update` filtra solo por `id`. Dos
aceptaciones concurrentes leen la misma plaza libre y ambas pasan. El conteo está en
`src/offer/offer.service.ts:123-127`.

Reproducción determinista: `src/application/application.seats.integration.spec.ts`. Una barrera
retiene a las dos aceptaciones después de su lectura del conteo, así que el entrelazado no
depende del azar. El test de secuencia confirma que, sin concurrencia, la segunda aceptación sí
se rechaza.

Requisitos para correr la prueba: `DATABASE_URL` apuntando a Postgres real. Sin esa variable la
prueba se salta, como la de D-01. Con `docker compose up -d postgres` y un `DATABASE_URL` válido,
corre. Si el puerto 5432 ya está ocupado, levanta el contenedor con `POSTGRES_PORT=5433` y apunta
`DATABASE_URL` a ese puerto.

### RESUELTO

El límite lo sostiene ahora la base de datos, con el trigger `applications_enforce_offer_seats`
(migración `20261013203000_enforce_offer_seats`). Antes de dejar que una postulación pase a
`ACCEPTED`, bloquea la fila de la oferta, cuenta las aceptadas reales y rechaza si ya no caben.

Dos aceptaciones concurrentes ya no se cuelan las dos: el `FOR NO KEY UPDATE` las serializa, de modo
que la segunda cuenta solo después de que la primera haya confirmado y ya ve la plaza ocupada. Como
todo ocurre dentro del propio `UPDATE`, no queda ventana entre comprobar y escribir.

El modo del candado importa y se estrechó después (migración `20261014210000_offer_seats_narrower_lock`).
`FOR UPDATE` choca con el `FOR KEY SHARE` que toma cada postulación nueva por su clave foránea, así
que aceptar dejaba esperando a cualquiera que se postulara a la misma oferta. `FOR NO KEY UPDATE` no
choca con ese, pero sí consigo mismo, que es la única exclusión necesaria. Hay un test que lo fija:
con el candado ancho, postularse no responde en 3 segundos.

`ApplicationService.decide` traduce la negativa del trigger a `la oferta ya no tiene cupos`, para que
la empresa lea el motivo y no un fallo de base de datos. El conteo previo con `acceptedCount` se
conserva: resuelve el caso normal sin llegar a provocar el error, pero ya no es lo que sostiene la
garantía.

**Por qué el trigger y no un bloqueo en el servicio.** Con el bloqueo en código, otra ruta que lo
olvidara reabriría el agujero; la historia pide que la base de datos también lo sostenga. Además
habría invalidado la prueba de concurrencia: con `SELECT ... FOR UPDATE` en el servicio, la segunda
llamada se bloquea antes de llegar a `acceptedCount` y la barrera expira a los 3 segundos.

**Por qué no una columna contadora con `CHECK`.** Fue el primer intento y no se sostiene: sería un
dato derivado del conteo de aceptadas, y el seed escribe postulaciones aceptadas sin pasar por
`decide()`, así que el contador nacería desfasado en todas las ofertas. El trigger cuenta siempre el
dato real y no hay nada que mantener en sincronía.

**Lo que no cubre.** Vigila la transición a `ACCEPTED`, no la inserción. La API solo crea
postulaciones en `SUBMITTED` y aceptar es siempre un `UPDATE`, así que por ahí no se puede entrar.
Un `INSERT` directo de una postulación ya aceptada sí lo esquiva — ver D-09.

Tests: `src/application/application.seats.integration.spec.ts` (requiere Postgres) y
`src/application/application.service.spec.ts`.

## D-09 · El seed crea ofertas con más aceptadas que cupos

`prisma/seed.ts`: las ofertas se crean con `seats: 2 + nextInt(4)` y después las postulaciones
aceptadas se reparten en round-robin (`offers[i % offers.length]`) sin mirar `seats`. Con los
valores actuales quedan 6 aceptadas en cada una de las 36 ofertas, que tienen entre 2 y 5 plazas.

No es el bug D-08: el seed escribe con `prisma.application.create` y nunca pasa por `decide()`, así
que ni lo provocó ni lo provoca. Son datos de ejemplo que contradicen una regla del negocio.

Importa por dos motivos. Cualquier intento de poner una restricción declarativa sobre los cupos
falla contra estos datos — es lo que descartó la columna contadora al resolver D-08. Y una demo
sobre el seed enseña ofertas que ya están sobrecupadas, que es justo lo que E2 dice que no puede
pasar.

Arreglarlo es repartir las aceptadas respetando `seats`, o subir `seats` para que quepan. Cambia los
datos de la demo y obliga a `prisma migrate reset --force && pnpm db:seed`, así que se deja anotado
en vez de hacerlo dentro de la historia de los cupos.
