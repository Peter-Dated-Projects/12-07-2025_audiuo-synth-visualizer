import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import React, { useEffect, useRef, useMemo } from "react";
import GUI from "lil-gui";

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
uniform sampler2D uCurrentFrame;
uniform float uNoiseFloor;

varying vec2 vUv;

void main() {
    // 1. Temporal Smoothing
    vec4 prev = texture2D(uPreviousFrame, vUv);
    vec4 curr = texture2D(uCurrentFrame, vUv);
    
    // Apply noise floor
    float val = max(0.0, curr.r - uNoiseFloor);
    
    // Smooth: mix previous and current
    float smoothed = mix(prev.r, val, 0.2);
    
    gl_FragColor = vec4(smoothed, 0.0, 0.0, 1.0);
}
`;

const VISUALIZER_VERTEX_SHADER = `
uniform int uMode;
uniform sampler2D uFreqTexture; // Smoothed frequency data
uniform sampler2D uWaveTexture; // Raw waveform data
uniform float uTime;
uniform float uLissajousRatio;

attribute float aIndex;

varying float vSignal;

#define PI 3.14159265359

// Helper to sample texture at a specific normalized position (0.0 to 1.0)
float getFreq(float t) {
    return texture2D(uFreqTexture, vec2(t, 0.5)).r;
}

float getWave(float t) {
    // Map 0..1 to texture coords
    return texture2D(uWaveTexture, vec2(t, 0.5)).r; // 0..1 range usually
}

// Remap 0..1 to -1..1
float getWaveSigned(float t) {
    return getWave(t) * 2.0 - 1.0;
}

void main() {
    float t = aIndex; // 0.0 to 1.0
    
    vec3 pos = vec3(0.0);
    float signal = 0.0;

    if (uMode == 0) {
        // --- Mode 0: Sine Crown (Synthetic) ---
        // Data: Frequency Data
        // Math: Lissajous parametric equations
        
        float freqVal = getFreq(t);
        signal = freqVal;
        
        // Lissajous parameters
        float a = 3.0;
        float b = a * uLissajousRatio; // e.g. 3.0 * 4.0/3.0 = 4.0
        
        float angle = t * 2.0 * PI; // 0 to 2PI
        
        // Base Lissajous
        float x = sin(a * angle + uTime * 0.5);
        float y = cos(b * angle);
        
        // Modulate radius by frequency magnitude
        float radius = 2.0 + freqVal * 2.0;
        
        pos = vec3(x * radius, y * radius, 0.0);
        
        // Add some depth based on index
        pos.z = sin(angle * 5.0) * freqVal;

    } else if (uMode == 1) {
        // --- Mode 1: Phase Shift (Goniometer) ---
        // Data: Waveform Data
        // x = sample(t)
        // y = sample(t - delay)
        
        float delay = 0.25; // Quarter cycle approx for sine waves
        
        // We treat 't' as the time index in the buffer
        // Since the buffer is cyclic or a snapshot, we just sample at t and t-delay
        
        float x = getWaveSigned(t);
        
        // Wrap t-delay
        float tDelayed = mod(t - delay, 1.0);
        float y = getWaveSigned(tDelayed);
        
        pos = vec3(x * 5.0, y * 5.0, 0.0);
        
        // Spread out in Z slightly to see history if we wanted, or keep flat
        // Prompt says: z = t (spread) or 0 (flat). Let's do flat for pure goniometer look
        // But maybe a little z for style
        pos.z = (t - 0.5) * 2.0; 
        
        signal = abs(x);

    } else if (uMode == 2) {
        // --- Mode 2: Derivative (Phase Plane) ---
        // Data: Waveform Data
        // x = sample(t)
        // y = sample(t) - sample(t - epsilon)
        
        float epsilon = 0.01;
        
        float x = getWaveSigned(t);
        
        float tPrev = mod(t - epsilon, 1.0);
        float xPrev = getWaveSigned(tPrev);
        
        float y = (x - xPrev) * 20.0; // Scale up derivative
        
        pos = vec3(x * 5.0, y * 5.0, 0.0);
        pos.z = (t - 0.5) * 2.0;
        
        signal = abs(y);
    }

    vSignal = signal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const VISUALIZER_FRAGMENT_SHADER = `
varying float vSignal;
uniform vec3 uColor;

void main() {
    // Simple glow based on signal strength
    float alpha = 0.5 + vSignal * 0.5;
    gl_FragColor = vec4(uColor * (1.0 + vSignal), alpha);
}
`;

// --- Classes ---

class GPGPUSmoother {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  mesh: THREE.Mesh;
  material: THREE.ShaderMaterial;
  renderTargetA: THREE.WebGLRenderTarget;
  renderTargetB: THREE.WebGLRenderTarget;
  size: number;

  constructor(renderer: THREE.WebGLRenderer, size: number = 128) {
    this.size = size;
    this.scene = new THREE.Scene();
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const geometry = new THREE.PlaneGeometry(2, 2);
    this.material = new THREE.ShaderMaterial({
      vertexShader: GPGPU_VERTEX_SHADER,
      fragmentShader: GPGPU_FRAGMENT_SHADER,
      uniforms: {
        uPreviousFrame: { value: null },
        uCurrentFrame: { value: null },
        uNoiseFloor: { value: 0.01 },
      },
    });

    this.mesh = new THREE.Mesh(geometry, this.material);
    this.scene.add(this.mesh);

    const rtOptions = {
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      format: THREE.RedFormat,
      type: THREE.FloatType, // Important for precision
    };

    this.renderTargetA = new THREE.WebGLRenderTarget(size, 1, rtOptions);
    this.renderTargetB = new THREE.WebGLRenderTarget(size, 1, rtOptions);
  }

  update(renderer: THREE.WebGLRenderer, currentDataTexture: THREE.DataTexture, noiseFloor: number) {
    // Ping-pong
    const temp = this.renderTargetA;
    this.renderTargetA = this.renderTargetB;
    this.renderTargetB = temp;

    this.material.uniforms.uPreviousFrame.value = this.renderTargetB.texture;
    this.material.uniforms.uCurrentFrame.value = currentDataTexture;
    this.material.uniforms.uNoiseFloor.value = noiseFloor;

    renderer.setRenderTarget(this.renderTargetA);
    renderer.render(this.scene, this.camera);
    renderer.setRenderTarget(null);
  }

  getTexture() {
    return this.renderTargetA.texture;
  }
}

class AudioController {
  analyser: AnalyserNode;
  freqData: Uint8Array;
  waveData: Uint8Array;
  freqTexture: THREE.DataTexture;
  waveTexture: THREE.DataTexture;

  constructor(analyserNode: AnalyserNode) {
    this.analyser = analyserNode;
    const fftSize = this.analyser.fftSize;
    const bufferLength = fftSize / 2; // Frequency bin count

    this.freqData = new Uint8Array(bufferLength);
    this.waveData = new Uint8Array(fftSize); // Waveform is full fftSize

    // Create textures
    // Frequency texture (1D)
    this.freqTexture = new THREE.DataTexture(
      this.freqData,
      bufferLength,
      1,
      THREE.RedFormat,
      THREE.UnsignedByteType
    );

    // Waveform texture (1D)
    this.waveTexture = new THREE.DataTexture(
      this.waveData,
      fftSize,
      1,
      THREE.RedFormat,
      THREE.UnsignedByteType
    );
  }

  update() {
    this.analyser.getByteFrequencyData(this.freqData as unknown as Uint8Array);
    this.analyser.getByteTimeDomainData(this.waveData as unknown as Uint8Array);

    this.freqTexture.needsUpdate = true;
    this.waveTexture.needsUpdate = true;
  }

  dispose() {
    this.freqTexture.dispose();
    this.waveTexture.dispose();
  }
}

// --- Main Component ---

interface AudioVisualizerEngineProps {
  analyser: AnalyserNode;
}

export default function AudioVisualizerEngine({ analyser }: AudioVisualizerEngineProps) {
  const { gl } = useThree();

  // Initialize Controllers
  const audioController = useMemo(() => new AudioController(analyser), [analyser]);
  const smoother = useMemo(() => new GPGPUSmoother(gl, analyser.fftSize / 2), [gl, analyser]);

  // Geometry
  const geometry = useMemo(() => {
    const count = 20000;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const indices = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      indices[i] = i / (count - 1); // Normalized 0..1
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aIndex", new THREE.BufferAttribute(indices, 1));
    return geo;
  }, []);

  // Material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: VISUALIZER_VERTEX_SHADER,
      fragmentShader: VISUALIZER_FRAGMENT_SHADER,
      uniforms: {
        uMode: { value: 0 },
        uFreqTexture: { value: null },
        uWaveTexture: { value: null },
        uTime: { value: 0 },
        uLissajousRatio: { value: 1.33 }, // 4:3
        uColor: { value: new THREE.Color("#00ff88") },
      },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      linewidth: 2, // Note: linewidth only works in some browsers/drivers
    });
  }, []);

  // Create the Line mesh
  const lineMesh = useMemo(() => {
    const mesh = new THREE.Line(geometry, material);
    mesh.frustumCulled = false; // Avoid culling issues with dynamic vertices
    return mesh;
  }, [geometry, material]);

  // Keep a ref to the material for easy access in useFrame
  const materialRef = useRef<THREE.ShaderMaterial>(material);

  // UI State
  const params = useRef({
    mode: 0,
    noiseFloor: 0.1,
    lissajousRatio: 1.33,
    color: "#00ff88",
  });

  // Setup GUI
  useEffect(() => {
    const container = document.getElementById("visualizer-controls-container");
    const gui = new GUI({
      title: "Visualizer Settings",
      container: container || undefined,
    });

    if (container) {
      gui.domElement.style.position = "relative";
      gui.domElement.style.width = "100%";
      gui.domElement.style.top = "auto";
      gui.domElement.style.right = "auto";
    }

    gui
      .add(params.current, "mode", {
        "Sine Crown (Freq)": 0,
        "Phase Shift (Wave)": 1,
        "Derivative (Wave)": 2,
      })
      .onChange((v: number) => {
        materialRef.current.uniforms.uMode.value = v;
      });

    gui.add(params.current, "noiseFloor", 0, 0.5).name("Noise Floor");
    gui.add(params.current, "lissajousRatio", 0.1, 5.0).name("Lissajous Ratio");
    gui.addColor(params.current, "color").onChange((v: string) => {
      materialRef.current.uniforms.uColor.value.set(v);
    });

    return () => {
      gui.destroy();
    };
  }, []);

  // Render Loop
  useFrame((state) => {
    if (!audioController || !smoother) return;

    // 1. Update Audio Data
    audioController.update();

    // 2. Run GPGPU Smoother on Frequency Data
    smoother.update(gl, audioController.freqTexture, params.current.noiseFloor);

    // 3. Update Visualizer Uniforms
    const mat = materialRef.current;
    mat.uniforms.uFreqTexture.value = smoother.getTexture(); // Use smoothed freq
    mat.uniforms.uWaveTexture.value = audioController.waveTexture; // Use raw wave
    mat.uniforms.uTime.value = state.clock.elapsedTime;
    mat.uniforms.uLissajousRatio.value = params.current.lissajousRatio;
  });

  // Cleanup
  useEffect(() => {
    return () => {
      audioController.dispose();
    };
  }, [audioController]);

  return <primitive object={lineMesh} />;
}
