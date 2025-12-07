"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  EffectComposer,
  Bloom,
  Scanline,
  Noise,
  Vignette,
  ChromaticAberration,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { HarmonicVisualizer, HarmonicMaterialType } from "./HarmonicShader";
import * as THREE from "three";
import { useRef, useState, useEffect } from "react";

interface SceneContentProps {
  getFrequencyData?: () => { bass: number; mid: number; treble: number };
  mode: "points" | "lines";
  analyser?: AnalyserNode | null;
}

// 1. DEFINE THE "BEAUTIFUL" PRESETS
const PRESETS = {
  IDLE: new THREE.Vector3(1, 1, 1), // Circle
  BASS: new THREE.Vector3(3, 4, 5), // Major Triad
  MID: new THREE.Vector3(5, 7, 9), // Complex/Jazz
  PEAK: new THREE.Vector3(10, 12, 15), // Dense/Minor
};

function SceneContent({ getFrequencyData, mode, analyser }: SceneContentProps) {
  const materialRef = useRef<HarmonicMaterialType>(null);
  const { camera } = useThree();
  const initialCameraPos = useRef<THREE.Vector3 | null>(null);

  // Store the current state of the shape
  const currentRatios = useRef(new THREE.Vector3(1, 1, 1));
  const targetVector = useRef(PRESETS.IDLE);

  // Capture initial camera position once
  useEffect(() => {
    initialCameraPos.current = camera.position.clone();
  }, [camera]);

  // Generate random offsets and speeds for less predictable movement
  const [movementParams] = useState(() => ({
    x: {
      freq1: 0.2 + Math.random() * 0.1,
      freq2: 0.3 + Math.random() * 0.1,
      offset1: Math.random() * Math.PI * 2,
      offset2: Math.random() * Math.PI * 2,
      amp: 0.5 + Math.random() * 0.2,
    },
    y: {
      freq1: 0.15 + Math.random() * 0.1,
      freq2: 0.25 + Math.random() * 0.1,
      offset1: Math.random() * Math.PI * 2,
      offset2: Math.random() * Math.PI * 2,
      amp: 0.5 + Math.random() * 0.2,
    },
  }));

  useFrame((state, delta) => {
    // Update shader time
    if (materialRef.current) {
      materialRef.current.uTime += delta;

      // Update audio uniforms if data is available
      if (getFrequencyData) {
        const { treble } = getFrequencyData();

        // 2. DECIDE TARGET SHAPE BASED ON TREBLE ONLY
        // We map the treble intensity to different complexity levels
        // Thresholds adjusted for the boosted treble value
        if (treble < 0.15) {
          targetVector.current = PRESETS.IDLE;
        } else if (treble < 0.45) {
          targetVector.current = PRESETS.MID; // Moderate complexity
        } else {
          targetVector.current = PRESETS.PEAK; // High complexity
        }

        // 3. SMOOTHLY INTERPOLATE (LERP)
        // We move 5% of the way to the target every frame.
        const speed = 0.05;

        currentRatios.current.lerp(targetVector.current, speed);

        // 4. UPDATE SHADER
        materialRef.current.uCurrentRatios = currentRatios.current;
      }
    }

    // Smooth camera movement with random offsets
    const t = state.clock.elapsedTime;
    const { x, y } = movementParams;

    if (initialCameraPos.current) {
      state.camera.position.x =
        initialCameraPos.current.x +
        Math.sin(t * x.freq1 + x.offset1) * x.amp +
        Math.cos(t * x.freq2 + x.offset2) * (x.amp * 0.5);

      state.camera.position.y =
        initialCameraPos.current.y +
        Math.cos(t * y.freq1 + y.offset1) * y.amp +
        Math.sin(t * y.freq2 + y.offset2) * (y.amp * 0.5);

      state.camera.position.z = initialCameraPos.current.z + Math.sin(t * 0.1) * 0.5;
    }

    state.camera.lookAt(0, 0, 0);
  });

  return (
    <>
      <HarmonicVisualizer ref={materialRef} mode={mode} analyser={analyser} />
      <EffectComposer>
        <Bloom intensity={2.5} luminanceThreshold={0.1} luminanceSmoothing={0.9} />
        <Scanline blendFunction={BlendFunction.OVERLAY} density={1.25} />
        <Noise opacity={0.15} />
        <Vignette eskil={false} offset={0.1} darkness={1.1} />
        <ChromaticAberration
          offset={new THREE.Vector2(0.002, 0.002)}
          radialModulation={false}
          modulationOffset={0}
        />
      </EffectComposer>
    </>
  );
}

interface SceneProps {
  getFrequencyData?: () => { bass: number; mid: number; treble: number };
  mode?: "points" | "lines";
  analyser?: AnalyserNode | null;
}

export default function Scene({ getFrequencyData, mode = "points", analyser }: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 20], fov: 40 }}
      style={{ background: "black", width: "100%", height: "100%" }}
      dpr={[1, 2]}
      frameloop="always"
    >
      <SceneContent getFrequencyData={getFrequencyData} mode={mode} analyser={analyser} />
    </Canvas>
  );
}
