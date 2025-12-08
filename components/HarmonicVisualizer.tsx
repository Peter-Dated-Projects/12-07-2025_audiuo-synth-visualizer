"use client";

import * as THREE from "three";
import { extend, useFrame } from "@react-three/fiber";
import { shaderMaterial } from "@react-three/drei";
import { useMemo, useRef } from "react";

// --- 1. Noise Functions (Simplex 3D) ---
// We include this chunk in the shader to generate organic movement
const NOISE_GLSL = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);

  // First corner
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;

  // Other corners
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );

  //   x0 = x0 - 0.0 + 0.0 * C.xxx;
  //   x1 = x0 - i1  + 1.0 * C.xxx;
  //   x2 = x0 - i2  + 2.0 * C.xxx;
  //   x3 = x0 - 1.0 + 3.0 * C.xxx;
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy; // 2.0*C.x = 1/3 = C.y
  vec3 x3 = x0 - D.yyy;      // -1.0+3.0*C.x = -0.5 = -D.y

  // Permutations
  i = mod289(i);
  vec4 p = permute( permute( permute(
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 ))
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

  // Gradients: 7x7 points over a square, mapped onto an octahedron.
  // The ring size 17*17 = 289 is close to a multiple of 49 (49*6 = 294)
  float n_ = 0.142857142857; // 1.0/7.0
  vec3  ns = n_ * D.wyz - D.xzx;

  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  //  mod(p,7*7)

  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    // mod(j,N)

  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);

  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );

  //vec4 s0 = vec4(lessThan(b0,0.0))*2.0 - 1.0;
  //vec4 s1 = vec4(lessThan(b1,0.0))*2.0 - 1.0;
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));

  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);

  //Normalise gradients
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;

  // Mix final noise value
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1),
                                dot(p2,x2), dot(p3,x3) ) );
}
`;

// --- 2. The Resonating Sphere Shader ---
const ResonatingOrbMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color(0.0, 1.0, 1.0),
    uAudioStrength: 0.0, // How much the sphere deforms
    uNoiseScale: 1.0, // Frequency of the noise (texture detail)
    uSpeed: 1.0, // Animation speed
    uOpacity: 1.0,
    uFresnelPower: 2.0, // Rim lighting intensity
  },
  // Vertex Shader
  `
    uniform float uTime;
    uniform float uAudioStrength;
    uniform float uNoiseScale;
    uniform float uSpeed;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vDisplacement;
    varying vec2 vUv;

    ${NOISE_GLSL}

    void main() {
      vUv = uv;
      vNormal = normalize(normalMatrix * normal);
      vPosition = position;

      // 1. Calculate Noise Displacement
      // We move the noise field through time
      vec3 noisePos = position * uNoiseScale + uTime * uSpeed;
      
      // Get noise value (-1 to 1)
      float n = snoise(noisePos);
      
      // 2. Apply Displacement along Normal
      // Base displacement + Audio reactive burst
      float displacement = n * uAudioStrength;
      
      vDisplacement = n; // Pass to fragment for coloring

      vec3 newPos = position + normal * displacement;

      gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
      
      // Scale point size for point rendering mode
      gl_PointSize = 4.0 + (uAudioStrength * 5.0);
    }
  `,
  // Fragment Shader
  `
    uniform vec3 uColor;
    uniform float uOpacity;
    uniform float uFresnelPower;

    varying vec3 vNormal;
    varying vec3 vPosition;
    varying float vDisplacement;

    void main() {
      // 1. Fresnel Effect (Rim Lighting)
      // Calculate angle between view direction and surface normal
      vec3 viewDir = normalize(-vPosition); // View is at 0,0,0 in view space
      float fresnel = dot(viewDir, vNormal);
      fresnel = clamp(1.0 - fresnel, 0.0, 1.0);
      fresnel = pow(fresnel, uFresnelPower);

      // 2. Color Mixing
      // Mix base color with white based on displacement (peaks are brighter)
      vec3 finalColor = mix(uColor, vec3(1.0), smoothstep(0.2, 0.8, vDisplacement));
      
      // Add Fresnel glow
      finalColor += vec3(fresnel * 0.8);

      // 3. Alpha
      // Edges are more opaque (Fresnel), center is more transparent
      float alpha = (fresnel + 0.2) * uOpacity;

      gl_FragColor = vec4(finalColor, alpha);
    }
  `
);

extend({ ResonatingOrbMaterial });

// --- Types ---
type ResonatingOrbMaterialType = THREE.ShaderMaterial & {
  uTime: number;
  uColor: THREE.Color;
  uAudioStrength: number;
  uNoiseScale: number;
  uSpeed: number;
  uOpacity: number;
  uFresnelPower: number;
};

interface FrequencyBand {
  id: string;
  label: string;
  min: number;
  max: number;
  color: string;
  amplitude: number;
}

interface HarmonicVisualizerProps {
  mode: "points" | "lines";
  analyser?: AnalyserNode | null;
  bands?: FrequencyBand[];
  audioTexture: THREE.DataTexture;
  normalizedData: Float32Array;
}

// --- Helper to calculate band energy ---
const getBandEnergy = (data: Float32Array, band: FrequencyBand) => {
  const start = Math.floor(band.min);
  const end = Math.floor(band.max);
  if (end <= start) return 0;

  let sum = 0;
  for (let i = start; i < end; i++) {
    if (i < data.length) sum += data[i];
  }
  return (sum / (end - start)) * band.amplitude;
};

// --- The Main Component ---
export const HarmonicVisualizer = ({ mode, bands, normalizedData }: HarmonicVisualizerProps) => {
  if (!bands) return null;

  // Refs for the 3 layers
  const bassRef = useRef<ResonatingOrbMaterialType>(null);
  const midRef = useRef<ResonatingOrbMaterialType>(null);
  const highRef = useRef<ResonatingOrbMaterialType>(null);

  const groupRef = useRef<THREE.Group>(null);

  // Geometries
  // Bass: Solid Core
  const bassGeo = useMemo(() => new THREE.IcosahedronGeometry(4, 4), []);
  // Mids: Wireframe Shell
  const midGeo = useMemo(() => new THREE.IcosahedronGeometry(6, 3), []);
  // Highs: Particle Cloud
  const highGeo = useMemo(() => new THREE.IcosahedronGeometry(8, 2), []);

  useFrame((state) => {
    const time = state.clock.elapsedTime;

    // Calculate total energy for global effects
    let totalEnergy = 0;
    if (bands[0]) totalEnergy += getBandEnergy(normalizedData, bands[0]);
    if (bands[1]) totalEnergy += getBandEnergy(normalizedData, bands[1]);
    if (bands[2]) totalEnergy += getBandEnergy(normalizedData, bands[2]);

    // Rotate the whole group - faster when loud
    if (groupRef.current) {
      groupRef.current.rotation.y += 0.002 + totalEnergy * 0.02;
      groupRef.current.rotation.z += 0.001 + totalEnergy * 0.01;
    }

    // 1. Update Bass (Core)
    if (bassRef.current && bands[0]) {
      const energy = getBandEnergy(normalizedData, bands[0]); // Bass Band
      bassRef.current.uTime = time;
      // Increased multiplier from 2.0 to 4.0 for more impact
      bassRef.current.uAudioStrength = THREE.MathUtils.lerp(
        bassRef.current.uAudioStrength,
        energy * 4.0,
        0.15
      );
      bassRef.current.uColor.set(bands[0].color);
      bassRef.current.uNoiseScale = 0.8; // Slightly more detail
      bassRef.current.uSpeed = 0.5 + energy * 2.0; // Speed up with bass
    }

    // 2. Update Mids (Shell)
    if (midRef.current && bands[1]) {
      const energy = getBandEnergy(normalizedData, bands[1]); // Mid Band
      midRef.current.uTime = time;
      // Increased multiplier from 1.5 to 3.0
      midRef.current.uAudioStrength = THREE.MathUtils.lerp(
        midRef.current.uAudioStrength,
        energy * 3.0,
        0.15
      );
      midRef.current.uColor.set(bands[1].color);
      midRef.current.uNoiseScale = 2.0;
      midRef.current.uSpeed = 1.0 + energy * 3.0; // Spin faster with mids
    }

    // 3. Update Highs (Particles)
    if (highRef.current && bands[2]) {
      const energy = getBandEnergy(normalizedData, bands[2]); // High Band
      highRef.current.uTime = time;
      // Increased multiplier from 3.0 to 5.0
      highRef.current.uAudioStrength = THREE.MathUtils.lerp(
        highRef.current.uAudioStrength,
        energy * 5.0,
        0.2
      );
      highRef.current.uColor.set(bands[2].color);
      highRef.current.uNoiseScale = 4.0;
      highRef.current.uSpeed = 2.0 + energy * 4.0; // Chaotic speed with highs
    }
  });

  return (
    <group ref={groupRef}>
      {/* Layer 1: Bass Core (Solid/Transparent) */}
      <mesh geometry={bassGeo}>
        {/* @ts-ignore */}
        <resonatingOrbMaterial
          ref={bassRef}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          uOpacity={0.6}
          uFresnelPower={2.0}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Layer 2: Mid Shell (Wireframe) */}
      <mesh geometry={midGeo}>
        {/* @ts-ignore */}
        <resonatingOrbMaterial
          ref={midRef}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          uOpacity={0.4}
          uFresnelPower={1.5}
          wireframe={true}
        />
      </mesh>

      {/* Layer 3: Highs Crust (Points) */}
      <points geometry={highGeo}>
        {/* @ts-ignore */}
        <resonatingOrbMaterial
          ref={highRef}
          transparent
          blending={THREE.AdditiveBlending}
          depthWrite={false}
          uOpacity={0.8}
          uFresnelPower={0.5}
        />
      </points>
    </group>
  );
};

HarmonicVisualizer.displayName = "HarmonicVisualizer";
