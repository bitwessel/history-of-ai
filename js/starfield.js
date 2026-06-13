// =========================================================================
// starfield.js — a calm, theme-aware "cosmos" background on one <canvas>.
//
// Zero dependencies. Designed to be cheap and unobtrusive:
//   - star count scales with viewport but is capped; device-pixel-ratio ≤ 2
//   - the loop only runs while active AND the tab is visible
//   - honours prefers-reduced-motion (renders a single static frame)
//   - faint links between nearby stars are a quiet nod to neural networks
//
// Palettes are derived from the design tokens in css/tokens.css so the
// background sits inside the same warm editorial world as the rest of the site.
// =========================================================================

const PALETTES = {
  dark: {
    bg0: '#13110C', bg1: '#0A0907',
    star: '244,239,225', accent: '226,124,94', link: '236,230,214',
    linkA: 0.14, bright: 1.45
  },
  light: {
    bg0: '#ECE7DB', bg1: '#E2DBCB',
    star: '60,52,40', accent: '181,70,46', link: '60,52,40',
    linkA: 0.07, bright: 1.0
  }
};

const LINK_DIST = 116;          // px; stars closer than this get a faint link
const LINK_DIST2 = LINK_DIST * LINK_DIST;

export function createStarfield(canvas) {
  const ctx = canvas.getContext('2d');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, dpr = 1;
  let stars = [];
  let grad = null;
  let theme = 'light';
  let active = false;
  let raf = 0;
  let last = 0;
  let meteor = null;
  let nextMeteor = 6;           // seconds until the next (rare) shooting star

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = Math.floor(W * dpr);
    canvas.height = Math.floor(H * dpr);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildGradient();
    spawn();
  }

  function buildGradient() {
    const p = PALETTES[theme];
    grad = ctx.createLinearGradient(0, 0, W * 0.6, H);
    grad.addColorStop(0, p.bg0);
    grad.addColorStop(1, p.bg1);
  }

  function spawn() {
    const n = Math.round(Math.min(150, (W * H) / 13000));
    const angle = -0.62;        // gentle global drift: rightward & slightly up
    const dx = Math.cos(angle), dy = Math.sin(angle);
    stars = Array.from({ length: n }, () => {
      const depth = Math.random();              // 0 = far, 1 = near
      const speed = 4 + depth * 16;             // px/sec — parallax by depth
      return {
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.4 + depth * 1.7,
        a: 0.22 + depth * 0.5,
        vx: dx * speed,
        vy: dy * speed,
        tw: 0.5 + Math.random() * 1.6,          // twinkle speed
        tp: Math.random() * Math.PI * 2,        // twinkle phase
        accent: Math.random() < 0.10
      };
    });
  }

  function drawStars(t) {
    const p = PALETTES[theme];
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(t * s.tw + s.tp);
      const alpha = Math.max(0, s.a * tw * p.bright);
      ctx.beginPath();
      ctx.fillStyle = `rgba(${s.accent ? p.accent : p.star},${alpha.toFixed(3)})`;
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawLinks() {
    const p = PALETTES[theme];
    ctx.lineWidth = 1;
    for (let i = 0; i < stars.length; i++) {
      const a = stars[i];
      for (let j = i + 1; j < stars.length; j++) {
        const b = stars[j];
        const dx = a.x - b.x, dy = a.y - b.y;
        const d2 = dx * dx + dy * dy;
        if (d2 > LINK_DIST2) continue;
        const k = (1 - Math.sqrt(d2) / LINK_DIST) * p.linkA;
        if (k <= 0.004) continue;
        ctx.strokeStyle = `rgba(${p.link},${k.toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
    }
  }

  function step(dt) {
    for (const s of stars) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      const m = s.r + 2;
      if (s.x < -m) s.x = W + m; else if (s.x > W + m) s.x = -m;
      if (s.y < -m) s.y = H + m; else if (s.y > H + m) s.y = -m;
    }

    // Rare, faint shooting star — a little reward for lingering.
    nextMeteor -= dt;
    if (!meteor && nextMeteor <= 0) {
      const fromLeft = Math.random() < 0.5;
      meteor = {
        x: fromLeft ? -40 : W * Math.random(),
        y: H * Math.random() * 0.5,
        vx: 360 + Math.random() * 220,
        vy: 150 + Math.random() * 120,
        life: 1
      };
      nextMeteor = 9 + Math.random() * 12;
    }
    if (meteor) {
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      meteor.life -= dt * 0.9;
      if (meteor.life <= 0 || meteor.x > W + 60 || meteor.y > H + 60) meteor = null;
    }
  }

  function drawMeteor() {
    if (!meteor) return;
    const p = PALETTES[theme];
    const tx = meteor.x - meteor.vx * 0.06;
    const ty = meteor.y - meteor.vy * 0.06;
    const g = ctx.createLinearGradient(tx, ty, meteor.x, meteor.y);
    g.addColorStop(0, `rgba(${p.accent},0)`);
    g.addColorStop(1, `rgba(${p.accent},${(0.5 * Math.max(0, meteor.life)).toFixed(3)})`);
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(tx, ty);
    ctx.lineTo(meteor.x, meteor.y);
    ctx.stroke();
  }

  function render(t) {
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
    drawLinks();
    drawStars(t);
    drawMeteor();
  }

  function frame(now) {
    if (!active) return;
    const dt = Math.min(0.05, (now - last) / 1000 || 0);  // clamp big gaps
    last = now;
    step(dt);
    render(now / 1000);
    raf = requestAnimationFrame(frame);
  }

  function start() {
    if (raf || !active || document.hidden) return;
    last = performance.now();
    if (reduced) { render(0); return; }     // static frame, no loop
    raf = requestAnimationFrame(frame);
  }

  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  window.addEventListener('resize', () => {
    if (!active) return;
    resize();
    if (reduced) render(0);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stop();
    else if (active) start();
  });

  return {
    setActive(on) {
      active = !!on;
      canvas.style.display = active ? 'block' : 'none';
      if (active) { resize(); start(); }
      else stop();
    },
    setTheme(next) {
      theme = (next === 'dark') ? 'dark' : 'light';
      if (!active) return;
      buildGradient();
      if (reduced) render(0);
    }
  };
}
