"use client";

import { Canvas, useFrame } from "@react-three/fiber";
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
import { useRef, useState } from "react";

function SceneContent() {
  const materialRef = useRef<HarmonicMaterialType>(null);

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
    }

    // Smooth camera movement with random offsets
    const t = state.clock.elapsedTime;
    const { x, y } = movementParams;

    state.camera.position.x =
      Math.sin(t * x.freq1 + x.offset1) * x.amp + Math.cos(t * x.freq2 + x.offset2) * (x.amp * 0.5);

    state.camera.position.y =
      Math.cos(t * y.freq1 + y.offset1) * y.amp + Math.sin(t * y.freq2 + y.offset2) * (y.amp * 0.5);

    state.camera.position.z = 8 + Math.sin(t * 0.1) * 0.5;
    state.camera.lookAt(0, 0, 0);
  });

  return (
    <>
      <HarmonicVisualizer ref={materialRef} />
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

export default function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 60 }}
      style={{ background: "black", width: "100%", height: "100%" }}
      dpr={[1, 2]}
      frameloop="always"
    >
      <SceneContent />
    </Canvas>
  );
}
