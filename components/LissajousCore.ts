import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

/**
 * GPGPU Vertex Shader
 * Standard full-screen quad setup.
 */
const GPGPU_VERTEX_SHADER = `
varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}
`;

/**
 * GPGPU Fragment Shader
 * Handles temporal smoothing (decay) and spatial smoothing (blur).
 */
const GPGPU_FRAGMENT_SHADER = `
uniform sampler2D uRawAudio;
uniform sampler2D uPreviousFrame;
uniform float uSmoothingTime; // 0.1
uniform vec2 uResolution;

varying vec2 vUv;

void main() {
    // 1. Read current raw audio data
    float raw = texture2D(uRawAudio, vUv).r;

    // 2. Read previous frame for temporal smoothing
    float prev = texture2D(uPreviousFrame, vUv).r;

    // Temporal Smoothing: mix(previous, current, 0.1)
    // If uSmoothingTime is small (0.1), it's mostly previous frame (slow decay).
    // Wait, mix(x, y, a) = x*(1-a) + y*a.
    // If we want to remove jitter, we want a slow update.
    float temporal = mix(prev, raw, uSmoothingTime);

    // 3. Spatial Smoothing: 3-tap blur
    // Average with neighbors to remove spectral spikes.
    float stepX = 1.0 / uResolution.x;
    float left = texture2D(uPreviousFrame, vec2(vUv.x - stepX, vUv.y)).r;
    float right = texture2D(uPreviousFrame, vec2(vUv.x + stepX, vUv.y)).r;
    
    // Note: Using 'temporal' (current mixed) for center, and neighbors from previous/current?
    // Let's blur the *temporally smoothed* result.
    // But we can't easily access neighbors of the *current calculation* without multiple passes.
    // We can blur the raw input or the previous frame. 
    // Let's blur the current temporal result with neighbors from the *previous* frame (approximation) 
    // or just sample the raw texture neighbors.
    // Better: Sample neighbors from uRawAudio and apply temporal smoothing to them too? 
    // Or just blur the result of the temporal mix?
    // Let's do a simple blur on the temporal result using the current UVs (which is fine, but we need neighbors).
    // Since we are in a fragment shader, we can't read the neighbor's *output* of this pass.
    // We can read neighbors from uRawAudio or uPreviousFrame.
    
    // Let's try: Calculate temporal for Left, Center, Right. Then average.
    // That's expensive.
    // Simpler: Average raw neighbors, then mix with previous.
    
    float rawLeft = texture2D(uRawAudio, vec2(clamp(vUv.x - stepX, 0.0, 1.0), vUv.y)).r;
    float rawRight = texture2D(uRawAudio, vec2(clamp(vUv.x + stepX, 0.0, 1.0), vUv.y)).r;
    float rawAvg = (rawLeft + raw + rawRight) / 3.0;
    
    float smoothed = mix(prev, rawAvg, uSmoothingTime);

    gl_FragColor = vec4(smoothed, 0.0, 0.0, 1.0);
}
`;

/**
 * Visualizer Vertex Shader
 * Implements Lissajous logic, Signal Processing, and Sine Crown mapping.
 */
const VISUALIZER_VERTEX_SHADER = `
uniform sampler2D uAudioTexture;
uniform float uTime;
uniform float uBassBoost; // e.g. 1.5
uniform float uTrebleBoost; // e.g. 2.0
uniform bool uSineCrown; // Toggle mode

attribute float aIndex; // Normalized index 0..1

varying float vAmplitude;
varying vec2 vUv;

// Constants for Lissajous
const float A = 10.0;
const float B = 10.0;
const float a = 3.0;
const float b = 2.0;
const float delta = 1.57; // Phase shift

void main() {
    vUv = uv;
    
    // --- Signal Processing ---
    
    // 1. Logarithmic X-Axis Sampling
    // Map linear index (0..1) to exponential frequency lookup
    // pow(t, 4.0) pushes more resolution to low frequencies (bass) if t goes 0->1?
    // Actually, if we want to distribute bass (low freq) vs treble (high freq),
    // and the texture is linear frequency (0=low, 1=high).
    // If we use linear t, we get linear frequencies.
    // If we use pow(t, 4.0), t=0.5 -> 0.06 (low freq). t=0.9 -> 0.65. 
    // This spreads out the low frequencies across the t range. Correct.
    float sampleX = pow(aIndex, 4.0);
    
    // 2. Sample Audio
    float rawAmp = texture2D(uAudioTexture, vec2(sampleX, 0.0)).r;
    
    // 3. Gamma Correction
    // Clean up noise floor
    float cleanAmp = pow(rawAmp, 2.5);
    
    // 4. Frequency Boost
    // Linearly multiply high-frequency amplitudes
    // sampleX is 0 (bass) to 1 (treble).
    float boost = mix(1.0, 3.0, sampleX); // Simple linear boost
    float finalAmp = cleanAmp * boost;
    
    vAmplitude = finalAmp; // Pass to fragment for coloring

    // --- Lissajous Math ---
    
    // Parametric equations
    // We use aIndex as the 't' parameter along the curve, plus time for animation.
    float t = aIndex * 6.28318 * 10.0 + uTime * 0.5; // 10 loops
    
    // Modulate radius/amplitude with audio
    // Base radius + audio displacement
    float r = 5.0 + finalAmp * 10.0; 
    
    float x = r * sin(a * t + delta);
    float y = r * sin(b * t);
    float z = r * cos(a * t); // Adding Z depth for 3D
    
    vec3 pos = vec3(x, y, z);

    // --- Sine Crown Mode ---
    if (uSineCrown) {
        // Map to cylinder: x -> theta, y -> y, z -> radius
        // Normalize x to angle
        float theta = (aIndex * 6.28318 * 2.0); // Full circle
        
        // Map Y to Y (height)
        float height = y;
        
        // Map Z (or Amplitude) to Radius
        float radius = 10.0 + finalAmp * 20.0;
        
        pos.x = radius * cos(theta);
        pos.z = radius * sin(theta);
        pos.y = height;
    }

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
}
`;

/**
 * Visualizer Fragment Shader
 * Simple coloring based on amplitude.
 */
const VISUALIZER_FRAGMENT_SHADER = `
varying float vAmplitude;

void main() {
    // Color based on amplitude (Heatmap style: Blue -> Red -> White)
    vec3 color = mix(vec3(0.0, 0.5, 1.0), vec3(1.0, 0.0, 0.5), vAmplitude);
    color = mix(color, vec3(1.0, 1.0, 1.0), smoothstep(0.8, 1.0, vAmplitude));
    
    gl_FragColor = vec4(color, 1.0);
}
`;

export class LissajousVisualizer {
    private renderer: THREE.WebGLRenderer;
    private analyser: THREE.AudioAnalyser;
    private audioTexture: THREE.DataTexture;
    
    // GPGPU
    private gpgpuScene: THREE.Scene;
    private gpgpuCamera: THREE.OrthographicCamera;
    private gpgpuMaterial: THREE.ShaderMaterial;
    private pingPongBuffers: [THREE.WebGLRenderTarget, THREE.WebGLRenderTarget];
    private currentBufferIndex: number = 0;

    // Visualizer
    private visualizerMesh: THREE.Line;
    private visualizerMaterial: THREE.ShaderMaterial;
    private geometry: THREE.BufferGeometry;

    constructor(renderer: THREE.WebGLRenderer, audio: THREE.Audio) {
        this.renderer = renderer;
        
        // 1. Audio Pipeline Setup
        this.analyser = new THREE.AudioAnalyser(audio, 2048);
        const fftSize = this.analyser.analyser.fftSize;
        const dataSize = fftSize / 2;
        
        // Initialize DataTexture
        const data = new Uint8Array(dataSize);
        this.audioTexture = new THREE.DataTexture(
            data, 
            dataSize, 
            1, 
            THREE.RedFormat, 
            THREE.UnsignedByteType
        );
        this.audioTexture.magFilter = THREE.LinearFilter;
        this.audioTexture.minFilter = THREE.LinearFilter;

        // 2. GPGPU Setup
        this.gpgpuScene = new THREE.Scene();
        this.gpgpuCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
        
        // Ping-Pong Buffers
        const renderTargetParams = {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RedFormat,
            type: THREE.FloatType, // Float for precision in smoothing
            depthBuffer: false,
            stencilBuffer: false
        };
        
        this.pingPongBuffers = [
            new THREE.WebGLRenderTarget(dataSize, 1, renderTargetParams),
            new THREE.WebGLRenderTarget(dataSize, 1, renderTargetParams)
        ];

        this.gpgpuMaterial = new THREE.ShaderMaterial({
            vertexShader: GPGPU_VERTEX_SHADER,
            fragmentShader: GPGPU_FRAGMENT_SHADER,
            uniforms: {
                uRawAudio: { value: this.audioTexture },
                uPreviousFrame: { value: null },
                uSmoothingTime: { value: 0.1 },
                uResolution: { value: new THREE.Vector2(dataSize, 1) }
            }
        });

        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.gpgpuMaterial);
        this.gpgpuScene.add(quad);

        // 3. Visualizer Geometry Setup
        const vertexCount = 20000;
        this.geometry = new THREE.BufferGeometry();
        
        const positions = new Float32Array(vertexCount * 3);
        const indices = new Float32Array(vertexCount);
        
        for (let i = 0; i < vertexCount; i++) {
            indices[i] = i / (vertexCount - 1); // Normalized index 0..1
            positions[i * 3] = 0;
            positions[i * 3 + 1] = 0;
            positions[i * 3 + 2] = 0;
        }
        
        this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        this.geometry.setAttribute('aIndex', new THREE.BufferAttribute(indices, 1));

        this.visualizerMaterial = new THREE.ShaderMaterial({
            vertexShader: VISUALIZER_VERTEX_SHADER,
            fragmentShader: VISUALIZER_FRAGMENT_SHADER,
            uniforms: {
                uAudioTexture: { value: null }, // Will be set to GPGPU output
                uTime: { value: 0 },
                uSineCrown: { value: false }
            },
            transparent: true,
            depthTest: false,
            blending: THREE.AdditiveBlending
        });

        this.visualizerMesh = new THREE.Line(this.geometry, this.visualizerMaterial);
    }

    public getMesh(): THREE.Line {
        return this.visualizerMesh;
    }

    public setMode(isSineCrown: boolean) {
        this.visualizerMaterial.uniforms.uSineCrown.value = isSineCrown;
    }

    public update(dt: number) {
        // 1. Update Audio Data
        const data = this.analyser.getFrequencyData();
        this.audioTexture.image.data.set(data);
        this.audioTexture.needsUpdate = true;

        // 2. GPGPU Pass (Ping-Pong)
        const readBuffer = this.pingPongBuffers[this.currentBufferIndex];
        const writeBuffer = this.pingPongBuffers[1 - this.currentBufferIndex];
        
        this.gpgpuMaterial.uniforms.uRawAudio.value = this.audioTexture;
        this.gpgpuMaterial.uniforms.uPreviousFrame.value = readBuffer.texture;
        
        // Render to writeBuffer
        const currentRenderTarget = this.renderer.getRenderTarget();
        this.renderer.setRenderTarget(writeBuffer);
        this.renderer.render(this.gpgpuScene, this.gpgpuCamera);
        this.renderer.setRenderTarget(currentRenderTarget); // Restore

        // Swap buffers
        this.currentBufferIndex = 1 - this.currentBufferIndex;

        // 3. Update Visualizer Uniforms
        this.visualizerMaterial.uniforms.uAudioTexture.value = writeBuffer.texture;
        this.visualizerMaterial.uniforms.uTime.value += dt;
    }

    public dispose() {
        this.geometry.dispose();
        this.visualizerMaterial.dispose();
        this.gpgpuMaterial.dispose();
        this.audioTexture.dispose();
        this.pingPongBuffers[0].dispose();
        this.pingPongBuffers[1].dispose();
    }
}

export const LissajousVisualizerComponent = ({ audio, mode }: { audio: THREE.Audio, mode: 'lissajous' | 'crown' }) => {
    const { gl, scene } = useThree();
    const visualizerRef = useRef<LissajousVisualizer | null>(null);
    
    useEffect(() => {
        if (!audio) return;
        const viz = new LissajousVisualizer(gl, audio);
        scene.add(viz.getMesh());
        visualizerRef.current = viz;
        
        return () => {
            scene.remove(viz.getMesh());
            viz.dispose();
        };
    }, [gl, scene, audio]);

    useEffect(() => {
        if (visualizerRef.current) {
            visualizerRef.current.setMode(mode === 'crown');
        }
    }, [mode]);

    useFrame((state, delta) => {
        if (visualizerRef.current) {
            visualizerRef.current.update(delta);
        }
    });

    return null;
};
