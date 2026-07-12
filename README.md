# 🍓 Pi Home Dashboard v2.0

Dashboard personal para Raspberry Pi con sistema de temas y personalización RGB.

## Nuevas funcionalidades v2.0
- **6 temas preset**: Matrix, Cyber, Sunset, Ocean, Lavender, Ember
- **Arco RGB interactivo**: selecciona cualquier color del espectro arrastrando
- **Sliders R/G/B**: control granular por canal
- **Input Hex**: introduce un código hex directamente
- **Persistencia**: el tema elegido se guarda en localStorage

## Instalación
```bash
npm install
```

### 1. Variables de entorno
```bash
cp .env.example .env
nano .env   # define API_KEY (genera una con: openssl rand -hex 32)
```

### 2. Wrappers de sudo (iptables / systemctl)
El dashboard necesita permisos elevados para gestionar el firewall y los
servicios systemd. En vez de dar sudo NOPASSWD sobre esos binarios
completos, instala los wrappers de mínimo privilegio en `deploy/`:
```bash
sudo cp deploy/pi-home-iptables deploy/pi-home-systemctl /usr/local/bin/
sudo chown root:root /usr/local/bin/pi-home-iptables /usr/local/bin/pi-home-systemctl
sudo chmod 750 /usr/local/bin/pi-home-iptables /usr/local/bin/pi-home-systemctl
sudo cp deploy/sudoers-pi-home /etc/sudoers.d/pi-home   # edita el usuario antes
sudo visudo -c
```

### 3. Datos de servicios y firewall (opcional)
`data/*.json` no se versiona (contiene tu configuración real). Al arrancar
por primera vez, el dashboard crea estos archivos automáticamente con
valores por defecto vacíos/seguros. Si prefieres partir de un ejemplo:
```bash
cp data/firewall.example.json data/firewall.json
cp data/sysservices.example.json data/sysservices.json
```

### 4. Arrancar
```bash
npm start
```

La web estará disponible en `http://[IP-DE-LA-PI]:8888`

## Arquitectura del backend

El backend está organizado por dominio en vez de vivir todo en un único
archivo, para que cada pieza sea auditable por separado:

```
server.js              → bootstrap: carga .env, arranca el servidor HTTP
app.js                 → configura Express (estáticos, JSON, auth) y monta los routers
config/paths.js         → rutas centralizadas a /public y /data
lib/sudo.js              → wrappers de mínimo privilegio (sudoRun, rutas a los scripts)
lib/network.js           → utilidad getLocalIP()
middleware/auth.js       → middleware de autenticación por X-API-Key
routes/
  ├── auth.js            → POST /api/auth/verify
  ├── system.js           → GET /api/system (CPU, memoria, disco, uptime)
  ├── services.js          → CRUD /api/services (tarjetas del dashboard)
  ├── firewall.js           → gestión de reglas NAT vía iptables
  ├── sysservices.js         → control de servicios systemd (start/stop/restart)
  └── pihole.js               → integración con la API v6 de Pi-hole
```

Cada router expone únicamente las rutas relativas a su prefijo (por ejemplo,
`routes/firewall.js` solo conoce `/`, `/toggle`, `/rules`, `/rules/:id` y
`/apply`; el prefijo `/api/firewall` se añade al montarlo en `app.js`). Añadir
un nuevo dominio (por ejemplo, monitorización de red) es tan sencillo como
crear `routes/network.js` y montarlo con `app.use('/api/network', ...)` en
`app.js`, sin tocar el resto del backend.
