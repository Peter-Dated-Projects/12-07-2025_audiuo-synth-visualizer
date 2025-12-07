/**
 * GPU-Optimized Lissajous Visualizer
 *
 * This component processes raw audio data directly on the GPU using vertex shaders,
 * providing massive performance improvements over CPU-based coordinate calculation.
 *
 * Key Optimizations:
 * - Raw audio passed as texture/attributes (no CPU preprocessing)
 * - Lissajous math executed in parallel for all points
 * - Supports 16k+ points for ultra-smooth curves
 * - Multiple Z-axis depth modes (parametric, time, frequency, phase)
 */

import * as THREE from "three";
import { useFrame } from "@react-three/fiber";
import React, { useMemo, useRef } from "react";

// --- GPU-Accelerated Lissajous Shader ---
//
// THE UNIVERSAL EQUATION: x = (AudioLeft * 0.7) + (sin(ωt) * 0.3)
//                         y = (AudioRight * 0.7) + (sin(ωt) * 0.3)
//
// This shader applies the SAME formula to ALL bands.
// Visual differences arise from the CHARACTERISTICS of the filtered audio data:
//
// • Bass (Lowpass <250Hz):   Slow, smooth, high-amplitude → Large breathing shapes
// • Mids (Bandpass 250-4kHz): Complex harmonics → Intricate knots and loops
// • Highs (Highpass >4kHz):   Fast oscillation, noisy → Electric fuzz texture
// • Melody (FFT-enhanced):    Dominant frequencies → Pulsing highlights
//
const GPU_LISSAJOUS_VERTEX_SHADER = `
// Audio data textures (raw waveform - PRE-FILTERED by band)
uniform sampler2D uLeftChannel;
uniform sampler2D uRightChannel;

// Lissajous parameters
uniform float uFrequencyRatioX;
uniform float uFrequencyRatioY;
uniform float uFrequencyRatioZ;
uniform float uPhase;
uniform float uPhaseZ;

// 3D configuration
uniform bool uEnable3D;
uniform int uZMode; // 0=parametric, 1=time, 2=frequency, 3=phase
uniform float uZScale;

// Blending & animation
uniform float uAudioBlend; // 0.0 = pure parametric, 1.0 = pure audio
uniform float uTime;

// Visual parameters
uniform vec3 uColor;
uniform float uScale;

attribute float aIndex; // Normalized 0..1 index

varying vec3 vColor;
varying float vIntensity;

#define PI 3.14159265359

// Sample audio from texture at normalized position
float sampleAudio(sampler2D audioTexture, float t) {
    return texture2D(audioTexture, vec2(t, 0.5)).r;
}

void main() {
    float t = aIndex; // 0.0 to 1.0
    float angle = t * 2.0 * PI;
    
    // --- Sample Raw Audio ---
    float audioLeft = sampleAudio(uLeftChannel, t);
    float audioRight = sampleAudio(uRightChannel, t);
    
    // Normalize audio from [0, 1] to [-1, 1] if needed
    // (Assuming audio is already normalized -1..1 range)
    
    // --- Generate Parametric Lissajous Coordinates ---
    float paramX = sin(uFrequencyRatioX * angle + uPhase);
    float paramY = sin(uFrequencyRatioY * angle);
    
    // --- Blend Audio with Parametric Curve ---
    // This ensures the shape remains interesting even with silence
    float x = mix(paramX, audioLeft, uAudioBlend);
    float y = mix(paramY, audioRight, uAudioBlend);
    
    // Apply scale
    x *= uScale;
    y *= uScale;
    
    // --- Calculate Z-Axis (Depth) ---
    float z = 0.0;
    
    if (uEnable3D) {
        if (uZMode == 0) {
            // Parametric: True 3D Lissajous with independent Z frequency
            float paramZ = sin(uFrequencyRatioZ * angle + uPhaseZ);
            
            // For parametric mode, blend all axes with parametric curves
            x = mix(paramX, audioLeft, uAudioBlend * 0.4);
            y = mix(paramY, audioRight, uAudioBlend * 0.4);
            z = paramZ * uZScale;
            
        } else if (uZMode == 1) {
            // Time: Depth based on position in sequence (tunnel effect)
            z = (t - 0.5) * 2.0 * uZScale;
            
        } else if (uZMode == 2) {
            // Frequency: Depth based on audio magnitude
            float magnitude = sqrt(audioLeft * audioLeft + audioRight * audioRight);
            z = magnitude * uZScale;
            
        } else if (uZMode == 3) {
            // Phase: Depth based on channel phase relationship
            float phaseDiff = atan(audioRight, audioLeft);
            z = sin(phaseDiff) * uZScale;
        }
    }
    
    // --- Final Position ---
    vec3 pos = vec3(x, y, z);
    
    // Optional: Add rotation animation
    // float rot = uTime * 0.2;
    // float rotX = pos.x * cos(rot) - pos.y * sin(rot);
    // float rotY = pos.x * sin(rot) + pos.y * cos(rot);
    // pos.x = rotX;
    // pos.y = rotY;
    
    // Calculate intensity for coloring (based on audio magnitude)
    vIntensity = sqrt(audioLeft * audioLeft + audioRight * audioRight) * 0.5;
    vColor = uColor;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = 2.0; // For point rendering mode
}
`;

const GPU_LISSAJOUS_FRAGMENT_SHADER = `
varying vec3 vColor;
varying float vIntensity;

void main() {
    // Add glow based on audio intensity
    vec3 finalColor = vColor * (1.0 + vIntensity * 0.5);
    float alpha = 0.8 + vIntensity * 0.2;
    
    gl_FragColor = vec4(finalColor, alpha);
}
`;

// --- TypeScript Interfaces ---

export type ZMode = "parametric" | "time" | "frequency" | "phase";

interface LissajousGPUProps {
  leftChannel: Float32Array;
  rightChannel: Float32Array;
  frequencyRatioX?: number;
  frequencyRatioY?: number;
  frequencyRatioZ?: number;
  phase?: number;
  phaseZ?: number;
  enable3D?: boolean;
  zMode?: ZMode;
  zScale?: number;
  audioBlend?: number; // 0..1, how much to blend audio vs parametric
  color?: string;
  scale?: number;
  pointCount?: number;
  renderMode?: "line" | "points";
}

/**
 * GPU-Optimized Lissajous Visualizer Component
 *
 * Processes raw audio data directly on the GPU for maximum performance.
 * Supports up to 16k+ points with real-time updates.
 */
export default function LissajousVisualizerGPU({
  leftChannel,
  rightChannel,
  frequencyRatioX = 3.0,
  frequencyRatioY = 4.0,
  frequencyRatioZ = 1.5,
  phase = Math.PI / 2,
  phaseZ = Math.PI / 2,
  enable3D = true,
  zMode = "parametric",
  zScale = 1.0,
  audioBlend = 0.7,
  color = "#00ffff",
  scale = 5.0,
  pointCount = 8192,
  renderMode = "line",
}: LissajousGPUProps) {
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const leftTextureRef = useRef<THREE.DataTexture | null>(null);
  const rightTextureRef = useRef<THREE.DataTexture | null>(null);

  // --- Geometry Setup ---
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(pointCount * 3);
    const indices = new Float32Array(pointCount);

    // Initialize with zeros (GPU will calculate actual positions)
    for (let i = 0; i < pointCount; i++) {
      indices[i] = i / (pointCount - 1);
      positions[i * 3] = 0;
      positions[i * 3 + 1] = 0;
      positions[i * 3 + 2] = 0;
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aIndex", new THREE.BufferAttribute(indices, 1));

    return geo;
  }, [pointCount]);

  // --- Audio Textures (1D textures for efficient GPU sampling) ---
  const [leftTexture, rightTexture] = useMemo(() => {
    const createAudioTexture = (data: Float32Array) => {
      // Create 1D texture (width = data.length, height = 1)
      const texture = new THREE.DataTexture(data, data.length, 1, THREE.RedFormat, THREE.FloatType);
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.needsUpdate = true;
      return texture;
    };

    const left = createAudioTexture(leftChannel);
    const right = createAudioTexture(rightChannel);

    leftTextureRef.current = left;
    rightTextureRef.current = right;

    return [left, right];
  }, [leftChannel, rightChannel]); // Recreate when audio channels change

  // --- Shader Uniforms ---
  const uniforms = useMemo(
    () => ({
      uLeftChannel: { value: leftTexture },
      uRightChannel: { value: rightTexture },
      uFrequencyRatioX: { value: frequencyRatioX },
      uFrequencyRatioY: { value: frequencyRatioY },
      uFrequencyRatioZ: { value: frequencyRatioZ },
      uPhase: { value: phase },
      uPhaseZ: { value: phaseZ },
      uEnable3D: { value: enable3D },
      uZMode: { value: zModeToInt(zMode) },
      uZScale: { value: zScale },
      uAudioBlend: { value: audioBlend },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uScale: { value: scale },
    }),
    [
      leftTexture,
      rightTexture,
      frequencyRatioX,
      frequencyRatioY,
      frequencyRatioZ,
      phase,
      phaseZ,
      enable3D,
      zMode,
      zScale,
      audioBlend,
      color,
      scale,
    ]
  );

  // --- Update Loop ---
  useFrame((state) => {
    if (!materialRef.current) return;

    // Update audio textures with new data
    if (leftTextureRef.current && rightTextureRef.current) {
      // Resize textures if audio buffer size changed
      if (leftChannel.length !== leftTextureRef.current.image.width) {
        leftTextureRef.current.image.data = leftChannel;
        leftTextureRef.current.image.width = leftChannel.length;
        rightTextureRef.current.image.data = rightChannel;
        rightTextureRef.current.image.width = rightChannel.length;
      } else {
        // Just update data
        if (leftTextureRef.current.image.data && rightTextureRef.current.image.data) {
          leftTextureRef.current.image.data.set(leftChannel);
          rightTextureRef.current.image.data.set(rightChannel);
        }
      }

      leftTextureRef.current.needsUpdate = true;
      rightTextureRef.current.needsUpdate = true;
    }

    // Update uniforms
    const u = materialRef.current.uniforms;
    u.uTime.value = state.clock.elapsedTime;
    u.uFrequencyRatioX.value = frequencyRatioX;
    u.uFrequencyRatioY.value = frequencyRatioY;
    u.uFrequencyRatioZ.value = frequencyRatioZ;
    u.uPhase.value = phase;
    u.uPhaseZ.value = phaseZ;
    u.uEnable3D.value = enable3D;
    u.uZMode.value = zModeToInt(zMode);
    u.uZScale.value = zScale;
    u.uAudioBlend.value = audioBlend;
    u.uColor.value.set(color);
    u.uScale.value = scale;
  });

  // --- Render ---
  const LineComponent = renderMode === "line" ? "line" : "points";

  return (
    <LineComponent geometry={geometry}>
      <shaderMaterial
        ref={materialRef}
        vertexShader={GPU_LISSAJOUS_VERTEX_SHADER}
        fragmentShader={GPU_LISSAJOUS_FRAGMENT_SHADER}
        uniforms={uniforms}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </LineComponent>
  );
}

// --- Helper Functions ---

function zModeToInt(mode: ZMode): number {
  switch (mode) {
    case "parametric":
      return 0;
    case "time":
      return 1;
    case "frequency":
      return 2;
    case "phase":
      return 3;
    default:
      return 0;
  }
}

/**
 * Example Usage:
 *
 * ```tsx
 * import LissajousVisualizerGPU from './LissajousVisualizerGPU';
 *
 * function MyScene() {
 *   const [leftChannel, setLeftChannel] = useState(new Float32Array(2048));
 *   const [rightChannel, setRightChannel] = useState(new Float32Array(2048));
 *
 *   // Update audio data from Web Audio API
 *   useEffect(() => {
 *     const analyser = audioContext.createAnalyser();
 *     analyser.fftSize = 2048;
 *
 *     const update = () => {
 *       const left = new Float32Array(analyser.fftSize);
 *       const right = new Float32Array(analyser.fftSize);
 *       analyser.getFloatTimeDomainData(left);
 *       // Get right channel from splitter...
 *       setLeftChannel(left);
 *       setRightChannel(right);
 *     };
 *
 *     const interval = setInterval(update, 16);
 *     return () => clearInterval(interval);
 *   }, []);
 *
 *   return (
 *     <Canvas>
 *       <LissajousVisualizerGPU
 *         leftChannel={leftChannel}
 *         rightChannel={rightChannel}
 *         frequencyRatioX={3}
 *         frequencyRatioY={4}
 *         enable3D={true}
 *         zMode="parametric"
 *         pointCount={16384}
 *         scale={8}
 *         color="#00ffff"
 *       />
 *     </Canvas>
 *   );
 * }
 * ```
 */
