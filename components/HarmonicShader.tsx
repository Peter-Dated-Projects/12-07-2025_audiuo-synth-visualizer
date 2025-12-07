"use client";

import * as THREE from "three";
import { extend, useFrame } from "@react-three/fiber";
import { shaderMaterial } from "@react-three/drei";
import { useMemo, useRef } from "react";

// Shader Material
const HarmonicMaterial = shaderMaterial(
  {
    uTime: 0,
    uColor: new THREE.Color(1.0, 0.1, 0.1), // Red color
    uRatios: new THREE.Vector4(4, 6, 10, 12),
    uRatio5: 15,
  },
  // Vertex Shader
  `
    uniform float uTime;
    uniform vec4 uRatios;
    uniform float uRatio5;
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
      
      float x = sin(r1 * t + time) * cos(r2 * t);
      float y = sin(r3 * t + time) * cos(r4 * t);
      float z = sin(r5 * t + time);

      vec3 pos = vec3(x, y, z);

      // Breathing effect
      float breathe = 1.0 + 0.1 * sin(uTime * 1.0);
      pos *= breathe * 3.5; // Scale up

      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;

      // Size attenuation
      gl_PointSize = (100.0 / -mvPosition.z);

      // Alpha based on depth or just constant
      vAlpha = 0.6 + 0.4 * sin(t * 5.0 + uTime * 2.0);
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

type HarmonicMaterialType = THREE.ShaderMaterial & {
  uTime: number;
  uColor: THREE.Color;
  uRatios: THREE.Vector4;
  uRatio5: number;
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

export function HarmonicVisualizer() {
  const materialRef = useRef<HarmonicMaterialType>(null);

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

  useFrame((state, delta) => {
    if (materialRef.current) {
      materialRef.current.uTime += delta;
    }
  });

  return (
    <points geometry={geometry}>
      <harmonicMaterial
        ref={materialRef}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uColor={frequencyToColor(200)}
        uRatios={new THREE.Vector4(4, 6, 10, 12)}
        uRatio5={15}
      />
    </points>
  );
}
