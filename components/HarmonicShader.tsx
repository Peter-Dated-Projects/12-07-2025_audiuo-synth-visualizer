"use client";

import * as THREE from "three";
import { extend, useFrame, useThree } from "@react-three/fiber";
import { shaderMaterial } from "@react-three/drei";
import { useMemo, forwardRef, useRef } from "react";

// Shader Material
const HarmonicMaterial = shaderMaterial(
  {
    uTime: 0,
    uFreqX: 1.0,
    uFreqY: 1.0,
    uFreqZ: 1.0,
    uAmpX: 0.0,
    uAmpY: 0.0,
    uAmpZ: 0.0,
    uColor: new THREE.Color(1.0, 1.0, 1.0),
    uAudioTexture: new THREE.DataTexture(new Uint8Array(1024), 1024, 1, THREE.RedFormat),
    uIsLine: 0, // 0 for points, 1 for lines
  },
  // Vertex Shader
  `
    uniform float uTime;
    uniform float uFreqX;
    uniform float uFreqY;
    uniform float uFreqZ;
    uniform float uAmpX;
    uniform float uAmpY;
    uniform float uAmpZ;
    uniform vec3 uColor;
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
      // Logarithmic Sampling to spread bass/mids across the visualizer
      float normalizedIndex = aIndex / 20000.0;
      float logIndex = pow(normalizedIndex, 4.0);
      
      float rawAudio = texture2D(uAudioTexture, vec2(logIndex, 0.0)).r;
      
      // Gamma Curve (Punchy Fix)
      float sharpAudio = pow(rawAudio, 2.5);

      // Amplitude Compensation (Boost Highs)
      float boost = 1.0 + (normalizedIndex * 3.0);
      float audioValue = sharpAudio * boost;
      
      // 3. Lissajous Parametric Equations
      // x(t) = Ax * sin(wx * t + phi)
      // y(t) = Ay * sin(wy * t + phi)
      // z(t) = Az * sin(wz * t + phi)
      
      // Base radius to ensure visibility
      float baseRadius = 5.0;
      
      // Amplitudes driven by audio levels (uAmpX, uAmpY, uAmpZ)
      // We scale them up to be visible
      float Ax = baseRadius + uAmpX * 10.0;
      float Ay = baseRadius + uAmpY * 10.0;
      float Az = baseRadius + uAmpZ * 10.0;

      vec3 pos;
      pos.x = Ax * sin(uFreqX * t + PI * 0.5);
      pos.y = Ay * sin(uFreqY * t);
      pos.z = Az * sin(uFreqZ * t);
      
      // Displace position based on audio frequency data
      // This makes the shape deform/spike with the music
      float displacement = 1.0 + audioValue * 3.0; 
      pos *= displacement;

      // 4. Set final position
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;

      // Pass color to fragment shader
      vColor = uColor;

      // Visual Polish:
      // Points in the center are brighter
      float centerDist = length(pos);
      // Much gentler falloff so lines stay visible at distance
      vAlpha = 1.0 / (centerDist * 0.05 + 0.5); 
      
      // Boost alpha with audio
      vAlpha *= (1.2 + audioValue * 3.0 + (uAmpX + uAmpY + uAmpZ) / 2.0);

      // Dynamic point size
      gl_PointSize = 4.0 + audioValue * 10.0 + ((uAmpX + uAmpY + uAmpZ) / 3.0) * 5.0; // Pulse size with audio
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
      } else {
        // Constant alpha for lines, max brightness
        strength = 1.5; 
      }

      gl_FragColor = vec4(vColor, strength * vAlpha);
      gl_FragColor = vec4(vColor, strength * vAlpha);
    }
  `
);

// Denoiser Shader Material (GPGPU)
const DenoiserMaterial = shaderMaterial(
  {
    uRawAudio: new THREE.DataTexture(new Uint8Array(1024), 1024, 1, THREE.RedFormat),
    uHistoryTexture: new THREE.DataTexture(
      new Float32Array(1024),
      1024,
      1,
      THREE.RedFormat,
      THREE.FloatType
    ),
    uLerpFactor: 0.1,
  },
  // Vertex Shader (Full Screen Quad)
  `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = vec4(position, 1.0);
    }
  `,
  // Fragment Shader
  `
    uniform sampler2D uRawAudio;
    uniform sampler2D uHistoryTexture;
    uniform float uLerpFactor;
    varying vec2 vUv;

    void main() {
      // 1. Spatial Denoise (Gaussian Blur on Raw Audio)
      float stepSize = 1.0 / 1024.0;
      
      float center = texture2D(uRawAudio, vUv).r;
      float left   = texture2D(uRawAudio, vUv - vec2(stepSize, 0.0)).r;
      float right  = texture2D(uRawAudio, vUv + vec2(stepSize, 0.0)).r;
      
      // Simple 3-tap average to remove spikes
      float smoothedRaw = (left + center + right) / 3.0;

      // 2. Temporal Smoothing (Lerp with History)
      float history = texture2D(uHistoryTexture, vUv).r;
      
      // Mix history with new smoothed data
      float finalValue = mix(history, smoothedRaw, uLerpFactor);

      gl_FragColor = vec4(finalValue, 0.0, 0.0, 1.0);
    }
  `
);

extend({ HarmonicMaterial, DenoiserMaterial });

export type HarmonicMaterialType = THREE.ShaderMaterial & {
  uTime: number;
  uFreqX: number;
  uFreqY: number;
  uFreqZ: number;
  uAmpX: number;
  uAmpY: number;
  uAmpZ: number;
  uColor: THREE.Color;
  uAudioTexture: THREE.Texture;
  uIsLine: number;
};

type DenoiserMaterialType = THREE.ShaderMaterial & {
  uRawAudio: THREE.Texture;
  uHistoryTexture: THREE.Texture;
  uLerpFactor: number;
};

declare module "@react-three/fiber" {
  interface ThreeElements {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    harmonicMaterial: any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    denoiserMaterial: any;
  }
}

function frequencyToColor(frequency: number): THREE.Color {
  const hue = (frequency % 360) / 360; // Normalize to [0,1]
  return new THREE.Color().setHSL(hue, 1.0, 0.5);
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
  band: FrequencyBand;
}

export const HarmonicVisualizer = forwardRef<HarmonicMaterialType, HarmonicVisualizerProps>(
  ({ mode, analyser, band }, forwardedRef) => {
    const lineRef = useRef<HarmonicMaterialType>(null);
    const pointRef = useRef<HarmonicMaterialType>(null);
    const { gl } = useThree();

    // Use forwarded ref if provided, otherwise use internal ref
    // Note: This simple assignment doesn't handle function refs, but sufficient for now
    // or just ignore forwardedRef since we don't use it in Scene anymore.

    // ...

    // --- GPGPU Setup ---

    // 1. Ping-Pong Buffers
    const [targetA, targetB] = useMemo(() => {
      const params = {
        minFilter: THREE.LinearFilter,
        magFilter: THREE.LinearFilter,
        format: THREE.RedFormat,
        type: THREE.FloatType, // High precision for smooth lerping
        depthBuffer: false,
        stencilBuffer: false,
      };
      return [
        new THREE.WebGLRenderTarget(1024, 1, params),
        new THREE.WebGLRenderTarget(1024, 1, params),
      ];
    }, []);

    // 2. Raw Audio Texture (Input)
    const dataArray = useMemo(() => new Uint8Array(1024), []);
    const rawAudioTexture = useMemo(() => {
      const texture = new THREE.DataTexture(
        dataArray,
        1024,
        1,
        THREE.RedFormat,
        THREE.UnsignedByteType
      );
      return texture;
    }, [dataArray]);

    // 3. GPGPU Scene & Camera
    const gpgpuScene = useMemo(() => new THREE.Scene(), []);
    const gpgpuCamera = useMemo(() => new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), []);
    const denoiserMaterialRef = useRef<DenoiserMaterialType>(null);

    // Create the full-screen quad for GPGPU once
    useMemo(() => {
      const geometry = new THREE.PlaneGeometry(2, 2);
      const material = new DenoiserMaterial();
      // @ts-expect-error - we know this is a valid material
      const mesh = new THREE.Mesh(geometry, material);
      gpgpuScene.add(mesh);
      // @ts-expect-error - assigning to ref
      denoiserMaterialRef.current = material;
    }, [gpgpuScene]);

    // Sync line material uniforms with point material and update audio texture
    // We need a mutable reference to the targets to swap them
    const targets = useRef({ read: targetA, write: targetB });
    const isFirstFrame = useRef(true);

    useFrame((state) => {
      if (!analyser || !denoiserMaterialRef.current) return;
      const time = state.clock.elapsedTime;

      // 1. Update Raw Audio Data
      analyser.getByteFrequencyData(dataArray);
      rawAudioTexture.image.data = dataArray;
      rawAudioTexture.needsUpdate = true;

      // 2. GPGPU Pass
      denoiserMaterialRef.current.uRawAudio = rawAudioTexture;

      // On first frame, use raw audio as history to avoid reading from empty texture
      if (isFirstFrame.current) {
        denoiserMaterialRef.current.uHistoryTexture = rawAudioTexture;
        isFirstFrame.current = false;
      } else {
        denoiserMaterialRef.current.uHistoryTexture = targets.current.read.texture;
      }

      const currentRenderTarget = gl.getRenderTarget();
      gl.setRenderTarget(targets.current.write);
      gl.render(gpgpuScene, gpgpuCamera);
      gl.setRenderTarget(currentRenderTarget);

      // 3. Update Main Material
      const pointMat = pointRef.current;
      const lineMat = lineRef.current;

      // Calculate sub-frequencies and amplitudes for this band
      const bufferLength = analyser.frequencyBinCount;
      // dataArray is already updated above

      const range = band.max - band.min;
      const third = range / 3;

      // Helper to get average amplitude for a range
      const getAverageAmp = (startIdx: number, endIdx: number) => {
        const s = Math.max(0, Math.floor(startIdx));
        const e = Math.min(bufferLength, Math.floor(endIdx));
        if (s >= e) return 0;

        let sum = 0;
        for (let i = s; i < e; i++) {
          sum += dataArray[i];
        }
        return sum / (e - s) / 255.0;
      };

      // 1. Split band into 3 sub-bands for X, Y, Z axes
      const startX = band.min;
      const endX = band.min + third;

      const startY = endX;
      const endY = band.min + 2 * third;

      const startZ = endY;
      const endZ = band.max;

      // 2. Calculate Amplitudes for each axis
      const ampX = getAverageAmp(startX, endX);
      const ampY = getAverageAmp(startY, endY);
      const ampZ = getAverageAmp(startZ, endZ);
      // 3. Calculate Frequencies (using center of each sub-band)
      // We map the center index to a frequency value
      const getFreq = (centerIdx: number) => (centerIdx / bufferLength) * 10.0 + 1.0;

      // Modulate frequencies with time and audio amplitude to make the shape morph
      // Reduced idle movement to be subtle breathing
      const freqX = getFreq(startX + third / 2) + Math.sin(time * 0.1) * 0.1 + ampX * 2.0;
      const freqY = getFreq(startY + third / 2) + Math.cos(time * 0.15) * 0.1 + ampY * 2.0;
      const freqZ = getFreq(startZ + third / 2) + Math.sin(time * 0.2) * 0.1 + ampZ * 2.0;

      if (pointMat) {
        pointMat.uAudioTexture = targets.current.write.texture;
        pointMat.uTime += 0.01; // Increment time
        pointMat.uFreqX = freqX;
        pointMat.uFreqY = freqY;
        pointMat.uFreqZ = freqZ;

        // Independent scaling per axis
        pointMat.uAmpX = ampX * band.amplitude;
        pointMat.uAmpY = ampY * band.amplitude;
        pointMat.uAmpZ = ampZ * band.amplitude;

        pointMat.uColor = new THREE.Color(band.color);
      }
      if (pointMat && lineMat) {
        lineMat.uTime = pointMat.uTime;
        lineMat.uFreqX = pointMat.uFreqX;
        lineMat.uFreqY = pointMat.uFreqY;
        lineMat.uFreqZ = pointMat.uFreqZ;
        lineMat.uAmpX = pointMat.uAmpX;
        lineMat.uAmpY = pointMat.uAmpY;
        lineMat.uAmpZ = pointMat.uAmpZ;
        lineMat.uColor = pointMat.uColor;
        lineMat.uAudioTexture = targets.current.write.texture;
      }

      // 4. Swap
      const temp = targets.current.read;
      targets.current.read = targets.current.write;
      targets.current.write = temp;
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
              ref={pointRef}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              uFreqX={1.0}
              uFreqY={1.0}
              uFreqZ={1.0}
              uAmpX={0.0}
              uAmpY={0.0}
              uAmpZ={0.0}
              uIsLine={0}
            />
          </points>
        )}
        {mode === "lines" && (
          <line geometry={geometry}>
            <harmonicMaterial
              ref={mode === "lines" ? pointRef : lineRef}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              uFreqX={1.0}
              uFreqY={1.0}
              uFreqZ={1.0}
              uAmpX={0.0}
              uAmpY={0.0}
              uAmpZ={0.0}
              uIsLine={1}
              opacity={1.0}
            />
          </line>
        )}
      </group>
    );
  }
);

HarmonicVisualizer.displayName = "HarmonicVisualizer";
