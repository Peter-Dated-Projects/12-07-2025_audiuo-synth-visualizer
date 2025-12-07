import * as THREE from "three";
import { extend, useFrame, useThree } from "@react-three/fiber";
import React, { useEffect, useMemo, useRef } from "react";

// --- Shaders ---

const GPGPU_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GPGPU_FRAGMENT_SHADER = `
uniform sampler2D uPreviousFrame;
uniform sampler2D uCurrentFrame; // Raw audio data this frame
uniform vec2 uResolution;

varying vec2 vUv;

void main() {
    // 1. Temporal Smoothing
    // Read previous frame's smoothed value
    float prevValue = texture2D(uPreviousFrame, vUv).r;
    
    // Read current raw value
    float rawValue = texture2D(uCurrentFrame, vUv).r;
    
    // Mix: 90% previous, 10% new (adjust for speed)
    float smoothedValue = mix(prevValue, rawValue, 0.2);
    
    // 2. Spatial Smoothing (3-tap blur)
    // Average with neighbors to remove spectral spikes
    float left = texture2D(uPreviousFrame, vUv - vec2(1.0/uResolution.x, 0.0)).r;
    float right = texture2D(uPreviousFrame, vUv + vec2(1.0/uResolution.x, 0.0)).r;
    
    float spatialAverage = (left + smoothedValue + right) / 3.0;
    
    gl_FragColor = vec4(spatialAverage, 0.0, 0.0, 1.0);
}
`;

const VISUALIZER_VERTEX_SHADER = `
uniform sampler2D uAudioTexture;
uniform float uTime;
uniform float uBassLevel;
uniform float uMidLevel;
uniform float uTrebleLevel;

attribute float aIndex;

varying vec3 vColor;

#define PI 3.14159265359

// Helper to sample audio with Logarithmic X and Gamma Y
float getAudioData(float t) {
    // Logarithmic X-Axis: Reduced exponent to 3.0 to give mids/highs more space
    float logT = pow(t, 3.0);
    
    // Sample texture
    float raw = texture2D(uAudioTexture, vec2(logT, 0.0)).r;
    
    // Gamma Corrected Y-Axis: Keep 5.0 for sharpness
    float sharp = pow(raw, 5.0);
    
    // Frequency Boost
    // Aggressive Bass Attenuation:
    // t=0 -> boost=0.1
    // t=1 -> boost=4.0
    float boost = 0.1 + (t * 4.0);
    
    return sharp * boost;
}

void main() {
    // Normalize index 0..1
    float t = aIndex / 20000.0; // Assuming 20k vertices
    
    // Get audio value for this vertex
    float audioValue = getAudioData(t);
    
    // Lissajous Parameters
    // Modulate these with time and audio
    float A = 10.0 + uBassLevel * 5.0;
    float B = 10.0 + uMidLevel * 5.0;
    float a = 3.0;
    float b = 2.0;
    float delta = uTime * 0.5;
    
    // Base Lissajous
    float angle = t * PI * 20.0; // Wrap multiple times
    
    float x = A * sin(a * angle + delta);
    float y = B * sin(b * angle);
    float z = 0.0;
    
    // Modulate radius with audio
    // Increased multiplier to 4.0 to make peaks more visible after gamma crush
    float radius = 1.0 + audioValue * 4.0;
    x *= radius;
    y *= radius;
    
    // "Sine Crown" Mode / Cylindrical Mapping
    // Map x -> theta, y -> height, z -> radius
    float theta = (x / 20.0) * PI * 2.0; // Wrap around cylinder
    float cylRadius = 10.0 + audioValue * 5.0 + z;
    float height = y;
    
    vec3 pos;
    pos.x = cylRadius * cos(theta);
    pos.z = cylRadius * sin(theta);
    pos.y = height;
    
    // Color based on frequency/position
    vec3 color1 = vec3(1.0, 0.2, 0.1); // Bass
    vec3 color2 = vec3(0.1, 0.5, 1.0); // Treble
    vColor = mix(color1, color2, t);
    vColor += vec3(audioValue); // Add brightness on beat

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
}
`;

const VISUALIZER_FRAGMENT_SHADER = `
varying vec3 vColor;

void main() {
    gl_FragColor = vec4(vColor, 1.0);
}
`;

// --- Class Implementation ---

class LissajousSystem {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;

  // GPGPU
  gpgpuScene: THREE.Scene;
  gpgpuCamera: THREE.OrthographicCamera;
  pingPongBuffer: THREE.WebGLRenderTarget[];
  currentBufferIndex: number = 0;
  gpgpuMaterial: THREE.ShaderMaterial;
  rawAudioTexture: THREE.DataTexture;

  // Visualizer
  visualizerMesh: THREE.Line;
  visualizerMaterial: THREE.ShaderMaterial;

  // Audio
  analyser: AnalyserNode;
  dataArray: Uint8Array;

  constructor(renderer: THREE.WebGLRenderer, analyser: AnalyserNode) {
    this.renderer = renderer;
    this.analyser = analyser;

    // 1. Setup Audio Data
    this.analyser.fftSize = 2048;
    const bufferLength = this.analyser.frequencyBinCount;
    this.dataArray = new Uint8Array(bufferLength);

    this.rawAudioTexture = new THREE.DataTexture(this.dataArray, bufferLength, 1, THREE.RedFormat);

    // 2. Setup GPGPU (Ping-Pong)
    this.gpgpuScene = new THREE.Scene();
    this.gpgpuCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const bufferParams = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RedFormat,
      type: THREE.FloatType, // High precision for smoothing
    };

    this.pingPongBuffer = [
      new THREE.WebGLRenderTarget(bufferLength, 1, bufferParams),
      new THREE.WebGLRenderTarget(bufferLength, 1, bufferParams),
    ];

    this.gpgpuMaterial = new THREE.ShaderMaterial({
      vertexShader: GPGPU_VERTEX_SHADER,
      fragmentShader: GPGPU_FRAGMENT_SHADER,
      uniforms: {
        uPreviousFrame: { value: null },
        uCurrentFrame: { value: this.rawAudioTexture },
        uResolution: { value: new THREE.Vector2(bufferLength, 1) },
      },
    });

    const plane = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.gpgpuMaterial);
    this.gpgpuScene.add(plane);

    // 3. Setup Visualizer Geometry
    const vertexCount = 20000;
    const geometry = new THREE.BufferGeometry();
    const indices = new Float32Array(vertexCount);
    for (let i = 0; i < vertexCount; i++) {
      indices[i] = i;
    }
    geometry.setAttribute("aIndex", new THREE.BufferAttribute(indices, 1));
    geometry.setAttribute(
      "position",
      new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3)
    ); // Dummy positions

    this.visualizerMaterial = new THREE.ShaderMaterial({
      vertexShader: VISUALIZER_VERTEX_SHADER,
      fragmentShader: VISUALIZER_FRAGMENT_SHADER,
      uniforms: {
        uAudioTexture: { value: null }, // Will be set to GPGPU output
        uTime: { value: 0 },
        uBassLevel: { value: 0 },
        uMidLevel: { value: 0 },
        uTrebleLevel: { value: 0 },
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.visualizerMesh = new THREE.Line(geometry, this.visualizerMaterial);
  }

  update(time: number) {
    // 1. Update Audio Data
    this.analyser.getByteFrequencyData(this.dataArray);
    this.rawAudioTexture.needsUpdate = true;

    // Calculate rough bands for uniforms
    let bass = 0,
      mid = 0,
      treble = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      const val = this.dataArray[i] / 255.0;
      if (i < 10) bass += val;
      else if (i < 100) mid += val;
      else treble += val;
    }
    bass /= 10;
    mid /= 90;
    treble /= this.dataArray.length - 100;

    // 2. GPGPU Pass
    const prevBuffer = this.pingPongBuffer[this.currentBufferIndex];
    const nextBuffer = this.pingPongBuffer[(this.currentBufferIndex + 1) % 2];

    this.gpgpuMaterial.uniforms.uPreviousFrame.value = prevBuffer.texture;
    this.gpgpuMaterial.uniforms.uCurrentFrame.value = this.rawAudioTexture;

    // Render to next buffer
    const currentRenderTarget = this.renderer.getRenderTarget();
    this.renderer.setRenderTarget(nextBuffer);
    this.renderer.render(this.gpgpuScene, this.gpgpuCamera);
    this.renderer.setRenderTarget(currentRenderTarget); // Restore

    // Swap
    this.currentBufferIndex = (this.currentBufferIndex + 1) % 2;

    // 3. Update Visualizer Uniforms
    this.visualizerMaterial.uniforms.uAudioTexture.value = nextBuffer.texture;
    this.visualizerMaterial.uniforms.uTime.value = time;
    this.visualizerMaterial.uniforms.uBassLevel.value = bass;
    this.visualizerMaterial.uniforms.uMidLevel.value = mid;
    this.visualizerMaterial.uniforms.uTrebleLevel.value = treble;
  }

  dispose() {
    this.pingPongBuffer.forEach((b) => b.dispose());
    this.rawAudioTexture.dispose();
    this.gpgpuMaterial.dispose();
    this.visualizerMaterial.dispose();
    this.visualizerMesh.geometry.dispose();
  }
}

// --- React Component ---

interface AdvancedLissajousProps {
  analyser: AnalyserNode;
}

export const AdvancedLissajous: React.FC<AdvancedLissajousProps> = ({ analyser }) => {
  const { gl, scene } = useThree();
  const systemRef = useRef<LissajousSystem | null>(null);

  useEffect(() => {
    if (!analyser) return;

    const system = new LissajousSystem(gl, analyser);
    systemRef.current = system;
    scene.add(system.visualizerMesh);

    return () => {
      scene.remove(system.visualizerMesh);
      system.dispose();
    };
  }, [analyser, gl, scene]);

  useFrame((state) => {
    if (systemRef.current) {
      systemRef.current.update(state.clock.elapsedTime);
    }
  });

  return null;
};
