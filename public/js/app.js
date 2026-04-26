// ── Iconos disponibles ──────────────────────────────────────────────────────
const ICONS = ['🌐','📁','🖥️','🔒','📊','🎬','🎵','📧','🔧','💾','🗄️','📡','🏠','⚙️','🔗','📷','🗺️','📝'];
let selectedIcon = '🌐';

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
    card.href = s.url || '#';
    card.target = '_blank';
    card.rel = 'noopener noreferrer';
    card.innerHTML = `
      <button class="card-delete" title="Eliminar" onclick="deleteService(event, ${s.id})">✕</button>
      <div class="card-top">
        <div class="card-icon">${s.icon}</div>
        <div class="card-status ${s.online ? 'status-online' : 'status-offline'}">
          <span class="status-dot"></span>${s.online ? 'online' : 'offline'}
        </div>
      </div>
      <div>
        <div class="card-name">${s.name}</div>
        <div class="card-desc">${s.desc}</div>
      </div>
      <div class="card-meta">
        <span class="card-port">localhost<span>${s.port}</span></span>
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
  await fetch(`/api/services/${id}`, { method: 'DELETE' });
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
  await fetch('/api/services', {
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
