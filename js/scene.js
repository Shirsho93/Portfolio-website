import * as THREE from 'three'

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uScroll;
  uniform float uPulse;
  uniform float uVelocity;
  uniform vec2 uMouse;
  varying float vDisplacement;
  varying vec3 vNormal;

  // Classic 3D simplex noise (Ashima Arts / Stefan Gustavson, MIT)
  vec4 permute(vec4 x) { return mod(((x * 34.0) + 1.0) * x, 289.0); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float snoise(vec3 v) {
    const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
    const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
    vec3 i = floor(v + dot(v, C.yyy));
    vec3 x0 = v - i + dot(i, C.xxx);
    vec3 g = step(x0.yzx, x0.xyz);
    vec3 l = 1.0 - g;
    vec3 i1 = min(g.xyz, l.zxy);
    vec3 i2 = max(g.xyz, l.zxy);
    vec3 x1 = x0 - i1 + C.xxx;
    vec3 x2 = x0 - i2 + 2.0 * C.xxx;
    vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
    i = mod(i, 289.0);
    vec4 p = permute(permute(permute(
      i.z + vec4(0.0, i1.z, i2.z, 1.0)) +
      i.y + vec4(0.0, i1.y, i2.y, 1.0)) +
      i.x + vec4(0.0, i1.x, i2.x, 1.0));
    float n_ = 1.0 / 7.0;
    vec3 ns = n_ * D.wyz - D.xzx;
    vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
    vec4 x_ = floor(j * ns.z);
    vec4 y_ = floor(j - 7.0 * x_);
    vec4 x = x_ * ns.x + ns.yyyy;
    vec4 y = y_ * ns.x + ns.yyyy;
    vec4 h = 1.0 - abs(x) - abs(y);
    vec4 b0 = vec4(x.xy, y.xy);
    vec4 b1 = vec4(x.zw, y.zw);
    vec4 s0 = floor(b0) * 2.0 + 1.0;
    vec4 s1 = floor(b1) * 2.0 + 1.0;
    vec4 sh = -step(h, vec4(0.0));
    vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
    vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
    vec3 p0 = vec3(a0.xy, h.x);
    vec3 p1 = vec3(a0.zw, h.y);
    vec3 p2 = vec3(a1.xy, h.z);
    vec3 p3 = vec3(a1.zw, h.w);
    vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
    p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
    vec4 m = max(0.6 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
    m = m * m;
    return 42.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
  }

  void main() {
    // Turbulence grows down the page, with scroll speed, and with a click pulse
    float strength = 0.25 + uScroll * 0.35 + length(uMouse) * 0.1 + uVelocity + uPulse * 0.6;
    float freq = 1.2 + uPulse * 1.5;
    float d = snoise(position * freq + vec3(uTime * 0.25, uMouse * 0.5)) * strength;
    vDisplacement = d;
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position + normal * d, 1.0);
  }
`

const fragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  varying float vDisplacement;
  varying vec3 vNormal;

  void main() {
    // Fresnel rim + displacement-driven gradient gives a soft, glossy look without lights
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
    vec3 color = mix(uColorA, uColorB, smoothstep(-0.3, 0.4, vDisplacement));
    color += fresnel * 0.35;
    gl_FragColor = vec4(color, 1.0);
  }
`

const lerp = (a, b, t) => a + (b - a) * t
const easeOutBack = (t) => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2)

export class Scene {
  constructor(container) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    container.appendChild(this.renderer.domElement)

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100)
    this.camera.position.z = 6

    this.uniforms = {
      uTime: { value: 0 },
      uScroll: { value: 0 },
      uPulse: { value: 0 },
      uVelocity: { value: 0 },
      uMouse: { value: new THREE.Vector2() },
      uColorA: { value: new THREE.Color('#0b3b2c') },
      uColorB: { value: new THREE.Color('#c8f169') },
    }
    // Section palettes are targets; the live uniforms ease toward them each frame
    this.targetA = this.uniforms.uColorA.value.clone()
    this.targetB = this.uniforms.uColorB.value.clone()

    // The group tilts with the mouse; the mesh inside is free for scroll choreography
    this.group = new THREE.Group()
    this.mesh = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.4, 128),
      new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms: this.uniforms })
    )
    this.group.add(this.mesh)
    this.scene.add(this.group)

    this.mouse = new THREE.Vector2()
    this.intro = 0
    this.revealing = false
    window.addEventListener('pointermove', (e) => {
      this.mouse.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1)
    })
    window.addEventListener('resize', () => this.resize())
    this.resize()
  }

  resize() {
    this.renderer.setSize(innerWidth, innerHeight)
    this.camera.aspect = innerWidth / innerHeight
    this.camera.updateProjectionMatrix()
    // Shrink the blob on narrow screens so it never crowds the text
    this.baseScale = innerWidth < 768 ? 0.7 : 1
  }

  /** Pop the blob in (with overshoot) once the loader has finished. */
  reveal(immediate = false) {
    this.revealing = true
    if (immediate) this.intro = 1
  }

  /** Burst of extra turbulence that decays over about a second. */
  pulse() {
    this.uniforms.uPulse.value = 1
  }

  setPalette(colorA, colorB) {
    this.targetA.set(colorA)
    this.targetB.set(colorB)
  }

  update(progress, dt, scrollVelocity) {
    const u = this.uniforms
    u.uTime.value += dt
    u.uScroll.value = progress
    u.uMouse.value.lerp(this.mouse, 0.05)
    u.uPulse.value *= Math.pow(0.03, dt)
    u.uVelocity.value = lerp(u.uVelocity.value, Math.min(Math.abs(scrollVelocity) * 0.01, 0.4), 0.1)
    u.uColorA.value.lerp(this.targetA, 0.04)
    u.uColorB.value.lerp(this.targetB, 0.04)

    if (this.revealing) this.intro = Math.min(this.intro + dt / 1.6, 1)
    this.group.scale.setScalar(Math.max(this.baseScale * easeOutBack(this.intro), 0.0001))
    this.group.rotation.x = -u.uMouse.value.y * 0.3
    this.group.rotation.z = u.uMouse.value.x * 0.15

    applyScrollChoreography(this.mesh, progress)
    this.renderer.render(this.scene, this.camera)
  }
}

/**
 * Maps page scroll progress (0 at top → 1 at bottom) onto the blob's transform.
 * This is the "choreography" of the 3D element as the visitor moves through
 * hero → work → about → contact.
 *
 * @param {THREE.Mesh} mesh
 * @param {number} p  scroll progress in [0, 1]
 */
function applyScrollChoreography(mesh, p) {
  // TODO(you): shape how the blob travels through the page.
  // Simple default: drift right and spin slowly as you scroll.
  mesh.position.x = p * 1.5
  mesh.rotation.y = p * Math.PI
}
