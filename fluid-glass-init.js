// Reusable Vanilla JS WebGL2 FluidGlass Loader
(function initFluidGlassGlobal() {
  const PIXEL_BUDGET = 4e6;
  const SHADOW_SIZE = 160;
  const SHAPES = ['lens', 'blob', 'cube', 'pill', 'torus', 'prism', 'diamond'];
  const EXTENT = { lens: 1.02, blob: 1.08, cube: 1.32, pill: 1.02, torus: 1.0, prism: 1.18, diamond: 1.05 };
  const BASE = {
    lens: [0, 0, 0],
    blob: [0.2, 0, 0],
    cube: [-0.48, 0.62, 0.0],
    pill: [0.0, 0.0, 0.0],
    torus: [-0.5, 0.18, 0.0],
    prism: [-0.3, 0.45, 0.0],
    diamond: [-0.35, 0.5, 0.0]
  };
  const SPIN = {
    lens: [0, 0],
    blob: [1, 0],
    cube: [1, 0],
    pill: [0, 0],
    torus: [0, 1],
    prism: [1, 0],
    diamond: [1, 0]
  };

  const VERTEX = `#version 300 es
  const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
  void main() {
    gl_Position = vec4(corners[gl_VertexID], 0.0, 1.0);
  }`;

  const CONTENT = `#version 300 es
  precision highp float;
  uniform vec2 uView;
  uniform float uRatio;
  uniform sampler2D uMedia;
  uniform vec4 uMediaRect;
  uniform float uMediaOn;
  uniform sampler2D uText;
  uniform float uTextOn;
  uniform vec4 uBackground;
  out vec4 fragColor;

  void main() {
    vec2 w = gl_FragCoord.xy / uRatio;
    vec2 uv = vec2(w.x, uView.y - w.y) / uView;
    vec4 color = uBackground;
    if (uTextOn > 0.5) {
      vec4 text = texture(uText, uv);
      color = text + color * (1.0 - text.a);
    }
    fragColor = color;
  }`;

  const SDF = {
    lens: `{
      float a = length(p - vec3(0.0, 0.0, -1.85)) - 2.13;
      float b = length(p - vec3(0.0, 0.0, 1.85)) - 2.13;
      float h = clamp(0.5 - 0.5 * (b - a) / 0.2, 0.0, 1.0);
      return mix(b, a, h) + 0.2 * h * (1.0 - h);
    }`,
    blob: `{
      vec3 q = p * 1.6;
      float t = uTime;
      float n = sin(q.x + t * 1.1) * sin(q.y * 1.15 - t * 0.9) * sin(q.z * 0.95 + t * 0.8);
      n += 0.45 * sin(q.x * 1.6 - t * 0.6 + q.z) * sin(q.y * 1.9 + t * 1.2 + q.x * 0.5);
      return (length(p) - 0.92 - 0.085 * n) * 0.78;
    }`,
    cube: `{
      vec3 q = abs(p) - vec3(0.6);
      return length(max(q, 0.0)) + min(max(q.x, max(q.y, q.z)), 0.0) - 0.16;
    }`,
    pill: `{
      float outline = length(vec2(max(abs(p.x) - 0.58, 0.0), p.y)) - 0.42;
      vec2 q = vec2(outline + 0.16, abs(p.z) - 0.16);
      return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.16;
    }`,
    torus: `{
      vec2 q = vec2(length(p.xy) - 0.68, p.z);
      return length(q) - 0.3;
    }`,
    prism: `{
      vec3 q = abs(p);
      float side = max(q.x * 0.866025 + p.y * 0.5, -p.y) - 0.5;
      float d = max(q.z - 0.34, side);
      return d - 0.08;
    }`,
    diamond: `{
      vec3 q = abs(p);
      return (q.x + q.y * 0.92 + q.z * 1.25 - 0.98) * 0.5;
    }`
  };

  const SUPERSAMPLE = `
    float rim = tr.mode > 1.5 ? 1.0 - smoothstep(0.3, 0.55, clamp(-dot(rd, tr.n), 0.0, 1.0)) : tr.mode;
    if (rim > 0.0) {
      vec2 offsets[3] = vec2[3](vec2(0.33, 0.33), vec2(-0.33, 0.25), vec2(0.25, -0.33));
      float scatter = (length(tx) + length(ty)) / max(uBound, 1.0);
      for (int k = 0; k < 3; k++) {
        vec2 sub = w + offsets[k] * pixel;
        vec3 subDir = normalize(vec3(sub, 0.0) - camera);
        Trace st = traceSurface(ro, subDir, eps, pixel);
        if (st.mode > 1.5 && (uTint.a > 0.0 || bandOf(clamp(-dot(subDir, st.n), 0.0, 1.0), scatter) < 1.0)) {
          traceInterior(st, subDir, eps);
        }
        color += shadeTrace(st, subDir, background, tone, sub, tx, ty, rx, ry);
      }
      color *= 0.25;
    }`;

  const fragmentFor = (a, b, supersample) => `#version 300 es
  precision highp float;
  uniform vec2 uView;
  uniform float uRatio;
  uniform float uFocal;
  uniform vec3 uCenter;
  uniform mat3 uInverse;
  uniform float uScale;
  uniform float uBound;
  uniform float uMorph;
  uniform float uRipple;
  uniform float uTime;
  uniform float uIor;
  uniform float uDispersion;
  uniform float uReflection;
  uniform float uFrost;
  uniform vec4 uTint;
  uniform float uShadow;
  uniform vec3 uLight;
  uniform float uPresence;
  uniform sampler2D uMedia;
  uniform vec4 uMediaRect;
  uniform float uMediaOn;
  uniform sampler2D uText;
  uniform float uTextOn;
  uniform vec4 uBackground;
  uniform float uPass;
  uniform sampler2D uShadowMap;
  uniform vec4 uShadowBox;
  uniform vec2 uShadowSize;
  out vec4 fragColor;

  float shapeA(vec3 p) ${SDF[a]}
  float shapeB(vec3 p) ${SDF[b]}

  float field(vec3 p) {
    float d = shapeA(p);
    ${a !== b ? 'd = mix(d, shapeB(p), uMorph);' : ''}
    if (uRipple > 0.0) {
      d += uRipple * sin(p.x * 3.1 + uTime * 2.3) * sin(p.y * 3.4 - uTime * 1.9) * sin(p.z * 2.9 + uTime * 1.6);
    }
    return d;
  }

  float map(vec3 w) {
    return field(uInverse * (w - uCenter)) * uScale;
  }

  vec3 normalAt(vec3 w) {
    float e = 0.35;
    vec2 k = vec2(1.0, -1.0);
    return normalize(
      k.xyy * map(w + k.xyy * e) +
      k.yyx * map(w + k.yyx * e) +
      k.yxy * map(w + k.yxy * e) +
      k.xxx * map(w + k.xxx * e)
    );
  }

  vec4 content(vec2 w, vec2 gx, vec2 gy) {
    vec2 uv = vec2(w.x, uView.y - w.y) / uView;
    vec2 dx = vec2(gx.x, -gx.y) / uView;
    vec2 dy = vec2(gy.x, -gy.y) / uView;
    vec4 color = uBackground;
    if (uTextOn > 0.5) {
      vec4 text = textureGrad(uText, uv, dx, dy);
      color = text + color * (1.0 - text.a);
    }
    return color;
  }

  vec4 frosted(vec2 w, vec2 gx, vec2 gy) {
    if (uFrost <= 0.0) return content(w, gx, gy);
    float r = uFrost * 16.0;
    vec2 bx = gx + vec2(r * 0.35, 0.0);
    vec2 by = gy + vec2(0.0, r * 0.35);
    vec4 sum = content(w, bx, by) * 0.2;
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.785398 + 0.3;
      sum += content(w + vec2(cos(a), sin(a)) * r * (0.55 + 0.45 * float(i & 1)), bx, by) * 0.1;
    }
    return sum;
  }

  vec3 studio(vec3 d) {
    vec2 a = vec2(atan(d.x, d.z), d.y);
    float key = smoothstep(0.42, 0.22, abs(a.x + 0.62)) * smoothstep(0.3, 0.12, abs(a.y - 0.5));
    float strip = smoothstep(0.12, 0.05, abs(a.x - 0.95)) * smoothstep(0.8, 0.35, abs(a.y - 0.05));
    float dome = smoothstep(0.0, 1.0, d.z) * 0.04;
    return vec3(18.0) * key + vec3(8.0) * strip + vec3(dome);
  }

  vec4 light(vec3 d, float weight) {
    vec3 c = studio(d) * weight;
    float a = clamp(max(c.r, max(c.g, c.b)), 0.0, 1.0);
    return vec4(min(c, vec3(a)), a);
  }

  vec2 landing(vec3 o, vec3 d, vec2 fallback) {
    if (d.z > -0.0005) return fallback;
    return o.xy + d.xy * (-o.z / d.z);
  }

  float shadowAt(vec2 w, out float caustic) {
    caustic = 0.0;
    if (uShadow <= 0.0) return 0.0;
    vec3 p = vec3(w, 0.0);
    vec2 footprint = uCenter.xy + uLight.xy / uLight.z * uCenter.z;
    if (length(w - footprint) > uBound * 1.6) return 0.0;
    float t = 2.0;
    float occlusion = 1.0;
    float deepest = 1e5;
    for (int i = 0; i < 28; i++) {
      float h = map(p + uLight * t);
      deepest = min(deepest, h);
      if (h > 0.0) occlusion = min(occlusion, 6.0 * h / t);
      if (t > uCenter.z * 2.6 + uBound * 2.0) break;
      t += clamp(abs(h) * 0.8, 2.0, uBound * 0.25);
    }
    if (deepest > 0.0) return (1.0 - clamp(occlusion, 0.0, 1.0)) * 0.36;
    float depth = -deepest / max(uBound, 1.0);
    caustic = smoothstep(0.12, 0.5, depth) * (uIor - 1.0) * 2.0;
    return exp(-depth * 14.0) * 0.42;
  }

  vec2 shadowSample(vec2 w) {
    if (uShadow <= 0.0) return vec2(0.0);
    vec2 uv = (w - uShadowBox.xy) / uShadowBox.zw;
    if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) return vec2(0.0);
    vec2 s = textureLod(uShadowMap, uv, 0.0).rg;
    return vec2(s.x * 0.42, s.y * 2.0);
  }

  vec2 lighting(vec2 w, float under) {
    vec2 s = shadowSample(w);
    float dark = s.x * uShadow * uPresence;
    float glow = clamp(s.y * uShadow * uPresence, 0.0, 1.0) * mix(0.12, 0.3, under);
    return vec2(dark * mix(0.45, 1.0, under), glow);
  }

  vec4 shade(vec4 color, vec2 factors) {
    vec3 rgb = color.rgb * (1.0 - factors.x);
    float alpha = color.a + factors.x - color.a * factors.x;
    rgb = vec3(factors.y) + rgb * (1.0 - factors.y);
    alpha = factors.y + alpha * (1.0 - factors.y);
    return vec4(rgb, alpha);
  }

  struct Trace {
    float mode;
    float cover;
    vec3 p;
    vec3 n;
    vec3 q;
    vec3 inside;
    vec3 exitNormal;
    vec3 exitDir;
    float escaped;
    float travel;
    float bounces;
  };

  Trace traceSurface(vec3 ro, vec3 rd, float eps, float pixel) {
    Trace tr;
    tr.mode = 0.0;
    tr.cover = 0.0;
    tr.p = vec3(0.0);
    tr.n = vec3(0.0, 0.0, 1.0);
    tr.q = vec3(0.0);
    tr.inside = vec3(0.0, 0.0, -1.0);
    tr.exitNormal = vec3(0.0, 0.0, 1.0);
    tr.exitDir = vec3(0.0, 0.0, -1.0);
    tr.escaped = 0.0;
    tr.travel = 0.0;
    tr.bounces = 0.0;
    vec3 oc = ro - uCenter;
    float b = dot(oc, rd);
    float c = dot(oc, oc) - uBound * uBound;
    float disc = b * b - c;
    if (disc <= 0.0 || uPresence <= 0.0) return tr;
    float sq = sqrt(disc);
    float t = max(-b - sq, 0.0);
    float tEnd = -b + sq;
    float closest = 1e5;
    float closestT = t;
    bool hit = false;
    for (int i = 0; i < 96; i++) {
      float d = map(ro + rd * t);
      if (d < closest) {
        closest = d;
        closestT = t;
      }
      if (d < eps) {
        hit = true;
        break;
      }
      t += d * 0.9;
      if (t > tEnd) break;
    }
    if (!hit && closest < pixel * 0.35) {
      hit = true;
      t = closestT;
    }
    if (!hit) {
      tr.cover = clamp(1.0 - closest / (pixel * 1.2), 0.0, 1.0) * uPresence;
      if (tr.cover > 0.0) {
        tr.mode = 1.0;
        tr.p = ro + rd * closestT;
        tr.n = normalAt(tr.p);
      }
      return tr;
    }
    tr.mode = 2.0;
    tr.p = ro + rd * t;
    tr.n = normalAt(tr.p);
    return tr;
  }

  void traceInterior(inout Trace tr, vec3 rd, float eps) {
    vec3 inside = refract(rd, tr.n, 1.0 / uIor);
    vec3 q = tr.p + inside * eps * 4.0;
    vec3 exitDir = inside;
    bool escaped = false;
    for (int bounce = 0; bounce < 3; bounce++) {
      for (int i = 0; i < 64; i++) {
        float d = map(q);
        if (d > -eps) break;
        float stepLength = max(-d * 0.9, eps);
        q += inside * stepLength;
        tr.travel += stepLength;
      }
      vec3 n2 = normalAt(q);
      tr.exitNormal = n2;
      vec3 out1 = refract(inside, -n2, uIor);
      if (dot(out1, out1) > 0.0) {
        exitDir = out1;
        escaped = true;
        break;
      }
      inside = reflect(inside, -n2);
      q += inside * eps * 4.0;
      tr.bounces += 1.0;
    }
    if (!escaped) exitDir = inside;
    if (exitDir.z > -0.2) exitDir = normalize(vec3(exitDir.xy, -0.2 - abs(exitDir.z)));
    tr.q = q;
    tr.inside = inside;
    tr.exitDir = exitDir;
    tr.escaped = escaped ? 1.0 : 0.0;
  }

  float bandOf(float cosi, float scatter) {
    return max(smoothstep(0.42, 0.12, cosi), smoothstep(0.06, 0.24, scatter));
  }

  vec4 shadeTrace(Trace tr, vec3 rd, vec4 background, vec4 tone, vec2 w, vec2 tx, vec2 ty, vec2 rx, vec2 ry) {
    if (tr.mode < 0.5) return background;
    vec3 mirrorDir = reflect(rd, tr.n);
    if (tr.mode < 1.5) {
      vec4 edgeTone = tone * uReflection * 0.8 + light(mirrorDir, uReflection) * 0.5;
      return mix(background, edgeTone + background * (1.0 - edgeTone.a), tr.cover * 0.7);
    }
    float cosi = clamp(-dot(rd, tr.n), 0.0, 1.0);
    float f0 = pow((uIor - 1.0) / (uIor + 1.0), 2.0);
    float fresnel = f0 + (1.0 - f0) * pow(1.0 - cosi, 5.0);
    float band = bandOf(cosi, (length(tx) + length(ty)) / max(uBound, 1.0));

    vec4 mirror = tone * uReflection;
    vec4 transmitted = tone;
    if (band < 1.0) {
      mirror = mirrorDir.z < -0.0005 ? frosted(landing(tr.p, mirrorDir, w), rx, ry) * uReflection : light(mirrorDir, uReflection);
      vec2 hitT = landing(tr.q, tr.exitDir, w);
      vec4 green = frosted(hitT, tx, ty);
      vec4 red = green;
      vec4 blue = green;
      if (tr.escaped > 0.5 && uDispersion > 0.0) {
        vec3 spread = vec3(-1.0, 0.0, 1.0) * uDispersion * 0.06;
        vec3 dirR = refract(tr.inside, -tr.exitNormal, uIor + spread.x);
        vec3 dirB = refract(tr.inside, -tr.exitNormal, uIor + spread.z);
        if (dot(dirR, dirR) > 0.0 && dirR.z < -0.2) red = frosted(landing(tr.q, dirR, hitT), tx, ty);
        if (dot(dirB, dirB) > 0.0 && dirB.z < -0.2) blue = frosted(landing(tr.q, dirB, hitT), tx, ty);
      }
      vec2 factors = lighting(hitT, 0.0);
      red = shade(red, factors);
      green = shade(green, factors);
      blue = shade(blue, factors);
      transmitted = mix(vec4(red.r, green.g, blue.b, green.a), tone, band);
      mirror = mix(mirror, tone * uReflection, band);
    }

    vec3 tint = pow(max(uTint.rgb, vec3(0.001)), vec3(uTint.a * tr.travel / max(uBound, 1.0)));
    transmitted.rgb *= tint;
    float body = (1.0 - dot(tint, vec3(0.3333))) * 0.7;
    transmitted += vec4(uTint.rgb * body, body) * (1.0 - transmitted.a);

    vec4 reflected = mirrorDir.z < -0.0005 ? mirror * fresnel : light(mirrorDir, uReflection * fresnel);
    vec4 glass = reflected + transmitted * (1.0 - reflected.a);
    float edge = 1.0 - smoothstep(0.04, 0.3, cosi);
    glass = mix(glass, mirror + background * (1.0 - mirror.a), edge);
    vec2 facing = normalize(vec2(-0.42, 0.55));
    float rimLight = pow(1.0 - cosi, 3.0) * (0.25 + 0.75 * abs(dot(normalize(tr.n.xy + 1e-5), facing))) * 0.55 * uReflection;
    rimLight *= smoothstep(0.0, 0.08, cosi);
    glass = vec4(rimLight) + glass * (1.0 - rimLight);
    return mix(background, glass, uPresence);
  }

  void main() {
    if (uPass > 0.5) {
      float caustic;
      float dark = shadowAt(uShadowBox.xy + gl_FragCoord.xy / uShadowSize * uShadowBox.zw, caustic);
      fragColor = vec4(dark / 0.42, caustic * 0.5, 0.0, 1.0);
      return;
    }
    vec2 w = gl_FragCoord.xy / uRatio;
    vec3 camera = vec3(uView * 0.5, uFocal);
    vec3 ro = camera;
    vec3 rd = normalize(vec3(w, 0.0) - camera);
    float pixel = 1.0 / uRatio;
    float eps = 0.25 * pixel;

    Trace tr = traceSurface(ro, rd, eps, pixel);
    if (tr.mode > 1.5) traceInterior(tr, rd, eps);
    vec2 hitT = tr.mode > 1.5 ? landing(tr.q, tr.exitDir, w) : w;
    vec2 hitR = tr.mode > 0.5 ? landing(tr.p, reflect(rd, tr.n), w) : w;
    vec2 tx = dFdx(hitT);
    vec2 ty = dFdy(hitT);
    vec2 rx = dFdx(hitR);
    vec2 ry = dFdy(hitR);
    vec2 wx = dFdx(w);
    vec2 wy = dFdy(w);

    vec4 background = shade(content(w, wx, wy), lighting(w, 1.0));
    vec4 tone = tr.mode > 0.5 ? content(uCenter.xy, vec2(uBound * 1.4, 0.0), vec2(0.0, uBound * 1.4)) : vec4(0.0);
    vec4 color = shadeTrace(tr, rd, background, tone, w, tx, ty, rx, ry);
    ${supersample ? SUPERSAMPLE : ''}
    fragColor = color;
  }`;

  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

  const smoother = t => {
    const x = clamp(t, 0, 1);
    return x * x * x * (x * (x * 6 - 15) + 10);
  };

  const quaternion = (x, y, z) => {
    const cx = Math.cos(x / 2), sx = Math.sin(x / 2);
    const cy = Math.cos(y / 2), sy = Math.sin(y / 2);
    const cz = Math.cos(z / 2), sz = Math.sin(z / 2);
    return [
      sx * cy * cz - cx * sy * sz,
      cx * sy * cz + sx * cy * sz,
      cx * cy * sz - sx * sy * cz,
      cx * cy * cz + sx * sy * sz
    ];
  };

  const multiply = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];

  const slerp = (a, b, t) => {
    let dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
    const target = dot < 0 ? b.map(v => -v) : b;
    dot = Math.abs(dot);
    if (dot > 0.9995) {
      const mixed = a.map((v, i) => v + (target[i] - v) * t);
      const len = Math.hypot(...mixed);
      return mixed.map(v => v / len);
    }
    const theta = Math.acos(dot);
    const sin = Math.sin(theta);
    return a.map((v, i) => v * (Math.sin((1 - t) * theta) / sin) + target[i] * (Math.sin(t * theta) / sin));
  };

  const driftAt = (clock, size) => [
    Math.sin(clock * 0.37) * size * 0.35 + Math.sin(clock * 0.71 + 1.3) * size * 0.12,
    Math.sin(clock * 0.29 + 0.8) * size * 0.2 + Math.cos(clock * 0.53) * size * 0.08
  ];

  const toMatrix = ([x, y, z, w]) => [
    1 - 2 * (y * y + z * z),
    2 * (x * y + z * w),
    2 * (x * z - y * w),
    2 * (x * y - z * w),
    1 - 2 * (x * x + z * z),
    2 * (y * z + x * w),
    2 * (x * z + y * w),
    2 * (y * z - x * w),
    1 - 2 * (x * x + y * y)
  ];

  function mountFluidGlass(container) {
    const text = container.getAttribute('data-text') || 'Look closer.';
    const initialShape = container.getAttribute('data-shape') || 'lens';
    const glassSize = parseInt(container.getAttribute('data-size')) || 240;
    const refraction = parseFloat(container.getAttribute('data-refraction')) || 1.1;
    const dispersion = parseFloat(container.getAttribute('data-dispersion')) || 0.4;
    const interactionMode = container.getAttribute('data-interaction') || 'follow';

    container.classList.add('fluid-glass');
    container.style.position = 'relative';
    container.style.overflow = 'hidden';

    const canvas = document.createElement('canvas');
    canvas.className = 'fluid-glass__canvas';
    canvas.style.position = 'absolute';
    canvas.style.inset = '0';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const handle = document.createElement('div');
    handle.className = 'fluid-glass__handle';
    handle.style.position = 'absolute';
    handle.style.borderRadius = '50%';
    container.appendChild(handle);

    const gl = canvas.getContext('webgl2', {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      powerPreference: 'high-performance'
    });
    if (!gl) {
      console.warn('WebGL2 not supported for FluidGlass');
      return;
    }

    const compileShader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      return s;
    };

    const vertex = compileShader(gl.VERTEX_SHADER, VERTEX);
    const programs = new Map();

    const request = name => {
      const key = name === 'content' ? name : `${name}>${view.ratio < 1.75 ? 1 : 0}`;
      if (programs.has(key)) return programs.get(key);
      const [a, b, sampled] = key.split('>');
      const fragment = compileShader(gl.FRAGMENT_SHADER, key === 'content' ? CONTENT : fragmentFor(a, b, sampled === '1'));
      const prog = gl.createProgram();
      gl.attachShader(prog, vertex);
      gl.attachShader(prog, fragment);
      gl.linkProgram(prog);
      const entry = { program: prog, fragment, uniforms: null, failed: false };
      programs.set(key, entry);
      return entry;
    };

    const ready = entry => {
      if (entry.failed) return false;
      if (entry.uniforms) return true;
      if (!gl.getProgramParameter(entry.program, gl.LINK_STATUS)) {
        entry.failed = true;
        return false;
      }
      const uniforms = {};
      const count = gl.getProgramParameter(entry.program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < count; i++) {
        const info = gl.getActiveUniform(entry.program, i);
        if (info) uniforms[info.name] = gl.getUniformLocation(entry.program, info.name);
      }
      entry.uniforms = uniforms;
      return true;
    };

    const vao = gl.createVertexArray();
    const makeTex = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return tex;
    };

    const textTexture = makeTex();
    const textCanvas = document.createElement('canvas');
    const view = { width: 1, height: 1, ratio: 1 };
    const textState = { key: '', ready: false };

    const pointer = { x: 0, y: 0, inside: false, down: false, grabbed: false, offsetX: 0, offsetY: 0, startX: 0, startY: 0 };
    const body = { x: 0, y: 0, vx: 0, vy: 0, spin: 0, ripple: 0, dirX: 1, dirY: 0, anchorX: 0, anchorY: 0 };
    const spring = { stretch: 1, vstretch: 0, tiltX: 0, vtiltX: 0, tiltY: 0, vtiltY: 0, scale: 1, vscale: 0 };
    let placed = false;
    let flying = false;
    const morph = { from: initialShape, to: initialShape, t: 1, pending: null };
    let current = null;
    let idleClock = Math.random() * 20;
    let last = performance.now();
    let time = 0;

    const drawText = () => {
      const family = 'Plus Jakarta Sans, sans-serif';
      const fill = '#ffffff';
      const width = canvas.width;
      const height = canvas.height;
      textCanvas.width = width;
      textCanvas.height = height;
      const ctx = textCanvas.getContext('2d');
      ctx.clearRect(0, 0, width, height);

      const lines = text.split('\n');
      const ratio = view.ratio;
      let px = Math.min((width * 0.88 * 100) / (lines[0].length * 55), height * 0.35);
      px = Math.max(28, px);

      ctx.font = `900 ${px}px ${family}`;
      ctx.fillStyle = fill;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if ('letterSpacing' in ctx) ctx.letterSpacing = '-1px';

      const totalHeight = px * 1.1 * lines.length;
      let y = (height - totalHeight) / 2 + (px * 1.1) / 2;
      lines.forEach(l => {
        ctx.fillText(l, width / 2, y);
        y += px * 1.1;
      });

      gl.bindTexture(gl.TEXTURE_2D, textTexture);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, textCanvas);
      gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
      gl.generateMipmap(gl.TEXTURE_2D);
      textState.ready = true;
    };

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const cssWidth = Math.max(1, rect.width);
      const cssHeight = Math.max(1, rect.height);
      const ratio = Math.min(window.devicePixelRatio || 1, 1.5);
      const width = Math.max(1, Math.round(cssWidth * ratio));
      const height = Math.max(1, Math.round(cssHeight * ratio));

      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      view.width = cssWidth;
      view.height = cssHeight;
      view.ratio = width / cssWidth;

      if (!placed) {
        body.x = cssWidth * 0.5;
        body.y = cssHeight * 0.5;
        body.anchorX = body.x;
        body.anchorY = body.y;
        placed = true;
      }
      drawText();
    };

    const radius = () => Math.min(glassSize / 2, Math.min(view.width, view.height) * 0.42);

    const bindContent = u => {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, textTexture);
      gl.uniform1i(u.uText, 1);
      gl.uniform2f(u.uView, view.width, view.height);
      gl.uniform1f(u.uRatio, view.ratio);
      gl.uniform1f(u.uTextOn, 1);
      gl.uniform4f(u.uBackground, 0, 0, 0, 0);
    };

    const frame = now => {
      requestAnimationFrame(frame);
      const dt = clamp((now - last) / 1000 || 0, 0, 0.05);
      last = now;
      time += dt;

      if (morph.pending && morph.t >= 1) {
        const key = `${morph.to}>${morph.pending}`;
        const entry = request(key);
        if (ready(entry)) {
          request(`${morph.pending}>${morph.pending}`);
          morph.from = morph.to;
          morph.to = morph.pending;
          morph.pending = null;
          morph.t = 0;
          spring.vstretch -= 2.0;
        }
      }
      if (morph.t < 1) {
        morph.t = Math.min(1, morph.t + dt / 0.65);
      }

      const size = radius();
      idleClock += dt;
      const drift = driftAt(idleClock, size);
      let goalX = body.anchorX + drift[0];
      let goalY = body.anchorY + drift[1];

      if (pointer.inside) {
        goalX = pointer.x;
        goalY = pointer.y;
      }

      const omega = 24;
      const h = dt / 2;
      for (let i = 0; i < 2; i++) {
        body.vx += (omega * omega * (goalX - body.x) - 2 * 0.86 * omega * body.vx) * h;
        body.vy += (omega * omega * (goalY - body.y) - 2 * 0.86 * omega * body.vy) * h;
        body.x += body.vx * h;
        body.y += body.vy * h;
      }

      body.spin += dt * 0.35;
      const key = morph.t < 1 ? `${morph.from}>${morph.to}` : `${morph.to}>${morph.to}`;
      const entry = request(key);
      if (ready(entry)) current = entry;

      if (!current) return;

      const eased = smoother(morph.t);
      const extent = EXTENT[morph.from] + (EXTENT[morph.to] - EXTENT[morph.from]) * eased;
      const unit = size / extent;
      const scale = spring.scale;
      const qa = quaternion(...BASE[morph.from]);
      const qb = quaternion(...BASE[morph.to]);
      let orientation = slerp(qa, qb, eased);
      const angle = body.spin % (Math.PI * 2);
      orientation = multiply(turnZ => turnZ, quaternion(0, angle, 0));
      const r = toMatrix(orientation);

      const focal = Math.max(view.width, view.height) * 1.6;
      const height = unit * (0.35 + 0.4);
      const worldY = view.height - body.y;
      const cx = view.width / 2 + (body.x - view.width / 2) * ((focal - height) / focal);
      const cy = view.height / 2 + (worldY - view.height / 2) * ((focal - height) / focal);

      const inv = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      const combined = new Float32Array(9);
      for (let col = 0; col < 3; col++) {
        for (let row = 0; row < 3; row++) {
          let sum = 0;
          for (let k = 0; k < 3; k++) sum += r[k * 3 + row] * inv[col * 3 + k];
          combined[col * 3 + row] = sum / (unit * scale);
        }
      }

      const u = current.uniforms;
      gl.useProgram(current.program);
      gl.bindVertexArray(vao);
      bindContent(u);
      gl.uniform1f(u.uFocal, focal);
      gl.uniform3f(u.uCenter, cx, cy, height);
      gl.uniformMatrix3fv(u.uInverse, false, combined);
      gl.uniform1f(u.uScale, unit * scale);
      gl.uniform1f(u.uBound, size * scale * 1.08 + 2);
      gl.uniform1f(u.uMorph, eased);
      gl.uniform1f(u.uRipple, 0);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uIor, 1 + 0.5 * refraction);
      gl.uniform1f(u.uDispersion, dispersion);
      gl.uniform1f(u.uReflection, 1.2);
      gl.uniform1f(u.uFrost, 0);
      gl.uniform4f(u.uTint, 1, 1, 1, 0);
      gl.uniform1f(u.uShadow, 0.4);
      gl.uniform3f(u.uLight, -0.4, 0.5, 0.8);
      gl.uniform1f(u.uPresence, 1);

      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform1f(u.uPass, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    const onPointerMove = e => {
      const rect = container.getBoundingClientRect();
      pointer.x = e.clientX - rect.left;
      pointer.y = e.clientY - rect.top;
      pointer.inside = (
        e.clientX >= rect.left && e.clientX <= rect.right &&
        e.clientY >= rect.top && e.clientY <= rect.bottom
      );
    };

    const onClick = () => {
      const idx = SHAPES.indexOf(morph.pending || morph.to);
      morph.pending = SHAPES[(idx + 1) % SHAPES.length];
    };

    container.addEventListener('pointermove', onPointerMove, { passive: true });
    container.addEventListener('pointerleave', () => { pointer.inside = false; });
    container.addEventListener('click', onClick);
    window.addEventListener('resize', resize);

    resize();
    request('content');
    request(`${initialShape}>${initialShape}`);
    requestAnimationFrame(frame);
  }

  function initAll() {
    document.querySelectorAll('[data-fluid-glass]').forEach(mountFluidGlass);
  }

  if (document.readyState === 'loading') {
    window.addEventListener('DOMContentLoaded', initAll);
  } else {
    initAll();
  }
})();

