# 🍓 Pi Home Dashboard v2.0.1

Dashboard personal para Raspberry Pi con sistema de temas y personalización RGB.

## Nuevas cambios v2.0.1
- server.js
Middleware requireApiKey exige la cabecera X-API-Key en todos los POST/PUT/DELETE bajo /api/. Los GET no se alteran. Si no hay API_KEY en . env, se bloquean las mutaciones. Endpoint POST /api/auth/verify para validar la clave sin acciones reales.
- app.js
Wrapper apiFetch() que añade la cabecera con la key de localStorage. Si hay respuesta 401, abre el modal de login, valida la key y reintenta la petición. Las 12 llamadas mutantes ahora usan apiFetch.
- index.html
Nuevo modal de autenticación usa clases CSS existentes. Incluye botón "seguir solo lectura" para navegar sin la clave.
- 

## Nuevas funcionalidades v2.0
- **6 temas preset**: Matrix, Cyber, Sunset, Ocean, Lavender, Ember
- **Arco RGB interactivo**: selecciona cualquier color del espectro arrastrando
- **Sliders R/G/B**: control granular por canal
- **Input Hex**: introduce un código hex directamente
- **Persistencia**: el tema elegido se guarda en localStorage

## Instalación
```bash
npm install
npm start
```

La web estará disponible en `http://[IP-DE-LA-PI]:8888`
