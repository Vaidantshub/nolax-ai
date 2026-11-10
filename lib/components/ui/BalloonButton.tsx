"use client";

import { useEffect, useRef, type ButtonHTMLAttributes, type CSSProperties, type PointerEvent } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

// The button is drawn as a height field: an inflated pillow (half a balloon)
// over a rounded rectangle, with folds pinched in along the sealed edge. Lighting
// comes from the normals of that field, so a press just reshapes the heights.
// All lengths are CSS pixels, origin at the button centre, y up.

const vertex = /* glsl */ `
void main() {
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragment = /* glsl */ `
precision highp float;

uniform vec2 uCanvas;     // canvas size, px
uniform float uDpr;
uniform vec2 uHalf;       // button half size, px
uniform float uRadius;
uniform vec3 uColor;      // linear
uniform float uPuff;
uniform float uCreaseSpacing;
uniform float uCreaseDepth;
uniform float uPress;     // spring: 0 at rest, 1 pressed, overshoots below 0 on release
uniform vec2 uPoint;      // where the press landed
uniform float uWaveT;     // seconds since the press
uniform float uWaveAmp;
uniform sampler2D uLabel; // label painted white on transparent, canvas-sized
uniform vec3 uInk;        // linear

#define PI 3.14159265

float sdRoundBox(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + r;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
}

// Distance along the outline from the top centre, mirrored into one quadrant so
// folds sit symmetrically. Rounded with at least rp so the inner diagonal where
// the nearest edge flips sits beyond the fold band.
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

// How far inside the seam a point is, 0 at the edge to 1 on the crown, and the
// rounded profile that rises from it.
void inset(vec2 p, vec2 b, out float e, out float roll) {
  float r = min(uRadius, min(b.x, b.y));
  float d = -sdRoundBox(p, b, r);
  e = clamp(d / (min(b.x, b.y) * 0.95), 0.0, 1.0);
  roll = sqrt(1.0 - (1.0 - e) * (1.0 - e));
}

// Resting height in px. fold returns how deep in a crease this point is (0..1) for shading.
float restHeight(vec2 p, vec2 b, out float fold) {
  fold = 0.0;
  float e, roll;
  inset(p, b, e, roll);
  if (e <= 0.0) return 0.0;

  vec2 n = p / b;
  float dome = 1.0 - clamp(dot(n, n), 0.0, 1.0);
  float top = b.y * uPuff;
  float h = top * (roll * 0.82 + dome * 0.18);

  // Folds: puffy arcs between sharp valleys, deepest just inside the seam.
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

// Height the press adds on top of rest, px. Kept separate so the label can be
// stretched by exactly this change in shape.
float deform(vec2 p, vec2 b) {
  float e, roll;
  inset(p, b, e, roll);
  if (e <= 0.0) return 0.0;
  float top = b.y * uPuff;

  // A dent under the finger; the air it pushes out swells the rest. Scaled by
  // roll (not e) so a press near the seam stays where it landed instead of
  // sliding toward the crown.
  vec2 dp = p - uPoint;
  float sig = b.y * 0.75;
  float g = exp(-dot(dp, dp) / (2.0 * sig * sig));
  float h = -uPress * top * 0.6 * g * sqrt(roll);
  h += uPress * top * 0.12 * (1.0 - g) * roll;
  // An off-centre press rocks the whole balloon: that side sinks, the far side lifts.
  h -= uPress * top * 0.2 * dot(p / b, uPoint / b) * roll;

  // Ripple running out from the press, gated so it only exists behind its front.
  float rr = length(dp);
  float phase = uWaveT * 20.0 - rr * 0.16;
  float wave = sin(phase) * smoothstep(0.0, 2.5, phase) * exp(-uWaveT * 3.5) * exp(-rr / (b.x * 0.9));
  h += uWaveAmp * wave * top * 0.1 * roll;
  return h;
}

// Label coverage. The texture is supersampled; resharpening its edge to one
// device pixel undoes the softening from resampling it through the warp.
float inkAt(vec2 tp) {
  float c = texture2D(uLabel, (tp + uCanvas * 0.5) / uCanvas).a;
  float w = max(fwidth(c), 1e-4);
  return clamp((c - 0.5) / w + 0.5, 0.0, 1.0);
}

void main() {
  vec2 p = (gl_FragCoord.xy / uDpr) - uCanvas * 0.5;

  // The whole balloon squashes a touch while pressed.
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

  // Printed label. It lives in the balloon's own frame, so it squashes with it,
  // and the press stretches it like the latex under it: drawn into the dent,
  // swollen over the bump on release, pushed and pulled by the ripple.
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

  // Screen-print wear: ink thins slightly in a few soft patches.
  ink *= 1.0 - smoothstep(0.6, 0.95, noise(tp * 0.3 + 3.0)) * 0.12;

  // Ink sits a hair proud of the latex, so its edges catch the light.
  float ix = inkAt(tp + vec2(0.5, 0.0));
  float iy = inkAt(tp + vec2(0.0, 0.5));
  n = normalize(n + vec3(print - ix, print - iy, 0.0) * 0.08);

  // Faint latex texture: broad and smooth, so it never reads as pixel noise.
  vec2 gp = p * 0.18;
  n = normalize(n + vec3(noise(gp) - 0.5, noise(gp + 17.0) - 0.5, 0.0) * 0.03);

  vec3 L = normalize(vec3(-0.45, 0.65, 0.8));
  vec3 V = vec3(0.0, 0.0, 1.0);
  vec3 H = normalize(L + V);
  float ndl = dot(n, L);
  float wrap = clamp((ndl + 0.35) / 1.35, 0.0, 1.0);
  float ndh = max(dot(n, H), 0.0);
  float fres = pow(1.0 - clamp(n.z, 0.0, 1.0), 2.5);

  // Ink is a thin layer on the surface: a little of the balloon shows through,
  // it takes the same light and shade, and it is a touch less glossy.
  vec3 inkColor = mix(uInk, uColor, 0.08) * 0.9;
  vec3 base = mix(uColor, inkColor, ink * 0.95);
  vec3 col = base * (0.3 + 0.8 * wrap);
  // Steep sides read deeper and more saturated, like stretched latex.
  col = mix(col, base * base * 0.9, fres * 0.55);
  col *= 1.0 - 0.45 * fold;
  // Sealed seam along the very edge.
  col *= mix(0.7, 1.0, smoothstep(0.0, 2.5, -sd));
  // Glossy highlight plus a broad sheen.
  float gloss = 1.0 - ink * 0.3;
  col += vec3(1.0) * (pow(ndh, 60.0) * 0.8 + pow(ndh, 20.0) * 0.2) * gloss;
  col += vec3(1.0) * fres * 0.06;

  // Antialias over one device pixel, not one CSS pixel.
  float a = clamp(0.5 - sd * uDpr, 0.0, 1.0);

  // Soft contact shadow that tightens as the balloon is pushed down.
  float lift = 1.0 - clamp(uPress, 0.0, 1.0) * 0.6;
  float ssd = sdRoundBox(p - vec2(0.0, -5.0 * lift), uHalf * vec2(0.97, 0.92), r);
  float sa = (1.0 - smoothstep(-6.0, 6.0 + 10.0 * lift, ssd)) * 0.22;

  col = pow(max(col, 0.0), vec3(1.0 / 2.2));
  float alpha = a + sa * (1.0 - a);
  gl_FragColor = vec4(col * a, alpha);
}
`;

// Room around the button for the shadow and the swell on press.
const PAD = 24;
const STIFFNESS = 520;
// A press always lasts at least this long (ms). A quick click or tap often delivers pointerdown and
// pointerup in the same frame, which would reset the spring before it moved and show no dent.
const MIN_PRESS = 140;
const msSince = (t: number) => performance.now() - t;

export type BalloonButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "color"> & {
  label?: string;
  /** Balloon colour, any CSS colour three.js understands. */
  color?: string;
  /** Corner radius in px. */
  radius?: number;
  /** How far the surface swells, relative to half the button height. */
  puff?: number;
  /** Distance between folds along the edge, px. */
  creaseSpacing?: number;
  /** How deep the folds pinch in. */
  creaseDepth?: number;
  /** How much the dent springs back past rest on release, 0 to 0.9. */
  bounce?: number;
};

type Gl = {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.Camera;
  material: THREE.ShaderMaterial;
};

export function BalloonButton({
  label = "Balloon Button",
  color = "#000000",
  radius = 18,
  puff = 0.7,
  creaseSpacing = 14,
  creaseDepth = 0.4,
  bounce = 0.2,
  className,
  onPointerDown,
  onPointerUp,
  onPointerLeave,
  onPointerCancel,
  onKeyDown,
  onKeyUp,
  ...rest
}: BalloonButtonProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const glRef = useRef<Gl | null>(null);

  // Animation state lives in a ref so the loop never re-renders React.
  const sim = useRef({
    x: 0,
    v: 0,
    target: 0,
    waveT: 99,
    waveAmp: 0,
    raf: 0,
    last: 0,
    damping: 0,
    reduced: false,
    pressedAt: 0,
    releaseTimer: 0,
  });
  const renderRef = useRef<() => void>(() => {});
  const drawRef = useRef<() => void>(() => {});

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    // A fresh canvas (and so a fresh WebGL context) for every setup. When the effect runs again on
    // the same element (StrictMode, or Next.js showing a kept-alive page again after navigating
    // back), a new renderer on the old canvas would inherit the old context's GL state, its
    // uniforms would go to the wrong program, and the press would stop showing.
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.className = "pointer-events-none absolute";
    Object.assign(canvas.style, { inset: `-${PAD}px`, width: `calc(100% + ${PAD * 2}px)`, height: `calc(100% + ${PAD * 2}px)` });

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, premultipliedAlpha: true });
    } catch {
      // No WebGL: fall back to a flat fill.
      button.dataset.fallback = "";
      return;
    }
    button.prepend(canvas);
    delete button.dataset.fallback;
    renderer.setClearColor(0x000000, 0);
    // Full device resolution (browser zoom raises it too); the canvas is small.
    const pixelRatio = () => Math.min(window.devicePixelRatio || 1, 8);
    renderer.setPixelRatio(pixelRatio());

    const material = new THREE.ShaderMaterial({
      vertexShader: vertex,
      fragmentShader: fragment,
      uniforms: {
        uCanvas: { value: new THREE.Vector2() },
        uDpr: { value: renderer.getPixelRatio() },
        uHalf: { value: new THREE.Vector2() },
        uRadius: { value: 28 },
        uColor: { value: new THREE.Color() },
        uPuff: { value: 0.9 },
        uCreaseSpacing: { value: 11 },
        uCreaseDepth: { value: 0.5 },
        uPress: { value: 0 },
        uPoint: { value: new THREE.Vector2() },
        uWaveT: { value: 99 },
        uWaveAmp: { value: 0 },
        uLabel: { value: null },
        uInk: { value: new THREE.Color() },
      },
    });

    // The label is painted into a texture and printed onto the surface in the
    // shader, so it bends with the folds and dents. The HTML text stays for
    // layout and screen readers but is invisible.
    const labelCanvas = document.createElement("canvas");
    const labelTexture = new THREE.CanvasTexture(labelCanvas);
    labelTexture.minFilter = THREE.LinearFilter;
    labelTexture.generateMipmaps = false;
    material.uniforms.uLabel.value = labelTexture;
    const scene = new THREE.Scene();
    const geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));
    const camera = new THREE.Camera();
    glRef.current = { renderer, scene, camera, material };

    const render = () => renderer.render(scene, camera);
    renderRef.current = render;

    const drawLabel = () => {
      const span = labelRef.current;
      if (!span) return;
      const w = button.offsetWidth + PAD * 2;
      const h = button.offsetHeight + PAD * 2;
      // Supersampled 2x past device resolution so the warped label stays crisp.
      const device = renderer.getPixelRatio();
      const dpr = device * Math.min(2, 4096 / (w * device));
      const cw = Math.round(w * dpr);
      const ch = Math.round(h * dpr);
      // three.js allocates texture storage once; a new size needs a fresh texture.
      if (labelCanvas.width !== cw || labelCanvas.height !== ch) labelTexture.dispose();
      labelCanvas.width = cw;
      labelCanvas.height = ch;
      const ctx = labelCanvas.getContext("2d");
      if (!ctx) return;
      const cs = getComputedStyle(span);
      ctx.scale(dpr, dpr);
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#fff";
      // Centre the font's line box where the HTML text sits.
      const m = ctx.measureText(span.textContent ?? "");
      const sr = span.getBoundingClientRect();
      const br = button.getBoundingClientRect();
      const cx = PAD + sr.left - br.left + sr.width / 2;
      const cy = PAD + sr.top - br.top + sr.height / 2;
      ctx.fillText(span.textContent ?? "", cx, cy + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2);
      material.uniforms.uInk.value.set(cs.color);
      labelTexture.needsUpdate = true;
      render();
    };
    button.dataset.gl = "";
    drawRef.current = drawLabel;
    document.fonts?.ready.then(drawLabel);

    // The ink is read from the label's computed colour, which a theme change (a class or data
    // attribute on <html>) can flip without any prop changing. Repaint it when that happens, or the
    // old ink stays: white on a light balloon, black on a dark one.
    const themeObserver = new MutationObserver(drawLabel);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style", "data-theme"] });

    const resize = () => {
      const w = button.offsetWidth;
      const h = button.offsetHeight;
      renderer.setSize(w + PAD * 2, h + PAD * 2, false);
      material.uniforms.uCanvas.value.set(w + PAD * 2, h + PAD * 2);
      material.uniforms.uHalf.value.set(w / 2, h / 2);
      drawLabel();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(button);
    resize();

    // Re-render sharp when the page moves to another screen or is zoomed.
    let dprQuery: MediaQueryList;
    const onDpr = () => {
      renderer.setPixelRatio(pixelRatio());
      material.uniforms.uDpr.value = renderer.getPixelRatio();
      resize();
      watchDpr();
    };
    const watchDpr = () => {
      dprQuery?.removeEventListener("change", onDpr);
      dprQuery = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
      dprQuery.addEventListener("change", onDpr);
    };
    watchDpr();

    const onLost = (e: Event) => {
      e.preventDefault();
      delete button.dataset.gl;
      button.dataset.fallback = "";
    };
    canvas.addEventListener("webglcontextlost", onLost);

    const s = sim.current;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    s.reduced = mq.matches;

    return () => {
      cancelAnimationFrame(s.raf);
      s.raf = 0;
      clearTimeout(s.releaseTimer);
      ro.disconnect();
      themeObserver.disconnect();
      dprQuery.removeEventListener("change", onDpr);
      canvas.removeEventListener("webglcontextlost", onLost);
      geometry.dispose();
      labelTexture.dispose();
      material.dispose();
      renderer.dispose();
      // free the context now (browsers allow only a handful) and drop its canvas
      renderer.forceContextLoss();
      canvas.remove();
      glRef.current = null;
      delete button.dataset.gl;
    };
  }, []);

  // Props feed straight into uniforms.
  useEffect(() => {
    const gl = glRef.current;
    if (!gl) return;
    const u = gl.material.uniforms;
    u.uRadius.value = radius;
    u.uColor.value.set(color);
    u.uPuff.value = puff;
    u.uCreaseSpacing.value = Math.max(creaseSpacing, 2);
    u.uCreaseDepth.value = creaseDepth;
    renderRef.current();
  }, [color, radius, puff, creaseSpacing, creaseDepth]);

  // The label ink comes from the text colour, so a className change repaints it. So does a new
  // balloon colour: a theme toggle usually changes both, and the text colour may come from CSS.
  useEffect(() => {
    drawRef.current();
  }, [label, className, color]);

  useEffect(() => {
    // Damping ratio from bounce: 0 settles without overshoot, 0.9 rings.
    const zeta = 1 - Math.min(Math.max(bounce, 0), 0.9);
    sim.current.damping = 2 * Math.sqrt(STIFFNESS) * zeta;
  }, [bounce]);

  const tick = (now: number) => {
    const s = sim.current;
    const gl = glRef.current;
    if (!gl) {
      // torn down mid-loop: clear the handle, or kick() would think a loop is still running
      s.raf = 0;
      return;
    }
    // the first frame's timestamp can be a little before kick() ran; never step backwards
    const dt = Math.min(Math.max((now - s.last) / 1000, 0), 1 / 30);
    s.last = now;

    // Spring toward the target in small steps for stability.
    const damping = s.reduced ? 2 * Math.sqrt(STIFFNESS) : s.damping;
    for (let i = 0; i < 4; i++) {
      const h = dt / 4;
      s.v += (-STIFFNESS * (s.x - s.target) - damping * s.v) * h;
      s.x += s.v * h;
    }
    s.waveT += dt;

    const u = gl.material.uniforms;
    u.uPress.value = s.x;
    u.uWaveT.value = s.waveT;
    u.uWaveAmp.value = s.reduced ? 0 : s.waveAmp;
    gl.renderer.render(gl.scene, gl.camera);

    const settled = Math.abs(s.x - s.target) < 0.0005 && Math.abs(s.v) < 0.0005 && s.waveT > 2;
    if (settled) {
      s.x = s.target;
      s.raf = 0;
      return;
    }
    s.raf = requestAnimationFrame(tick);
  };

  const kick = () => {
    const s = sim.current;
    if (s.raf) return;
    s.last = performance.now();
    s.raf = requestAnimationFrame(tick);
  };

  const press = (x: number, y: number) => {
    const s = sim.current;
    clearTimeout(s.releaseTimer);
    s.pressedAt = performance.now();
    glRef.current?.material.uniforms.uPoint.value.set(x, y);
    s.target = 1;
    s.waveT = 0;
    s.waveAmp = 1;
    kick();
  };

  const release = () => {
    const s = sim.current;
    if (s.target === 0) return;
    const wait = MIN_PRESS - msSince(s.pressedAt);
    clearTimeout(s.releaseTimer);
    if (wait > 0) {
      // let the dent form before springing back
      s.releaseTimer = window.setTimeout(release, wait);
      return;
    }
    s.target = 0;
    kick();
  };

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    onPointerDown?.(e);
    const rect = e.currentTarget.getBoundingClientRect();
    press(e.clientX - rect.left - rect.width / 2, rect.height / 2 - (e.clientY - rect.top));
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      {...rest}
      onPointerDown={handlePointerDown}
      onPointerUp={(e) => {
        onPointerUp?.(e);
        release();
      }}
      onPointerLeave={(e) => {
        onPointerLeave?.(e);
        release();
      }}
      onPointerCancel={(e) => {
        onPointerCancel?.(e);
        release();
      }}
      onKeyDown={(e) => {
        onKeyDown?.(e);
        if ((e.key === "Enter" || e.key === " ") && !e.repeat) press(0, 0);
      }}
      onKeyUp={(e) => {
        onKeyUp?.(e);
        if (e.key === "Enter" || e.key === " ") release();
      }}
      className={cn(
        "relative inline-flex h-14 cursor-pointer touch-manipulation items-center justify-center px-9 text-base font-semibold tracking-tight text-white select-none data-fallback:bg-(--balloon) focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-zinc-400",
        className,
      )}
      style={{ borderRadius: radius, WebkitTapHighlightColor: "transparent", "--balloon": color } as CSSProperties}
    >
      <span ref={labelRef} className="relative in-data-gl:opacity-0">
        {label}
      </span>
    </button>
  );
}

