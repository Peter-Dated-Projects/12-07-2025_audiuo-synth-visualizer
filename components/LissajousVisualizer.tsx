import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import React, { useMemo } from "react";
import { calculateBandPowerFrequencies } from "../utils/FrequencyAnalysis";

// --- Shader for a Single Lissajous Figure ---
const LISSAJOUS_VERTEX_SHADER = `
uniform float uTime;
uniform float uFreqX;
uniform float uFreqY;
uniform float uScale;
uniform vec3 uColor;
uniform float uZOffset;

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
    
    // Base radius - reduced for less visual clutter
    float radius = 4.5 * uScale; 
    
    // Add a slow rotation to the whole figure so it's not static
    float rot = uTime * 0.15;
    
    // Raw Lissajous coords
    float lx = sin(uFreqX * t + PI/2.0);
    float ly = sin(uFreqY * t);
    
    // Apply rotation
    float x = (lx * cos(rot) - ly * sin(rot)) * radius;
    float y = (lx * sin(rot) + ly * cos(rot)) * radius;
    float z = 0.0; // Base Z position
    
    vec3 pos = vec3(x, y, z + uZOffset);
    
    vColor = uColor;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const LISSAJOUS_FRAGMENT_SHADER = `
uniform float uScale;
varying vec3 vColor;

void main() {
    // Dynamic alpha based on scale for better visual clarity
    float alpha = clamp(uScale * 0.6 + 0.3, 0.3, 0.9);
    gl_FragColor = vec4(vColor, alpha);
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
  bands: FrequencyBand[];
  normalizedData: Float32Array;
}

// --- Sub-component for a single band's figure ---
const LissajousFigure = ({
  band,
  normalizedData,
  bandIndex,
}: {
  band: FrequencyBand;
  normalizedData: Float32Array;
  bandIndex: number;
}) => {
  // Geometry: A line strip with many points
  const geometry = useMemo(() => {
    const count = 2000; // Resolution - reduced for cleaner visuals
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

  // Uniforms - create mutable object outside useMemo
  const uniforms = {
    uTime: { value: 0 },
    uFreqX: { value: 3.0 }, // Default to 3
    uFreqY: { value: 4.0 }, // Default to 4
    uScale: { value: 0.0 },
    uColor: { value: new THREE.Color(band.color) },
    uZOffset: { value: bandIndex * 1.5 - 1.5 }, // Spread bands in Z: -1.5, 0, 1.5
  };

  // Create line mesh with material
  const lineMesh = useMemo(() => {
    const material = new THREE.ShaderMaterial({
      vertexShader: LISSAJOUS_VERTEX_SHADER,
      fragmentShader: LISSAJOUS_FRAGMENT_SHADER,
      uniforms: uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.NormalBlending,
    });
    return new THREE.Line(geometry, material);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geometry]);

  useFrame((state) => {
    const material = lineMesh.material as THREE.ShaderMaterial;
    if (!material) return;

    // 2. Analyze Band
    const start = Math.max(0, Math.min(band.min, normalizedData.length - 1));
    const end = Math.max(start, Math.min(band.max, normalizedData.length));

    if (end <= start) return;

    // Extract band-specific frequency data
    const bandData = normalizedData.slice(start, end);

    // Use Band Power method to calculate frequencies dynamically
    // Assuming 44100 Hz sample rate and 1024 FFT size (adjust if different)
    const sampleRate = 44100; // You could pass this as a prop if needed
    const fftSize = 1024;

    const result = calculateBandPowerFrequencies(
      bandData,
      sampleRate,
      fftSize,
      3.0, // Base frequency
      5.0 // Multiplier
    );

    // Calculate scale based on the average amplitude of the two frequencies
    // that are actually used to generate the Lissajous figure
    // The complexity value from the result represents the overall amplitude (0-1)
    // We use it directly as it's already the average of all contributing frequencies
    const targetScale = result.complexity * band.amplitude;

    // Use calculated frequencies from Band Power method
    const targetFreqX = result.freqA;
    const targetFreqY = result.freqB;

    // Update Uniforms with Lerp
    const u = material.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uFreqX.value = THREE.MathUtils.lerp(u.uFreqX.value, targetFreqX, 0.05);
    u.uFreqY.value = THREE.MathUtils.lerp(u.uFreqY.value, targetFreqY, 0.05);
    u.uScale.value = THREE.MathUtils.lerp(u.uScale.value, targetScale, 0.1);
    u.uColor.value.set(band.color);
  });

  return <primitive object={lineMesh} />;
};

export default function LissajousVisualizer({ bands, normalizedData }: LissajousVisualizerProps) {
  return (
    <group>
      {bands.map((band, index) => (
        <LissajousFigure
          key={band.id}
          band={band}
          normalizedData={normalizedData}
          bandIndex={index}
        />
      ))}
    </group>
  );
}
