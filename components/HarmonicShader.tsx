"use client";

import * as THREE from "three";
import { extend, useFrame, useThree } from "@react-three/fiber";
import { shaderMaterial } from "@react-three/drei";
import { useMemo, forwardRef, useRef } from "react";

// Shader Material
const HarmonicMaterial = shaderMaterial(
  {
    uTime: 0,
    uBassFreq: 1.0,
    uMidFreq: 1.0,
    uBassLevel: 0.0,
    uBassScale: 1.0,
    uMidScale: 1.0,
    uTrebleScale: 1.0,
    uBassColor: new THREE.Color(1.0, 0.3, 0.0),
    uMidColor: new THREE.Color(0.2, 0.8, 0.2), // Default Greenish
    uTrebleColor: new THREE.Color(0.5, 0.2, 0.8), // Default Purpleish
    uAudioTexture: new THREE.DataTexture(new Uint8Array(1024), 1024, 1, THREE.RedFormat),
    uIsLine: 0, // 0 for points, 1 for lines
  },
  // Vertex Shader
  `
    uniform float uTime;
    uniform float uBassFreq;
    uniform float uMidFreq;
    uniform float uBassLevel;
    uniform float uBassScale;
    uniform float uMidScale;
    uniform float uTrebleScale;
    uniform vec3 uBassColor;
    uniform vec3 uMidColor;
    uniform vec3 uTrebleColor;
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
      // Amplitude Compensation (Boost Highs)
      float boost = 1.0 + (normalizedIndex * 3.0);
      float audioValue = sharpAudio * boost;
      
      // 3. Lissajous Parametric Equations
      // We use audioValue to modulate the AMPLITUDE (Radius)
      float radius = 5.0 + (audioValue * 3.0); 
      
      // Add a "Bass Pulse" to the overall size
      radius += uBassLevel * 2.0;

      vec3 pos;
      pos.x = radius * sin(uBassFreq * t + PI * 0.5) * uBassScale;
      pos.y = radius * sin(uMidFreq * t) * uMidScale;
      pos.z = radius * sin((uBassFreq + uMidFreq) * 0.5 * t) * uTrebleScale; // Add depth with Treble Scale
      
      // Optional: Twist the whole thing based on time
      
      // Optional: Twist the whole thing based on time
      // pos.x += sin(uTime) * 2.0;

      // 4. Set final position
      vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
      gl_Position = projectionMatrix * mvPosition;

      // Pass color to fragment shader
      // Base color (Treble/Mid mix)
      vec3 baseColor = mix(uMidColor, uTrebleColor, 0.5 + 0.5 * sin(t));
      
      // Mix based on bass level (squared for sharper reaction)
      float mixFactor = clamp(uBassLevel * uBassLevel * 1.5, 0.0, 1.0);
      vColor = mix(baseColor, uBassColor, mixFactor);

      // Visual Polish:
      // Points in the center are brighter
      float centerDist = length(pos);
      vAlpha = 1.0 / (centerDist * 0.5 + 0.1); 
      
      // Boost alpha with audio
      vAlpha *= (0.5 + audioValue * 2.0 + uBassLevel);

      // Dynamic point size
      gl_PointSize = 4.0 + audioValue * 10.0 + uBassLevel * 5.0; // Pulse size with audio
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
  uBassFreq: number;
  uMidFreq: number;
  uBassLevel: number;
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

interface HarmonicVisualizerProps {
  mode: "points" | "lines";
  analyser?: AnalyserNode | null;
}

export const HarmonicVisualizer = forwardRef<HarmonicMaterialType, HarmonicVisualizerProps>(
  ({ mode, analyser }, ref) => {
    const lineRef = useRef<HarmonicMaterialType>(null);
    const { gl } = useThree();

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

    useFrame(() => {
      if (!analyser || !denoiserMaterialRef.current) return;

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
      // @ts-expect-error - ref is mutable ref object
      const pointMat = ref?.current;
      const lineMat = lineRef.current;

      if (pointMat) {
        pointMat.uAudioTexture = targets.current.write.texture;
      }
      if (pointMat && lineMat) {
        lineMat.uTime = pointMat.uTime;
        lineMat.uBassFreq = pointMat.uBassFreq;
        lineMat.uMidFreq = pointMat.uMidFreq;
        lineMat.uBassLevel = pointMat.uBassLevel;
        lineMat.uBassScale = pointMat.uBassScale;
        lineMat.uMidScale = pointMat.uMidScale;
        lineMat.uTrebleScale = pointMat.uTrebleScale;
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
              ref={ref}
              transparent
              depthWrite={false}
              blending={THREE.AdditiveBlending}
              uBassFreq={1.0}
              uMidFreq={1.0}
              uBassLevel={0.0}
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
              uBassLevel={0.0}
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
