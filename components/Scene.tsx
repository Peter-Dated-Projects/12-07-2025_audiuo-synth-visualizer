"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import { HarmonicVisualizer } from "./HarmonicShader";

export default function Scene() {
  return (
    <Canvas
      camera={{ position: [0, 0, 8], fov: 60 }}
      style={{ background: "black", width: "100vw", height: "100vh" }}
      dpr={[1, 2]}
    >
      <HarmonicVisualizer />
      <OrbitControls />
      <EffectComposer>
        <Bloom intensity={2.0} luminanceThreshold={0.1} luminanceSmoothing={0.9} />
      </EffectComposer>
    </Canvas>
  );
}
