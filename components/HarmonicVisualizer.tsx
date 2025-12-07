"use client";

import * as THREE from "three";
import { extend, useFrame } from "@react-three/fiber";
import { shaderMaterial } from "@react-three/drei";
import { useMemo, useRef } from "react";

// Shader Material
const HarmonicMaterial = shaderMaterial(
  {
    uTime: 0,
    uBassFreq: 1.0,
    uMidFreq: 1.0,
    uAudioTexture: new THREE.DataTexture(new Uint8Array(1024), 1024, 1, THREE.RedFormat),
    uIsLine: 0, // 0 for points, 1 for lines
    uMinUV: 0.0,
    uMaxUV: 1.0,
    uColor: new THREE.Color(1, 1, 1),
    uRadiusBase: 5.0,
  },
  // Vertex Shader
  `
    uniform float uTime;
    uniform float uBassFreq;
    uniform float uMidFreq;
    uniform sampler2D uAudioTexture;
    uniform float uMinUV;
    uniform float uMaxUV;
    uniform vec3 uColor;
    uniform float uRadiusBase;

    attribute float aIndex;
    varying vec3 vColor;
    varying float vAlpha;

    #define PI 3.14159265359

    void main() {
      // 1. Normalize index to a "time" variable t (0.0 to 1.0 along the line)
      // We multiply by 2*PI * loops to wrap it around multiple times
      float t = (aIndex / 20000.0) * 6.28318 * 10.0;

      // 2. Sample Audio Data
      // Map index to the specific band's UV range
      float freqUV = uMinUV + (aIndex / 20000.0) * (uMaxUV - uMinUV);

      float audioValue = texture2D(uAudioTexture, vec2(freqUV, 0.0)).r;

      // 3. Lissajous Parametric Equations
      // We use audioValue to modulate the AMPLITUDE (Radius)
      float radius = uRadiusBase + (audioValue * 3.0);

      vec3 pos;
      pos.x = radius * sin(uBassFreq * t);
      pos.y = radius * sin(uMidFreq * t);
      pos.z = radius * cos(uBassFreq * t); // Using cos(x) vs sin(z) creates the cylinder projection

      // 4. Set final position
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;

      // Pass color to fragment shader
      // Mix the band color with some variation based on t
      vColor = mix(uColor, uColor + vec3(0.2 * sin(t), 0.2 * cos(t), 0.2 * sin(t*2.0)), 0.3);

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
  uMinUV: number;
  uMaxUV: number;
  uColor: THREE.Color;
  uRadiusBase: number;
};

declare module "@react-three/fiber" {
  interface ThreeElements {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    harmonicMaterial: any;
  }
}

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
}

// Sub-component for a single figure
const HarmonicFigure = ({
  analyser,
  band,
  audioTexture,
  dataArray,
  index,
}: {
  analyser: AnalyserNode;
  band: FrequencyBand;
  audioTexture: THREE.Texture;
  dataArray: Uint8Array;
  index: number;
}) => {
  const pointRef = useRef<HarmonicMaterialType>(null);
  const lineRef = useRef<HarmonicMaterialType>(null);

  // Geometry
  const count = 20000;
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const indices = new Float32Array(count);
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      indices[i] = i;
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aIndex", new THREE.BufferAttribute(indices, 1));
    return geo;
  }, []);

  // Animation Loop
  useFrame((state) => {
    if (!pointRef.current || !lineRef.current) return;

    // Analyze Band Data to find dominant frequencies
    const start = Math.max(0, Math.min(band.min, dataArray.length - 1));
    const end = Math.max(start, Math.min(band.max, dataArray.length));

    let max1 = -1;
    let max1Index = -1;
    let max2 = -1;
    let max2Index = -1;

    if (end > start) {
      for (let i = start; i < end; i++) {
        const val = dataArray[i];
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
    }

    // Quantize frequencies: divide index by 20 to group them
    const f1 = max1Index > -1 ? Math.floor(max1Index / 20) + 1 : 1;
    const f2 = max2Index > -1 ? Math.floor(max2Index / 20) + 1 : 2;

    const targetFreqX = f1;
    const targetFreqY = f2;

    // Update Uniforms
    const time = state.clock.elapsedTime;

    // Points
    pointRef.current.uTime = time;
    pointRef.current.uBassFreq = THREE.MathUtils.lerp(
      pointRef.current.uBassFreq,
      targetFreqX,
      0.05
    );
    pointRef.current.uMidFreq = THREE.MathUtils.lerp(pointRef.current.uMidFreq, targetFreqY, 0.05);
    pointRef.current.uMinUV = band.min / 1024.0; // Assuming 1024 fft size
    pointRef.current.uMaxUV = band.max / 1024.0;
    pointRef.current.uColor.set(band.color);
    pointRef.current.uAudioTexture = audioTexture;
    pointRef.current.uRadiusBase = 4.0 + index * 3.0; // 4, 7, 10

    // Lines (Sync)
    lineRef.current.uTime = time;
    lineRef.current.uBassFreq = pointRef.current.uBassFreq;
    lineRef.current.uMidFreq = pointRef.current.uMidFreq;
    lineRef.current.uMinUV = pointRef.current.uMinUV;
    lineRef.current.uMaxUV = pointRef.current.uMaxUV;
    lineRef.current.uColor.set(band.color);
    lineRef.current.uAudioTexture = audioTexture;
    lineRef.current.uRadiusBase = pointRef.current.uRadiusBase;
  });

  return (
    <group>
      <points geometry={geometry}>
        <harmonicMaterial
          ref={pointRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uBassFreq={1.0}
          uMidFreq={1.0}
          uAudioTexture={audioTexture}
          uIsLine={0}
          uRadiusBase={5.0}
        />
      </points>
      <line geometry={geometry}>
        <harmonicMaterial
          ref={lineRef}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
          uBassFreq={1.0}
          uMidFreq={1.0}
          uAudioTexture={audioTexture}
          uIsLine={1}
          opacity={0.5}
          uRadiusBase={5.0}
        />
      </line>
    </group>
  );
};

export const HarmonicVisualizer = ({ mode, analyser, bands }: HarmonicVisualizerProps) => {
  // Shared Audio Texture
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

  useFrame(() => {
    if (analyser) {
      analyser.getByteFrequencyData(dataArray);
      audioTexture.needsUpdate = true;
    }
  });

  if (!bands || !analyser) return null;

  return (
    <group>
      {bands.map((band, i) => (
        <HarmonicFigure
          key={band.id}
          analyser={analyser}
          band={band}
          audioTexture={audioTexture}
          dataArray={dataArray}
          index={i}
        />
      ))}
    </group>
  );
};

HarmonicVisualizer.displayName = "HarmonicVisualizer";
