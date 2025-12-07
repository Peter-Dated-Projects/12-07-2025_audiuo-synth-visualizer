import * as THREE from "three";
import { useFrame, useThree } from "@react-three/fiber";
import React, { useEffect, useRef, useMemo } from "react";
import GUI from "lil-gui";

const LISSAJOUS_VERTEX_SHADER = `
uniform float uTime;
uniform float uBass;
uniform float uMid;
uniform float uTreble;
uniform float uA; // Parameter a
uniform float uB; // Parameter b
uniform float uDelta; // Phase shift

attribute float aIndex; // 0..1

varying vec3 vColor;

#define PI 3.14159265359

void main() {
    float t = aIndex * 2.0 * PI * 10.0; // Wrap multiple times
    
    // Lissajous Parametric Equations
    // x = A * sin(a*t + delta)
    // y = B * sin(b*t)
    
    // Modulate amplitude with audio
    float ampBase = 5.0;
    float ampX = ampBase + uBass * 5.0;
    float ampY = ampBase + uMid * 5.0;
    float ampZ = ampBase + uTreble * 5.0; // Use Z for 3D effect
    
    // Add some movement to parameters
    float timeOffset = uTime * 0.5;
    
    float x = ampX * sin(uA * t + uDelta + timeOffset);
    float y = ampY * sin(uB * t);
    float z = ampZ * sin((uA + uB) * 0.5 * t + timeOffset); // 3D variation
    
    vec3 pos = vec3(x, y, z);
    
    // Color based on position/index
    vec3 color1 = vec3(1.0, 0.2, 0.2); // Red
    vec3 color2 = vec3(0.2, 0.5, 1.0); // Blue
    vColor = mix(color1, color2, sin(t * 0.5) * 0.5 + 0.5);
    
    // Add brightness based on audio
    vColor += vec3(uBass + uMid + uTreble) * 0.2;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const LISSAJOUS_FRAGMENT_SHADER = `
varying vec3 vColor;

void main() {
    gl_FragColor = vec4(vColor, 1.0);
}
`;

interface LissajousVisualizerProps {
  analyser: AnalyserNode;
}

export default function LissajousVisualizer({ analyser }: LissajousVisualizerProps) {
  const { gl } = useThree();
  
  // Audio Data Arrays
  const dataArrays = useMemo(() => {
    const bufferLength = analyser.frequencyBinCount;
    return {
      freq: new Uint8Array(bufferLength),
      wave: new Uint8Array(analyser.fftSize)
    };
  }, [analyser]);

  // Geometry
  const geometry = useMemo(() => {
    const count = 10000; // Number of points in the line
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const indices = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      indices[i] = i / (count - 1);
    }

    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("aIndex", new THREE.BufferAttribute(indices, 1));
    return geo;
  }, []);

  // Material
  const material = useMemo(() => {
    return new THREE.ShaderMaterial({
      vertexShader: LISSAJOUS_VERTEX_SHADER,
      fragmentShader: LISSAJOUS_FRAGMENT_SHADER,
      uniforms: {
        uTime: { value: 0 },
        uBass: { value: 0 },
        uMid: { value: 0 },
        uTreble: { value: 0 },
        uA: { value: 3.0 },
        uB: { value: 2.0 },
        uDelta: { value: 1.57 }, // PI/2
      },
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
  }, []);

  // Mesh
  const mesh = useMemo(() => {
    return new THREE.Line(geometry, material);
  }, [geometry, material]);

  const materialRef = useRef<THREE.ShaderMaterial>(material);
  const params = useRef({
    a: 3.0,
    b: 2.0,
    delta: Math.PI / 2,
    speed: 0.5
  });

  // GUI
  useEffect(() => {
    const container = document.getElementById("visualizer-controls-container");
    // Clear previous controls if any (simple way, though might conflict if multiple components use it)
    // Ideally we'd manage this better, but for now:
    if (container) container.innerHTML = ''; 

    const gui = new GUI({
      title: "Lissajous Settings",
      container: container || undefined,
    });

    if (container) {
      gui.domElement.style.position = "relative";
      gui.domElement.style.width = "100%";
    }

    gui.add(params.current, "a", 1, 10, 1).name("Freq X (a)");
    gui.add(params.current, "b", 1, 10, 1).name("Freq Y (b)");
    gui.add(params.current, "delta", 0, Math.PI * 2).name("Phase (delta)");
    gui.add(params.current, "speed", 0, 2).name("Animation Speed");

    return () => {
      gui.destroy();
    };
  }, []);

  useFrame((state) => {
    // Analyze Audio
    analyser.getByteFrequencyData(dataArrays.freq);
    
    // Calculate average bands
    // Bass: 0-10
    // Mid: 11-100
    // Treble: 101-255 (approx)
    
    let bassSum = 0, midSum = 0, trebleSum = 0;
    let bassCount = 0, midCount = 0, trebleCount = 0;
    
    for(let i=0; i<dataArrays.freq.length; i++) {
        const val = dataArrays.freq[i] / 255.0;
        if(i < 10) { bassSum += val; bassCount++; }
        else if(i < 100) { midSum += val; midCount++; }
        else { trebleSum += val; trebleCount++; }
    }
    
    const bass = bassCount > 0 ? bassSum / bassCount : 0;
    const mid = midCount > 0 ? midSum / midCount : 0;
    const treble = trebleCount > 0 ? trebleSum / trebleCount : 0;

    // Update Uniforms
    const mat = materialRef.current;
    mat.uniforms.uTime.value = state.clock.elapsedTime * params.current.speed;
    mat.uniforms.uBass.value = THREE.MathUtils.lerp(mat.uniforms.uBass.value, bass, 0.1);
    mat.uniforms.uMid.value = THREE.MathUtils.lerp(mat.uniforms.uMid.value, mid, 0.1);
    mat.uniforms.uTreble.value = THREE.MathUtils.lerp(mat.uniforms.uTreble.value, treble, 0.1);
    
    mat.uniforms.uA.value = params.current.a;
    mat.uniforms.uB.value = params.current.b;
    mat.uniforms.uDelta.value = params.current.delta;
  });

  return <primitive object={mesh} />;
}
