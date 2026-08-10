// js/embers.js
//
// A lightweight 2D-canvas particle system: small amber/orange embers that
// drift upward and sideways across the whole page, flickering as they go.
// No library — plain canvas + requestAnimationFrame. Deliberately sparse and
// small ("very small ... moving around"), not a dense flame simulation.

const PARTICLE_COUNT = 42;
const COLORS = ["#ff8a1e", "#ffb347", "#ff5a1f", "#ffd27a"];

export function initEmbers() {
  const canvas = document.createElement("canvas");
  canvas.id = "embersCanvas";
  canvas.style.position = "fixed";
  canvas.style.inset = "0";
  canvas.style.zIndex = "1";
  canvas.style.pointerEvents = "none";
  document.body.prepend(canvas);

  const ctx = canvas.getContext("2d");
  let width, height;
  let particles = [];

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
  }

  function makeParticle(spawnAnywhere) {
    return {
      x: Math.random() * width,
      y: spawnAnywhere ? Math.random() * height : height + Math.random() * 40,
      r: 0.6 + Math.random() * 1.6, // very small: <2px radius
      speedY: 0.15 + Math.random() * 0.35,
      driftX: (Math.random() - 0.5) * 0.4,
      wobble: Math.random() * Math.PI * 2,
      wobbleSpeed: 0.01 + Math.random() * 0.02,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      baseAlpha: 0.25 + Math.random() * 0.45,
      life: 0,
      maxLife: 500 + Math.random() * 500,
    };
  }

  function init() {
    resize();
    particles = Array.from({ length: PARTICLE_COUNT }, () => makeParticle(true));
  }

  function step() {
    ctx.clearRect(0, 0, width, height);

    for (const p of particles) {
      p.life++;
      p.y -= p.speedY;
      p.wobble += p.wobbleSpeed;
      p.x += p.driftX + Math.sin(p.wobble) * 0.3;

      // Flicker: alpha breathes slightly and fades out near end of life
      const lifeFrac = p.life / p.maxLife;
      const fade = lifeFrac > 0.75 ? (1 - lifeFrac) / 0.25 : 1;
      const flicker = 0.7 + Math.sin(p.wobble * 3) * 0.3;
      const alpha = Math.max(0, p.baseAlpha * fade * flicker);

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = alpha;
      ctx.fill();

      if (p.y < -10 || p.life > p.maxLife || p.x < -10 || p.x > width + 10) {
        Object.assign(p, makeParticle(false));
      }
    }
    ctx.globalAlpha = 1;

    requestAnimationFrame(step);
  }

  window.addEventListener("resize", resize);

  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    return; // respect reduced-motion — skip the animation entirely
  }

  init();
  requestAnimationFrame(step);
}
