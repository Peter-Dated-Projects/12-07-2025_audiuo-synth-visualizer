"use client";

import { useState, useRef, useEffect } from "react";
import Scene from "../components/Scene";
import { useAudioAnalyzer, getSettingsFromDB, saveSettingsToDB } from "../hooks/useAudioAnalyzer";
import { Sidebar, FrequencyAnalysisSettings } from "../components/Sidebar";
import { SpectrumAnalyzer } from "../components/SpectrumAnalyzer";

interface FrequencyBand {
  id: string;
  label: string;
  min: number;
  max: number;
  color: string;
  amplitude: number;
}

// 4 Frequency Bands matching MultiBandAnalyzer architecture
// Bass: <250Hz (bins 0-5), Mids: 250-4kHz (bins 6-80), Highs: >4kHz (bins 81-255), Melody: FFT-enhanced
const DEFAULT_BANDS: FrequencyBand[] = [
  { id: "bass", label: "Bass", min: 0, max: 5, color: "#ff0000", amplitude: 1.0 },
  { id: "mids", label: "Mids", min: 6, max: 80, color: "#00ff00", amplitude: 1.0 },
  { id: "highs", label: "Highs", min: 81, max: 180, color: "#0088ff", amplitude: 1.0 },
  { id: "melody", label: "Melody", min: 0, max: 255, color: "#00ffff", amplitude: 0.8 },
];

// Presets for quick configuration
const BAND_PRESETS: Record<string, FrequencyBand[]> = {
  default: DEFAULT_BANDS,
  "wide-range": [
    { id: "bass", label: "Bass", min: 0, max: 8, color: "#ff0000", amplitude: 1.2 },
    { id: "mids", label: "Mids", min: 9, max: 100, color: "#00ff00", amplitude: 0.9 },
    { id: "highs", label: "Highs", min: 101, max: 200, color: "#0088ff", amplitude: 1.5 },
    { id: "melody", label: "Melody", min: 0, max: 255, color: "#00ffff", amplitude: 1.0 },
  ],
  "bass-focused": [
    { id: "bass", label: "Bass", min: 0, max: 15, color: "#ff0000", amplitude: 1.5 },
    { id: "mids", label: "Mids", min: 16, max: 70, color: "#00ff00", amplitude: 0.6 },
    { id: "highs", label: "Highs", min: 71, max: 150, color: "#0088ff", amplitude: 0.8 },
    { id: "melody", label: "Melody", min: 0, max: 255, color: "#00ffff", amplitude: 0.5 },
  ],
  "highs-focused": [
    { id: "bass", label: "Bass", min: 0, max: 3, color: "#ff0000", amplitude: 0.5 },
    { id: "mids", label: "Mids", min: 4, max: 60, color: "#00ff00", amplitude: 0.7 },
    { id: "highs", label: "Highs", min: 61, max: 220, color: "#0088ff", amplitude: 2.0 },
    { id: "melody", label: "Melody", min: 0, max: 255, color: "#00ffff", amplitude: 0.6 },
  ],
  balanced: [
    { id: "bass", label: "Bass", min: 0, max: 6, color: "#ff0000", amplitude: 1.0 },
    { id: "mids", label: "Mids", min: 7, max: 85, color: "#00ff00", amplitude: 1.0 },
    { id: "highs", label: "Highs", min: 86, max: 170, color: "#0088ff", amplitude: 1.2 },
    { id: "melody", label: "Melody", min: 0, max: 255, color: "#00ffff", amplitude: 0.9 },
  ],
};

export default function Home() {
  const {
    audioRef,
    isPlaying,
    isLooping,
    audioUrl,
    loadFile,
    togglePlay,
    toggleLoop,
    analyser,
    setGlobalVolume,
    isReady,
    getFrequencyData,
    startSystemAudio,
    stopSystemAudio,
    isSystemAudio,
  } = useAudioAnalyzer();

  const [volume, setVolume] = useState(0.5);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [mode, setMode] = useState<"points" | "lines">("points");
  const [visualizerType, setVisualizerType] = useState<"spectrum" | "lissajous" | "harmonic">(
    "spectrum"
  );
  const [bands, setBands] = useState<FrequencyBand[]>(DEFAULT_BANDS);
  const [currentPreset, setCurrentPreset] = useState<string>("default");
  const [frequencySettings, setFrequencySettings] = useState<FrequencyAnalysisSettings>({
    useDynamicFreq: true,
    method: "band_power",
    baseFrequency: 3.0,
    multiplier: 5.0,
    minFreq: 1.0,
    maxFreq: 12.0,
    smoothing: 0.1,
  });

  // Handle preset changes
  const handlePresetChange = async (presetName: string) => {
    const preset = BAND_PRESETS[presetName];
    if (preset) {
      // Preserve current colors
      const newBands = preset.map((presetBand) => {
        const currentBand = bands.find((b) => b.id === presetBand.id);
        return currentBand ? { ...presetBand, color: currentBand.color } : presetBand;
      });

      setBands(newBands);
      setCurrentPreset(presetName);

      // Save to DB
      const currentSettings = (await getSettingsFromDB()) || {};
      await saveSettingsToDB({ ...currentSettings, bands: newBands, currentPreset: presetName });
    }
  };

  // Load cached bands and frequency settings on mount
  useEffect(() => {
    const loadCachedSettings = async () => {
      const settings = await getSettingsFromDB();
      if (settings) {
        if (settings.bands) {
          setBands(settings.bands);
        }
        if (settings.currentPreset) {
          setCurrentPreset(settings.currentPreset);
        }
        if (settings.frequencySettings) {
          setFrequencySettings(settings.frequencySettings);
        }
      }
    };
    loadCachedSettings();
  }, []);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      loadFile(e.target.files[0]);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  useEffect(() => {
    if (audioRef.current) {
      // Ensure the audio element volume is maxed out so the source gets full signal
      // The actual output volume is controlled by the GainNode via setGlobalVolume
      audioRef.current.volume = 1.0;
    }
    setGlobalVolume(volume);
  }, [volume, audioRef, setGlobalVolume, isReady]);

  // Add keyboard shortcut for play/pause
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        // Check if the active element is an input or textarea to avoid conflict
        const activeElement = document.activeElement;
        const isInput =
          activeElement instanceof HTMLInputElement || activeElement instanceof HTMLTextAreaElement;

        if (!isInput) {
          e.preventDefault(); // Prevent scrolling
          togglePlay();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [togglePlay]);

  const handleBandChange = async (id: string, newBand: Partial<FrequencyBand>) => {
    setBands((prev) => {
      const newBands = prev.map((b) => (b.id === id ? { ...b, ...newBand } : b));

      // Save to DB
      // We need to do this asynchronously, but we can't await inside the setState callback
      // So we fire and forget, but we need the latest state.
      // A cleaner way is to use an effect or just call the async function with the new value.
      (async () => {
        const currentSettings = (await getSettingsFromDB()) || {};
        await saveSettingsToDB({ ...currentSettings, bands: newBands });
      })();

      return newBands;
    });
  };

  const handleFrequencySettingsChange = async (newSettings: Partial<FrequencyAnalysisSettings>) => {
    setFrequencySettings((prev) => {
      const updated = { ...prev, ...newSettings };

      // Save to DB
      (async () => {
        const currentSettings = (await getSettingsFromDB()) || {};
        await saveSettingsToDB({ ...currentSettings, frequencySettings: updated });
      })();

      return updated;
    });
  };

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <main className="w-screen h-screen bg-black flex overflow-hidden">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={() => togglePlay()}
      />

      {/* Left Side: Visualizer + Controls */}
      <div className="flex-1 flex flex-col h-full relative">
        {/* Main Visualizer Area */}
        <div className="flex-1 relative bg-black overflow-hidden">
          <div className="absolute inset-0 z-0">
            <Scene
              bands={bands}
              mode={mode}
              analyser={analyser}
              visualizerType={visualizerType}
              getFrequencyData={getFrequencyData}
            />
          </div>

          {/* Overlay Controls (Top Left) */}
          <div className="absolute top-4 left-4 z-20 flex gap-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isSystemAudio}
              className={`px-4 py-2 backdrop-blur border rounded-full text-xs font-mono uppercase transition-colors ${
                isSystemAudio
                  ? "bg-zinc-900/40 border-zinc-800 text-zinc-600 cursor-not-allowed"
                  : "bg-zinc-900/80 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {audioUrl ? "Change File" : "Select File"}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*"
              onChange={handleFileChange}
              className="hidden"
            />

            <button
              onClick={isSystemAudio ? stopSystemAudio : startSystemAudio}
              className={`px-4 py-2 backdrop-blur border rounded-full text-xs font-mono uppercase transition-colors ${
                isSystemAudio
                  ? "bg-red-900/80 border-red-700 text-red-300 hover:bg-red-800"
                  : "bg-zinc-900/80 border-zinc-700 text-zinc-300 hover:bg-zinc-800"
              }`}
            >
              {isSystemAudio ? "Stop System Audio" : "Use System Audio"}
            </button>
          </div>
        </div>

        {/* Bottom Control Bar & Spectrum */}
        <div className="h-auto bg-zinc-900/50 border-t border-zinc-800 backdrop-blur-md flex flex-col">
          {/* Spectrum Analyzer */}
          <div className="w-full h-[125px] bg-black/50 border-b border-zinc-800 relative">
            <SpectrumAnalyzer analyser={analyser} bands={bands} onBandChange={handleBandChange} />
          </div>

          {/* Playback Controls */}
          <div className="p-4 flex items-center gap-6 justify-center">
            {isSystemAudio ? (
              <div className="flex items-center gap-2 px-4 py-2 bg-red-900/20 border border-red-900/50 rounded-full mr-4">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs font-mono text-red-400 uppercase tracking-wider">
                  System Audio Live
                </span>
              </div>
            ) : (
              <>
                <button
                  onClick={togglePlay}
                  className="w-12 h-12 flex items-center justify-center rounded-full bg-zinc-100 text-black hover:scale-105 transition-transform"
                >
                  {isPlaying ? (
                    <div className="w-3 h-3 bg-black gap-1 flex">
                      <div className="w-1 h-full bg-black"></div>
                      <div className="w-1 h-full bg-black"></div>
                    </div>
                  ) : (
                    <div className="w-0 h-0 border-t-[6px] border-t-transparent border-l-[10px] border-l-black border-b-[6px] border-b-transparent ml-1"></div>
                  )}
                </button>

                <div className="flex flex-col gap-1 w-96">
                  <input
                    type="range"
                    min="0"
                    max={duration || 100}
                    value={currentTime}
                    onChange={handleSeek}
                    className="w-full h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
                  />
                  <div className="flex justify-between text-[10px] font-mono text-zinc-500">
                    <span>{formatTime(currentTime)}</span>
                    <span>{formatTime(duration)}</span>
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center gap-2">
              <span className="text-[10px] font-mono text-zinc-500">VOL</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-20 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
              />
            </div>

            {!isSystemAudio && (
              <button
                onClick={toggleLoop}
                className={`px-3 py-1 rounded text-xs font-mono uppercase border transition-colors ${
                  isLooping
                    ? "bg-green-500/20 border-green-500 text-green-500"
                    : "bg-transparent border-zinc-700 text-zinc-500 hover:border-zinc-500"
                }`}
              >
                Loop
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      <Sidebar
        bands={bands}
        onBandChange={handleBandChange}
        visualizerType={visualizerType}
        onVisualizerTypeChange={setVisualizerType}
        frequencySettings={frequencySettings}
        onFrequencySettingsChange={handleFrequencySettingsChange}
        presets={BAND_PRESETS}
        currentPreset={currentPreset}
        onPresetChange={handlePresetChange}
      />
    </main>
  );
}
