import { useEffect, useRef } from 'react'
import * as THREE from 'three'

interface Props {
  phase: string
  analyser: AnalyserNode | null
}

// Ashima/Gustavson 3D simplex noise (public domain), trimmed.
const NOISE_GLSL = /* glsl */ `
vec3 mod289(vec3 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x - floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C = vec2(1.0/6.0, 1.0/3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(i.z + vec4(0.0, i1.z, i2.z, 1.0))
        + i.y + vec4(0.0, i1.y, i2.y, 1.0)) + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
}
`

const VERTEX = /* glsl */ `
uniform float uTime;
uniform float uAmplitude;
varying float vDisplacement;
varying vec3 vNormal;
varying vec3 vViewDir;
${NOISE_GLSL}
void main() {
  float n = snoise(normal * 1.6 + vec3(uTime * 0.35));
  vDisplacement = n;
  vec3 displaced = position + normal * n * (0.06 + uAmplitude * 0.45);
  vec4 mv = modelViewMatrix * vec4(displaced, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vViewDir = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`

const FRAGMENT = /* glsl */ `
uniform float uBurst;
varying float vDisplacement;
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  vec3 brownRed = vec3(0.635, 0.173, 0.161); // #a22c29
  vec3 ashGrey = vec3(0.725, 0.729, 0.639);  // #b9baa3
  vec3 bone = vec3(0.839, 0.835, 0.788);     // #d6d5c9
  float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), 2.0);
  vec3 color = mix(brownRed, ashGrey, vDisplacement * 0.5 + 0.5);
  color += bone * fresnel * 0.55 + uBurst * 0.5;
  gl_FragColor = vec4(color, 0.92);
}
`

export default function Orb({ phase, analyser }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const phaseRef = useRef(phase)
  const burstRef = useRef(0)

  analyserRef.current = analyser
  if (phase === 'match' && phaseRef.current !== 'match') burstRef.current = 1
  phaseRef.current = phase

  useEffect(() => {
    const mount = mountRef.current!
    const size = 240
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(size, size)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 10)
    camera.position.z = 3.2

    const uniforms = {
      uTime: { value: 0 },
      uAmplitude: { value: 0 },
      uBurst: { value: 0 },
    }
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      uniforms,
      transparent: true,
    })
    const geometry = new THREE.IcosahedronGeometry(1.05, 32)
    const mesh = new THREE.Mesh(geometry, material)
    scene.add(mesh)

    const freqData = new Uint8Array(128)
    let smoothed = 0
    let raf = 0
    const clock = new THREE.Clock()

    const animate = () => {
      raf = requestAnimationFrame(animate)
      uniforms.uTime.value = clock.getElapsedTime()

      let level = 0
      const a = analyserRef.current
      if (a && phaseRef.current === 'listening') {
        a.getByteFrequencyData(freqData)
        let sum = 0
        for (let i = 0; i < freqData.length; i++) sum += freqData[i]
        level = sum / freqData.length / 255
      }
      smoothed += (level - smoothed) * 0.12
      uniforms.uAmplitude.value = smoothed

      burstRef.current = Math.max(0, burstRef.current - 0.02)
      uniforms.uBurst.value = burstRef.current

      mesh.rotation.y += 0.0035
      mesh.rotation.x += 0.0012
      renderer.render(scene, camera)
    }
    animate()

    return () => {
      cancelAnimationFrame(raf)
      geometry.dispose()
      material.dispose()
      renderer.dispose()
      mount.removeChild(renderer.domElement)
    }
  }, [])

  return <div ref={mountRef} style={{ width: 240, height: 240 }} />
}
