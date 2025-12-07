"use client";

import { useState, useRef, useEffect } from "react";
import Scene from "../components/Scene";
import { useAudioAnalyzer, getSettingsFromDB, saveSettingsToDB } from "../hooks/useAudioAnalyzer";
import { Sidebar } from "../components/Sidebar";
import { SpectrumAnalyzer } from "../components/SpectrumAnalyzer";

interface FrequencyBand {
  id: string;
  label: string;
  min: number;
  max: number;
  color: string;
  amplitude: number;
}

const DEFAULT_BANDS: FrequencyBand[] = [
  { id: "bass", label: "Bass", min: 0, max: 10, color: "#ff4d00", amplitude: 1.0 },
  { id: "mid", label: "Mid", min: 11, max: 80, color: "#33cc33", amplitude: 1.0 },
  { id: "treble", label: "Treble", min: 81, max: 255, color: "#8033cc", amplitude: 1.0 },
];

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
  } = useAudioAnalyzer();

  const [volume, setVolume] = useState(0.5);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [mode, setMode] = useState<"points" | "lines">("points");
  const [bands, setBands] = useState<FrequencyBand[]>(DEFAULT_BANDS);

  // Load cached bands on mount
  useEffect(() => {
    const loadCachedBands = async () => {
      const settings = await getSettingsFromDB();
      if (settings && settings.bands) {
        setBands(settings.bands);
      }
    };
    loadCachedBands();
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
            <Scene bands={bands} mode={mode} analyser={analyser} />
          </div>

          {/* Overlay Controls (Top Left) */}
          <div className="absolute top-4 left-4 z-20 flex gap-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="px-4 py-2 bg-zinc-900/80 backdrop-blur border border-zinc-700 rounded-full text-xs font-mono uppercase hover:bg-zinc-800 transition-colors text-zinc-300"
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
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      <Sidebar bands={bands} onBandChange={handleBandChange} />
    </main>
  );
}
