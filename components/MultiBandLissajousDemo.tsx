/**
 * Multi-Band Lissajous Visualizer Demo
 *
 * Demonstrates independent Lissajous curves for each frequency band:
 * - Bass (Red): Lowpass @ 250 Hz
 * - Mids (Green): Bandpass @ 2125 Hz
 * - Highs (Blue): Highpass @ 4000 Hz
 * - Melody (Cyan): FFT-based dominant frequency
 *
 * Each band gets its own GPU-accelerated curve with stereo time-domain data.
 */

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Stats } from "@react-three/drei";
import React, { useEffect, useState } from "react";
import { useAudioAnalyzer } from "../hooks/useAudioAnalyzer";
import LissajousVisualizerGPU from "./LissajousVisualizerGPU";
import { BandData } from "../utils/MultiBandAnalyzer";

interface BandConfig {
  name: string;
  color: string;
  position: [number, number, number];
  freqX: number;
  freqY: number;
  scale: number;
}

const BAND_CONFIGS: Record<string, BandConfig> = {
  bass: {
    name: "Bass",
    color: "#ff0000",
    position: [-12, 6, 0],
    freqX: 1,
    freqY: 2,
    scale: 4,
  },
  mids: {
    name: "Mids",
    color: "#00ff00",
    position: [12, 6, 0],
    freqX: 3,
    freqY: 4,
    scale: 4,
  },
  highs: {
    name: "Highs",
    color: "#0088ff",
    position: [-12, -6, 0],
    freqX: 5,
    freqY: 6,
    scale: 4,
  },
  melody: {
    name: "Melody",
    color: "#00ffff",
    position: [12, -6, 0],
    freqX: 2,
    freqY: 3,
    scale: 4,
  },
};

function MultiBandLissajousScene() {
  const { getBandData, multiBandAnalyzer } = useAudioAnalyzer();

  // Band data state
  const [bassData, setBassData] = useState<BandData>({
    left: new Float32Array(2048),
    right: new Float32Array(2048),
    energy: 0,
  });

  const [midsData, setMidsData] = useState<BandData>({
    left: new Float32Array(2048),
    right: new Float32Array(2048),
    energy: 0,
  });

  const [highsData, setHighsData] = useState<BandData>({
    left: new Float32Array(2048),
    right: new Float32Array(2048),
    energy: 0,
  });

  const [melodyData, setMelodyData] = useState<BandData>({
    left: new Float32Array(2048),
    right: new Float32Array(2048),
    energy: 0,
  });

  // Update band data every frame
  useEffect(() => {
    if (!multiBandAnalyzer) return;

    let animationId: number;

    const updateBands = () => {
      setBassData(getBandData("bass"));
      setMidsData(getBandData("mids"));
      setHighsData(getBandData("highs"));
      setMelodyData(getBandData("melody"));

      animationId = requestAnimationFrame(updateBands);
    };

    updateBands();

    return () => cancelAnimationFrame(animationId);
  }, [multiBandAnalyzer, getBandData]);

  return (
    <>
      {/* Bass - Red */}
      <group position={BAND_CONFIGS.bass.position}>
        <LissajousVisualizerGPU
          leftChannel={bassData.left}
          rightChannel={bassData.right}
          frequencyRatioX={BAND_CONFIGS.bass.freqX}
          frequencyRatioY={BAND_CONFIGS.bass.freqY}
          enable3D={true}
          zMode="parametric"
          pointCount={4096}
          scale={BAND_CONFIGS.bass.scale * (1 + bassData.energy * 2)}
          color={BAND_CONFIGS.bass.color}
          audioBlend={0.8}
        />
      </group>

      {/* Mids - Green */}
      <group position={BAND_CONFIGS.mids.position}>
        <LissajousVisualizerGPU
          leftChannel={midsData.left}
          rightChannel={midsData.right}
          frequencyRatioX={BAND_CONFIGS.mids.freqX}
          frequencyRatioY={BAND_CONFIGS.mids.freqY}
          enable3D={true}
          zMode="time"
          pointCount={4096}
          scale={BAND_CONFIGS.mids.scale * (1 + midsData.energy * 2)}
          color={BAND_CONFIGS.mids.color}
          audioBlend={0.7}
        />
      </group>

      {/* Highs - Blue */}
      <group position={BAND_CONFIGS.highs.position}>
        <LissajousVisualizerGPU
          leftChannel={highsData.left}
          rightChannel={highsData.right}
          frequencyRatioX={BAND_CONFIGS.highs.freqX}
          frequencyRatioY={BAND_CONFIGS.highs.freqY}
          enable3D={true}
          zMode="frequency"
          pointCount={4096}
          scale={BAND_CONFIGS.highs.scale * (1 + highsData.energy * 3)}
          color={BAND_CONFIGS.highs.color}
          audioBlend={0.6}
        />
      </group>

      {/* Melody - Cyan */}
      <group position={BAND_CONFIGS.melody.position}>
        <LissajousVisualizerGPU
          leftChannel={melodyData.left}
          rightChannel={melodyData.right}
          frequencyRatioX={BAND_CONFIGS.melody.freqX}
          frequencyRatioY={BAND_CONFIGS.melody.freqY}
          enable3D={true}
          zMode="phase"
          pointCount={4096}
          scale={BAND_CONFIGS.melody.scale * (1 + melodyData.energy * 2)}
          color={BAND_CONFIGS.melody.color}
          audioBlend={0.75}
        />
      </group>

      {/* Lighting */}
      <ambientLight intensity={0.3} />
      <pointLight position={[0, 0, 20]} intensity={1} />
    </>
  );
}

export default function MultiBandLissajousDemo() {
  const { audioRef, isPlaying, togglePlay, loadFile, getBandEnergies } = useAudioAnalyzer();
  const [energies, setEnergies] = useState({ full: 0, bass: 0, mids: 0, highs: 0, melody: 0 });

  // Update energy display
  useEffect(() => {
    let animationId: number;

    const updateEnergies = () => {
      setEnergies(getBandEnergies());
      animationId = requestAnimationFrame(updateEnergies);
    };

    updateEnergies();

    return () => cancelAnimationFrame(animationId);
  }, [getBandEnergies]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadFile(file);
    }
  };

  return (
    <div style={{ width: "100vw", height: "100vh", background: "#000" }}>
      {/* Hidden Audio Element */}
      <audio ref={audioRef} style={{ display: "none" }} />

      {/* Controls */}
      <div
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          zIndex: 100,
          background: "rgba(0,0,0,0.85)",
          padding: 20,
          borderRadius: 8,
          color: "white",
          fontFamily: "monospace",
          minWidth: 300,
        }}
      >
        <h2 style={{ margin: "0 0 15px 0", fontSize: 18 }}>🎵 Multi-Band Lissajous</h2>

        <div style={{ marginBottom: 15 }}>
          <label
            style={{
              display: "block",
              marginBottom: 8,
              padding: 8,
              background: "#222",
              borderRadius: 4,
              cursor: "pointer",
              textAlign: "center",
            }}
          >
            📁 Load Audio File
            <input
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
          </label>
        </div>

        <button
          onClick={togglePlay}
          style={{
            width: "100%",
            padding: 12,
            fontSize: 16,
            background: isPlaying ? "#ff4444" : "#44ff44",
            border: "none",
            borderRadius: 4,
            color: "#000",
            cursor: "pointer",
            fontWeight: "bold",
            marginBottom: 20,
          }}
        >
          {isPlaying ? "⏸ Pause" : "▶ Play"}
        </button>

        <div style={{ fontSize: 12 }}>
          <h3 style={{ margin: "0 0 10px 0", fontSize: 14 }}>Band Energies:</h3>

          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>🔴 Bass:</span>
              <span>{(energies.bass * 100).toFixed(1)}%</span>
            </div>
            <div
              style={{
                width: "100%",
                height: 4,
                background: "#333",
                borderRadius: 2,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  width: `${energies.bass * 100}%`,
                  height: "100%",
                  background: "#ff0000",
                  borderRadius: 2,
                  transition: "width 0.1s",
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>🟢 Mids:</span>
              <span>{(energies.mids * 100).toFixed(1)}%</span>
            </div>
            <div
              style={{
                width: "100%",
                height: 4,
                background: "#333",
                borderRadius: 2,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  width: `${energies.mids * 100}%`,
                  height: "100%",
                  background: "#00ff00",
                  borderRadius: 2,
                  transition: "width 0.1s",
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>🔵 Highs:</span>
              <span>{(energies.highs * 100).toFixed(1)}%</span>
            </div>
            <div
              style={{
                width: "100%",
                height: 4,
                background: "#333",
                borderRadius: 2,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  width: `${energies.highs * 100}%`,
                  height: "100%",
                  background: "#0088ff",
                  borderRadius: 2,
                  transition: "width 0.1s",
                }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span>💠 Melody:</span>
              <span>{(energies.melody * 100).toFixed(1)}%</span>
            </div>
            <div
              style={{
                width: "100%",
                height: 4,
                background: "#333",
                borderRadius: 2,
                marginTop: 4,
              }}
            >
              <div
                style={{
                  width: `${energies.melody * 100}%`,
                  height: "100%",
                  background: "#00ffff",
                  borderRadius: 2,
                  transition: "width 0.1s",
                }}
              />
            </div>
          </div>
        </div>

        <div
          style={{
            marginTop: 15,
            paddingTop: 15,
            borderTop: "1px solid #333",
            fontSize: 11,
            opacity: 0.7,
          }}
        >
          <div>🔴 Bass: Lowpass @ 250Hz</div>
          <div>🟢 Mids: Bandpass @ 2125Hz</div>
          <div>🔵 Highs: Highpass @ 4000Hz</div>
          <div>💠 Melody: FFT Dominant Frequencies</div>
        </div>
      </div>

      {/* Stats */}
      <div style={{ position: "absolute", top: 20, right: 20, zIndex: 100 }}>
        <Stats />
      </div>

      {/* 3D Canvas */}
      <Canvas camera={{ position: [0, 0, 35], fov: 75 }}>
        <color attach="background" args={["#000"]} />
        <MultiBandLissajousScene />
        <OrbitControls />
        <gridHelper args={[60, 60, 0x333333, 0x111111]} />
      </Canvas>

      {/* Instructions */}
      <div
        style={{
          position: "absolute",
          bottom: 20,
          left: "50%",
          transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.85)",
          padding: 12,
          borderRadius: 8,
          color: "white",
          fontFamily: "monospace",
          fontSize: 11,
          textAlign: "center",
        }}
      >
        🖱️ Drag to rotate • 🔍 Scroll to zoom • Each band has independent filtering
      </div>
    </div>
  );
}

/**
 * Architecture Overview:
 *
 * Audio Source
 *   ↓
 * Channel Splitter (Stereo L/R)
 *   ↓
 * ┌─────────────┬─────────────┬─────────────┬─────────────┐
 * │   Bass      │    Mids     │   Highs     │   Melody    │
 * │ Lowpass     │  Bandpass   │  Highpass   │  FFT        │
 * │  250Hz      │  2125Hz     │  4000Hz     │  Analysis   │
 * └─────────────┴─────────────┴─────────────┴─────────────┘
 *   ↓             ↓             ↓             ↓
 * Analyser L/R  Analyser L/R  Analyser L/R  Analyser L/R
 *   ↓             ↓             ↓             ↓
 * Time Domain   Time Domain   Time Domain   Time Domain
 *   ↓             ↓             ↓             ↓
 * GPU Shader    GPU Shader    GPU Shader    GPU Shader
 *   ↓             ↓             ↓             ↓
 * Lissajous     Lissajous     Lissajous     Lissajous
 *  Curve         Curve         Curve         Curve
 */
