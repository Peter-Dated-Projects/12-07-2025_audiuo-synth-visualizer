import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import React, { useMemo, useRef, useEffect } from "react";

// --- Shader for a Single Lissajous Figure ---
const LISSAJOUS_VERTEX_SHADER = `
uniform float uTime;
uniform float uFreqX;
uniform float uFreqY;
uniform float uScale;
uniform vec3 uColor;

attribute float aIndex; // 0..1

varying vec3 vColor;

#define PI 3.14159265359

void main() {
    // Map index to parameter t
    // We want enough loops to close the shape if the ratio is complex.
    float t = aIndex * 2.0 * PI * 100.0; 
    
    // Lissajous Parametric Equations (2D)
    // x = A * sin(a*t + delta)
    // y = B * sin(b*t)
    
    // Base radius
    float radius = 8.0 * uScale; 
    
    // Add a slow rotation to the whole figure so it's not static
    float rot = uTime * 0.2;
    
    // Raw Lissajous coords
    float lx = sin(uFreqX * t + PI/2.0);
    float ly = sin(uFreqY * t);
    
    // Apply rotation
    float x = (lx * cos(rot) - ly * sin(rot)) * radius;
    float y = (lx * sin(rot) + ly * cos(rot)) * radius;
    float z = 0.0; // 2D only as requested
    
    vec3 pos = vec3(x, y, z);
    
    vColor = uColor;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const LISSAJOUS_FRAGMENT_SHADER = `
varying vec3 vColor;

void main() {
    gl_FragColor = vec4(vColor, 1.0);
}
`;

interface FrequencyBand {
  id: string;
  label: string;
  min: number;
  max: number;
  color: string;
  amplitude: number;
}

interface LissajousVisualizerProps {
  analyser: AnalyserNode;
  bands: FrequencyBand[];
  normalizedData: Float32Array;
}

// --- Sub-component for a single band's figure ---
const LissajousFigure = ({
  band,
  normalizedData,
}: {
  band: FrequencyBand;
  normalizedData: Float32Array;
}) => {
  const materialRef = useRef<THREE.ShaderMaterial>(null);

  // Geometry: A line strip with many points
  const geometry = useMemo(() => {
    const count = 5000; // Resolution
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const indices = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      indices[i] = i / (count - 1);
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aIndex", new THREE.BufferAttribute(indices, 1));
    return geo;
  }, []);

  // Uniforms
  const uniforms = useMemo(
    () => ({
      uTime: { value: 0 },
      uFreqX: { value: 3.0 }, // Default to 3
      uFreqY: { value: 4.0 }, // Default to 4
      uScale: { value: 0.0 },
      uColor: { value: new THREE.Color(band.color) },
    }),
    [band.color]
  );

  useFrame((state) => {
    if (!materialRef.current) return;

    // 2. Analyze Band
    const start = Math.max(0, Math.min(band.min, normalizedData.length - 1));
    const end = Math.max(start, Math.min(band.max, normalizedData.length));

    if (end <= start) return;

    let max1 = -1;
    let max1Index = -1;
    let max2 = -1;
    let max2Index = -1;
    let sum = 0;

    for (let i = start; i < end; i++) {
      const val = normalizedData[i];
      sum += val;
      if (val > max1) {
        max2 = max1;
        max2Index = max1Index;
        max1 = val;
        max1Index = i;
      } else if (val > max2) {
        max2 = val;
        max2Index = i;
      }
    }

    const avg = sum / (end - start);
    const targetScale = avg * band.amplitude;

    // Use indices as frequencies.
    // We map the raw index to a smaller range (1-12) to get nice integer ratios
    // that look like classic Lissajous figures.
    // Using raw indices (e.g. 100) creates too much noise.
    // Quantize every 20 bins to avoid 1:1 ratios and rapid changes
    const f1 = max1Index > -1 ? Math.floor(max1Index / 20) + 1 : 3;
    const f2 = max2Index > -1 ? Math.floor(max2Index / 20) + 1 : 4;

    const targetFreqX = f1;
    const targetFreqY = f2;

    // Update Uniforms with Lerp
    const u = materialRef.current.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uFreqX.value = THREE.MathUtils.lerp(u.uFreqX.value, targetFreqX, 0.05);
    u.uFreqY.value = THREE.MathUtils.lerp(u.uFreqY.value, targetFreqY, 0.05);
    u.uScale.value = THREE.MathUtils.lerp(u.uScale.value, targetScale, 0.1);
    u.uColor.value.set(band.color);
  });

  return (
    <line geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={LISSAJOUS_VERTEX_SHADER}
        fragmentShader={LISSAJOUS_FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        linewidth={2}
      />
    </line>
  );
};

export default function LissajousVisualizer({
  analyser,
  bands,
  normalizedData,
}: LissajousVisualizerProps) {
  return (
    <group>
      {bands.map((band) => (
        <LissajousFigure key={band.id} band={band} normalizedData={normalizedData} />
      ))}
    </group>
  );
}
