/* A right-cropped sandglass that scales with the viewport. One continuous
   profile blends from the desktop poster to the phone layout by width, so no
   size snaps the composition. Stencil's integer hash, 2px dither, 2.2MP budget
   and static → GPU lifecycle are retained; time alone moves the grains. */
(() => {
  "use strict";

  const BULB_COUNT = 18000;
  const STREAM_COUNT = 2000;
  const PILE_COUNT = 4000;
  const BODY_RIM_COUNT = 5400;
  const BASE_RIM_COUNT = 600;
  const COUNT = BULB_COUNT + STREAM_COUNT + PILE_COUNT + BODY_RIM_COUNT + BASE_RIM_COUNT;
  const PIXEL_BUDGET = 2200000;
  // Dither cells hash on a 2px grid anchored to the neck, so the noise travels
  // with the glass instead of re-rolling underneath it on every resize.
  const GRID = { stride: 1440, tipX: 1392, tipY: 468 };
  const TAU = Math.PI * 2;
  const stage = document.getElementById("stage");
  const fallback = document.getElementById("sand-fallback");
  const canvas = document.getElementById("sand-gl");
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const listeners = new AbortController();
  const signal = listeners.signal;
  const css = getComputedStyle(stage);

  function color(token) {
    const value = parseInt(css.getPropertyValue(token).trim().slice(1), 16);
    return new Float32Array([(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255]);
  }
  const sky = color("--st-sky");
  const violet = color("--st-violet");
  const plum = color("--st-plum");
  const silver = color("--st-silver");

  function hash(value) {
    let n = value >>> 0;
    n = Math.imul(n ^ n >>> 16, 0x7feb352d);
    n = Math.imul(n ^ n >>> 15, 0x846ca68b);
    return (n ^ n >>> 16) >>> 0;
  }
  function random(value) { return (hash(value) >>> 8) / 16777216; }
  function smoothstep(lo, hi, value) {
    const x = Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
    return x * x * (3 - 2 * x);
  }

  // Four fixed seeds per grain, uploaded once rather than rehashed each frame.
  const seeds = new Float32Array(COUNT * 4);
  for (let i = 0; i < COUNT; i++) {
    for (let j = 0; j < 4; j++) seeds[i * 4 + j] = random((i + 1) * 17 + j + 1);
  }

  // Wide ≥ 880px is exactly the desktop poster, narrow ≤ 560px exactly the
  // phone profile; between them every parameter eases, never steps.
  function geometry() {
    const rect = stage.getBoundingClientRect();
    const width = Math.max(1, rect.width);
    const height = Math.max(1, rect.height);
    const wide = smoothstep(560, 880, width);
    const blend = (narrow, broad) => narrow + (broad - narrow) * wide;
    const scale = Math.min(Math.max(.55, devicePixelRatio || 1), Math.sqrt(PIXEL_BUDGET / (width * height)));
    const length = blend(Math.min(height * .78, width * 1.55), Math.min(height * .88, width * .76));
    const aspect = blend(.48 * Math.min(1, (width * 2.2 / height) ** 2), 1.2);
    const tipX = width * blend(.945, .965);
    const tipY = height * blend(.43, .52);
    // The base is pushed below the viewport, so the glass is cropped at the bottom
    // edge the way it is cropped at the top and right; the grains reach the edge.
    const base = Math.max(1, height - tipY + Math.max(10, height * .022));
    stage.style.setProperty("--outlet-x", `${Math.round(tipX)}px`);
    stage.style.setProperty("--outlet-y", `${Math.round(tipY)}px`);
    // Backing pixels. The neck is rounded so grains stay pixel-centred and the
    // dither grid keeps its parity while it moves with the glass.
    const g = {
      width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)),
      tipX: Math.round(tipX * scale), tipY: Math.round(tipY * scale),
      length: length * scale, radius: length * aspect * scale, neck: Math.max(5, length * .0115) * scale,
      base: base * scale, baseDepth: Math.max(6, Math.min(20, base * .055)) * scale, scale
    };
    g.originX = g.tipX - GRID.tipX;
    g.originY = g.tipY - GRID.tipY;
    g.baseRadius = glassWidth(g.base, g);
    g.pileHeight = Math.min(g.base * .4, g.baseRadius * .55);
    g.dy = g.base * .965 - g.pileHeight;
    return g;
  }
  // Signed distance from the neck drives both sides of one continuous profile.
  function glassWidth(along, g) {
    const u = Math.min(1, Math.abs(along) / g.length);
    return g.neck + (g.radius - g.neck) * Math.pow(Math.sin(u * Math.PI / 2), 1.65);
  }
  function heapSurface(side, g) {
    const q = Math.min(1, Math.abs(side) / (g.baseRadius * .86));
    return g.base * .965 - g.pileHeight * (1 - q);
  }

  const COMMON = `#version 300 es
precision highp float;
precision highp int;
uniform vec2 u_resolution;
uniform vec3 u_grid; // neck-anchored dither origin x/y, cell-row stride; backing pixels
uniform vec4 u_body; // neck x/y, profile length/radius; backing pixels
uniform vec3 u_flow; // vertical travel, open-neck half-width, render scale
uniform vec4 u_heap; // profile-derived base offset/radius, heap height, base depth
uniform float u_time;
uniform vec3 u_sky;
uniform vec3 u_violet;
uniform vec3 u_plum;
uniform vec3 u_silver;
const float TAU = 6.283185307179586;
uint hash_u32(uint n) {
  n = (n ^ (n >> 16u)) * 0x7feb352du;
  n = (n ^ (n >> 15u)) * 0x846ca68bu;
  return n ^ (n >> 16u);
}
float random01(uint n) { return float(hash_u32(n) >> 8u) / 16777216.0; }
float glass_width(float along) {
  float u = clamp(abs(along) / u_body.z, 0.0, 1.0);
  return u_flow.y + (u_body.w - u_flow.y) * pow(sin(u * 1.57079632679), 1.65);
}
float heap_surface(float side) {
  float q = min(1.0, abs(side) / (u_heap.y * 0.86));
  return u_heap.x * 0.965 - u_heap.z * (1.0 - q);
}
`;

  const FIELD_VERTEX = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  // Colour is selected per integer cell, never a smooth CSS gradient.
  // Each cell rethrows its colour every 1.5s, with a fixed staggered bucket.
  const FIELD_FRAGMENT = COMMON + `
out vec4 fragColor;
void main() {
  vec2 local = vec2(gl_FragCoord.x, u_resolution.y - gl_FragCoord.y) - u_grid.xy;
  ivec2 cellXY = ivec2(floor(local * 0.5));
  vec2 p = vec2(cellXY) * 2.0 + 1.0 + u_grid.xy;
  uint cell = uint(cellXY.y) * uint(u_grid.z * 0.5) + uint(cellXY.x);
  uint bucket = hash_u32(cell ^ 0x85ebca6bu) % 90u;
  uint frame = uint(max(0.0, floor(u_time * 60.0)));
  uint generation = (frame + 89u - bucket) / 90u;
  float roll = random01(cell ^ (generation * 0xc2b2ae35u) ^ 0x20260712u);
  float grain = random01(cell ^ 0x9e3779b9u) > 0.955 ? 0.018 : 0.0;
  vec3 ink = vec3(0.0);
  float s = u_flow.z;

  float progress = (p.y - u_body.y) / u_flow.x;
  if (progress > 0.0 && progress < 1.15) {
    float d = abs(p.x - u_body.x);
    float fade = min(1.0, progress * 50.0) * min(1.0, (1.15 - progress) * 5.0);
    float core = exp(-d / (u_flow.y * 0.42 + 1.5 * s)) * 0.2 * fade;
    float cyan = exp(-d / (u_flow.y + 8.0 * s)) * 0.25 * fade;
    float purple = exp(-d / (u_flow.y * 2.5 + 28.0 * s)) * 0.28 * fade;
    float dark = exp(-d / (u_flow.y * 4.0 + 80.0 * s)) * 0.18 * fade;
    if (roll < core) ink = u_silver * 0.19;
    else if (roll < core + cyan) ink = u_sky * 0.42;
    else if (roll < core + cyan + purple) ink = u_violet * (0.27 + 0.20 * progress);
    else if (roll < core + cyan + purple + dark) ink = u_plum * 0.55;
  }

  float along = p.y - u_body.y;
  float side = p.x - u_body.x;
  float u = abs(along) / u_body.z;
  if (along >= -u_body.z * 1.035 && along <= u_heap.x) {
    float width = glass_width(along);
    float outside = abs(side) - width;
    float edge = exp(-abs(outside) / (2.1 * s)) * 0.98;
    float glimmer = 0.94 + 0.06 * sin(u * 16.0 - u_time * 0.5);
    if (roll < edge) {
      ink = mix(u_sky, u_silver, 0.82) * glimmer;
    } else if (outside > 0.0) {
      float cyan = exp(-outside / (8.0 * s)) * 0.36;
      float purple = exp(-outside / (45.0 * s)) * 0.32;
      float dark = exp(-outside / (130.0 * s)) * 0.14;
      if (roll < edge + cyan) ink = u_sky * 0.65;
      else if (roll < edge + cyan + purple) ink = u_violet * 0.5;
      else if (roll < edge + cyan + purple + dark) ink = u_plum * 0.7;
    } else {
      float q;
      float surface;
      float surfaceDistance;
      bool filled;
      if (along < 0.0) {
        q = side / width;
        surface = 0.66 + 0.11 * q * q;
        filled = u <= surface;
        surfaceDistance = abs(u - surface) * u_body.z;
      } else {
        q = side / (u_heap.y * 0.86);
        surface = heap_surface(side);
        filled = along >= surface && along <= u_heap.x * 0.965 && abs(q) <= 1.0;
        surfaceDistance = abs(along - surface);
      }
      if (filled) {
        float density = 0.12 + abs(q) * 0.15;
        if (roll < density) ink = u_sky * (0.11 + 0.21 * abs(q));
        else if (roll < density + 0.1) ink = u_violet * 0.12;
        if (surfaceDistance < 1.4 * s && roll < 0.65) ink = mix(u_sky, u_silver, 0.65) * 0.75;
      }
    }
  }

  if (abs(along - u_heap.x) <= u_heap.w + 3.0 * s && abs(side) <= u_heap.y + 3.0 * s) {
    float ellipse = length(vec2(side / u_heap.y, (along - u_heap.x) / u_heap.w));
    float rim = exp(-abs(ellipse - 1.0) * u_heap.w / (1.8 * s)) * 0.97;
    if (roll < rim) ink = mix(u_sky, u_silver, 0.8) * 0.9;
  }
  fragColor = vec4(max(ink, vec3(grain)), 1.0);
}`;

  const PARTICLE_VERTEX = COMMON + `
layout(location = 0) in vec4 a_seed;
out vec4 v_color;
void main() {
  vec2 point;
  vec3 ink = u_silver;
  float opacity;
  int instance = gl_InstanceID;
  if (instance < ${BULB_COUNT}) {
    float phase = fract(a_seed.x + u_time * (0.025 + 0.012 * a_seed.w));
    float u = 0.78 * (1.0 - phase);
    float q = a_seed.y * 2.0 - 1.0;
    float side = q * glass_width(-u * u_body.z) * 0.93;
    float surface = 0.66 + 0.11 * q * q;
    point = vec2(side, -u * u_body.z);
    opacity = u > surface ? 0.0 : min(1.0, (surface - u) * 22.0) * (0.2 + 0.76 * a_seed.z);
    if (a_seed.w > 0.9) ink = mix(u_silver, u_sky, 0.38);
  } else if (instance < ${BULB_COUNT + STREAM_COUNT}) {
    // Fixed horizontal seed: every falling grain stays in its own vertical lane.
    float age = fract(a_seed.x + u_time / (3.4 + 1.8 * a_seed.w));
    float p = 0.22 * age + 0.78 * age * age;
    float q = a_seed.y * 2.0 - 1.0;
    q = sign(q) * q * q;
    float offset = q * u_flow.y * 0.86;
    point = vec2(offset, u_flow.x * p);
    opacity = smoothstep(0.0, 0.018, p) * (1.0 - smoothstep(0.94, 1.0, p)) * (0.28 + 0.72 * a_seed.z);
    if (a_seed.w > 0.9) ink = mix(u_silver, u_sky, 0.38);
  } else if (instance < ${BULB_COUNT + STREAM_COUNT + PILE_COUNT}) {
    float q = a_seed.y * 2.0 - 1.0;
    q = sign(q) * (1.0 - sqrt(1.0 - abs(q)));
    float side = q * u_heap.y * 0.86;
    float surface = heap_surface(side);
    float depth = fract(a_seed.x + u_time * (0.025 + 0.012 * a_seed.w));
    point = vec2(side, mix(surface, u_heap.x * 0.965, depth));
    opacity = min(1.0, depth * 22.0) * (0.2 + 0.76 * a_seed.z);
    if (a_seed.w > 0.9) ink = mix(u_silver, u_sky, 0.38);
  } else if (instance < ${COUNT - BASE_RIM_COUNT}) {
    // Rim grains stop just above the viewport: the top of the glass is cropped.
    float top = min(u_body.z * 1.035, u_body.y + u_body.z * 0.04);
    float along = mix(-top, u_heap.x, a_seed.x);
    float direction = a_seed.y < 0.72 ? -1.0 : 1.0;
    float jitter = (a_seed.z - 0.5) * 3.5 * u_flow.z;
    float side = direction * (glass_width(along) + jitter);
    point = vec2(side, along);
    opacity = (0.5 + 0.45 * a_seed.w) * (0.9 + 0.1 * sin(u_time * 0.25 + a_seed.x * TAU));
    ink = mix(u_silver, u_sky, 0.12 + 0.32 * a_seed.z);
  } else {
    float angle = a_seed.x * TAU;
    float jitter = (a_seed.z - 0.5) * 2.5 * u_flow.z;
    point = vec2(cos(angle) * (u_heap.y + jitter), u_heap.x + sin(angle) * (u_heap.w + jitter));
    opacity = 0.55 + 0.4 * a_seed.w;
    ink = mix(u_silver, u_sky, 0.2);
  }
  point = floor(point) + 0.5 + u_body.xy;
  ink *= 0.7 + 0.3 * a_seed.z;
  v_color = vec4(ink, opacity);
  gl_Position = vec4(point.x / u_resolution.x * 2.0 - 1.0, 1.0 - point.y / u_resolution.y * 2.0, 0.0, 1.0);
  gl_PointSize = max(1.0, floor(u_flow.z * (instance >= ${BULB_COUNT + STREAM_COUNT + PILE_COUNT} ? 1.3 + 0.55 * a_seed.z : (a_seed.w > 0.96 ? 1.8 : 1.05)) + 0.5));
}`;
  const PARTICLE_FRAGMENT = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 fragColor;
void main() { fragColor = v_color; }`;

  function program(gl, vertexSource, fragmentSource) {
    const shaders = [];
    const result = gl.createProgram();
    try {
      for (const [type, source] of [[gl.VERTEX_SHADER, vertexSource], [gl.FRAGMENT_SHADER, fragmentSource]]) {
        const shader = gl.createShader(type);
        shaders.push(shader);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
        gl.attachShader(result, shader);
      }
      gl.linkProgram(result);
      if (!gl.getProgramParameter(result, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(result));
      const uniforms = {};
      for (const name of ["resolution", "grid", "body", "flow", "heap", "time", "sky", "violet", "plum", "silver"]) {
        uniforms[name] = gl.getUniformLocation(result, `u_${name}`);
      }
      return { handle: result, uniforms };
    } catch (error) {
      gl.deleteProgram(result);
      throw error;
    } finally {
      for (const shader of shaders) gl.deleteShader(shader);
    }
  }

  function createRenderer() {
    const gl = canvas.getContext("webgl2", { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: "high-performance" });
    if (!gl) return null;
    // Shader grain is neck-anchored; hardware dither would move with the screen.
    gl.disable(gl.DITHER);
    let field;
    let grains;
    try {
      field = program(gl, FIELD_VERTEX, FIELD_FRAGMENT);
      grains = program(gl, PARTICLE_VERTEX, PARTICLE_FRAGMENT);
    } catch (error) {
      if (field) gl.deleteProgram(field.handle);
      if (grains) gl.deleteProgram(grains.handle);
      console.warn("Sandglass: WebGL initialization failed; displaying the static canvas.", error);
      return null;
    }
    const vao = gl.createVertexArray();
    const buffer = gl.createBuffer();
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, seeds, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 0, 0);
    gl.vertexAttribDivisor(0, 1);
    let g;

    function setUniforms(p, seconds) {
      const u = p.uniforms;
      gl.useProgram(p.handle);
      gl.uniform2f(u.resolution, g.width, g.height);
      gl.uniform3f(u.grid, g.originX, g.originY, GRID.stride);
      gl.uniform4f(u.body, g.tipX, g.tipY, g.length, g.radius);
      gl.uniform3f(u.flow, g.dy, g.neck, g.scale);
      gl.uniform4f(u.heap, g.base, g.baseRadius, g.pileHeight, g.baseDepth);
      gl.uniform1f(u.time, seconds);
    }
    for (const p of [field, grains]) {
      gl.useProgram(p.handle);
      gl.uniform3fv(p.uniforms.sky, sky);
      gl.uniform3fv(p.uniforms.violet, violet);
      gl.uniform3fv(p.uniforms.plum, plum);
      gl.uniform3fv(p.uniforms.silver, silver);
    }
    return {
      resize(next) {
        g = next;
        canvas.width = g.width;
        canvas.height = g.height;
        gl.viewport(0, 0, g.width, g.height);
      },
      render(seconds) {
        gl.bindVertexArray(vao);
        gl.disable(gl.BLEND);
        setUniforms(field, seconds);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        setUniforms(grains, seconds);
        gl.drawArraysInstanced(gl.POINTS, 0, 1, COUNT);
        gl.disable(gl.BLEND);
      },
      free() {
        gl.deleteBuffer(buffer);
        gl.deleteVertexArray(vao);
        gl.deleteProgram(field.handle);
        gl.deleteProgram(grains.handle);
      }
    };
  }

  // CPU fallback mirrors the geometry, palette and both GPU passes.
  // It only paints on boot, fallback resize, or context loss.
  const context = fallback.getContext("2d", { alpha: false });
  const ink = new Float64Array(3);
  const sample = new Float64Array(8);
  function setInk(out, rgb, strength) {
    for (let j = 0; j < 3; j++) out[j] = rgb[j] * strength;
  }
  function mixInk(out, a, b, mix, strength = 1) {
    for (let j = 0; j < 3; j++) out[j] = (a[j] * (1 - mix) + b[j] * mix) * strength;
  }
  function shadeCell(x, y, cell, seconds, g) {
    ink.fill(0);
    const bucket = hash(cell ^ 0x85ebca6b) % 90;
    const generation = Math.floor((Math.floor(seconds * 60) + 89 - bucket) / 90);
    const roll = random(cell ^ Math.imul(generation, 0xc2b2ae35) ^ 0x20260712);
    const p = (y - g.tipY) / g.dy;
    if (p > 0 && p < 1.15) {
      const d = Math.abs(x - g.tipX);
      const fade = Math.min(1, p * 50) * Math.min(1, (1.15 - p) * 5);
      const core = Math.exp(-d / (g.neck * .42 + 1.5 * g.scale)) * .2 * fade;
      const cyan = Math.exp(-d / (g.neck + 8 * g.scale)) * .25 * fade;
      const purple = Math.exp(-d / (g.neck * 2.5 + 28 * g.scale)) * .28 * fade;
      const dark = Math.exp(-d / (g.neck * 4 + 80 * g.scale)) * .18 * fade;
      if (roll < core) setInk(ink, silver, .19);
      else if (roll < core + cyan) setInk(ink, sky, .42);
      else if (roll < core + cyan + purple) setInk(ink, violet, .27 + .20 * p);
      else if (roll < core + cyan + purple + dark) setInk(ink, plum, .55);
    }
    const along = y - g.tipY;
    const side = x - g.tipX;
    const u = Math.abs(along) / g.length;
    if (along >= -g.length * 1.035 && along <= g.base) {
      const width = glassWidth(along, g);
      const outside = Math.abs(side) - width;
      const edge = Math.exp(-Math.abs(outside) / (2.1 * g.scale)) * .98;
      const glimmer = .94 + .06 * Math.sin(u * 16 - seconds * .5);
      if (roll < edge) mixInk(ink, sky, silver, .82, glimmer);
      else if (outside > 0) {
        const cyan = Math.exp(-outside / (8 * g.scale)) * .36;
        const purple = Math.exp(-outside / (45 * g.scale)) * .32;
        const dark = Math.exp(-outside / (130 * g.scale)) * .14;
        if (roll < edge + cyan) setInk(ink, sky, .65);
        else if (roll < edge + cyan + purple) setInk(ink, violet, .5);
        else if (roll < edge + cyan + purple + dark) setInk(ink, plum, .7);
      } else {
        let q, surface, surfaceDistance, filled;
        if (along < 0) {
          q = side / width;
          surface = .66 + .11 * q * q;
          filled = u <= surface;
          surfaceDistance = Math.abs(u - surface) * g.length;
        } else {
          q = side / (g.baseRadius * .86);
          surface = heapSurface(side, g);
          filled = along >= surface && along <= g.base * .965 && Math.abs(q) <= 1;
          surfaceDistance = Math.abs(along - surface);
        }
        if (filled) {
          const density = .12 + Math.abs(q) * .15;
          if (roll < density) setInk(ink, sky, .11 + .21 * Math.abs(q));
          else if (roll < density + .1) setInk(ink, violet, .12);
          if (surfaceDistance < 1.4 * g.scale && roll < .65) mixInk(ink, sky, silver, .65, .75);
        }
      }
    }
    if (Math.abs(along - g.base) <= g.baseDepth + 3 * g.scale && Math.abs(side) <= g.baseRadius + 3 * g.scale) {
      const ellipse = Math.hypot(side / g.baseRadius, (along - g.base) / g.baseDepth);
      const rim = Math.exp(-Math.abs(ellipse - 1) * g.baseDepth / (1.8 * g.scale)) * .97;
      if (roll < rim) mixInk(ink, sky, silver, .8, .9);
    }
  }

  function sampleParticle(i, seconds, g) {
    const a = seeds[i * 4], b = seeds[i * 4 + 1], c = seeds[i * 4 + 2], d = seeds[i * 4 + 3];
    let x, y, opacity;
    setInk(ink, silver, 1);
    if (i < BULB_COUNT) {
      const phase = (a + seconds * (.025 + .012 * d)) % 1;
      const u = .78 * (1 - phase);
      const q = b * 2 - 1;
      const side = q * glassWidth(-u * g.length, g) * .93;
      const surface = .66 + .11 * q * q;
      x = side;
      y = -u * g.length;
      opacity = u > surface ? 0 : Math.min(1, (surface - u) * 22) * (.2 + .76 * c);
      if (d > .9) mixInk(ink, silver, sky, .38);
    } else if (i < BULB_COUNT + STREAM_COUNT) {
      const age = (a + seconds / (3.4 + 1.8 * d)) % 1;
      const p = .22 * age + .78 * age * age;
      const q0 = b * 2 - 1;
      const q = Math.sign(q0) * q0 * q0;
      x = q * g.neck * .86;
      y = g.dy * p;
      opacity = smoothstep(0, .018, p) * (1 - smoothstep(.94, 1, p)) * (.28 + .72 * c);
      if (d > .9) mixInk(ink, silver, sky, .38);
    } else if (i < BULB_COUNT + STREAM_COUNT + PILE_COUNT) {
      const q0 = b * 2 - 1;
      const q = Math.sign(q0) * (1 - Math.sqrt(1 - Math.abs(q0)));
      const side = q * g.baseRadius * .86;
      const surface = heapSurface(side, g);
      const depth = (a + seconds * (.025 + .012 * d)) % 1;
      x = side;
      y = surface * (1 - depth) + g.base * .965 * depth;
      opacity = Math.min(1, depth * 22) * (.2 + .76 * c);
      if (d > .9) mixInk(ink, silver, sky, .38);
    } else if (i < COUNT - BASE_RIM_COUNT) {
      const top = Math.min(g.length * 1.035, g.tipY + g.length * .04);
      const along = -top + (top + g.base) * a;
      const direction = b < .72 ? -1 : 1;
      const side = direction * (glassWidth(along, g) + (c - .5) * 3.5 * g.scale);
      x = side;
      y = along;
      opacity = (.5 + .45 * d) * (.9 + .1 * Math.sin(seconds * .25 + a * TAU));
      mixInk(ink, silver, sky, .12 + .32 * c);
    } else {
      const angle = a * TAU;
      const jitter = (c - .5) * 2.5 * g.scale;
      x = Math.cos(angle) * (g.baseRadius + jitter);
      y = g.base + Math.sin(angle) * (g.baseDepth + jitter);
      opacity = .55 + .4 * d;
      mixInk(ink, silver, sky, .2);
    }
    sample[0] = Math.floor(x) + .5 + g.tipX;
    sample[1] = Math.floor(y) + .5 + g.tipY;
    sample[2] = opacity;
    sample[3] = Math.max(1, Math.floor(g.scale * (i >= BULB_COUNT + STREAM_COUNT + PILE_COUNT ? 1.3 + .55 * c : (d > .96 ? 1.8 : 1.05)) + .5));
    for (let j = 0; j < 3; j++) sample[4 + j] = Math.round(ink[j] * (.7 + .3 * c) * 255);
  }

  let g = geometry();
  let renderer = null;
  let elapsed = 0;
  let origin = 0;
  let raf = 0;
  let disposed = false;

  function paintStatic() {
    if (!context) return;
    fallback.width = g.width;
    fallback.height = g.height;
    const image = context.createImageData(g.width, g.height);
    const data = image.data;
    const startX = -((g.originX % 2 + 2) % 2);
    const startY = -((g.originY % 2 + 2) % 2);
    for (let y = startY; y < g.height; y += 2) {
      for (let x = startX; x < g.width; x += 2) {
        const cellX = (x - g.originX) / 2;
        const cellY = (y - g.originY) / 2;
        const cell = (cellY * (GRID.stride / 2) + cellX) >>> 0;
        shadeCell(x + 1, y + 1, cell, elapsed / 1000, g);
        const grain = random(cell ^ 0x9e3779b9) > .955 ? .018 : 0;
        for (let yy = Math.max(0, y); yy < Math.min(g.height, y + 2); yy++) {
          const row = yy * g.width;
          for (let xx = Math.max(0, x); xx < Math.min(g.width, x + 2); xx++) {
            const index = (row + xx) * 4;
            for (let j = 0; j < 3; j++) data[index + j] = Math.max(ink[j], grain) * 255;
            data[index + 3] = 255;
          }
        }
      }
    }
    for (let i = 0; i < COUNT; i++) {
      sampleParticle(i, elapsed / 1000, g);
      if (sample[2] <= 0) continue;
      const left = Math.floor(sample[0] - sample[3] / 2);
      const top = Math.floor(sample[1] - sample[3] / 2);
      for (let y = Math.max(0, top); y < Math.min(g.height, top + sample[3]); y++) {
        for (let x = Math.max(0, left); x < Math.min(g.width, left + sample[3]); x++) {
          const index = (y * g.width + x) * 4;
          for (let j = 0; j < 3; j++) data[index + j] += (sample[4 + j] - data[index + j]) * sample[2];
        }
      }
    }
    context.putImageData(image, 0, 0);
  }

  function canAnimate() { return renderer && !reducedMotion.matches && !document.hidden && !disposed; }
  function tick(now) {
    raf = 0;
    if (!canAnimate()) return;
    elapsed = now - origin;
    renderer.render(elapsed / 1000);
    raf = requestAnimationFrame(tick);
  }
  function start() {
    if (!canAnimate() || raf) return;
    origin = performance.now() - elapsed;
    raf = requestAnimationFrame(tick);
  }
  function stop() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }
  function renderCurrent() {
    if (renderer) renderer.render(elapsed / 1000);
    else paintStatic();
  }
  function bootGPU() {
    if (disposed || renderer) return;
    renderer = createRenderer();
    if (renderer) {
      renderer.resize(g);
      renderer.render(elapsed / 1000);
      canvas.hidden = false;
      fallback.hidden = true;
      stage.dataset.renderer = "webgl2";
    } else stage.dataset.renderer = "canvas2d";
    start();
  }

  // Synchronous: a suspended frame callback must never leave the poster stale.
  window.addEventListener("resize", () => {
    if (disposed) return;
    g = geometry();
    if (renderer) renderer.resize(g);
    renderCurrent();
  }, { passive: true, signal });
  reducedMotion.addEventListener("change", () => {
    stop();
    renderCurrent();
    start();
  }, { signal });
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else start(); }, { signal });
  canvas.addEventListener("webglcontextlost", event => {
    event.preventDefault();
    stop();
    renderer = null;
    canvas.hidden = true;
    fallback.hidden = false;
    stage.dataset.renderer = "canvas2d";
    paintStatic();
  }, { signal });
  canvas.addEventListener("webglcontextrestored", bootGPU, { signal });
  window.addEventListener("pagehide", event => {
    stop();
    if (event.persisted) return;
    disposed = true;
    listeners.abort();
    clearTimeout(introTimer);
    if (renderer) renderer.free();
  }, { signal });
  window.addEventListener("pageshow", start, { signal });

  const introTimer = setTimeout(() => stage.classList.remove("landing-intro"), 2000);
  paintStatic();
  requestAnimationFrame(bootGPU);
})();
