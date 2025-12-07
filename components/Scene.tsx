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
import AudioVisualizerEngine from "./AudioVisualizerEngine";
import LissajousVisualizer from "./LissajousVisualizer";
import { HarmonicVisualizer, HarmonicMaterialType } from "./HarmonicVisualizer";
import { AudioNormalizer } from "../utils/AudioNormalizer";
import * as THREE from "three";
import { useRef, useState, useEffect, useMemo } from "react";

interface FrequencyBand {
  id: string;
  label: string;
  min: number;
  max: number;
  color: string;
  amplitude: number;
}

interface SceneContentProps {
  bands: FrequencyBand[];
  mode: "points" | "lines";
  analyser?: AnalyserNode | null;
  visualizerType?: "spectrum" | "lissajous" | "harmonic";
  getFrequencyData?: () => { bass: number; mid: number; treble: number };
}

function SceneContent({
  bands,
  mode,
  analyser,
  visualizerType = "spectrum",
  getFrequencyData,
}: SceneContentProps) {
  const { camera } = useThree();
  const initialCameraPos = useRef<THREE.Vector3 | null>(null);

  // Unified Audio Normalizer
  const normalizer = useMemo(() => new AudioNormalizer(1024), []);
  const rawData = useMemo(() => new Uint8Array(1024), []);

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
    // Update Audio Normalizer
    if (analyser) {
      analyser.getByteFrequencyData(rawData);
      normalizer.update(rawData);
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
      <color attach="background" args={["#000000"]} />
      {analyser &&
        (visualizerType === "lissajous" ? (
          <LissajousVisualizer bands={bands} normalizedData={normalizer.normalizedData} />
        ) : visualizerType === "harmonic" ? (
          <HarmonicVisualizer
            mode={mode}
            analyser={analyser}
            bands={bands}
            audioTexture={normalizer.texture}
            normalizedData={normalizer.normalizedData}
          />
        ) : (
          <AudioVisualizerEngine
            analyser={analyser}
            bands={bands}
            audioTexture={normalizer.texture}
          />
        ))}
      <EffectComposer multisampling={0} disableNormalPass autoClear={true}>
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
  bands: FrequencyBand[];
  mode?: "points" | "lines";
  analyser?: AnalyserNode | null;
  visualizerType?: "spectrum" | "lissajous" | "harmonic";
  getFrequencyData?: () => { bass: number; mid: number; treble: number };
}

export default function Scene({
  bands,
  mode = "points",
  analyser,
  visualizerType = "spectrum",
  getFrequencyData,
}: SceneProps) {
  return (
    <Canvas
      camera={{ position: [0, 0, 20], fov: 40 }}
      style={{ background: "black", width: "100%", height: "100%" }}
      dpr={[1, 2]}
      frameloop="always"
      gl={{ alpha: false, antialias: false, powerPreference: "high-performance", stencil: false, depth: true }}
    >
      <SceneContent
        bands={bands}
        mode={mode}
        analyser={analyser}
        visualizerType={visualizerType}
        getFrequencyData={getFrequencyData}
      />
    </Canvas>
  );
}
