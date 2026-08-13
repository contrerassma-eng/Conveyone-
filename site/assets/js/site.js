/* ==========================================================================
   site.js — comportamiento común del sitio Conveyone.
   Sin dependencias. Se carga como módulo en todas las páginas.
   Responsabilidades: cabecera, menú móvil, transición entre páginas,
   revelado al hacer scroll, contadores y la lista de cotización.
   ========================================================================== */

/* --- lista de cotización (persistente en el navegador) ------------------- */
const CART_KEY = 'conveyone.cotizacion.v1';

export const cart = {
  read() {
    try { return JSON.parse(localStorage.getItem(CART_KEY) || '[]'); }
    catch (e) { return []; }
  },
  write(items) {
    try { localStorage.setItem(CART_KEY, JSON.stringify(items)); } catch (e) { /* modo privado */ }
    document.dispatchEvent(new CustomEvent('cart:change', { detail: items }));
    paintCount();
  },
  add(item) {
    const items = cart.read();
    items.push({ ...item, uid: 'it' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6) });
    cart.write(items);
    return items.length;
  },
  remove(uid) { cart.write(cart.read().filter((i) => i.uid !== uid)); },
  setQty(uid, qty) {
    cart.write(cart.read().map((i) => (i.uid === uid ? { ...i, qty: Math.max(1, qty | 0) } : i)));
  },
  clear() { cart.write([]); },
  count() { return cart.read().reduce((a, i) => a + (i.qty || 1), 0); },
};

function paintCount() {
  const n = cart.count();
  document.querySelectorAll('[data-cart-count]').forEach((el) => {
    el.textContent = n;
    const host = el.closest('[data-cart-host]') || el.parentElement;
    if (host) host.dataset.empty = n ? '0' : '1';
  });
}

/* --- cabecera ------------------------------------------------------------ */
function initHeader() {
  const hdr = document.querySelector('.hdr');
  if (!hdr) return;
  const overHero = hdr.dataset.overHero === '1';
  const prog = document.querySelector('.prog');

  const onScroll = () => {
    const y = window.scrollY;
    hdr.classList.toggle('stuck', y > 24);
    if (overHero) hdr.classList.toggle('on-dark', y <= 24);
    if (prog) {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      prog.style.width = (h > 0 ? (y / h) * 100 : 0) + '%';
    }
  };
  if (overHero) hdr.classList.add('on-dark');
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  // menú móvil
  const burger = document.querySelector('.burger');
  const scrim = document.querySelector('.scrim');
  const close = () => document.body.classList.remove('menu-open');
  if (burger) burger.addEventListener('click', () => document.body.classList.toggle('menu-open'));
  if (scrim) scrim.addEventListener('click', close);
  document.querySelectorAll('.nav a').forEach((a) => a.addEventListener('click', close));
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

  // marcar la página actual
  const here = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav a').forEach((a) => {
    const target = (a.getAttribute('href') || '').split('/').pop();
    if (target === here) a.classList.add('active');
  });
}

/* --- revelado al hacer scroll ------------------------------------------- */
function initReveal() {
  const els = document.querySelectorAll('[data-rv]');
  if (!els.length) return;
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion:reduce)').matches) {
    els.forEach((el) => el.classList.add('seen'));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      const delay = parseFloat(el.dataset.rvd || '0');
      setTimeout(() => el.classList.add('seen'), delay * 1000);
      io.unobserve(el);
    });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.12 });
  els.forEach((el) => io.observe(el));
}

/* Reparte un retardo incremental entre los hijos de un contenedor [data-rv-stagger] */
function initStagger() {
  document.querySelectorAll('[data-rv-stagger]').forEach((host) => {
    const step = parseFloat(host.dataset.rvStagger) || 0.08;
    Array.from(host.children).forEach((child, i) => {
      if (child.hasAttribute('data-rv') && !child.dataset.rvd) child.dataset.rvd = (i * step).toFixed(2);
    });
  });
}

/* Revela el contenido inyectado DESPUÉS del arranque (grillas construidas por
   JS): el observador inicial ya pasó y esos nodos nunca se mostrarían. */
export function revelar(root, paso = 0.06) {
  const els = (root || document).querySelectorAll('[data-rv]:not(.seen)');
  els.forEach((el, i) => setTimeout(() => el.classList.add('seen'), 60 + i * paso * 1000));
}

/* --- contadores ---------------------------------------------------------- */
function initCounters() {
  const els = document.querySelectorAll('[data-count]');
  if (!els.length || !('IntersectionObserver' in window)) return;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => {
      if (!en.isIntersecting) return;
      const el = en.target;
      const to = parseFloat(el.dataset.count);
      const suffix = el.dataset.countSuffix || '';
      const dur = 1200;
      const t0 = performance.now();
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / dur);
        const eased = 1 - Math.pow(1 - k, 3);
        el.textContent = Math.round(to * eased).toLocaleString('es-CL') + suffix;
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
      io.unobserve(el);
    });
  }, { threshold: 0.4 });
  els.forEach((el) => io.observe(el));
}

/* --- transición entre páginas ------------------------------------------- */
function initPageTransition() {
  if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;

  const veil = document.createElement('div');
  veil.className = 'page-veil';
  veil.innerHTML = '<img class="vm" src="assets/img/mark.png" alt="">';
  document.body.appendChild(veil);

  const internal = (a) => {
    const href = a.getAttribute('href') || '';
    if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) return false;
    if (a.target === '_blank' || a.hasAttribute('download') || a.dataset.noTransition != null) return false;
    try { return new URL(href, location.href).origin === location.origin; } catch (e) { return false; }
  };

  document.addEventListener('click', (e) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    const a = e.target.closest('a');
    if (!a || !internal(a)) return;
    const url = new URL(a.getAttribute('href'), location.href);
    if (url.pathname === location.pathname && url.search === location.search) return; // misma página
    e.preventDefault();
    veil.classList.remove('out');
    veil.classList.add('in');
    setTimeout(() => { location.href = url.href; }, 430);
  });

  // al volver con el historial, el navegador restaura la página: quitar el velo
  window.addEventListener('pageshow', (ev) => {
    if (ev.persisted) veil.classList.remove('in', 'out');
  });
}

/* --- año en el pie ------------------------------------------------------- */
function initYear() {
  document.querySelectorAll('[data-year]').forEach((el) => { el.textContent = new Date().getFullYear(); });
}

/* --- arranque ------------------------------------------------------------ */
function boot() {
  initHeader();
  initStagger();
  initReveal();
  initCounters();
  initPageTransition();
  initYear();
  paintCount();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

export default { cart, revelar };
