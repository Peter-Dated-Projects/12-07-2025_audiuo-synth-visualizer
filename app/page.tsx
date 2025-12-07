"use client";

import { useState, useRef, useEffect } from "react";
import Scene from "../components/Scene";

export default function Home() {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [volume, setVolume] = useState(0.5);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAudioFile(file);
      setIsPlaying(false);

      if (audioRef.current) {
        const url = URL.createObjectURL(file);
        audioRef.current.src = url;
        audioRef.current.load();
      }
    }
  };

  const togglePlay = () => {
    if (audioFile && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
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

  const handleEnded = () => {
    setIsPlaying(false);
  };

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  return (
    <main className="w-screen h-screen bg-black flex flex-col items-center p-8 gap-8 overflow-hidden">
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
      />

      {/* Visualizer Section - Top 75% */}
      <div className="w-full h-[70%] flex items-center justify-center relative">
        <div className="relative aspect-[4/3] h-full max-w-full bg-black rounded-[3rem] overflow-hidden border-4 border-zinc-800 shadow-[0_0_50px_rgba(255,0,0,0.2)]">
          <div className="absolute inset-0 pointer-events-none z-10 rounded-[3rem] shadow-[inset_0_0_100px_rgba(0,0,0,0.9)]"></div>
          <Scene />
        </div>
      </div>

      {/* Controls Section - Bottom part */}
      <div className="w-full flex-1 flex flex-col items-center justify-start gap-6 text-zinc-200 z-20">
        {/* File Input */}
        <div className="flex flex-col items-center gap-2">
          <label
            htmlFor="audio-upload"
            className="cursor-pointer px-6 py-3 bg-zinc-900 border border-zinc-700 rounded-full hover:bg-zinc-800 hover:border-red-500/50 transition-all duration-300 text-sm font-medium tracking-wider uppercase"
          >
            {audioFile ? audioFile.name : "Select Audio File"}
          </label>
          <input
            id="audio-upload"
            ref={fileInputRef}
            type="file"
            accept="audio/*"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        {/* Playback Controls */}
        <div className="flex flex-col items-center gap-4 w-full max-w-md">
          {/* Progress Bar */}
          <div className="w-full flex items-center gap-3 text-xs font-mono text-zinc-500">
            <span>{formatTime(currentTime)}</span>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              disabled={!audioFile}
              className="flex-1 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:hover:shadow-[0_0_10px_rgba(255,0,0,0.5)]"
            />
            <span>{formatTime(duration)}</span>
          </div>

          <div className="flex items-center gap-8">
            <button
              onClick={togglePlay}
              disabled={!audioFile}
              className={`w-16 h-16 flex items-center justify-center rounded-full border-2 transition-all duration-300 ${
                audioFile
                  ? "border-red-500 text-red-500 hover:bg-red-500/10 hover:shadow-[0_0_20px_rgba(255,0,0,0.4)]"
                  : "border-zinc-800 text-zinc-800 cursor-not-allowed"
              }`}
            >
              {isPlaying ? (
                <div className="w-4 h-4 flex gap-1">
                  <div className="w-1.5 h-full bg-current"></div>
                  <div className="w-1.5 h-full bg-current"></div>
                </div>
              ) : (
                <div className="w-0 h-0 border-t-[8px] border-t-transparent border-l-[14px] border-l-current border-b-[8px] border-b-transparent ml-1"></div>
              )}
            </button>

            {/* Volume Slider */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono text-zinc-500">VOL</span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                className="w-32 h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-red-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:hover:shadow-[0_0_10px_rgba(255,0,0,0.5)]"
              />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
