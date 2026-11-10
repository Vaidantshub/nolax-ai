/**
 * BalloonButton — WebGL Tactile Inflated Balloon Shader Button
 * Directly ported from the 21st.dev / uibrik React component
 * Renders an inflated pillow height-field with edge creases, wave ripples,
 * and physical label warping.
 */

(function initBalloonButtonGlobal() {
  const PAD = 24;
  const STIFFNESS = 520;
  const MIN_PRESS = 140;

  const vertexShader = /* glsl */ `
    void main() {
      gl_Position = vec4(position.xy, 0.0, 1.0);
    }
  `;

  const fragmentShader = /* glsl */ `
    precision highp float;

    uniform vec2 uCanvas;
    uniform float uDpr;
    uniform vec2 uHalf;
    uniform float uRadius;
    uniform vec3 uColor;
    uniform float uPuff;
    uniform float uCreaseSpacing;
    uniform float uCreaseDepth;
    uniform float uPress;
    uniform vec2 uPoint;
    uniform float uWaveT;
    uniform float uWaveAmp;
    uniform sampler2D uLabel;
    uniform vec3 uInk;

    #define PI 3.14159265

    float sdRoundBox(vec2 p, vec2 b, float r) {
      vec2 q = abs(p) - b + r;
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
    }

    float perimeter(vec2 p, vec2 b, float rp) {
      p = abs(p);
      vec2 c = b - rp;
      vec2 q = p - c;
      if (q.x > 0.0 && q.y > 0.0) return c.x + rp * atan(q.x, q.y);
      if (q.y > 0.0) return p.x;
      if (q.x > 0.0) return c.x + rp * PI * 0.5 + (c.y - p.y);
      return (b.y - p.y) < (b.x - p.x) ? p.x : c.x + rp * PI * 0.5 + (c.y - p.y);
    }

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
    }

    float noise(vec2 p) {
      vec2 i = floor(p), f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
    }

    void inset(vec2 p, vec2 b, out float e, out float roll) {
      float r = min(uRadius, min(b.x, b.y));
      float d = -sdRoundBox(p, b, r);
      e = clamp(d / (min(b.x, b.y) * 0.95), 0.0, 1.0);
      roll = sqrt(1.0 - (1.0 - e) * (1.0 - e));
    }

    float restHeight(vec2 p, vec2 b, out float fold) {
      fold = 0.0;
      float e, roll;
      inset(p, b, e, roll);
      if (e <= 0.0) return 0.0;

      vec2 n = p / b;
      float dome = 1.0 - clamp(dot(n, n), 0.0, 1.0);
      float top = b.y * uPuff;
      float h = top * (roll * 0.82 + dome * 0.18);

      float r = min(uRadius, min(b.x, b.y));
      float s = perimeter(p, b, max(r, min(b.x, b.y) * 0.57));
      float wobble = 0.35 * sin(s * 0.11 + 1.3) + 0.2 * sin(s * 0.29 + 4.1);
      float reach = 0.42 + 0.18 * sin(s * 0.17 + 0.6) + 0.1 * sin(s * 0.47);
      float band = smoothstep(0.0, 0.07, e) * (1.0 - smoothstep(reach * 0.35, reach, e));
      float arc = abs(sin(PI * (s / uCreaseSpacing + wobble)));
      float valley = 1.0 - arc;
      fold = band * valley * valley;
      h -= top * uCreaseDepth * 0.22 * band * (1.0 - arc) * (0.7 + 0.3 * sin(s * 0.23));
      return h;
    }

    float deform(vec2 p, vec2 b) {
      float e, roll;
      inset(p, b, e, roll);
      if (e <= 0.0) return 0.0;
      float top = b.y * uPuff;

      vec2 dp = p - uPoint;
      float sig = b.y * 0.75;
      float g = exp(-dot(dp, dp) / (2.0 * sig * sig));
      float h = -uPress * top * 0.6 * g * sqrt(roll);
      h += uPress * top * 0.12 * (1.0 - g) * roll;
      h -= uPress * top * 0.2 * dot(p / b, uPoint / b) * roll;

      float rr = length(dp);
      float phase = uWaveT * 20.0 - rr * 0.16;
      float wave = sin(phase) * smoothstep(0.0, 2.5, phase) * exp(-uWaveT * 3.5) * exp(-rr / (b.x * 0.9));
      h += uWaveAmp * wave * top * 0.1 * roll;
      return h;
    }

    float inkAt(vec2 tp) {
      float c = texture2D(uLabel, (tp + uCanvas * 0.5) / uCanvas).a;
      float w = max(fwidth(c), 1e-4);
      return clamp((c - 0.5) / w + 0.5, 0.0, 1.0);
    }

    void main() {
      vec2 p = (gl_FragCoord.xy / uDpr) - uCanvas * 0.5;
      vec2 b = uHalf * (1.0 - vec2(0.012, 0.03) * uPress);
      float r = min(uRadius, min(b.x, b.y));
      float sd = sdRoundBox(p, b, r);

      float fold, f2;
      float d0 = deform(p, b);
      float dx = deform(p + vec2(1.0, 0.0), b);
      float dy = deform(p + vec2(0.0, 1.0), b);
      float h = restHeight(p, b, fold) + d0;
      float hx = restHeight(p + vec2(1.0, 0.0), b, f2) + dx;
      float hy = restHeight(p + vec2(0.0, 1.0), b, f2) + dy;
      vec3 n = normalize(vec3(h - hx, h - hy, 1.0));

      vec2 dp = p - uPoint;
      float rr = length(dp);
      float sig = b.y * 1.6;
      float g = exp(-rr * rr / (2.0 * sig * sig));
      float phase = uWaveT * 20.0 - rr * 0.16;
      float wave = sin(phase) * smoothstep(0.0, 2.5, phase) * exp(-uWaveT * 3.5) * exp(-rr / (b.x * 0.9));
      vec2 q = uPoint + dp * (1.0 + uPress * 0.3 * g) + (rr > 0.0 ? dp / rr : vec2(0.0)) * wave * uWaveAmp * 1.5;
      vec2 tp = q * (uHalf / b) - n.xy * h * 0.12;
      float print = inkAt(tp);
      float ink = print;

      ink *= 1.0 - smoothstep(0.6, 0.95, noise(tp * 0.3 + 3.0)) * 0.12;

      float ix = inkAt(tp + vec2(0.5, 0.0));
      float iy = inkAt(tp + vec2(0.0, 0.5));
      n = normalize(n + vec3(print - ix, print - iy, 0.0) * 0.08);

      vec2 gp = p * 0.18;
      n = normalize(n + vec3(noise(gp) - 0.5, noise(gp + 17.0) - 0.5, 0.0) * 0.03);

      vec3 L = normalize(vec3(-0.45, 0.65, 0.8));
      vec3 V = vec3(0.0, 0.0, 1.0);
      vec3 H = normalize(L + V);
      float ndl = dot(n, L);
      float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
      float ndh = max(dot(n, H), 0.0);
      float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.5);

      vec3 inkColor = mix(uInk, uColor, 0.08) * 0.9;
      vec3 base = mix(uColor, inkColor, ink * 0.95);
      vec3 col = base * (0.3 + 0.8 * wrap);
      col = mix(col, base * base * 0.9, fres * 0.55);
      col *= 1.0 - 0.45 * fold;
      col *= mix(0.7, 1.0, smoothstep(0.0, 2.5, -sd));
      float gloss = 1.0 - ink * 0.3;
      col += vec3(1.0) * (pow(ndh, 60.0) * 0.8 + pow(ndh, 20.0) * 0.2) * gloss;
      col += vec3(1.0) * fres * 0.06;

      float a = clamp(0.5 - sd * uDpr, 0.0, 1.0);

      float lift = 1.0 - clamp(uPress, 0.0, 1.0) * 0.6;
      float ssd = sdRoundBox(p - vec2(0.0, -5.0 * lift), uHalf * vec2(0.97, 0.92), r);
      float sa = (1.0 - smoothstep(-6.0, 6.0 + 10.0 * lift, ssd)) * 0.22;

      col = pow(max(col, 0.0), vec3(1.0 / 2.2));
      float alpha = a + sa * (1.0 - a);
      gl_FragColor = vec4(col * a, alpha);
    }
  `;

  function ensureThree(callback) {
    if (window.THREE) {
      callback(window.THREE);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js';
    script.onload = () => callback(window.THREE);
    script.onerror = () => console.warn('Failed to load Three.js for BalloonButton');
    document.head.appendChild(script);
  }

  function mountBalloonButton(button, THREE) {
    if (button._balloonMounted) return;
    button._balloonMounted = true;

    // Button container styling
    button.style.position = 'relative';
    button.style.overflow = 'visible';
    button.style.isolation = 'isolate';
    button.style.userSelect = 'none';

    const color = button.getAttribute('data-color') || '#0b0d13';
    const radius = parseFloat(button.getAttribute('data-radius')) || 24;
    const puff = parseFloat(button.getAttribute('data-puff')) || 0.7;
    const creaseSpacing = parseFloat(button.getAttribute('data-crease-spacing')) || 14;
    const creaseDepth = parseFloat(button.getAttribute('data-crease-depth')) || 0.4;
    const bounce = parseFloat(button.getAttribute('data-bounce')) || 0.2;

    const canvas = document.createElement('canvas');
    canvas.setAttribute('aria-hidden', 'true');
    canvas.style.position = 'absolute';
    canvas.style.pointerEvents = 'none';
    canvas.style.zIndex = '0';
    canvas.style.inset = `-${PAD}px`;
    canvas.style.width = `calc(100% + ${PAD * 2}px)`;
    canvas.style.height = `calc(100% + ${PAD * 2}px)`;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true });
    } catch (err) {
      button.dataset.fallback = '';
      return;
    }
    button.prepend(canvas);
    renderer.setClearColor(0x000000, 0);
    const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 4);
    renderer.setPixelRatio(pixelRatio());

    const material = new THREE.ShaderMaterial({
      vertexShader: vertexShader,
      fragmentShader: fragmentShader,
      uniforms: {
        uCanvas: { value: new THREE.Vector2() },
        uDpr: { value: renderer.getPixelRatio() },
        uHalf: { value: new THREE.Vector2() },
        uRadius: { value: radius },
        uColor: { value: new THREE.Color(color) },
        uPuff: { value: puff },
        uCreaseSpacing: { value: Math.max(creaseSpacing, 2) },
        uCreaseDepth: { value: creaseDepth },
        uPress: { value: 0 },
        uPoint: { value: new THREE.Vector2() },
        uWaveT: { value: 99 },
        uWaveAmp: { value: 0 },
        uLabel: { value: null },
        uInk: { value: new THREE.Color('#ffffff') },
      },
    });

    const labelCanvas = document.createElement('canvas');
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.minFilter = THREE.LinearFilter;
    labelTexture.generateMipmaps = false;
    material.uniforms.uLabel.value = labelTexture;

    const scene = new THREE.Scene();
    const geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));
    const camera = new THREE.Camera();

    const sim = {
      x: 0,
      v: 0,
      target: 0,
      waveT: 99,
      waveAmp: 0,
      raf: 0,
      last: 0,
      damping: 2 * Math.sqrt(STIFFNESS) * (1 - Math.min(Math.max(bounce, 0), 0.9)),
      pressedAt: 0,
      releaseTimer: 0,
    };

    const render = () => renderer.render(scene, camera);

    const drawLabel = () => {
      const w = button.offsetWidth + PAD * 2;
      const h = button.offsetHeight + PAD * 2;
      if (w <= PAD * 2 || h <= PAD * 2) return;

      const device = renderer.getPixelRatio();
      const dpr = device * Math.min(2, 4096 / (w * device));
      const cw = Math.round(w * dpr);
      const ch = Math.round(h * dpr);

      if (labelCanvas.width !== cw || labelCanvas.height !== ch) {
        labelTexture.dispose();
      }
      labelCanvas.width = cw;
      labelCanvas.height = ch;
      const ctx = labelCanvas.getContext('2d');
      if (!ctx) return;

      ctx.scale(dpr, dpr);

      // Extract text content from button
      const text = button.innerText.trim();
      const cs = getComputedStyle(button);
      ctx.font = `700 ${cs.fontSize || '14px'} ${cs.fontFamily || 'sans-serif'}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';

      // Centre label in button area
      const cx = PAD + (button.offsetWidth / 2);
      const cy = PAD + (button.offsetHeight / 2);
      ctx.fillText(text, cx, cy);

      material.uniforms.uInk.value.set('#ffffff');
      labelTexture.needsUpdate = true;
      render();
    };

    const resize = () => {
      const w = button.offsetWidth;
      const h = button.offsetHeight;
      if (w === 0 || h === 0) return;
      renderer.setSize(w + PAD * 2, h + PAD * 2, false);
      material.uniforms.uCanvas.value.set(w + PAD * 2, h + PAD * 2);
      material.uniforms.uHalf.value.set(w / 2, h / 2);
      drawLabel();
    };

    const ro = new ResizeObserver(resize);
    ro.observe(button);
    resize();

    // Hide direct DOM children opacity to let the WebGL shader label take over seamlessly
    Array.from(button.children).forEach(child => {
      if (child !== canvas) {
        child.style.opacity = '0';
      }
    });

    const tick = (now) => {
      const dt = Math.min(Math.max((now - sim.last) / 1000, 0), 1 / 30);
      sim.last = now;

      for (let i = 0; i < 4; i++) {
        const h = dt / 4;
        sim.v += (-STIFFNESS * (sim.x - sim.target) - sim.damping * sim.v) * h;
        sim.x += sim.v * h;
      }
      sim.waveT += dt;

      const u = material.uniforms;
      u.uPress.value = sim.x;
      u.uWaveT.value = sim.waveT;
      u.uWaveAmp.value = sim.waveAmp;
      renderer.render(scene, camera);

      const settled = Math.abs(sim.x - sim.target) < 0.0005 && Math.abs(sim.v) < 0.0005 && sim.waveT > 2;
      if (settled) {
        sim.x = sim.target;
        sim.raf = 0;
        return;
      }
      sim.raf = requestAnimationFrame(tick);
    };

    const kick = () => {
      if (sim.raf) return;
      sim.last = performance.now();
      sim.raf = requestAnimationFrame(tick);
    };

    const press = (x, y) => {
      clearTimeout(sim.releaseTimer);
      sim.pressedAt = performance.now();
      material.uniforms.uPoint.value.set(x, y);
      sim.target = 1;
      sim.waveT = 0;
      sim.waveAmp = 1;
      kick();
    };

    const release = () => {
      if (sim.target === 0) return;
      const wait = MIN_PRESS - (performance.now() - sim.pressedAt);
      clearTimeout(sim.releaseTimer);
      if (wait > 0) {
        sim.releaseTimer = setTimeout(release, wait);
        return;
      }
      sim.target = 0;
      kick();
    };

    button.addEventListener('pointerdown', (e) => {
      const rect = button.getBoundingClientRect();
      const px = e.clientX - rect.left - rect.width / 2;
      const py = rect.height / 2 - (e.clientY - rect.top);
      press(px, py);
    });

    button.addEventListener('pointerup', release);
    button.addEventListener('pointerleave', release);
    button.addEventListener('pointercancel', release);

    // Initial render call once font is ready
    if (document.fonts) {
      document.fonts.ready.then(drawLabel);
    }
  }

  window.initBalloonButtons = function() {
    ensureThree((THREE) => {
      const buttons = document.querySelectorAll('.balloon-btn, [data-balloon-btn]');
      buttons.forEach(btn => mountBalloonButton(btn, THREE));
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.initBalloonButtons);
  } else {
    window.initBalloonButtons();
  }
})();

