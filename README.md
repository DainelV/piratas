# Piratas del Caribe — Progreso

## Paso 1 — Servidor base
Node.js + Express + SQLite funcionando, con página inicial.

## Paso 2 — Registro/Login + Referidos

**Auth:** email + contraseña únicamente. No hay (ni existió) login de Google.

- `POST /api/auth/register` — { email, password, ref? }
- `POST /api/auth/login` — { email, password }
- `POST /api/auth/logout`
- `GET  /api/auth/me`

**Referidos por link (sin código manual):**
- Cada usuario tiene su link: `/register.html?ref=<su_id>`
- Al registrarse con ese link, el nuevo usuario queda vinculado (`referred_by`)
- El referido SOLO se acredita cuando el usuario nuevo acumula **5 minutos
  de actividad dentro del sistema** (no hace falta que sean continuos —
  se van sumando con heartbeats mientras la pestaña está abierta y visible)
- Al cruzar el umbral, una única vez:
  - **+100 oro** al usuario nuevo
  - **+1 pirata** al referidor

`POST /api/activity/heartbeat` es quien acumula el tiempo y dispara la
recompensa cuando corresponde.

## Cómo correrlo

```bash
npm install
npm start
```

Abrí http://localhost:3000 → te lleva a login/registro. Al registrarte
con un link de referido (`?ref=ID`), quedás vinculado a ese usuario.

## Estructura

```
piratas-caribe/
├── src/
│   ├── server.js
│   ├── db/database.js         # tablas: server_info, users
│   ├── middleware/auth.js     # requireAuth (sesión)
│   └── routes/
│       ├── auth.js            # registro/login/logout/me
│       └── activity.js        # heartbeat + lógica de referidos
├── public/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── dashboard.html
│   ├── css/estilo.css
│   └── js/heartbeat.js
└── package.json
```

## Notas técnicas
- Sesiones con `express-session` (MemoryStore) — para producción conviene
  un store persistente (ej. `connect-sqlite3`) así las sesiones sobreviven
  reinicios del server.
- Contraseñas hasheadas con `bcryptjs`.
- El heartbeat cachea saltos de tiempo raros (pestaña dormida, PC en
  suspensión) para que no se pueda "trampear" el contador de 5 minutos.

Todavía sin sistema de economía más allá de oro/piratas como
contadores para la recompensa de referidos.

## Paso 3 — Sistema de barco / perfil del jugador

Cada usuario ahora tiene, además de oro y piratas:

- `nivel` (1–100, arranca en 1)
- `hp` / `hp_max` (100 base)
- `velas` (nivel 1)
- `canones` (nivel 1)
- `casco` (nivel 1)

Estas columnas se agregaron a `users` con migración automática (si ya
tenías una base de datos de los pasos 1–2, se actualiza sola al arrancar
el server, sin perder los usuarios existentes).

**Nueva ruta:**
- `GET /api/profile` — ficha completa del jugador logueado

**Nueva página:** `perfil.html` — muestra nivel, barra de HP, oro,
piratas y las tres piezas del barco (velas, cañones, casco). Accesible
desde el dashboard.

## Paso 4 — Sistema de producción de oro

- **Nivel 1: 0.01 oro/minuto**, escala linealmente con `nivel`
  (nivel × 0.01 oro/min). Nivel máximo 100.
- La producción se calcula con **reloj real**, no con heartbeats: se
  usa la columna `last_production_at` para saber cuánto tiempo pasó
  desde el último cálculo, así que **sigue corriendo aunque el usuario
  esté offline**.
- **Al entrar** (login, o simplemente al abrir el dashboard/perfil vía
  `/api/auth/me` o `/api/profile`) se suma automáticamente toda la
  producción generada desde la última conexión.
- Mientras el usuario está online, el heartbeat (cada 20s) también
  aplica la producción pasiva, así los oro se ven crecer en vivo
  sin necesidad de recargar la página.

**Nuevo servicio:** `src/services/production.js`
- `aplicarProduccion(userId)` — calcula y suma lo producido, actualiza `last_production_at`
- `infoProduccion(nivel)` — devuelve producción actual y la del próximo nivel

**En pantalla (dashboard y perfil):**
- Producción actual (oro/min)
- Producción del próximo nivel (oro/min), o aviso de "nivel máximo" si ya es 100

Los oro ahora se muestran con 2 decimales ya que se acumulan de a fracciones pequeñas por minuto.

## Paso 5 — Sistema de niveles 1–100

**Reglas de subida:**
- Nivel 1 a 3: solo pide oro
- Nivel 3+: pide oro **+** un mínimo de referidos activos (piratas), y ese mínimo sube +1 cada 10 niveles:
  - nivel 3–12 → 1 referido
  - nivel 13–22 → 2 referidos
  - nivel 23–32 → 3 referidos, etc.
- Los referidos son un **requisito** (tener al menos X piratas), no se consumen al subir de nivel — solo se gastan los oro.

**Costo en oro** (no se especificó una tabla exacta, así que usé una curva cuadrática simple y documentada para poder ajustarla fácil):
```
costo(nivel) = 10 × nivel²
```
Ej: nivel 1→2 cuesta 10 oro, nivel 3→4 cuesta 90, nivel 50→51 cuesta 25.000.
Se puede cambiar editando `FACTOR_COSTO` en `src/services/leveling.js`.

**Cada nivel:**
- Aumenta la producción (ya ligada a `nivel` desde el paso 4: `nivel × 0.01` oro/min)
- Desbloquea mejoras: el nivel del jugador queda disponible como tope para futuras mejoras de velas/cañones/casco (a implementarse en el sistema de mejoras)

**Nivel del barco** (distinto del nivel del jugador):
```
nivelBarco = promedio(velas, cañones, casco)
```

**Nuevo servicio:** `src/services/leveling.js`
- `costoOro(nivel)`, `referidosRequeridos(nivel)`, `nivelBarco(user)`, `evaluarSubida(user)`, `subirNivel(userId)`

**Nuevas rutas:**
- `GET /api/level/estado` — nivel actual, nivel del barco, costo y referidos requeridos para el próximo nivel
- `POST /api/level/subir` — intenta subir un nivel (gasta oro si corresponde)

**En pantalla:**
- Dashboard: nivel actual del jugador
- Perfil: nivel del barco (promedio de las 3 piezas) + botón "Subir de nivel" con el costo y los referidos requeridos, deshabilitado si ya está en nivel máximo (100)

## Paso 6 — Sistema PvP automático

**Matchmaking:**
- Nivel 1 a 5: solo enfrenta rivales de exactamente el mismo nivel
- Nivel 6+: rivales dentro de ±3 niveles

**Enemigos "activos":** usuarios con un heartbeat en los últimos 15 minutos
(mismo mecanismo del sistema de actividad del paso 2). Se listan con un
alias (`Pirata #id`) — no se expone el email de otros jugadores.

**Fórmula de daño** (por turno, de atacante a defensor):
```
daño = cañones + (HP_max del casco / 10) - (velas del rival * 0.5)
```
- "HP del casco" = `hp_max` (la capacidad máxima del barco, estadística fija)
- La evasión la aporta el stat `velas` de quien RECIBE el golpe
- Daño mínimo garantizado: 1 (para que ninguna pelea quede infinita)

**Batalla por turnos:** el que ataca primero es quien elige pelear (el
"retador"). Se turnan golpe por golpe hasta que alguno llega a 0 HP (o
hasta un tope de 100 turnos, donde gana quien le quede más % de HP).

**Consecuencias reales** (confirmado explícitamente):
- El HP resultante de la pelea se persiste en ambos usuarios (mínimo 1 HP:
  todavía no hay sistema de "barco hundido" / reaparición, así que por
  ahora nadie llega a 0 de forma permanente)
- El ganador recibe oro: `max(5, nivel_del_rival_vencido × 5)` —
  no se especificó un monto exacto, así que usé esta fórmula simple
  (ajustable en `ORO_POR_NIVEL_RIVAL` / `ORO_MINIMO_VICTORIA`
  en `src/services/pvp.js`)
- Se lleva un historial de victorias/derrotas por usuario

**Nuevo servicio:** `src/services/pvp.js`
- `rangoNiveles(nivel)`, `listaEnemigos(userId)`, `calcularDano(...)`, `simularBatalla(...)`, `pelear(retadorId, rivalId)`

**Nuevas rutas:**
- `GET /api/pvp/enemigos` — lista de rivales activos dentro de tu rango de nivel
- `POST /api/pvp/pelear` — `{ enemigoId }`, ejecuta la batalla completa y devuelve el log turno por turno

**Nueva página:** `pvp.html` — lista de enemigos activos con botón "Atacar" por cada uno (el usuario elige contra quién pelear), resultado de la batalla y log de turnos. Accesible desde el dashboard y desde la ficha del capitán.

## Paso 7 — Reglas de recompensa, cooldown y capacidad de bodega en PvP

**Ganador:**
- Recibe `nivel del oponente × 5` oro (nominal)
- Ese botín se le **roba** al perdedor: no puede ser más de lo que el
  perdedor realmente tiene en su bodega
- Y está **limitado por la capacidad del barco** del ganador — si su
  bodega no tiene lugar, no se pierden oro "en la nada": solo se
  transfiere lo que efectivamente entra

**Capacidad de bodega** (nuevo concepto, no se especificó un valor
exacto así que usé una constante simple y documentada):
```
capacidad = casco × 1000 oro
```
Se aplica de forma consistente en TODO el juego, no solo en PvP: también
topea la producción pasiva (paso 4) y la recompensa de +100 oro por
referido (paso 2). Ajustable en `CAPACIDAD_POR_CASCO` en `src/services/economia.js`.

**Perdedor:** pierde la batalla y los oro robados (ver arriba).

**Cooldown:**
- Base: 5 minutos entre batallas iniciadas por un mismo jugador
- +10 minutos cada 10 niveles del jugador (nivel 1-9: 5 min, 10-19: 15 min, 20-29: 25 min, ...)
- Se aplica siempre a quien inicia la pelea (el "retador"), gane o pierda
- Mientras estás en cooldown, la pantalla de PvP te avisa y deshabilita los botones de "Atacar"

**Jugadores inactivos:** la lista de rivales ahora muestra tanto activos (🟢, heartbeat reciente) como inactivos (⚪) dentro de tu rango de nivel — un jugador inactivo también puede ser atacado y perder oro igual que uno activo, incluyendo el botín acumulado por producción pasiva mientras estaba offline.

**Nuevo servicio:** `src/services/economia.js` — `capacidadBarco(user)`, `espacioDisponible(user)`

**Rutas actualizadas:**
- `GET /api/pvp/enemigos` — ahora también devuelve el estado de cooldown del usuario y el campo `activo` por rival
- `POST /api/pvp/pelear` — devuelve `recompensaNominal`, `oroTransferido` (lo que realmente se robó) y `cooldownMinutos`

**Nota de diseño:** no se especificó si la recompensa se "imprime" o se le resta al perdedor. Implementé un mecanismo de saqueo (se le resta al perdedor lo que efectivamente se le transfiere al ganador) porque es coherente con "el perdedor... puede... perder oro" y con la temática pirata. Si preferís que la recompensa se genere de la nada (sin restarle nada al perdedor), es un cambio de una línea en `src/services/pvp.js`.

## Ajuste — Capacidad de bodega ahora es hp_max / 10

Cambié la fórmula de capacidad de `casco × 1000` a:
```
capacidad = hp_max / 10
```
Con el HP base de 100, eso da una capacidad inicial de **10 oro**.
Se aplica igual que antes en producción, referidos y PvP (`src/services/economia.js`).

Ojo: con este tope tan bajo, cosas como el bono de +100 oro por
referido (paso 2) van a quedar recortadas a la capacidad disponible en
ese momento — es el comportamiento esperado del sistema de topes, pero
avisado por si el número te resulta demasiado chico en la práctica.

## Paso 8 — Sistema de reparación

**Después de una batalla el barco queda dañado** (el HP perdido en PvP ya se persistía desde el paso 6/7).

**No puede pelear por debajo del 30% de HP:** `POST /api/pvp/pelear` ahora rechaza el intento (razón `necesita_reparar`) si el HP actual del retador es menor al 30% de su `hp_max`. La pantalla de PvP muestra el aviso y deshabilita los botones de "Atacar" automáticamente.

**Costo de reparación:** `oro = HP faltante hasta el 100%` (1 oro por punto de HP). Es una reparación completa — no hay reparación parcial: o se paga todo, o no se repara nada.

**Al subir de nivel también se paga reparación automática a 100%:** el costo total para subir de nivel ahora es `costoNivel + costoReparación` (HP faltante en ese momento). Si no alcanza para pagar ambos, no se puede subir. Al subir, el HP queda al 100%.

**Nuevo servicio:** `src/services/repair.js`
- `costoReparacion(user)`, `puedePelear(user)`, `estadoReparacion(user)`, `reparar(userId)`

**Nueva ruta:**
- `GET /api/repair/estado` — HP actual/máximo, % de HP, si puede pelear, costo de reparar a 100%
- `POST /api/repair` — repara el barco a 100% (requiere oro suficiente)

**Cambios en rutas existentes:**
- `POST /api/pvp/pelear` — nuevo motivo de rechazo `necesita_reparar`
- `POST /api/level/subir` — el costo ahora incluye la reparación automática (`costoTotal`)
- `GET /api/profile` y `GET /api/pvp/enemigos` — incluyen el estado de reparación del usuario

**En pantalla:** ficha del capitán con tarjeta de reparación (HP, %, costo, botón "Reparar a 100%"), aviso en la pantalla de PvP cuando el barco está por debajo del 30%, y el costo total (nivel + reparación) mostrado antes de subir de nivel.

## Ajuste — La moneda del juego pasa de "barriles" a "oro"

Reemplacé la moneda del juego en todo el proyecto: base de datos, backend
y frontend. No cambió ninguna regla de juego (producción, costos,
recompensas de PvP, reparación, capacidad de bodega) — solo el nombre.

- **Base de datos:** la columna `barriles` se renombra a `oro` (migración
  automática con `ALTER TABLE users RENAME COLUMN barriles TO oro`, así
  que los saldos existentes se conservan). Requiere SQLite 3.25+ (incluido
  en versiones normales de `better-sqlite3`).
- **Backend:** todas las variables, constantes y mensajes de error que
  decían "barriles" ahora dicen "oro" (`costoBarriles` → `costoOro`,
  `BARRILES_POR_NIVEL_RIVAL` → `ORO_POR_NIVEL_RIVAL`, etc.)
- **Frontend:** dashboard, ficha del capitán y pantalla de PvP muestran
  "oro" con el emoji 🪙 en vez de "barriles" con 🛢️.

## Paso 10 — Sistema económico: depósitos y retiros (con aprobación manual de admin)

**Depósitos:** 1 CUP = 70 oro. El usuario ve la conversión clara en pantalla,
crea una solicitud (monto en CUP + teléfono), y se le indica comunicarse
por WhatsApp al **55858321** para coordinar el pago. El oro **no se
acredita al crear la solicitud** — recién se acredita cuando vos, como
admin, la aprobás desde `/admin.html`.

**Retiros:** 100 oro = 1 CUP, mínimo 10.000 oro, 1 retiro cada 24h por
usuario. Al crear la solicitud se descuenta el oro de inmediato (para que
no se pueda gastar mientras está pendiente); si rechazás la solicitud, el
oro se le devuelve automáticamente. Igual que en depósitos, se indica
comunicarse por WhatsApp al **55858321** para coordinar el pago en CUP.

**Todo queda guardado en la tabla `transacciones`** (tipo, montos en CUP
y oro, teléfono, estado: pendiente/aprobado/rechazado, quién y cuándo lo
resolvió).

**Cómo entrar como admin:** no hay una pantalla para "hacerte admin" —
por seguridad, se hace por variable de entorno. Al arrancar el server,
seteá `ADMIN_EMAILS` con tu email:
```bash
ADMIN_EMAILS="tu@email.com" npm start
```
Esa cuenta queda marcada `is_admin=1` automáticamente. Con eso ya te
aparece el link "🛠️ Panel de administración" en el dashboard.

**Nuevo servicio:** `src/services/wallet.js`
- `tasas()`, `crearDeposito()`, `crearRetiro()`, `puedeRetirarHoy()`, `historialUsuario()`, `listarPendientes()`, `aprobarTransaccion()`, `rechazarTransaccion()`

**Nuevas rutas (usuario):**
- `GET /api/wallet/tasas` — conversión clara + contacto de WhatsApp
- `POST /api/wallet/depositos` — `{ montoCup, telefono }`
- `POST /api/wallet/retiros` — `{ montoOro, telefono }`
- `GET /api/wallet/historial` — depósitos/retiros propios

**Nuevas rutas (admin):**
- `GET /api/admin/transacciones` — pendientes
- `POST /api/admin/transacciones/:id/aprobar`
- `POST /api/admin/transacciones/:id/rechazar`

**Nuevas páginas:** `wallet.html` (formularios + historial) y `admin.html` (cola de aprobación, solo funcional para cuentas admin).

**Nota importante:** por diseño, nada se acredita ni se paga en automático — todo pasa por tu revisión manual antes de tocar el oro de un usuario. Esto es a propósito: acreditar solo con datos que el propio usuario escribe (sin verificar contra el banco) sería trivial de falsear.

## Paso 11 — Panel admin completo

**Ver usuarios:** `GET /api/admin/usuarios?q=busqueda` (búsqueda opcional por email) — lista con nivel, HP, oro, piratas, historial PvP, admin/baneado.

**Modificar nivel, HP, oro:** `PATCH /api/admin/usuarios/:id` con `{ nivel?, hp?, oro? }` — cada campo se valida (nivel 1-100, HP entre 0 y su hp_max, oro no negativo) y se aplica directo, sin pasar por costos ni producción. Desde el panel: inputs editables al lado de cada usuario con botón "Guardar".

**Banear / desbanear:** `POST /api/admin/usuarios/:id/banear` (con motivo opcional) y `POST /api/admin/usuarios/:id/desbanear`. Un usuario baneado:
- No puede iniciar sesión (bloqueado en `/api/auth/login`)
- Si ya tenía la sesión abierta, se le corta en su próximo request (el middleware `requireAuth` ahora chequea `baneado` en cada llamada, no solo al loguearse)

**Aprobar depósitos/retiros:** ya existían desde el paso 10 (`POST /api/admin/transacciones/:id/aprobar` y `/rechazar`), ahora integrados en el mismo panel.

**Estadísticas globales:** `GET /api/admin/estadisticas` — usuarios totales, **oro en circulación** (suma de oro de todos los usuarios), activos en las últimas 24h, nivel promedio, total de referidos, batallas ganadas, usuarios baneados/admins, depósitos/retiros pendientes, y oro/CUP movido históricamente (aprobado).

**Notificaciones de nuevos depósitos/retiros:** el panel admin sondea `GET /api/admin/transacciones` cada 15 segundos; cuando aparece un id que no había visto antes, dispara una notificación del navegador (pide permiso la primera vez) y actualiza el título de la pestaña con un 🔔. El link "Panel de administración" en el dashboard también muestra un contador de pendientes.

**Nuevo servicio:** `src/services/adminPanel.js` — `listarUsuarios()`, `modificarUsuario()`, `banearUsuario()`, `desbanearUsuario()`, `estadisticasGlobales()`

**Nuevas columnas:** `users.baneado`, `users.baneado_motivo` (migración automática)

**Nuevas rutas:**
- `GET /api/admin/usuarios`
- `PATCH /api/admin/usuarios/:id`
- `POST /api/admin/usuarios/:id/banear`
- `POST /api/admin/usuarios/:id/desbanear`
- `GET /api/admin/estadisticas`

`admin.html` quedó con tres secciones: estadísticas globales, solicitudes pendientes (con notificación), y usuarios (buscar, editar nivel/HP/oro, banear/desbanear).

## Paso 12 (final) — Mejoras de UI y tutoriales

**Tema pirata oscuro:** paleta de madera/mar oscuro, dorado como acento,
pergamino como color de texto, y tipografía decorativa "Pirata One"
(Google Fonts) para los títulos — todo centralizado en
`public/css/estilo.css` así se aplica igual en todas las páginas.

**Responsive móvil:** tarjetas fluidas con `max-width`, tipografía con
`clamp()`, botones con alto mínimo táctil (44px) y ancho completo en
pantallas chicas, grillas que caen a una columna por debajo de 360-480px.

**Animaciones suaves:** fade-in al cargar la página y cada tarjeta,
transición en botones (hover/active), transición de ancho en la barra de
HP, el barco "flota" con una animación sutil. Se respeta
`prefers-reduced-motion` para desactivar todo si el usuario lo pidió.

**Barcos que mejoran cada 10 niveles:** `public/js/barco.js` define 10
categorías (Balandra → Bergantín → Goleta → Fragata → Corbeta → Galeón →
Galeón de Guerra → Navío de Línea → Buque Insignia → Leviatán de los
Mares), cada una con más mástiles, casco más grande y colores más nobles
(dorado en las últimas dos). Se genera como SVG en el momento — no
depende de imágenes externas. Visible en el dashboard (mini) y en la
ficha del capitán (completo, con nombre de categoría y próximo umbral
de mejora).

**Tutoriales:** `public/js/tutorial.js` — caja dismissible por página,
con botón "❓ Ver tutorial" para reabrirla cuando quieras (se recuerda
con localStorage, por navegador). Están en:
- **Inicio** (`index.html`): tutorial completo del juego, todos los sistemas
- **Perfil** (`perfil.html`): barco visual, HP, reparación, subir de nivel, capacidad de bodega
- **Batalla** (`pvp.html`): matchmaking, fórmula de daño, botín, cooldown, mínimo de HP para pelear
- **Tienda** y **Retiro** (`wallet.html`, dos tutoriales separados en la misma página ya que ambas cosas viven ahí: comprar oro con CUP, y retirar oro a CUP)

Ningún cambio de este paso tocó las reglas de juego ni el backend — es puramente visual/UX.

## Ajuste — Nombre de capitán + 100 de oro inicial

**Nombre de usuario:** el registro ahora pide un "nombre de capitán"
(2-20 caracteres: letras con tildes/ñ, números, espacios, guiones y
guiones bajos), obligatorio. Se guarda en la nueva columna
`users.nombre` (migración automática; los usuarios ya existentes de
antes de este cambio quedan con un nombre por defecto tipo "Pirata #7").

Se usa para identificar al jugador en vez del email:
- Dashboard y ficha del capitán muestran el nombre como título principal (el email queda como dato secundario)
- La lista de rivales en PvP ahora muestra el nombre real en vez de solo "Pirata #id"
- El panel admin muestra nombre + email en la lista de usuarios, y la búsqueda ahora filtra por nombre o email

**100 de oro inicial:** toda cuenta nueva arranca con 100 de oro (antes arrancaba en 0). Esto es aparte del bono de +100 oro por referido activo (que sigue funcionando igual, son dos cosas distintas que coinciden en el número).

No hay todavía una pantalla para cambiar el nombre después de registrarse — si lo querés, es una ruta y un formulario más, avisame y lo agrego.

## Ajuste — Reparación más barata (10% del HP faltante, no 1:1)

Antes reparar costaba 1 de oro por cada punto de HP faltante (ej: 100 HP
faltante = 100 de oro, carísimo para un jugador recién empezado con 100
de oro inicial). Ahora cuesta el **10% del HP faltante**:

```
costo = HP_faltante × 0.10
```

Ej: reparar de 0 a 100 HP ahora cuesta 10 de oro en vez de 100.
Ajustable en `PORCENTAJE_COSTO_REPARACION` en `src/services/repair.js`
(afecta también al costo de reparación automática al subir de nivel,
ya que usa la misma función `costoReparacion()`).

## Fix — El oro no se acreditaba (bug de zona horaria)

**Causa:** `CURRENT_TIMESTAMP` de SQLite guarda la fecha en UTC pero sin
la "Z" del formato ISO (`"2026-07-03 02:00:00"` en vez de
`"2026-07-03T02:00:00Z"`). Node interpreta ese formato como **hora
local del servidor**, no UTC. Si el servidor corre en una zona horaria
distinta a UTC (como Cuba, UTC-4/-5), la fecha guardada terminaba
"corriendo hacia el futuro" varias horas, así que `ahora - última_vez`
daba negativo, se topeaba en 0, y la producción de oro (y cooldowns,
actividad, límite de retiro diario) casi nunca avanzaba.

**Fix:**
- `src/utils/fechas.js` — `parseFechaDB()` fuerza el formato UTC antes
  de parsear, sin importar en qué zona horaria corra el servidor
- Reemplazado en los 4 lugares que parseaban fechas de la base de datos:
  producción de oro, heartbeat/actividad, cooldown de PvP, y el límite
  de 1 retiro por día
- `src/server.js` fuerza `process.env.TZ = 'UTC'` como red de seguridad
  extra, para que si en el futuro alguien agrega un `new Date(...)`
  sobre una columna de la base sin pasar por el helper, no vuelva a
  romperse

Probado simulando el servidor en huso horario de Cuba (América/Habana):
antes del fix el desfasaje era de 4 horas hacia el futuro; con el fix,
el cálculo de minutos transcurridos da el valor correcto.

## Ajuste — Recompensa de PvP: 5% del oro del perdedor, sin tope de capacidad

Antes: el ganador recibía `nivel del rival × 5` oro, topeado por lo que
el perdedor tenía Y por la capacidad de bodega del ganador.

Ahora: el ganador recibe el **5% del oro que tiene el perdedor** en ese
momento (sigue sin poder ser más de lo que el perdedor realmente tiene,
pero ya **no hay tope por capacidad de bodega** del ganador — se lo
lleva completo aunque su bodega esté llena).

```
botín = oro_del_perdedor × 5%
```

Ajustable en `PORCENTAJE_BOTIN` en `src/services/pvp.js`. La capacidad
de bodega se sigue aplicando igual que antes en producción pasiva y en
el bono de oro por referidos — solo se quitó del PvP.

## Fix — El oro no subía (la capacidad de bodega era menor que el oro inicial)

**Causa real** (distinta al bug de zona horaria del fix anterior):
la capacidad de bodega se calculaba como `hp_max / 10` = **10 de oro**
con el HP base de 100. Pero los usuarios nuevos arrancan con **100 de
oro** desde el ajuste anterior. Como la producción y el bono de
referidos usaban `MIN(oro + producido, capacidad)`, apenas se calculaba
la primera producción el oro se topeaba HACIA ABAJO a 10 — y como ya
quedaba en el tope, nunca más podía subir, sin importar cuánto tiempo
pasara. El bono de +100 oro por referido tenía el mismo problema
(podía incluso bajar el oro en vez de subirlo).

**Fix:** se sacó el tope de capacidad de:
- la producción pasiva (`src/services/production.js`)
- el bono de oro por referidos (`src/routes/activity.js`)

(ya se había sacado del PvP en el ajuste anterior). El módulo
`src/services/economia.js` con `capacidadBarco()` queda sin usar en
ningún lado por ahora — si en algún momento se quiere retomar un
sistema de capacidad, hay que recalibrar la fórmula para que el tope
inicial sea mayor que el oro con el que arrancan los usuarios nuevos.

Probado simulando una hora de producción real: el oro ahora sube de
forma continua y proporcional al tiempo transcurrido, sin trabarse.

## Fix — Cooldown de PvP: nivel 10 quedaba mal encasillado

Repasé toda la cadena (fórmula, parseo de fechas UTC, orden de
operaciones al pelear) y matemáticamente daba bien para niveles 1-9,
pero encontré un límite corrido: el nivel 10 caía en el segundo escalón
(15 min) en vez de quedar dentro del bloque de "primeros niveles".

**Antes:** `Math.floor(nivel / 10)` → nivel 1-9 = 5 min, nivel 10-19 = 15 min.
**Ahora:** `Math.floor((nivel - 1) / 10)` → **nivel 1-10 = 5 min**, nivel 11-20 = 15 min, ...

Probado el ciclo completo (pelear → cooldown restante → puede volver a
pelear) con fechas simuladas para varios niveles y tiempos transcurridos,
todo da el valor esperado.

## Ajuste — Bono de referido: ahora es inmediato al registrarse

Antes: el referido se acreditaba recién cuando el usuario nuevo
acumulaba 5 minutos de actividad dentro del juego.

Ahora: se acredita **al instante, en el mismo registro** — si alguien
se registra con tu link, en la misma respuesta del registro ya se
suman +100 oro para el nuevo usuario (además de los 100 de oro inicial,
o sea 200 en total) y +1 pirata para vos.

**Cambios:**
- `src/routes/auth.js` — el registro ahora acredita el bono de una si viene con `ref` válido
- `src/routes/activity.js` — se sacó toda la lógica de los 5 minutos / umbral de actividad del heartbeat (ya no hace falta, el heartbeat solo sigue trackeando `active_seconds` de forma informativa y aplicando la producción pasiva)
- Frontend actualizado: dashboard y tutorial de inicio ya no mencionan la espera de 5 minutos
