"use client";

import * as THREE from "three";
import { extend, useFrame } from "@react-three/fiber";
import { shaderMaterial } from "@react-three/drei";
import { useMemo, forwardRef, useRef } from "react";

// Shader Material
const HarmonicMaterial = shaderMaterial(
  {
    uTime: 0,
    uBassFreq: 1.0,
    uMidFreq: 1.0,
    uAudioTexture: new THREE.DataTexture(new Uint8Array(1024), 1024, 1, THREE.RedFormat),
    uIsLine: 0, // 0 for points, 1 for lines
  },
  // Vertex Shader
  `
    uniform float uTime;
    uniform float uBassFreq;
    uniform float uMidFreq;
    uniform sampler2D uAudioTexture;
    
    attribute float aIndex;
    varying vec3 vColor;
    varying float vAlpha;

    #define PI 3.14159265359

    void main() {
      // 1. Normalize index to a "time" variable t (0.0 to 1.0 along the line)
      // We multiply by 2*PI * loops to wrap it around multiple times
      float t = (aIndex / 20000.0) * 6.28318 * 10.0;

      // 2. Sample Audio Data
      // We map the index to the treble range in UV space (approx 0.1 to 0.25).
      float minUV = 81.0 / 1024.0;
      float maxUV = 255.0 / 1024.0;
      float freqUV = minUV + (aIndex / 20000.0) * (maxUV - minUV);
      
      float audioValue = texture2D(uAudioTexture, vec2(freqUV, 0.0)).r;
      
      // 3. Lissajous Parametric Equations
      // We use audioValue to modulate the AMPLITUDE (Radius)
      float radius = 5.0 + (audioValue * 3.0); 
      
      vec3 pos;
      pos.x = radius * sin(uBassFreq * t);
      pos.y = radius * sin(uMidFreq * t);
      pos.z = radius * cos(uBassFreq * t); // Using cos(x) vs sin(z) creates the cylinder projection
      
      // Optional: Twist the whole thing based on time
      // pos.x += sin(uTime) * 2.0;

      // 4. Set final position
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;

      // Pass color to fragment shader
      vColor = vec3(0.5 + 0.5 * sin(t), 0.2, 0.8 + 0.5 * cos(t));

      // Visual Polish:
      // Points in the center are brighter
      float centerDist = length(pos);
      vAlpha = 1.0 / (centerDist * 0.5 + 0.1); 
      
      // Boost alpha with audio
      vAlpha *= (0.5 + audioValue * 2.0);

      // Dynamic point size
      gl_PointSize = 4.0 + audioValue * 10.0; // Pulse size with audio
      gl_PointSize *= (10.0 / -mvPosition.z);
    }
  `,
  // Fragment Shader
  `
    varying vec3 vColor;
    uniform float uIsLine;
    varying float vAlpha;

    void main() {
      float strength = 1.0;

      if (uIsLine < 0.5) {
        // Soft circular glow for points
        vec2 coord = gl_PointCoord - vec2(0.5);
        float dist = length(coord);
        
        if (dist > 0.5) discard;

        strength = 1.0 - (dist * 2.0);
        strength = pow(strength, 2.0);
      } else {
        // Constant alpha for lines, maybe slightly dimmer
        strength = 0.5; 
      }

      gl_FragColor = vec4(vColor, strength * vAlpha);
    }
  `
);

extend({ HarmonicMaterial });

export type HarmonicMaterialType = THREE.ShaderMaterial & {
  uTime: number;
  uBassFreq: number;
  uMidFreq: number;
  uAudioTexture: THREE.Texture;
  uIsLine: number;
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

interface HarmonicVisualizerProps {
  mode: "points" | "lines";
  analyser?: AnalyserNode | null;
}

export const HarmonicVisualizer = forwardRef<HarmonicMaterialType, HarmonicVisualizerProps>(
  ({ mode, analyser }, ref) => {
    const lineRef = useRef<HarmonicMaterialType>(null);

    // Create DataTexture for audio data
    const dataArray = useMemo(() => new Uint8Array(1024), []);
    const audioTexture = useMemo(() => {
      const texture = new THREE.DataTexture(
        dataArray,
        1024,
        1,
        THREE.RedFormat,
        THREE.UnsignedByteType
      );
      texture.needsUpdate = true;
      return texture;
    }, [dataArray]);

    // Sync line material uniforms with point material and update audio texture
    useFrame(() => {
      // Update Audio Texture
      if (analyser) {
        analyser.getByteFrequencyData(dataArray);
        audioTexture.needsUpdate = true;
      }

      // @ts-expect-error - ref is mutable ref object
      const pointMat = ref?.current;
      const lineMat = lineRef.current;

      if (pointMat) {
        pointMat.uAudioTexture = audioTexture;
      }

      if (pointMat && lineMat) {
        lineMat.uTime = pointMat.uTime;
        lineMat.uBassFreq = pointMat.uBassFreq;
        lineMat.uMidFreq = pointMat.uMidFreq;
        lineMat.uAudioTexture = audioTexture;
      }
    });

    // Generate points - Highly Tessellated
    const count = 20000; // Number of particles
    const geometry = useMemo(() => {
      const geo = new THREE.BufferGeometry();
      const indices = new Float32Array(count);
      const positions = new Float32Array(count * 3); // Dummy positions, calculated in shader

      for (let i = 0; i < count; i++) {
        indices[i] = i; // Store the index so the shader can calc 't'
        positions[i * 3] = 0;
        positions[i * 3 + 1] = 0;
        positions[i * 3 + 2] = 0;
      }

      geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geo.setAttribute("aIndex", new THREE.BufferAttribute(indices, 1));
      return geo;
    }, []);

    return (
      <group>
        {mode === "points" && (
          <points geometry={geometry}>
            <harmonicMaterial
              ref={ref}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              uBassFreq={1.0}
              uMidFreq={1.0}
              uAudioTexture={audioTexture}
              uIsLine={0}
            />
          </points>
        )}
        {mode === "lines" && (
          <line geometry={geometry}>
            <harmonicMaterial
              ref={mode === "lines" ? ref : lineRef}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              uBassFreq={1.0}
              uMidFreq={1.0}
              uAudioTexture={audioTexture}
              uIsLine={1}
              opacity={0.15}
            />
          </line>
        )}
      </group>
    );
  }
);

HarmonicVisualizer.displayName = "HarmonicVisualizer";
