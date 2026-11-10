// Reusable TechText interactive canvas component
(function initTechTextGlobal() {
  const LABEL_FONT = '10px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  const FALLOFF_STEPS = 8;
  const SPRING = 320;
  const INTRO_DELAY = 0.15;
  const KICK_DECAY = 0.62;

  const approach = (current, target, dt, seconds) => current + (target - current) * (1 - Math.exp(-dt / seconds));
  const clamp01 = value => Math.min(1, Math.max(0, Number(value) || 0));
  const smoothstep = (edge0, edge1, value) => {
    const t = clamp01((value - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
  };
  const noise = (...values) => {
    let h = 2166136261;
    for (const value of values) {
      h = Math.imul(h ^ (value | 0), 16777619);
      h ^= h >>> 13;
      h = Math.imul(h, 0x5bd1e995);
      h ^= h >>> 15;
    }
    return (h >>> 0) / 4294967296;
  };
  const signed = value => (value > 0 ? `+${value}` : value < 0 ? `−${-value}` : '0');

  function mountTechText(container) {
    const canvas = document.createElement('canvas');
    canvas.className = 'tech-text-canvas';
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.style.position = 'relative';
    container.style.touchAction = 'pan-y';
    container.style.userSelect = 'none';
    container.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    const scratch = document.createElement('canvas');
    const scratchCtx = scratch.getContext('2d');
    if (!ctx || !scratchCtx) return;

    const s = {
      text: container.getAttribute('data-text') || 'NOLAX AI',
      fontFamily: container.getAttribute('data-font-family') || "'Plus Jakarta Sans', sans-serif",
      fontWeight: parseInt(container.getAttribute('data-font-weight')) || 800,
      fontSize: parseInt(container.getAttribute('data-font-size')) || 95,
      letterSpacing: -0.04,
      color: container.getAttribute('data-color') || '#ffffff',
      accentColor: container.getAttribute('data-accent') || '#38bdf8',
      align: 'center',
      reach: 180,
      softness: 0.7,
      dashLength: 4,
      dashGap: 2,
      strokeWidth: 1.5,
      lineStyle: 'dashed',
      reveal: 'letter',
      specks: 12,
      selection: true,
      labels: true,
      draggable: true,
      bounce: 0.45,
      sweep: true,
      speed: 1,
      clickKick: true,
      intro: 'none',
      introDuration: 2,
      guides: false
    };

    let width = 1, height = 1, dpr = 1, raf = 0, last = performance.now();
    let visible = true, alive = true, layoutKey = '', sizeDirty = true;
    let word = null, glyphs = [], presence = 0, clock = 0, pulse = 0, placed = false;
    let dragging = -1, cursor = '', guideAlpha = 0;
    const kicks = [], press = { x: 0, y: 0, time: 0, index: -1 };
    const pointer = { x: 0, y: 0, inside: false }, grab = { x: 0, y: 0 }, lens = { x: 0, y: 0 };
    const frame = { x1: 0, y1: 0, x2: 0, y2: 0, alpha: 0, index: -1 };

    const fontFor = size => `${s.fontWeight} ${size}px ${s.fontFamily}`;
    const setFont = (target, size) => {
      target.font = fontFor(size);
      if ('letterSpacing' in target) target.letterSpacing = `${s.letterSpacing * size}px`;
      target.textAlign = 'left';
      target.textBaseline = 'alphabetic';
    };

    const sprite = (view, glyph, stroke, ink) => {
      const pad = Math.ceil(s.strokeWidth * 2 + 4);
      const left = glyph.box.x1 - pad;
      const top = glyph.box.y1 - pad;
      const w = glyph.box.x2 - glyph.box.x1 + pad * 2;
      const h = glyph.box.y2 - glyph.box.y1 + pad * 2;
      const image = document.createElement('canvas');
      image.width = Math.max(1, Math.ceil(w * dpr));
      image.height = Math.max(1, Math.ceil(h * dpr));
      const c = image.getContext('2d');
      if (!c) return { image, left, top };
      c.setTransform(dpr, 0, 0, dpr, -left * dpr, -top * dpr);
      setFont(c, view.size);
      if (stroke) {
        c.lineJoin = 'round';
        c.lineWidth = s.strokeWidth * 2;
        c.lineCap = 'butt';
        c.strokeStyle = ink;
        c.setLineDash([Math.max(1, s.dashLength), Math.max(1, s.dashGap)]);
        c.strokeText(glyph.char, glyph.x, view.baseline);
        c.setLineDash([]);
        c.globalCompositeOperation = 'destination-out';
        c.fillStyle = '#000000';
        c.fillText(glyph.char, glyph.x, view.baseline);
        c.globalCompositeOperation = 'source-over';
      } else {
        c.fillStyle = ink;
        c.fillText(glyph.char, glyph.x, view.baseline);
      }
      return { image, left, top };
    };

    const ensureLayout = ink => {
      const key = [s.text, s.fontFamily, s.fontWeight, s.fontSize, width, height, dpr].join('|');
      if (key === layoutKey && word) return word;
      layoutKey = key;

      const probe = scratchCtx;
      setFont(probe, s.fontSize);
      let m = probe.measureText(s.text);
      const fit = Math.min(
        1,
        (width * 0.95) / Math.max(m.actualBoundingBoxLeft + m.actualBoundingBoxRight, 1),
        (height * 0.8) / Math.max(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent, 1)
      );
      const size = s.fontSize * fit;
      setFont(probe, size);
      m = probe.measureText(s.text);
      const inkWidth = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
      const inkHeight = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
      const start = (width - inkWidth) / 2;
      const x = start + m.actualBoundingBoxLeft;
      const baseline = (height - inkHeight) / 2 + m.actualBoundingBoxAscent;
      const next = {
        size,
        baseline,
        left: x - m.actualBoundingBoxLeft,
        right: x + m.actualBoundingBoxRight,
        top: baseline - m.actualBoundingBoxAscent,
        bottom: baseline + m.actualBoundingBoxDescent
      };
      word = next;

      const chars = Array.from(s.text);
      glyphs = [];
      let prefix = '';
      chars.forEach((char, i) => {
        prefix += char;
        const own = probe.measureText(char);
        const gx = x + probe.measureText(prefix).width - own.width;
        if (!char.trim()) return;
        const base = {
          char,
          x: gx,
          box: {
            x1: gx - own.actualBoundingBoxLeft,
            y1: baseline - own.actualBoundingBoxAscent,
            x2: gx + own.actualBoundingBoxRight,
            y2: baseline + own.actualBoundingBoxDescent
          }
        };
        glyphs.push({
          ...base,
          offset: { x: 0, y: 0 },
          velocity: { x: 0, y: 0 },
          outline: 0,
          shown: 1,
          index: i,
          fill: sprite(next, base, false, ink),
          dashes: sprite(next, base, true, ink)
        });
      });
      return next;
    };

    const glyphAt = (x, y) => {
      if (!word || y < word.top - 20 || y > word.bottom + 20) return -1;
      let best = -1, bestDist = Infinity;
      glyphs.forEach((g, i) => {
        const x1 = g.box.x1 + g.offset.x;
        const x2 = g.box.x2 + g.offset.x;
        const d = x < x1 ? x1 - x : x > x2 ? x - x2 : 0;
        if (d < bestDist) {
          bestDist = d;
          best = i;
        }
      });
      return bestDist < 25 ? best : -1;
    };

    const blit = (art, dx, dy) => {
      ctx.drawImage(art.image, Math.round((art.left + dx) * dpr), Math.round((art.top + dy) * dpr));
    };

    const kick = index => {
      const strength = (word ? word.size : 100) * 8;
      kicks.push({ index, at: pulse, velocity: strength });
      for (let d = 1; d < glyphs.length; d++) {
        const vel = strength * Math.pow(KICK_DECAY, d);
        if (vel < 20) break;
        for (const j of [index - d, index + d]) {
          if (j >= 0 && j < glyphs.length) kicks.push({ index: j, at: pulse + d * 0.05, velocity: vel });
        }
      }
    };

    const drawFrame = accent => {
      const glyph = glyphs[frame.index];
      if (!glyph || frame.alpha < 0.01) return;
      const a = frame.alpha;
      const x1 = Math.round(frame.x1 * dpr) / dpr;
      const y1 = Math.round(frame.y1 * dpr) / dpr;
      const x2 = Math.round(frame.x2 * dpr) / dpr;
      const y2 = Math.round(frame.y2 * dpr) / dpr;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = accent;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1;

      ctx.beginPath();
      ctx.rect(x1, y1, x2 - x1, y2 - y1);
      ctx.globalAlpha = 0.5 * a;
      ctx.stroke();

      for (const [cx, cy] of [[x1, y1], [x2, y1], [x2, y2], [x1, y2]]) {
        ctx.fillRect(Math.round(cx) - 2, Math.round(cy) - 2, 5, 5);
      }

      if (s.labels) {
        ctx.font = LABEL_FONT;
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.8 * a;
        ctx.fillText(`${glyph.char}  ${Math.round(glyph.box.x2 - glyph.box.x1)} × ${Math.round(glyph.box.y2 - glyph.box.y1)}`, x1, y1 - 6);
      }
      ctx.globalAlpha = 1;
    };

    const tick = now => {
      raf = 0;
      if (sizeDirty) {
        sizeDirty = false;
        width = Math.max(1, container.clientWidth);
        height = Math.max(1, container.clientHeight);
        dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const dt = Math.min(0.04, Math.max(0.001, (now - last) / 1000));
      last = now;

      const view = ensureLayout(s.color);
      const damping = 2 * Math.sqrt(SPRING) * (1 - clamp01(s.bounce) * 0.96);

      if (s.sweep && !pointer.inside && dragging < 0) clock += dt * s.speed;
      pulse += dt;

      let targetX = pointer.x, targetY = pointer.y;
      if (!pointer.inside && dragging < 0) {
        targetX = view.left + (view.right - view.left) * (0.5 - 0.5 * Math.cos(clock * 0.55));
        targetY = view.top + (view.bottom - view.top) * (0.5 + 0.1 * Math.sin(clock * 0.9));
      }

      const active = pointer.inside || dragging >= 0 || s.sweep;
      if (active && !placed) { lens.x = targetX; lens.y = targetY; }
      if (active) {
        lens.x = approach(lens.x, targetX, dt, pointer.inside ? 0.05 : 0.2);
        lens.y = approach(lens.y, targetY, dt, pointer.inside ? 0.05 : 0.2);
      }
      placed = active;

      for (let k = kicks.length - 1; k >= 0; k--) {
        if (kicks[k].at > pulse) continue;
        const g = glyphs[kicks[k].index];
        if (g) g.velocity.y -= kicks[k].velocity;
        kicks.splice(k, 1);
      }

      glyphs.forEach((g, i) => {
        if (i === dragging) {
          g.offset.x = approach(g.offset.x, pointer.x - grab.x, dt, 0.03);
          g.offset.y = approach(g.offset.y, pointer.y - grab.y, dt, 0.03);
          g.velocity.x = 0; g.velocity.y = 0;
          return;
        }
        g.velocity.x += (-SPRING * g.offset.x - damping * g.velocity.x) * dt;
        g.velocity.y += (-SPRING * g.offset.y - damping * g.velocity.y) * dt;
        g.offset.x += g.velocity.x * dt;
        g.offset.y += g.velocity.y * dt;
      });

      const focus = dragging >= 0 ? dragging : glyphAt(lens.x, lens.y);
      if (focus >= 0 && s.selection) {
        const g = glyphs[focus];
        const bx1 = g.box.x1 + g.offset.x - 6;
        const by1 = g.box.y1 + g.offset.y - 6;
        const bx2 = g.box.x2 + g.offset.x + 6;
        const by2 = g.box.y2 + g.offset.y + 6;
        if (frame.index < 0 || frame.alpha < 0.02) {
          frame.x1 = bx1; frame.y1 = by1; frame.x2 = bx2; frame.y2 = by2;
        }
        frame.x1 = approach(frame.x1, bx1, dt, 0.08);
        frame.y1 = approach(frame.y1, by1, dt, 0.08);
        frame.x2 = approach(frame.x2, bx2, dt, 0.08);
        frame.y2 = approach(frame.y2, by2, dt, 0.08);
        frame.index = focus;
      }
      frame.alpha = approach(frame.alpha, focus >= 0 && s.selection ? 1 : 0, dt, 0.1);

      glyphs.forEach((g, i) => {
        const tgt = s.reveal === 'letter' && i === focus && i !== dragging ? 1 : 0;
        g.outline = approach(g.outline, tgt, dt, 0.09);
      });

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      glyphs.forEach(g => {
        if (g.outline < 0.99) {
          ctx.globalAlpha = 1 - g.outline;
          blit(g.fill, g.offset.x, g.offset.y);
        }
        if (g.outline > 0.01) {
          ctx.globalAlpha = g.outline;
          blit(g.dashes, g.offset.x, g.offset.y);
        }
        ctx.globalAlpha = 1;
      });

      drawFrame(s.accentColor);

      if (visible && alive) raf = requestAnimationFrame(tick);
    };

    const wake = () => { if (!raf && visible && alive) { last = performance.now(); raf = requestAnimationFrame(tick); } };

    const locate = e => {
      const rect = container.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
    };
    container.addEventListener('pointermove', e => { locate(e); pointer.inside = true; wake(); });
    container.addEventListener('pointerenter', e => { locate(e); pointer.inside = true; wake(); });
    container.addEventListener('pointerleave', () => { if (dragging < 0) pointer.inside = false; });
    container.addEventListener('pointerdown', e => {
      locate(e);
      pointer.inside = true;
      const idx = glyphAt(pointer.x, pointer.y);
      press.x = pointer.x; press.y = pointer.y; press.time = performance.now(); press.index = idx;
      if (idx >= 0) {
        dragging = idx;
        grab.x = pointer.x - glyphs[idx].offset.x;
        grab.y = pointer.y - glyphs[idx].offset.y;
        container.setPointerCapture?.(e.pointerId);
      }
      wake();
    });
    const onUp = e => {
      if (dragging >= 0) {
        dragging = -1;
        container.releasePointerCapture?.(e.pointerId);
      }
      if (press.index >= 0 && performance.now() - press.time < 350) {
        if (Math.hypot(e.clientX - press.x - container.getBoundingClientRect().left, e.clientY - press.y - container.getBoundingClientRect().top) < 10) {
          kick(press.index);
        }
      }
      press.index = -1;
    };
    container.addEventListener('pointerup', onUp);
    container.addEventListener('pointercancel', onUp);

    window.addEventListener('resize', () => { sizeDirty = true; wake(); });
    wake();
  }

  window.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-tech-text]').forEach(mountTechText);
  });
})();

