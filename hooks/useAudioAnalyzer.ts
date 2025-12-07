import { useRef, useState, useEffect, useCallback } from "react";

export interface AudioData {
  bass: number;
  mid: number;
  treble: number;
}

export const useAudioAnalyzer = () => {
  const audioRef = useRef<HTMLAudioElement>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Initialize Audio Context
  const initAudio = useCallback(() => {
    if (audioContextRef.current) return;

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContextClass();
    audioContextRef.current = ctx;

    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;

    if (audioRef.current) {
      const source = ctx.createMediaElementSource(audioRef.current);
      source.connect(analyser);
      analyser.connect(ctx.destination);
      sourceRef.current = source;
      setIsReady(true);
    }
  }, []);

  const loadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.load();
    }
    // Ensure context is initialized on user interaction
    initAudio();
  };

  const togglePlay = async () => {
    if (!audioContextRef.current) initAudio();
    
    if (audioContextRef.current?.state === 'suspended') {
      await audioContextRef.current.resume();
    }

    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        try {
          await audioRef.current.play();
        } catch (err) {
          console.error("Playback failed:", err);
        }
      }
      setIsPlaying(!isPlaying);
    }
  };

  const getFrequencyData = useCallback((): AudioData => {
    if (!analyserRef.current) return { bass: 0, mid: 0, treble: 0 };

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate bands (approximate ranges for 1024 FFT size)
    // Bass: 0-10 (approx 0-200Hz)
    // Mid: 11-100 (approx 200Hz-2kHz)
    // Treble: 101-511 (approx 2kHz-20kHz)
    
    const getAverage = (start: number, end: number) => {
      let sum = 0;
      for (let i = start; i < end; i++) {
        sum += dataArray[i];
      }
      return sum / (end - start);
    };

    const bass = getAverage(0, 10) / 255;
    const mid = getAverage(11, 100) / 255;
    const treble = getAverage(101, 255) / 255; // Cap treble range to avoid high-end noise

    return { bass, mid, treble };
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (audioContextRef.current) audioContextRef.current.close();
    };
  }, []);

  return {
    audioRef,
    isPlaying,
    audioUrl,
    isReady,
    loadFile,
    togglePlay,
    getFrequencyData
  };
};
