"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  EffectComposer,
  Bloom,
  Scanline,
  Noise,
  Vignette,
  ChromaticAberration,
} from "@react-three/postprocessing";
import { BlendFunction } from "postprocessing";
import { HarmonicVisualizer } from "./HarmonicShader";
import * as THREE from "three";
import { useRef } from "react";

export default function Scene() {
  const orbitRef = useRef<THREE.OrbitControls>(null);

  useFrame(() => {
    // This forces the controls to update every single frame
    // allowing the damping physics to calculate
    orbitRef.current?.update();
  });

  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 60 }}
      style={{ background: "black", width: "100%", height: "100%" }}
      dpr={[1, 2]}
    >
      <HarmonicVisualizer />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.05}
        rotateSpeed={0.2}
        minAzimuthAngle={-25 * (Math.PI / 180)}
        maxAzimuthAngle={25 * (Math.PI / 180)}
        minPolarAngle={Math.PI / 2 - 25 * (Math.PI / 180)}
        maxPolarAngle={Math.PI / 2 + 25 * (Math.PI / 180)}
      />
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
    </Canvas>
  );
}
