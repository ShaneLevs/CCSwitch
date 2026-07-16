<template>
  <div class="prismatic-container" ref="containerRef" />
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Renderer, Program, Mesh, Triangle, Texture } from 'ogl'

const props = defineProps({
  animationType: { type: String, default: 'rotate3d' },
  intensity: { type: Number, default: 2 },
  speed: { type: Number, default: 0.5 },
  distort: { type: Number, default: 0 },
  paused: { type: Boolean, default: false },
  offset: { type: Object, default: () => ({ x: 0, y: 0 }) },
  hoverDampness: { type: Number, default: 0.25 },
  rayCount: { type: Number, default: 0 },
  mixBlendMode: { type: String, default: 'lighten' },
  colors: { type: Array, default: () => [] },
})

const containerRef = ref(null)
const programRef = ref(null)
const rendererRef = ref(null)
const gradTexRef = ref(null)
const meshRef = ref(null)
const mouseTarget = ref([0.5, 0.5])
const mouseSmooth = ref([0.5, 0.5])
const pausedRef = ref(props.paused)
const hoverDampRef = ref(props.hoverDampness)
const isVisible = ref(true)

const vertex = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 0.0, 1.0);
}
`

const fragment = `#version 300 es
precision highp float;
precision highp int;

out vec4 fragColor;

uniform vec2  uResolution;
uniform float uTime;

uniform float uIntensity;
uniform float uSpeed;
uniform int   uAnimType;
uniform vec2  uMouse;
uniform int   uColorCount;
uniform float uDistort;
uniform vec2  uOffset;
uniform sampler2D uGradient;
uniform float uNoiseAmount;
uniform int   uRayCount;

float hash21(vec2 p){
    p = floor(p);
    float f = 52.9829189 * fract(dot(p, vec2(0.065, 0.005)));
    return fract(f);
}

mat2 rot30(){ return mat2(0.8, -0.5, 0.5, 0.8); }

float layeredNoise(vec2 fragPx){
    vec2 p = mod(fragPx + vec2(uTime * 30.0, -uTime * 21.0), 1024.0);
    vec2 q = rot30() * p;
    float n = 0.0;
    n += 0.40 * hash21(q);
    n += 0.25 * hash21(q * 2.0 + 17.0);
    n += 0.20 * hash21(q * 4.0 + 47.0);
    n += 0.10 * hash21(q * 8.0 + 113.0);
    n += 0.05 * hash21(q * 16.0 + 191.0);
    return n;
}

vec3 rayDir(vec2 frag, vec2 res, vec2 offset, float dist){
    float focal = res.y * max(dist, 1e-3);
    return normalize(vec3(2.0 * (frag - offset) - res, focal));
}

float edgeFade(vec2 frag, vec2 res, vec2 offset){
    vec2 toC = frag - 0.5 * res - offset;
    float r = length(toC) / (0.5 * min(res.x, res.y));
    float x = clamp(r, 0.0, 1.0);
    float q = x * x * x * (x * (x * 6.0 - 15.0) + 10.0);
    float s = q * 0.5;
    s = pow(s, 1.5);
    float tail = 1.0 - pow(1.0 - s, 2.0);
    s = mix(s, tail, 0.2);
    float dn = (layeredNoise(frag * 0.15) - 0.5) * 0.0015 * s;
    return clamp(s + dn, 0.0, 1.0);
}

mat3 rotX(float a){ float c = cos(a), s = sin(a); return mat3(1.0,0.0,0.0, 0.0,c,-s, 0.0,s,c); }
mat3 rotY(float a){ float c = cos(a), s = sin(a); return mat3(c,0.0,s, 0.0,1.0,0.0, -s,0.0,c); }
mat3 rotZ(float a){ float c = cos(a), s = sin(a); return mat3(c,-s,0.0, s,c,0.0, 0.0,0.0,1.0); }

vec3 sampleGradient(float t){
    t = clamp(t, 0.0, 1.0);
    return texture(uGradient, vec2(t, 0.5)).rgb;
}

vec2 rot2(vec2 v, float a){
    float s = sin(a), c = cos(a);
    return mat2(c, -s, s, c) * v;
}

float bendAngle(vec3 q, float t){
    float a = 0.8 * sin(q.x * 0.55 + t * 0.6)
            + 0.7 * sin(q.y * 0.50 - t * 0.5)
            + 0.6 * sin(q.z * 0.60 + t * 0.7);
    return a;
}

void main(){
    vec2 frag = gl_FragCoord.xy;
    float t = uTime * uSpeed;
    float jitterAmp = 0.1 * clamp(uNoiseAmount, 0.0, 1.0);
    vec3 dir = rayDir(frag, uResolution, uOffset, 1.0);
    float marchT = 0.0;
    vec3 col = vec3(0.0);
    float n = layeredNoise(frag);
    vec4 c = cos(t * 0.2 + vec4(0.0, 33.0, 11.0, 0.0));
    mat2 M2 = mat2(c.x, c.y, c.z, c.w);
    float amp = clamp(uDistort, 0.0, 50.0) * 0.15;

    mat3 rot3dMat = mat3(1.0);
    if(uAnimType == 1){
      vec3 ang = vec3(t * 0.31, t * 0.21, t * 0.17);
      rot3dMat = rotZ(ang.z) * rotY(ang.y) * rotX(ang.x);
    }
    mat3 hoverMat = mat3(1.0);
    if(uAnimType == 2){
      vec2 m = uMouse * 2.0 - 1.0;
      vec3 ang = vec3(m.y * 0.6, m.x * 0.6, 0.0);
      hoverMat = rotY(ang.y) * rotX(ang.x);
    }

    for (int i = 0; i < 30; ++i) {
        vec3 P = marchT * dir;
        P.z -= 2.0;
        float rad = length(P);
        vec3 Pl = P * (10.0 / max(rad, 1e-6));

        if(uAnimType == 0){
            Pl.xz *= M2;
        } else if(uAnimType == 1){
      Pl = rot3dMat * Pl;
        } else {
      Pl = hoverMat * Pl;
        }

        float stepLen = min(rad - 0.3, n * jitterAmp) + 0.1;

        float grow = smoothstep(0.35, 3.0, marchT);
        float a1 = amp * grow * bendAngle(Pl * 0.6, t);
        float a2 = 0.5 * amp * grow * bendAngle(Pl.zyx * 0.5 + 3.1, t * 0.9);
        vec3 Pb = Pl;
        Pb.xz = rot2(Pb.xz, a1);
        Pb.xy = rot2(Pb.xy, a2);

        float rayPattern = smoothstep(
            0.5, 0.7,
            sin(Pb.x + cos(Pb.y) * cos(Pb.z)) *
            sin(Pb.z + sin(Pb.y) * cos(Pb.x + t))
        );

        if (uRayCount > 0) {
            float ang = atan(Pb.y, Pb.x);
            float comb = 0.5 + 0.5 * cos(float(uRayCount) * ang);
            comb = pow(comb, 3.0);
            rayPattern *= smoothstep(0.15, 0.95, comb);
        }

        vec3 spectralDefault = 1.0 + vec3(
            cos(marchT * 3.0 + 0.0),
            cos(marchT * 3.0 + 1.0),
            cos(marchT * 3.0 + 2.0)
        );

        float saw = fract(marchT * 0.25);
        float tRay = saw * saw * (3.0 - 2.0 * saw);
        vec3 userGradient = 2.0 * sampleGradient(tRay);
        vec3 spectral = (uColorCount > 0) ? userGradient : spectralDefault;
        vec3 base = (0.05 / (0.4 + stepLen))
                  * smoothstep(5.0, 0.0, rad)
                  * spectral;

        col += base * rayPattern;
        marchT += stepLen;
    }

    col *= edgeFade(frag, uResolution, uOffset);
    col *= uIntensity;

    fragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`

const hexToRgb01 = (hex) => {
  let h = hex.trim()
  if (h.startsWith('#')) h = h.slice(1)
  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }
  const intVal = parseInt(h, 16)
  if (isNaN(intVal) || (h.length !== 6 && h.length !== 8)) return [1, 1, 1]
  return [
    ((intVal >> 16) & 255) / 255,
    ((intVal >> 8) & 255) / 255,
    (intVal & 255) / 255,
  ]
}

const toPx = (v) => {
  if (v == null) return 0
  if (typeof v === 'number') return v
  const num = parseFloat(String(v).trim().replace('px', ''))
  return isNaN(num) ? 0 : num
}

const animTypeMap = { rotate: 0, rotate3d: 1, hover: 2 }

let raf = 0, lastTime = 0, accumTime = 0
let resizeObserver = null, intersectionObserver = null

function buildGradient(renderer, colors) {
  const gl = renderer.gl
  const capped = (colors || []).slice(0, 64)
  const count = capped.length
  if (count === 0) return { count: 0, texture: null }

  const data = new Uint8Array(count * 4)
  for (let i = 0; i < count; i++) {
    const [r, g, b] = hexToRgb01(capped[i])
    data[i * 4] = Math.round(r * 255)
    data[i * 4 + 1] = Math.round(g * 255)
    data[i * 4 + 2] = Math.round(b * 255)
    data[i * 4 + 3] = 255
  }

  const tex = new Texture(gl, {
    image: data,
    width: count,
    height: 1,
    format: gl.RGBA,
    type: gl.UNSIGNED_BYTE,
    generateMipmaps: false,
    flipY: false,
  })
  tex.minFilter = gl.LINEAR
  tex.magFilter = gl.LINEAR
  tex.wrapS = gl.CLAMP_TO_EDGE
  tex.wrapT = gl.CLAMP_TO_EDGE
  tex.needsUpdate = true

  return { count, texture: tex }
}

function updateUniforms() {
  const program = programRef.value
  const renderer = rendererRef.value
  if (!program || !renderer) return

  program.uniforms.uIntensity.value = props.intensity ?? 1
  program.uniforms.uSpeed.value = props.speed ?? 1
  program.uniforms.uAnimType.value = animTypeMap[props.animationType] ?? 0
  program.uniforms.uDistort.value = typeof props.distort === 'number' ? props.distort : 0
  program.uniforms.uOffset.value = [toPx(props.offset?.x), toPx(props.offset?.y)]
  program.uniforms.uRayCount.value = Math.max(0, Math.floor(props.rayCount ?? 0))

  const colors = props.colors || []
  if (colors.length > 0) {
    const { count, texture } = buildGradient(renderer, colors)
    program.uniforms.uColorCount.value = count
    if (texture) {
      if (gradTexRef.value) {
        try { renderer.gl.deleteTexture(gradTexRef.value.texture) } catch (e) { /* ignore */ }
      }
      gradTexRef.value = texture
      program.uniforms.uGradient.value = texture
    }
  } else {
    program.uniforms.uColorCount.value = 0
  }
}

onMounted(() => {
  const container = containerRef.value
  if (!container) return

  const renderer = new Renderer({ dpr: Math.min(window.devicePixelRatio || 1, 2), alpha: false, antialias: false })
  rendererRef.value = renderer
  const gl = renderer.gl

  gl.canvas.style.position = 'absolute'
  gl.canvas.style.inset = '0'
  gl.canvas.style.width = '100%'
  gl.canvas.style.height = '100%'
  gl.canvas.style.mixBlendMode = props.mixBlendMode && props.mixBlendMode !== 'none' ? props.mixBlendMode : ''
  gl.canvas.style.pointerEvents = 'none'
  container.appendChild(gl.canvas)

  const white = new Uint8Array([255, 255, 255, 255])
  const gradientTex = new Texture(gl, {
    image: white,
    width: 1,
    height: 1,
    generateMipmaps: false,
    flipY: false,
  })
  gradientTex.minFilter = gl.LINEAR
  gradientTex.magFilter = gl.LINEAR
  gradientTex.wrapS = gl.CLAMP_TO_EDGE
  gradientTex.wrapT = gl.CLAMP_TO_EDGE
  gradTexRef.value = gradientTex

  const program = new Program(gl, {
    vertex,
    fragment,
    uniforms: {
      uResolution: { value: [1, 1] },
      uTime: { value: 0 },
      uIntensity: { value: props.intensity ?? 1 },
      uSpeed: { value: props.speed ?? 1 },
      uAnimType: { value: animTypeMap[props.animationType] ?? 0 },
      uMouse: { value: [0.5, 0.5] },
      uColorCount: { value: 0 },
      uDistort: { value: typeof props.distort === 'number' ? props.distort : 0 },
      uOffset: { value: [toPx(props.offset?.x), toPx(props.offset?.y)] },
      uGradient: { value: gradientTex },
      uNoiseAmount: { value: 0.8 },
      uRayCount: { value: Math.max(0, Math.floor(props.rayCount ?? 0)) },
    },
  })
  programRef.value = program

  const triangle = new Triangle(gl)
  const mesh = new Mesh(gl, { geometry: triangle, program })
  meshRef.value = mesh

  const resize = () => {
    const w = container.clientWidth || 1
    const h = container.clientHeight || 1
    renderer.setSize(w, h)
    program.uniforms.uResolution.value = [gl.drawingBufferWidth, gl.drawingBufferHeight]
  }

  if ('ResizeObserver' in window) {
    resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
  } else {
    window.addEventListener('resize', resize)
  }
  resize()

  // Use window-level pointer events + pointer-events:none on canvas
  // so background doesn't block UI interactions
  const onPointer = (e) => {
    const rect = container.getBoundingClientRect()
    const x = (e.clientX - rect.left) / Math.max(rect.width, 1)
    const y = (e.clientY - rect.top) / Math.max(rect.height, 1)
    mouseTarget.value = [Math.min(Math.max(x, 0), 1), Math.min(Math.max(y, 0), 1)]
  }
  window.addEventListener('pointermove', onPointer, { passive: true })

  if ('IntersectionObserver' in window) {
    intersectionObserver = new IntersectionObserver(
      (entries) => { if (entries[0]) isVisible.value = entries[0].isIntersecting },
      { threshold: 0.01 }
    )
    intersectionObserver.observe(container)
  }

  lastTime = performance.now()
  accumTime = 0

  const update = (now) => {
    const dt = Math.max(0, now - lastTime) * 0.001
    lastTime = now
    const visible = isVisible.value && !document.hidden
    if (!pausedRef.value) accumTime += dt
    if (!visible) {
      raf = requestAnimationFrame(update)
      return
    }
    const tau = 0.02 + Math.max(0, Math.min(1, hoverDampRef.value)) * 0.5
    const alpha = 1 - Math.exp(-dt / tau)
    const tgt = mouseTarget.value
    const sm = mouseSmooth.value
    sm[0] += (tgt[0] - sm[0]) * alpha
    sm[1] += (tgt[1] - sm[1]) * alpha
    program.uniforms.uMouse.value = [sm[0], sm[1]]
    program.uniforms.uTime.value = accumTime
    renderer.render({ scene: mesh })
    raf = requestAnimationFrame(update)
  }
  raf = requestAnimationFrame(update)

  // Apply initial colors
  if (props.colors && props.colors.length > 0) {
    updateUniforms()
  }

  onUnmounted(() => {
    cancelAnimationFrame(raf)
    window.removeEventListener('pointermove', onPointer)
    resizeObserver?.disconnect()
    if (!resizeObserver) window.removeEventListener('resize', resize)
    intersectionObserver?.disconnect()
    try { container.removeChild(gl.canvas) } catch (e) { /* ignore */ }
    meshRef.value = null
    programRef.value = null
    try {
      if (gradTexRef.value?.texture) gl.deleteTexture(gradTexRef.value.texture)
    } catch (e) { /* ignore */ }
    rendererRef.value = null
    gradTexRef.value = null
  })
})

watch(() => props.paused, (v) => { pausedRef.value = v })
watch(() => props.hoverDampness, (v) => { hoverDampRef.value = v })

watch(
  () => props.mixBlendMode,
  (mode) => {
    const canvas = rendererRef.value?.gl?.canvas
    if (canvas) {
      canvas.style.mixBlendMode = mode && mode !== 'none' ? mode : ''
    }
  }
)

watch(
  () => [props.intensity, props.speed, props.animationType, props.colors, props.distort, props.offset, props.rayCount],
  updateUniforms,
  { deep: true }
)
</script>

<style scoped>
.prismatic-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: -1;
  pointer-events: none;
}
</style>
