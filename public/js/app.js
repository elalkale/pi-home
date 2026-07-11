// ── Iconos disponibles ──────────────────────────────────────────────────────
const ICONS = ['🌐','📁','🖥️','🔒','📊','🎬','🎵','📧','🔧','💾','🗄️','📡','🏠','⚙️','🔗','📷','🗺️','📝'];
let selectedIcon = '🌐';

// ══════════════════════════════════════════════
// UTILIDADES DE ESCAPADO (protección XSS)
// ══════════════════════════════════════════════
// Cualquier dato que venga de un servicio/regla (nombre, descripción, puerto,
// comentario...) puede haber sido introducido vía la API sin pasar por el
// formulario del dashboard. Antes de interpolarlo en innerHTML, SIEMPRE se
// debe pasar por escapeHtml() para evitar HTML/JS inyectado (ej. un nombre de
// servicio como "<img src=x onerror=alert(1)>").
function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// Solo permite URLs http/https (o relativas). Bloquea esquemas peligrosos
// como javascript:, data:, vbscript:, etc. que podrían ejecutarse al hacer
// click en la tarjeta de un servicio.
function safeUrl(url) {
  const u = String(url ?? '').trim();
  if (!u || u === '#') return '#';
  try {
    // Permite rutas relativas (sin esquema) resolviéndolas contra el origen actual
    const parsed = new URL(u, window.location.origin);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return u;
    return '#';
  } catch {
    return '#';
  }
}

// ══════════════════════════════════════════════
// AUTENTICACIÓN (API KEY)
// ══════════════════════════════════════════════
// Los endpoints POST/PUT/DELETE bajo /api/* requieren la cabecera X-API-Key
// (ver server.js). La key se guarda en localStorage tras introducirla una vez.
const API_KEY_STORAGE = 'pi-api-key';
let pendingAuthResolve = null;

function getApiKey() {
  return localStorage.getItem(API_KEY_STORAGE) || '';
}

function openAuthModal() {
  document.getElementById('auth-modal')?.classList.add('open');
  setTimeout(() => document.getElementById('auth-inp-key')?.focus(), 50);
}

function closeAuthModal() {
  document.getElementById('auth-modal')?.classList.remove('open');
  if (pendingAuthResolve) { pendingAuthResolve(false); pendingAuthResolve = null; }
}

async function saveApiKey() {
  const input = document.getElementById('auth-inp-key');
  const key = (input?.value || '').trim();
  if (!key) { input?.focus(); return; }

  localStorage.setItem(API_KEY_STORAGE, key);

  // Validamos contra el servidor sin ejecutar ninguna acción real
  try {
    const res = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'X-API-Key': key }
    });
    if (!res.ok) {
      localStorage.removeItem(API_KEY_STORAGE);
      input.style.borderColor = 'var(--red)';
      input.placeholder = 'key incorrecta, inténtalo de nuevo';
      input.value = '';
      return;
    }
  } catch (e) {
    input.style.borderColor = 'var(--red)';
    return;
  }

  input.style.borderColor = '';
  document.getElementById('auth-modal')?.classList.remove('open');
  if (pendingAuthResolve) { pendingAuthResolve(true); pendingAuthResolve = null; }
}

// Espera a que el usuario introduzca una key válida (o cancele)
function waitForAuth() {
  return new Promise(resolve => {
    pendingAuthResolve = resolve;
    openAuthModal();
  });
}

// Wrapper de fetch para todas las llamadas que mutan estado (POST/PUT/DELETE).
// Añade la cabecera X-API-Key y, si el servidor responde 401, pide la key
// al usuario y reintenta una vez.
async function apiFetch(url, options = {}) {
  const doFetch = () => fetch(url, {
    ...options,
    headers: { ...(options.headers || {}), 'X-API-Key': getApiKey() }
  });

  let res = await doFetch();

  if (res.status === 401) {
    const authed = await waitForAuth();
    if (!authed) throw new Error('Acción cancelada: se requiere autenticación');
    res = await doFetch();
    if (res.status === 401) throw new Error('API key inválida');
  }

  return res;
}

// ══════════════════════════════════════════════
// RELOJ
// ══════════════════════════════════════════════
function updateClock() {
  const now = new Date();
  const h = String(now.getHours()).padStart(2, '0');
  const m = String(now.getMinutes()).padStart(2, '0');
  const s = String(now.getSeconds()).padStart(2, '0');
  const el = document.getElementById('clock');
  if (el) el.textContent = `${h}:${m}:${s}`;
}
setInterval(updateClock, 1000);
updateClock();

// ══════════════════════════════════════════════
// STATS DEL SISTEMA
// ══════════════════════════════════════════════
async function loadSystemStats() {
  try {
    const res = await fetch('/api/system');
    const data = await res.json();

    const hostnameEl = document.getElementById('hostname');
    if (hostnameEl) hostnameEl.textContent = data.hostname || 'raspberry pi';

    const uptimeEl = document.getElementById('stat-uptime');
    if (uptimeEl) {
      const { days, hours, mins } = data.uptime;
      uptimeEl.textContent = days > 0 ? `${days}d ${hours}h` : `${hours}h ${mins}m`;
    }

    const tempEl = document.getElementById('stat-temp');
    if (tempEl) {
      tempEl.textContent = data.cpu.temp !== 'N/A' ? `${data.cpu.temp}°C` : 'N/A';
      if (parseFloat(data.cpu.temp) > 70) tempEl.style.color = 'var(--red)';
    }

    const ramEl = document.getElementById('stat-ram');
    if (ramEl) ramEl.textContent = `${data.memory.used} / ${data.memory.total} GB`;

    const diskEl = document.getElementById('stat-disk');
    if (diskEl && data.disk.used !== 'N/A') {
      diskEl.textContent = `${data.disk.used} / ${data.disk.total}`;
    }

    renderUptimeBar(data.uptime.days);
  } catch (e) {
    console.warn('No se pudo cargar info del sistema:', e);
  }
}

function renderUptimeBar(days = 10) {
  const bar = document.getElementById('uptime-bar');
  if (!bar) return;
  bar.innerHTML = '';
  const segments = 20;
  for (let i = 0; i < segments; i++) {
    const seg = document.createElement('div');
    const ratio = i / segments;
    if (ratio < 0.85)       seg.className = 'bar-seg active';
    else if (ratio < 0.92)  seg.className = 'bar-seg amber';
    else                    seg.className = 'bar-seg active';
    bar.appendChild(seg);
  }
}

loadSystemStats();
setInterval(loadSystemStats, 30000);

// ══════════════════════════════════════════════
// SERVICIOS
// ══════════════════════════════════════════════
async function loadServices() {
  try {
    const res = await fetch('/api/services');
    const services = await res.json();
    renderServices(services);
  } catch (e) {
    document.getElementById('services-grid').innerHTML =
      '<div class="loading-placeholder" style="color:var(--red)">Error cargando servicios</div>';
  }
}

function renderServices(services) {
  const grid = document.getElementById('services-grid');
  grid.innerHTML = '';

  const countEl = document.getElementById('stat-services');
  if (countEl) countEl.textContent = services.length;

  services.forEach(s => {
    const card = document.createElement('a');
    card.className = 'service-card';
    card.href = safeUrl(s.url);
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.innerHTML = `
      <button class="card-delete" title="Eliminar" onclick="deleteService(event, ${s.id})">✕</button>
      <div class="card-top">
        <div class="card-icon">${escapeHtml(s.icon)}</div>
        <div class="card-status ${s.online ? 'status-online' : 'status-offline'}">
          <span class="status-dot"></span>${s.online ? 'online' : 'offline'}
        </div>
      </div>
      <div>
        <div class="card-name">${escapeHtml(s.name)}</div>
        <div class="card-desc">${escapeHtml(s.desc)}</div>
      </div>
      <div class="card-meta">
        <span class="card-port">localhost<span>${escapeHtml(s.port)}</span></span>
        <span class="card-arrow">↗</span>
      </div>`;
    grid.appendChild(card);
  });

  const addCard = document.createElement('button');
  addCard.className = 'add-card';
  addCard.onclick = openModal;
  addCard.innerHTML = `<div class="add-card-icon">+</div><span class="add-card-label">añadir servicio</span>`;
  grid.appendChild(addCard);
}

async function deleteService(event, id) {
  event.preventDefault();
  event.stopPropagation();
  if (!confirm('¿Eliminar este servicio?')) return;
  await apiFetch(`/api/services/${id}`, { method: 'DELETE' });
  loadServices();
}

// ══════════════════════════════════════════════
// MODAL
// ══════════════════════════════════════════════
function openModal() {
  selectedIcon = '🌐';
  document.getElementById('inp-name').value = '';
  document.getElementById('inp-desc').value = '';
  document.getElementById('inp-url').value = '';
  document.getElementById('inp-port').value = '';
  renderIconGrid();
  document.getElementById('modal').classList.add('open');
  setTimeout(() => document.getElementById('inp-name').focus(), 100);
}
function closeModal() {
  document.getElementById('modal').classList.remove('open');
}
function closeModalBg(e) {
  if (e.target === document.getElementById('modal')) closeModal();
}
function renderIconGrid() {
  const g = document.getElementById('icon-grid');
  g.innerHTML = '';
  ICONS.forEach(ic => {
    const d = document.createElement('div');
    d.className = 'icon-opt' + (ic === selectedIcon ? ' selected' : '');
    d.textContent = ic;
    d.onclick = () => {
      selectedIcon = ic;
      document.querySelectorAll('.icon-opt').forEach(el => el.classList.remove('selected'));
      d.classList.add('selected');
    };
    g.appendChild(d);
  });
}
async function addService() {
  const name = document.getElementById('inp-name').value.trim();
  const desc = document.getElementById('inp-desc').value.trim();
  const url  = document.getElementById('inp-url').value.trim();
  const port = document.getElementById('inp-port').value.trim();
  if (!name) {
    document.getElementById('inp-name').focus();
    document.getElementById('inp-name').style.borderColor = 'var(--red)';
    return;
  }
  await apiFetch('/api/services', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, desc: desc || 'Sin descripción', url: url || '#', port, icon: selectedIcon })
  });
  closeModal();
  loadServices();
}
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeModal(); closeThemePanel(); }
});

// ══════════════════════════════════════════════
// SISTEMA DE TEMAS
// ══════════════════════════════════════════════
const THEMES = {
  matrix:   { accent: [34, 197, 94],   surface: '#0f1117', surface2: '#161b27', surface3: '#1e2535' },
  cyber:    { accent: [0, 212, 255],   surface: '#060b14', surface2: '#0d1520', surface3: '#152030' },
  sunset:   { accent: [255, 107, 53],  surface: '#120a08', surface2: '#1f1008', surface3: '#2a1810' },
  ocean:    { accent: [6, 182, 212],   surface: '#070f14', surface2: '#0e1e2a', surface3: '#162a38' },
  lavender: { accent: [167, 139, 250], surface: '#0e0c17', surface2: '#16122a', surface3: '#1e1838' },
  ember:    { accent: [251, 146, 60],  surface: '#130a04', surface2: '#1f1008', surface3: '#2d1a0a' },
};

let currentTheme = localStorage.getItem('pi-theme') || 'matrix';

function setTheme(name) {
  currentTheme = name;
  localStorage.setItem('pi-theme', name);
  const t = THEMES[name];
  applyAccentColor(t.accent[0], t.accent[1], t.accent[2]);

  // Actualiza botones del panel
  document.querySelectorAll('.theme-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === name);
  });

  // Sincroniza sliders con el nuevo acento
  document.getElementById('slider-r').value = t.accent[0];
  document.getElementById('slider-g').value = t.accent[1];
  document.getElementById('slider-b').value = t.accent[2];
  document.getElementById('val-r').textContent = t.accent[0];
  document.getElementById('val-g').textContent = t.accent[1];
  document.getElementById('val-b').textContent = t.accent[2];
  syncHexFromRGB(t.accent[0], t.accent[1], t.accent[2]);
  updatePreview(t.accent[0], t.accent[1], t.accent[2]);
}

function applyAccentColor(r, g, b) {
  const root = document.documentElement;
  const hex = rgbToHex(r, g, b);

  root.style.setProperty('--accent', `#${hex}`);
  root.style.setProperty('--accent-dim', `#${darkenHex(hex, 0.7)}`);
  root.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);

  // Actualiza tema data-attribute para fondos preset
  // (si es custom, no seteamos data-theme)
  const matchedTheme = Object.entries(THEMES).find(([, t]) =>
    t.accent[0] === r && t.accent[1] === g && t.accent[2] === b
  );
  document.documentElement.setAttribute('data-theme', matchedTheme ? matchedTheme[0] : 'custom');
}

function rgbToHex(r, g, b) {
  return [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}
function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  if (clean.length !== 6) return null;
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}
function darkenHex(hex, factor) {
  const r = Math.round(parseInt(hex.slice(0,2),16) * factor);
  const g = Math.round(parseInt(hex.slice(2,4),16) * factor);
  const b = Math.round(parseInt(hex.slice(4,6),16) * factor);
  return rgbToHex(Math.min(255,r), Math.min(255,g), Math.min(255,b));
}

// ── Panel toggle ──
function toggleThemePanel() {
  const panel = document.getElementById('theme-panel');
  const overlay = document.getElementById('panel-overlay');
  panel.classList.toggle('open');
  overlay.classList.toggle('open');
}
function closeThemePanel() {
  document.getElementById('theme-panel').classList.remove('open');
  document.getElementById('panel-overlay').classList.remove('open');
}

// ══════════════════════════════════════════════
// ARCO RGB (CANVAS)
// ══════════════════════════════════════════════
function drawArc() {
  const canvas = document.getElementById('rgb-arc');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const cx = W / 2, cy = H - 10;
  const R = W / 2 - 12;
  const startAngle = Math.PI;
  const endAngle = 0;

  // Dibujar el arco con gradiente de espectro
  const steps = 180;
  for (let i = 0; i < steps; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / steps);
    const nextAngle = startAngle + (endAngle - startAngle) * ((i + 1) / steps);
    const hue = (i / steps) * 360;

    ctx.beginPath();
    ctx.strokeStyle = `hsl(${hue}, 100%, 55%)`;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    ctx.arc(cx, cy, R, angle, nextAngle);
    ctx.stroke();
  }

  // Track de fondo tenue
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI, 0);
  ctx.strokeStyle = 'rgba(255,255,255,0.04)';
  ctx.lineWidth = 18;
  ctx.stroke();

  // Re-dibujar arco encima
  for (let i = 0; i < steps; i++) {
    const angle = startAngle + (endAngle - startAngle) * (i / steps);
    const nextAngle = startAngle + (endAngle - startAngle) * ((i + 1) / steps);
    const hue = (i / steps) * 360;
    ctx.beginPath();
    ctx.strokeStyle = `hsl(${hue}, 100%, 55%)`;
    ctx.lineWidth = 12;
    ctx.arc(cx, cy, R, angle, nextAngle);
    ctx.stroke();
  }
}

// Convierte posición del arco a RGB
function arcPositionToRGB(ratio) {
  const hue = ratio * 360;
  return hslToRgb(hue, 1, 0.55);
}

function hslToRgb(h, s, l) {
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
  };
  return {
    r: Math.round(f(0) * 255),
    g: Math.round(f(8) * 255),
    b: Math.round(f(4) * 255),
  };
}

// Interacción con el arco
let arcDragging = false;

function getArcRatio(canvas, clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.bottom - 10 * (rect.height / canvas.height);
  const dx = clientX - cx;
  const dy = clientY - cy;
  const angle = Math.atan2(dy, dx); // -π a π
  // Solo el semicírculo superior (de 180° a 0°, izquierda a derecha)
  let ratio = (angle - Math.PI) / (0 - Math.PI);
  return Math.max(0, Math.min(1, ratio));
}

function handleArcInput(e) {
  const canvas = document.getElementById('rgb-arc');
  const clientX = e.touches ? e.touches[0].clientX : e.clientX;
  const clientY = e.touches ? e.touches[0].clientY : e.clientY;
  const ratio = getArcRatio(canvas, clientX, clientY);
  const { r, g, b } = arcPositionToRGB(ratio);

  document.getElementById('slider-r').value = r;
  document.getElementById('slider-g').value = g;
  document.getElementById('slider-b').value = b;
  document.getElementById('val-r').textContent = r;
  document.getElementById('val-g').textContent = g;
  document.getElementById('val-b').textContent = b;
  syncHexFromRGB(r, g, b);
  updatePreview(r, g, b);
}

function initArc() {
  const canvas = document.getElementById('rgb-arc');
  if (!canvas) return;
  drawArc();

  canvas.addEventListener('mousedown', e => { arcDragging = true; handleArcInput(e); });
  canvas.addEventListener('mousemove', e => { if (arcDragging) handleArcInput(e); });
  window.addEventListener('mouseup', () => { arcDragging = false; });

  canvas.addEventListener('touchstart', e => { arcDragging = true; handleArcInput(e); e.preventDefault(); }, { passive: false });
  canvas.addEventListener('touchmove', e => { if (arcDragging) handleArcInput(e); e.preventDefault(); }, { passive: false });
  window.addEventListener('touchend', () => { arcDragging = false; });
}

// ══════════════════════════════════════════════
// SLIDERS RGB
// ══════════════════════════════════════════════
function updateFromSliders() {
  const r = parseInt(document.getElementById('slider-r').value);
  const g = parseInt(document.getElementById('slider-g').value);
  const b = parseInt(document.getElementById('slider-b').value);
  document.getElementById('val-r').textContent = r;
  document.getElementById('val-g').textContent = g;
  document.getElementById('val-b').textContent = b;
  syncHexFromRGB(r, g, b);
  updatePreview(r, g, b);
}

// ══════════════════════════════════════════════
// HEX INPUT
// ══════════════════════════════════════════════
function updateFromHex() {
  const hex = document.getElementById('hex-input').value.trim();
  document.getElementById('hex-swatch').style.background = hex.length === 6 ? `#${hex}` : '';
  if (hex.length === 6) {
    const rgb = hexToRgb(hex);
    if (rgb) {
      document.getElementById('slider-r').value = rgb.r;
      document.getElementById('slider-g').value = rgb.g;
      document.getElementById('slider-b').value = rgb.b;
      document.getElementById('val-r').textContent = rgb.r;
      document.getElementById('val-g').textContent = rgb.g;
      document.getElementById('val-b').textContent = rgb.b;
      updatePreview(rgb.r, rgb.g, rgb.b);
    }
  }
}

function syncHexFromRGB(r, g, b) {
  const hex = rgbToHex(r, g, b);
  document.getElementById('hex-input').value = hex.toUpperCase();
  document.getElementById('hex-swatch').style.background = `#${hex}`;
}

function updatePreview(r, g, b) {
  const hex = rgbToHex(r, g, b);
  document.getElementById('rgb-preview').style.background = `#${hex}`;
  document.getElementById('rgb-preview').style.boxShadow = `0 0 20px rgba(${r},${g},${b},0.6)`;
}

// ══════════════════════════════════════════════
// APLICAR COLOR CUSTOM
// ══════════════════════════════════════════════
function applyCustomColor() {
  const r = parseInt(document.getElementById('slider-r').value);
  const g = parseInt(document.getElementById('slider-g').value);
  const b = parseInt(document.getElementById('slider-b').value);

  applyAccentColor(r, g, b);

  // Quitar selección de temas preset
  document.querySelectorAll('.theme-btn').forEach(btn => btn.classList.remove('active'));

  // Guardar como custom en localStorage
  localStorage.setItem('pi-custom-color', JSON.stringify({ r, g, b }));
  localStorage.removeItem('pi-theme');

  // Feedback visual en el botón
  const btn = document.querySelector('.apply-rgb-btn');
  const original = btn.textContent;
  btn.textContent = '✓ aplicado';
  setTimeout(() => { btn.textContent = original; }, 1500);
}

// ══════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  // Cargar tema guardado
  const savedColor = localStorage.getItem('pi-custom-color');
  if (savedColor) {
    const { r, g, b } = JSON.parse(savedColor);
    applyAccentColor(r, g, b);
    document.getElementById('slider-r').value = r;
    document.getElementById('slider-g').value = g;
    document.getElementById('slider-b').value = b;
    document.getElementById('val-r').textContent = r;
    document.getElementById('val-g').textContent = g;
    document.getElementById('val-b').textContent = b;
    syncHexFromRGB(r, g, b);
    updatePreview(r, g, b);
  } else {
    const saved = localStorage.getItem('pi-theme') || 'matrix';
    setTheme(saved);
  }

  initArc();
  loadServices();
});

// ══════════════════════════════════════════════
// FIREWALL MODULE
// ══════════════════════════════════════════════

let fwState = { enabled: false, rules: [] };
let fwEditingId = null;

// ── Toast ──────────────────────────────────────
function fwToast(msg, type = 'success') {
  let t = document.getElementById('fw-toast-el');
  if (!t) {
    t = document.createElement('div');
    t.id = 'fw-toast-el';
    t.className = 'fw-toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.className = `fw-toast ${type}`;
  // Force reflow
  void t.offsetWidth;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 3000);
}

// ── Cargar y renderizar estado ─────────────────
async function loadFirewall() {
  try {
    const res = await fetch('/api/firewall');
    fwState = await res.json();
    renderFirewallUI();
  } catch(e) {
    console.error('Error cargando firewall:', e);
  }
}

function renderFirewallUI() {
  const enabled = fwState.enabled;

  // Badge
  const badge = document.getElementById('fw-status-badge');
  if (badge) {
    badge.textContent = enabled ? 'activo' : 'desactivado';
    badge.classList.toggle('active', enabled);
  }

  // Toggle button
  const btn = document.getElementById('fw-toggle-btn');
  const lbl = document.getElementById('fw-toggle-label');
  if (btn) {
    btn.classList.toggle('active', enabled);
    if (lbl) lbl.textContent = enabled ? 'desactivar firewall' : 'activar firewall';
  }

  // Status bar
  const bar = document.getElementById('fw-status-bar');
  const dot = document.getElementById('fw-dot');
  const statusTxt = document.getElementById('fw-status-text');
  const rulesCount = document.getElementById('fw-rules-count');

  if (bar) bar.classList.toggle('active', enabled);
  if (dot) dot.classList.toggle('active', enabled);

  const activeRules = (fwState.rules || []).filter(r => r.active).length;
  const totalRules = (fwState.rules || []).length;

  if (statusTxt) {
    statusTxt.textContent = enabled
      ? `Firewall activo · ${activeRules} de ${totalRules} reglas aplicadas`
      : 'Firewall inactivo · las reglas no están aplicadas';
  }
  if (rulesCount) {
    rulesCount.textContent = `${activeRules} regla${activeRules !== 1 ? 's' : ''} activa${activeRules !== 1 ? 's' : ''}`;
  }

  // Render tabla
  renderRulesTable();
}

function renderRulesTable() {
  const tbody = document.getElementById('fw-rules-body');
  if (!tbody) return;

  const rules = fwState.rules || [];
  if (rules.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="fw-empty">No hay reglas · añade una con el botón de abajo</td></tr>`;
    return;
  }

  tbody.innerHTML = rules.map(r => `
    <tr class="${r.active ? '' : 'fw-row-inactive'}" id="fw-row-${r.id}">
      <td class="fw-td-center">
        <div class="fw-row-switch">
          <label class="fw-switch" title="${r.active ? 'Desactivar' : 'Activar'} regla">
            <input type="checkbox" ${r.active ? 'checked' : ''} onchange="toggleRule(${r.id}, this.checked)">
            <span class="fw-switch-track"></span>
          </label>
        </div>
      </td>
      <td>
        <span class="fw-proto fw-proto-${r.proto === 'both' ? 'both' : r.proto}">
          ${r.proto === 'both' ? 'TCP+UDP' : r.proto.toUpperCase()}
        </span>
      </td>
      <td><span class="fw-port">:${r.srcPort}</span></td>
      <td class="fw-arrow-td">→</td>
      <td><span class="fw-port">:${r.dstPort}</span></td>
      <td><span class="fw-comment">${r.comment ? escapeHtml(r.comment) : '—'}</span></td>
      <td>
        <div class="fw-row-actions">
          <button class="fw-btn-edit" onclick="openFwModal(${r.id})">editar</button>
          <button class="fw-btn-del" onclick="deleteRule(${r.id})">✕</button>
        </div>
      </td>
    </tr>
  `).join('');
}

// ── Toggle firewall on/off ─────────────────────
async function toggleFirewall() {
  const btn = document.getElementById('fw-toggle-btn');
  if (btn) { btn.disabled = true; btn.style.opacity = '0.6'; }
  try {
    const res = await apiFetch('/api/firewall/toggle', { method: 'POST' });
    const data = await res.json();
    fwState.enabled = data.enabled;
    renderFirewallUI();
    if (data.ok) {
      fwToast(data.enabled ? `🔒 Firewall activado · ${data.applied ?? 0} regla(s)` : '🔓 Firewall desactivado', 'success');
    } else {
      fwToast(`⚠ ${(data.errors || []).join(' | ')}`, 'error');
    }
  } catch(e) {
    fwToast('Error al cambiar estado del firewall', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.style.opacity = ''; }
  }
}

// ── Toggle regla individual ────────────────────
async function toggleRule(id, active) {
  try {
    const res = await apiFetch(`/api/firewall/rules/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active })
    });
    const updated = await res.json();
    const rule = fwState.rules.find(r => r.id === id);
    if (rule) rule.active = active;
    renderFirewallUI();
    fwToast(active ? '✓ Regla activada' : '○ Regla desactivada');
  } catch(e) {
    fwToast('Error al actualizar regla', 'error');
    loadFirewall(); // Recargar estado real
  }
}

// ── Eliminar regla ─────────────────────────────
async function deleteRule(id) {
  const rule = fwState.rules.find(r => r.id === id);
  const label = rule ? `:${rule.srcPort} → :${rule.dstPort}` : 'esta regla';
  if (!confirm(`¿Eliminar la regla ${label}?`)) return;
  try {
    await apiFetch(`/api/firewall/rules/${id}`, { method: 'DELETE' });
    fwState.rules = fwState.rules.filter(r => r.id !== id);
    renderFirewallUI();
    fwToast('✓ Regla eliminada');
  } catch(e) {
    fwToast('Error al eliminar regla', 'error');
  }
}

// ── Re-aplicar reglas ──────────────────────────
async function applyFirewall() {
  try {
    const res = await apiFetch('/api/firewall/apply', { method: 'POST' });
    const data = await res.json();
    fwToast(data.ok ? `✓ ${data.msg}` : `⚠ ${data.errors?.join(', ')}`, data.ok ? 'success' : 'error');
  } catch(e) {
    fwToast('Error al aplicar reglas', 'error');
  }
}

// ── Modal añadir/editar regla ──────────────────
function openFwModal(editId = null) {
  fwEditingId = editId;
  const modal = document.getElementById('fw-modal');
  const title = document.getElementById('fw-modal-title');
  const saveBtn = document.getElementById('fw-modal-save-btn');

  if (editId) {
    const rule = fwState.rules.find(r => r.id === editId);
    if (!rule) return;
    document.getElementById('fw-inp-proto').value = rule.proto;
    document.getElementById('fw-inp-src').value = rule.srcPort;
    document.getElementById('fw-inp-dst').value = rule.dstPort;
    document.getElementById('fw-inp-comment').value = rule.comment || '';
    document.getElementById('fw-inp-active').checked = rule.active;
    if (title) title.textContent = 'Editar regla de firewall';
    if (saveBtn) saveBtn.textContent = 'guardar cambios →';
  } else {
    document.getElementById('fw-inp-proto').value = 'tcp';
    document.getElementById('fw-inp-src').value = '';
    document.getElementById('fw-inp-dst').value = '';
    document.getElementById('fw-inp-comment').value = '';
    document.getElementById('fw-inp-active').checked = true;
    if (title) title.textContent = 'Añadir regla de firewall';
    if (saveBtn) saveBtn.textContent = 'añadir regla →';
  }

  if (modal) modal.style.display = 'flex';
}

function closeFwModal() {
  const modal = document.getElementById('fw-modal');
  if (modal) modal.style.display = 'none';
  fwEditingId = null;
}

function closeFwModalBg(e) {
  if (e.target.id === 'fw-modal') closeFwModal();
}

async function saveFwRule() {
  const proto   = document.getElementById('fw-inp-proto').value;
  const srcPort = parseInt(document.getElementById('fw-inp-src').value);
  const dstPort = parseInt(document.getElementById('fw-inp-dst').value);
  const comment = document.getElementById('fw-inp-comment').value.trim();
  const active  = document.getElementById('fw-inp-active').checked;

  if (!srcPort || srcPort < 1 || srcPort > 65535) {
    fwToast('Puerto origen inválido (1-65535)', 'error'); return;
  }
  if (!dstPort || dstPort < 1 || dstPort > 65535) {
    fwToast('Puerto destino inválido (1-65535)', 'error'); return;
  }

  const payload = { proto, srcPort, dstPort, comment, active };

  try {
    if (fwEditingId) {
      const res = await apiFetch(`/api/firewall/rules/${fwEditingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      const rule = data.rule || data; // compatibilidad
      const idx = fwState.rules.findIndex(r => r.id === fwEditingId);
      if (idx !== -1) fwState.rules[idx] = rule;
      const ar = data.applyResult;
      if (ar && !ar.ok) fwToast(`⚠ Guardada pero error al aplicar: ${(ar.errors||[]).join(', ')}`, 'error');
      else fwToast('✓ Regla actualizada y aplicada');
    } else {
      const res = await apiFetch('/api/firewall/rules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.error) { fwToast(`Error: ${data.error}`, 'error'); return; }
      const rule = data.rule || data;
      fwState.rules.push(rule);
      const ar = data.applyResult;
      if (ar && !ar.ok) fwToast(`⚠ Guardada pero error al aplicar: ${(ar.errors||[]).join(', ')}`, 'error');
      else fwToast('✓ Regla añadida y aplicada');
    }
    renderFirewallUI();
    closeFwModal();
  } catch(e) {
    fwToast('Error al guardar regla', 'error');
  }
}

// ── Init ───────────────────────────────────────
loadFirewall();
setInterval(loadFirewall, 30000); // Sincronizar cada 30s

// ══════════════════════════════════════════════
// SERVICIOS DEL SISTEMA (systemd)
// ══════════════════════════════════════════════

async function loadSysServices() {
  try {
    const res = await fetch('/api/sysservices');
    const services = await res.json();
    renderSysServices(services);
  } catch (e) {
    const grid = document.getElementById('sys-services-grid');
    if (grid) grid.innerHTML = '<div class="loading-placeholder" style="color:var(--red)">Error cargando servicios del sistema</div>';
  }
}

function renderSysServices(services) {
  const grid = document.getElementById('sys-services-grid');
  if (!grid) return;
  grid.innerHTML = '';

  if (!services.length) {
    grid.innerHTML = '<div class="loading-placeholder">No hay servicios del sistema configurados · pulsa "+ añadir servicio"</div>';
    return;
  }

  services.forEach(svc => {
    const card = document.createElement('div');
    card.className = 'sys-svc-card';
    card.id = `sys-svc-${svc.id}`;

    const isActive = svc.status === 'active';
    const isFailed = svc.status === 'failed';
    const statusClass = isActive ? 'svc-status-active' : isFailed ? 'svc-status-failed' : 'svc-status-inactive';
    const statusLabel = isActive ? 'activo' : isFailed ? 'error' : 'inactivo';

    card.innerHTML = `
      <div class="sys-svc-top">
        <div class="sys-svc-info">
          <div class="sys-svc-name">${escapeHtml(svc.displayName || svc.name)}</div>
          <div class="sys-svc-unit">${escapeHtml(svc.name)}.service</div>
          ${svc.description ? `<div class="sys-svc-desc">${escapeHtml(svc.description)}</div>` : ''}
        </div>
        <div class="sys-svc-status-badge ${statusClass}">
          <span class="sys-svc-dot"></span>
          ${statusLabel}
        </div>
      </div>
      <div class="sys-svc-actions">
        <button class="sys-svc-btn btn-start" onclick="sysServiceAction(${svc.id}, 'start')" title="Iniciar" ${isActive ? 'disabled' : ''}>
          ▶ iniciar
        </button>
        <button class="sys-svc-btn btn-stop" onclick="sysServiceAction(${svc.id}, 'stop')" title="Detener" ${!isActive ? 'disabled' : ''}>
          ■ detener
        </button>
        <button class="sys-svc-btn btn-restart" onclick="sysServiceAction(${svc.id}, 'restart')" title="Reiniciar">
          ↺ reiniciar
        </button>
        <button class="sys-svc-btn btn-remove" onclick="removeSysService(${svc.id})" title="Quitar de la lista">
          ✕
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

async function sysServiceAction(id, action) {
  const card = document.getElementById(`sys-svc-${id}`);
  if (!card) return;

  // Feedback visual
  const btns = card.querySelectorAll('.sys-svc-btn');
  btns.forEach(b => b.disabled = true);
  const badge = card.querySelector('.sys-svc-status-badge');
  if (badge) { badge.className = 'sys-svc-status-badge svc-status-pending'; badge.innerHTML = '<span class="sys-svc-dot"></span>ejecutando...'; }

  try {
    const res = await apiFetch(`/api/sysservices/${id}/action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const data = await res.json();
    if (data.ok) {
      await loadSysServices(); // recargar todo
    } else {
      showSysError(card, data.error || 'Error desconocido');
      await loadSysServices();
    }
  } catch (e) {
    showSysError(card, 'Error de red');
    await loadSysServices();
  }
}

function showSysError(card, msg) {
  const err = document.createElement('div');
  err.className = 'sys-svc-error';
  err.textContent = '⚠ ' + msg;
  card.appendChild(err);
  setTimeout(() => err.remove(), 4000);
}

async function removeSysService(id) {
  if (!confirm('¿Quitar este servicio de la lista? (no se desinstalará del sistema)')) return;
  try {
    await apiFetch(`/api/sysservices/${id}`, { method: 'DELETE' });
    await loadSysServices();
  } catch (e) {}
}

// ── Modal añadir servicio del sistema ────────────────────────────────────────

function openSysServiceModal() {
  document.getElementById('syssvc-modal').classList.add('open');
  document.getElementById('syssvc-inp-name').focus();
}

function closeSysServiceModal() {
  document.getElementById('syssvc-modal').classList.remove('open');
  document.getElementById('syssvc-inp-name').value = '';
  document.getElementById('syssvc-inp-display').value = '';
  document.getElementById('syssvc-inp-desc').value = '';
}

function closeSysServiceModalBg(e) {
  if (e.target === document.getElementById('syssvc-modal')) closeSysServiceModal();
}

async function addSysService() {
  const name = document.getElementById('syssvc-inp-name').value.trim();
  const displayName = document.getElementById('syssvc-inp-display').value.trim();
  const description = document.getElementById('syssvc-inp-desc').value.trim();
  if (!name) { document.getElementById('syssvc-inp-name').focus(); return; }

  try {
    const res = await apiFetch('/api/sysservices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, displayName: displayName || name, description })
    });
    const data = await res.json();
    if (res.ok) {
      closeSysServiceModal();
      await loadSysServices();
    } else {
      alert(data.error || 'Error añadiendo el servicio');
    }
  } catch (e) {
    alert('Error de red');
  }
}

// ── Modal de logs ─────────────────────────────────────────────────────────────

function closeSysLogModal() {
  document.getElementById('syslog-modal').classList.remove('open');
}

function closeSysLogModalBg(e) {
  if (e.target === document.getElementById('syslog-modal')) closeSysLogModal();
}

// Arrancar carga inicial
loadSysServices();
setInterval(loadSysServices, 15000);

// ─── Pi-hole ──────────────────────────────────────────────────────────────────
async function loadPihole() {
  try {
    const data = await fetch('/api/pihole').then(r => r.json());
    if (data.error) {
      document.getElementById('pihole-status-badge').textContent = 'sin conexión';
      return;
    }
    const isEnabled = data.status === 'enabled';
    const badge = document.getElementById('pihole-status-badge');
    badge.textContent = isEnabled ? 'activo' : 'desactivado';
    badge.style.color = isEnabled ? 'var(--accent)' : 'var(--text-muted)';

    document.getElementById('ph-domains').textContent  = data.domains_blocked.toLocaleString();
    document.getElementById('ph-queries').textContent  = data.dns_queries_today.toLocaleString();
    document.getElementById('ph-blocked').textContent  = data.ads_blocked_today.toLocaleString();
    document.getElementById('ph-percent').textContent  = data.ads_percent + '%';
    document.getElementById('ph-clients').textContent  = data.unique_clients;
  } catch (e) {
    document.getElementById('pihole-status-badge').textContent = 'error';
  }
}

async function togglePihole() {
  const badge = document.getElementById('pihole-status-badge').textContent;
  const enable = badge !== 'activo';
  await apiFetch('/api/pihole/toggle', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enable })
  });
  setTimeout(loadPihole, 800);
}

// Añadir al intervalo de refresco existente o crear uno nuevo:
loadPihole();
setInterval(loadPihole, 30000);

// ─── Refresco automático cada 2 minutos ──────────────────────────────────────
const REFRESH_INTERVAL = 2 * 60 * 1000; // 2 minutos en ms

setInterval(() => {
  loadSystemInfo();
  loadServices();
  loadSysServices();
  loadPihole();
}, REFRESH_INTERVAL);