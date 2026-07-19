<template>
  <div class="aurora-container" ref="containerRef" />
</template>

<script setup>
import { Color, Mesh, Program, Renderer, Triangle } from 'ogl'
import { onBeforeUnmount, onMounted, ref } from 'vue'

// Aurora 极光背景（Vue Bits / ogl）。原始为透明 alpha 混合叠加层，
// 这里作为深色模式全屏背景：容器给深色底色，极光带在底色上合成。
const props = defineProps({
  colorStops: { type: Array, default: () => ['#171D22', '#7cff67', '#171D22'] },
  amplitude: { type: Number, default: 1.0 },
  blend: { type: Number, default: 0.5 },
  speed: { type: Number, default: 1.0 },
  time: { type: Number, default: undefined },
})

const VERT = `#version 300 es
in vec2 position;
void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`

const FRAG = `#version 300 es
precision highp float;

uniform float uTime;
uniform float uAmplitude;
uniform vec3 uColorStops[3];
uniform vec2 uResolution;
uniform float uBlend;

out vec4 fragColor;

vec3 permute(vec3 x) {
  return mod(((x * 34.0) + 1.0) * x, 289.0);
}

float snoise(vec2 v){
  const vec4 C = vec4(
      0.211324865405187, 0.366025403784439,
      -0.577350269189626, 0.024390243902439
  );
  vec2 i  = floor(v + dot(v, C.yy));
  vec2 x0 = v - i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz;
  x12.xy -= i1;
  i = mod(i, 289.0);

  vec3 p = permute(
      permute(i.y + vec3(0.0, i1.y, 1.0))
    + i.x + vec3(0.0, i1.x, 1.0)
  );

  vec3 m = max(
      0.5 - vec3(
          dot(x0, x0),
          dot(x12.xy, x12.xy),
          dot(x12.zw, x12.zw)
      ),
      0.0
  );
  m = m * m;
  m = m * m;

  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);

  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

struct ColorStop {
  vec3 color;
  float position;
};

#define COLOR_RAMP(colors, factor, finalColor) {              \\
  int index = 0;                                            \\
  for (int i = 0; i < 2; i++) {                               \\
     ColorStop currentColor = colors[i];                    \\
     bool isInBetween = currentColor.position <= factor;    \\
     index = int(mix(float(index), float(i), float(isInBetween))); \\
  }                                                         \\
  ColorStop currentColor = colors[index];                   \\
  ColorStop nextColor = colors[index + 1];                  \\
  float range = nextColor.position - currentColor.position; \\
  float lerpFactor = (factor - currentColor.position) / range; \\
  finalColor = mix(currentColor.color, nextColor.color, lerpFactor); \\
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;

  ColorStop colors[3];
  colors[0] = ColorStop(uColorStops[0], 0.0);
  colors[1] = ColorStop(uColorStops[1], 0.5);
  colors[2] = ColorStop(uColorStops[2], 1.0);

  vec3 rampColor;
  COLOR_RAMP(colors, uv.x, rampColor);

  float height = snoise(vec2(uv.x * 2.0 + uTime * 0.1, uTime * 0.25)) * 0.5 * uAmplitude;
  height = exp(height);
  height = (uv.y * 2.0 - height + 0.2);
  float intensity = 0.6 * height;

  float midPoint = 0.20;
  float auroraAlpha = smoothstep(midPoint - uBlend * 0.5, midPoint + uBlend * 0.5, intensity);

  vec3 auroraColor = intensity * rampColor;

  fragColor = vec4(auroraColor * auroraAlpha, auroraAlpha);
}
`

const containerRef = ref(null)
let renderer = null
let program = null
let animateId = 0
let cleanup = null

const buildColorStops = () =>
  (props.colorStops ?? ['#171D22', '#7cff67', '#171D22']).map((hex) => {
    const c = new Color(hex)
    return [c.r, c.g, c.b]
  })

const setup = () => {
  const ctn = containerRef.value
  if (!ctn) return

  renderer = new Renderer({
    alpha: true,
    premultipliedAlpha: true,
    antialias: true,
    dpr: Math.min(window.devicePixelRatio || 1, 2),
  })
  const gl = renderer.gl
  gl.clearColor(0, 0, 0, 0)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
  gl.canvas.style.backgroundColor = 'transparent'

  // 全屏背景定位（与 PrismaticBurst / FaultyTerminal 一致）
  gl.canvas.style.position = 'absolute'
  gl.canvas.style.inset = '0'
  gl.canvas.style.width = '100%'
  gl.canvas.style.height = '100%'
  gl.canvas.style.pointerEvents = 'none'

  const resize = () => {
    if (!ctn || !renderer) return
    const w = ctn.clientWidth || ctn.offsetWidth || 1
    const h = ctn.clientHeight || ctn.offsetHeight || 1
    renderer.setSize(w, h)
    // uResolution 用绘制缓冲尺寸，保证 gl_FragCoord/uResolution 在 retina 下 uv 仍为 0~1
    if (program) program.uniforms.uResolution.value = [gl.canvas.width, gl.canvas.height]
  }
  const resizeObserver = new ResizeObserver(() => resize())
  resizeObserver.observe(ctn)
  resize()

  const geometry = new Triangle(gl)
  if (geometry.attributes.uv) delete geometry.attributes.uv

  program = new Program(gl, {
    vertex: VERT,
    fragment: FRAG,
    uniforms: {
      uTime: { value: 0 },
      uAmplitude: { value: props.amplitude ?? 1.0 },
      uColorStops: { value: buildColorStops() },
      uResolution: { value: [gl.canvas.width || 1, gl.canvas.height || 1] },
      uBlend: { value: props.blend ?? 0.5 },
    },
  })

  const mesh = new Mesh(gl, { geometry, program })

  const update = (t) => {
    animateId = requestAnimationFrame(update)
    if (!program || !renderer) return
    const time = props.time ?? t * 0.01
    const speed = props.speed ?? 1.0
    program.uniforms.uTime.value = time * speed * 0.1
    renderer.render({ scene: mesh })
  }
  animateId = requestAnimationFrame(update)

  ctn.appendChild(gl.canvas)

  cleanup = () => {
    cancelAnimationFrame(animateId)
    resizeObserver.disconnect()
    if (gl.canvas.parentElement === ctn) ctn.removeChild(gl.canvas)
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    renderer = null
    program = null
  }
}

onMounted(() => {
  if (containerRef.value) setup()
})

onBeforeUnmount(() => {
  if (cleanup) {
    cleanup()
    cleanup = null
  }
})
</script>

<style scoped>
.aurora-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  overflow: hidden;
  z-index: -1;
  pointer-events: none;
  /* 极光为透明 alpha 叠加层，给深色底让透明区域在深色模式下有暗色背景 */
  background-color: #0b0b0b;
}
</style>
