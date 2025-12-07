"use client";

import * as THREE from "three";
import { extend } from "@react-three/fiber";
import { shaderMaterial } from "@react-three/drei";
import { useMemo, forwardRef } from "react";

// Shader Material
const HarmonicMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color(1.0, 0.1, 0.1), // Red color
    uRatios: new THREE.Vector4(4, 6, 10, 12),
    uRatio5: 15,
    uBass: 0,
    uMid: 0,
    uTreble: 0,
  },
  // Vertex Shader
  `
    uniform float uTime;
    uniform vec4 uRatios;
    uniform float uRatio5;
    uniform float uBass;
    uniform float uMid;
    uniform float uTreble;
    
    attribute float aIndex;
    varying float vAlpha;

    #define PI 3.14159265359

    void main() {
      // Map normalized index to a larger range for loops
      float t = aIndex * 100.0 * PI; 
      
      // Parametric formula
      // Using the ratios to drive frequencies
      float r1 = uRatios.x;
      float r2 = uRatios.y;
      float r3 = uRatios.z;
      float r4 = uRatios.w;
      float r5 = uRatio5;

      // Complex harmonic motion
      // We use t as the parameter. 
      // x = sin(r1 * t) * cos(r2 * t)
      // y = sin(r3 * t) * cos(r4 * t)
      // z = sin(r5 * t)
      
      // Adding uTime to animate the flow along the curve or the shape itself
      float time = uTime * 0.2;
      
      // Audio Reactivity: Modulate frequencies with Bass
      float bassMod = 1.0 + uBass * 0.5;
      
      float x = sin(r1 * t * bassMod + time) * cos(r2 * t);
      float y = sin(r3 * t * bassMod + time) * cos(r4 * t);
      float z = sin(r5 * t * bassMod + time);

      vec3 pos = vec3(x, y, z);

      // Breathing effect + Audio Pulse
      // Combine slow breathing with rapid bass pulse
      float breathe = 1.0 + 0.1 * sin(uTime * 1.0);
      float audioPulse = 1.0 + uBass * 0.8 + uMid * 0.4;
      
      pos *= breathe * 3.5 * audioPulse; // Scale up

      // Add some noise/distortion based on Treble
      float noise = sin(t * 50.0 + uTime) * uTreble * 0.2;
      pos += normalize(pos) * noise;

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;

      // Size attenuation
      // Modulate size with Mid frequencies
      float sizeMod = 1.0 + uMid * 2.0;
      gl_PointSize = (25.0 * sizeMod / -mvPosition.z);

      // Alpha based on depth or just constant
      vAlpha = 0.6 + 0.4 * sin(t * 5.0 + uTime * 2.0);
      
      // Boost alpha with audio
      vAlpha = min(1.0, vAlpha + uTreble * 0.5);
    }
  `,
  // Fragment Shader
  `
    uniform vec3 uColor;
    varying float vAlpha;

    void main() {
      // Soft circular glow
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = length(coord);
      
      if (dist > 0.5) discard;

      float strength = 1.0 - (dist * 2.0);
      strength = pow(strength, 2.0);

      gl_FragColor = vec4(uColor, strength * vAlpha);
    }
  `
);

extend({ HarmonicMaterial });

export type HarmonicMaterialType = THREE.ShaderMaterial & {
  uTime: number;
  uColor: THREE.Color;
  uRatios: THREE.Vector4;
  uRatio5: number;
  uBass: number;
  uMid: number;
  uTreble: number;
};

declare module "@react-three/fiber" {
  interface ThreeElements {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    harmonicMaterial: any;
  }
}

function frequencyToColor(frequency: number): THREE.Color {
  const hue = (frequency % 360) / 360; // Normalize to [0,1]
  return new THREE.Color().setHSL(hue, 1.0, 0.5);
}

export const HarmonicVisualizer = forwardRef<HarmonicMaterialType>((_, ref) => {
  // Generate points
  const count = 20000; // Number of particles
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const indices = new Float32Array(count);
    const positions = new Float32Array(count * 3); // Dummy positions, calculated in shader

    for (let i = 0; i < count; i++) {
      indices[i] = i / count;
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aIndex", new THREE.BufferAttribute(indices, 1));
    return geo;
  }, []);

  return (
    <points geometry={geometry}>
      <harmonicMaterial
        ref={ref}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uColor={frequencyToColor(200)}
        uRatios={new THREE.Vector4(4, 6, 10, 12)}
        uRatio5={15}
      />
    </points>
  );
});

HarmonicVisualizer.displayName = "HarmonicVisualizer";
