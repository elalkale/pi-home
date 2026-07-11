# Changelog — Hardening de seguridad

Registro de los parches de seguridad aplicados al dashboard, en orden. Cada
punto viene de una revisión de seguridad sobre el repo original (sin auth,
sin sudoers restringido, con posibles XSS y validaciones incompletas).

## 1. Autenticación por API key en endpoints mutantes

**Problema:** cualquier dispositivo en la red local podía hacer `POST`,
`PUT` o `DELETE` sobre `/api/*` (reiniciar servicios, tocar el firewall...)
sin ningún tipo de login. Como el servidor ejecuta comandos con `sudo`,
esto equivalía a sudo sin contraseña para cualquiera en la LAN.

**Cambios:**
- `server.js`: middleware `requireApiKey` que exige la cabecera
  `X-API-Key` en todo `POST/PUT/DELETE` bajo `/api/*` (comparación con
  `crypto.timingSafeEqual`). Los `GET` (solo lectura) quedan abiertos.
  Nuevo endpoint `POST /api/auth/verify` para validar una key sin ejecutar
  ninguna acción real.
- `public/js/app.js`: wrapper `apiFetch()` que añade la cabecera
  automáticamente y muestra un modal de login si el servidor responde 401.
- `public/index.html`: modal nuevo para introducir/guardar la API key.
- `.env.example`: nueva variable `API_KEY`.

**Requiere en el `.env` real:** `API_KEY=<genera con: openssl rand -hex 32>`

---

## 2. XSS almacenado vía `innerHTML`

**Problema:** `name`, `desc`, `port` de un servicio (y `comment` de una
regla de firewall) se insertaban directamente en `innerHTML` sin escapar.
Cualquier dato que llegara con HTML/JS embebido (vía API, no solo desde el
formulario) se ejecutaría en el navegador.

**Cambios (`public/js/app.js`):**
- `escapeHtml()` centralizada como utilidad compartida (antes solo la
  usaban las tarjetas de `sysservices`).
- `safeUrl()` nueva: solo permite `http:`/`https:`/rutas relativas en el
  `href` de las tarjetas, bloqueando `javascript:` y otros esquemas.
- Aplicado a `renderServices()` (tarjetas de servicios personales) y al
  campo `comment` de las reglas de firewall.

---

## 3. Privilegios de sudo demasiado amplios (`iptables`/`systemctl`)

**Problema:** el `NOPASSWD` de sudoers cubría los binarios completos de
`iptables` y `systemctl`, así que cualquier fallo de validación (o una key
filtrada) daba control total sobre el firewall y cualquier unidad systemd,
incluido `ssh`.

**Cambios:**
- `deploy/pi-home-iptables` y `deploy/pi-home-systemctl` (nuevos): scripts
  wrapper que validan estrictamente los argumentos antes de tocar el
  sistema. El de systemctl además bloquea una lista de unidades protegidas
  (`ssh`, `sshd`, `networking`, `dbus`...) para evitar quedarte sin acceso
  remoto.
- `deploy/sudoers-pi-home` (nuevo): sudoers de ejemplo que da `NOPASSWD`
  solo sobre esos dos wrappers, no sobre los binarios reales.
- `server.js`: todas las llamadas a `iptables`/`systemctl` reescritas para
  pasar por los wrappers vía `spawnSync` con argumentos como array (nunca
  por shell), eliminando además la interpolación de strings.

**Requiere instalación manual en la Pi** (ver README, sección
"Wrappers de sudo").

---

## 4. Datos de configuración reales commiteados en el repo público

**Problema:** `data/firewall.json` y `data/sysservices.json` estaban en
el repo (a diferencia de `services.json`, que ya estaba en `.gitignore`),
exponiendo infraestructura real: servicios corriendo (FTP, bot de Discord,
galería), y la regla de firewall real.

**Cambios:**
- `.gitignore`: añadidas ambas rutas.
- `data/firewall.example.json` y `data/sysservices.example.json` (nuevos):
  plantillas genéricas para un clon en fresco.
- `README.md`: documentado el paso de copiar las plantillas.

**Nota:** esto limpia el archivo actual, no el historial de git. Si en
algún commit antiguo llegaron a subirse datos reales, hace falta purgarlo
aparte (`git filter-repo` + force-push), ver conversación para el
procedimiento en Windows.

---

## 5. Validación de puertos incompleta

**Problema:** en tres rutas del backend se comprobaba `!srcPort` (que
descarta `0` y `NaN`, pero **no** números negativos, porque `-5` es
"truthy" en JS) y `srcPort > 65535`, dejando pasar puertos negativos.

**Cambios (`server.js`):**
- Nueva función `isValidPort(n)`: `Number.isInteger(n) && n >= 1 && n <= 65535`.
- Sustituye la comprobación repetida e incompleta en `applyIptables()`,
  `POST /api/firewall/rules` y `PUT /api/firewall/rules/:id`.
- El frontend (`public/js/app.js`) ya validaba correctamente
  (`srcPort < 1`) desde antes; el problema estaba solo en el backend.

---

## Pendiente (no aplicado aún)

Del resto de la revisión inicial, quedan por hacer si se quiere seguir
endureciendo el proyecto:
- Separar `server.js` en routers (`routes/firewall.js`, `routes/system.js`...).
- Cachear `/api/system` para no relanzar `df` en cada petición.
- Borrar `index.js` si se confirma que es código muerto.
- Logs persistentes con rotación.
- Purga del historial de git para el punto 4 (opcional, ver arriba).
