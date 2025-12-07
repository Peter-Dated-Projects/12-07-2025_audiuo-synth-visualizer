import { useRef, useState, useEffect, useCallback } from "react";

// --- IndexedDB Helpers ---
const DB_NAME = "AudioVisualizerDB";
const STORE_NAME = "files";
const FILE_KEY = "lastPlayed";

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

const saveFileToDB = async (file: File) => {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    store.put(file, FILE_KEY);
  } catch (err) {
    console.error("Failed to save file to DB:", err);
  }
};

const getFileFromDB = async (): Promise<File | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(FILE_KEY);
      request.onsuccess = () => resolve(request.result as File);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to get file from DB:", err);
    return null;
  }
};
// -------------------------

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
  const [isLooping, setIsLooping] = useState(false);
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
      // Check if source already exists to avoid error
      if (!sourceRef.current) {
        const source = ctx.createMediaElementSource(audioRef.current);
        source.connect(analyser);
        analyser.connect(ctx.destination);
        sourceRef.current = source;
      }
      setIsReady(true);
    }
  }, []);

  // Load cached file on mount
  useEffect(() => {
    const loadCachedFile = async () => {
      const file = await getFileFromDB();
      if (file) {
        const url = URL.createObjectURL(file);
        setAudioUrl(url);
        if (audioRef.current) {
          audioRef.current.src = url;
          audioRef.current.load();
        }
      }
    };
    loadCachedFile();
  }, []);

  const loadFile = (file: File) => {
    saveFileToDB(file); // Cache the file
    const url = URL.createObjectURL(file);
    setAudioUrl(url);
    if (audioRef.current) {
      audioRef.current.src = url;
      audioRef.current.load();
    }
    // Ensure context is initialized on user interaction
    initAudio();
    if (isPlaying) togglePlay();
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

  const toggleLoop = () => {
    if (audioRef.current) {
      audioRef.current.loop = !isLooping;
      setIsLooping(!isLooping);
    }
  };

  const getFrequencyData = useCallback((): AudioData => {
    if (!analyserRef.current) return { bass: 0, mid: 0, treble: 0 };

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    analyserRef.current.getByteFrequencyData(dataArray);

    // Calculate bands (approximate ranges for 1024 FFT size)
    // Sample Rate is typically 44100Hz or 48000Hz.
    // Frequency Resolution = SampleRate / FFTSize
    // e.g., 44100 / 1024 ≈ 43 Hz per bin.
    
    // Bass: 0-10 (approx 0-430Hz)
    // Mid: 11-100 (approx 473Hz-4.3kHz)
    // Treble: 101-255 (approx 4.3kHz-11kHz) - We cap at 255 to focus on audible highs
    
    const getAverage = (start: number, end: number) => {
      let sum = 0;
      for (let i = start; i < end; i++) {
        sum += dataArray[i];
      }
      return sum / (end - start);
    };

    // High frequencies naturally have lower energy in most music (pink noise spectrum).
    // We need to boost the treble sensitivity significantly to get good visual reaction.
    // We also use a slightly lower start bin (80 instead of 101) to catch more "presence".
    const bass = getAverage(0, 10) / 255;
    const mid = getAverage(11, 80) / 255;
    const rawTreble = getAverage(81, 255) / 255;
    const treble = Math.min(1, rawTreble * 3.0); // 3x Boost for treble

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
    isLooping,
    audioUrl,
    isReady,
    loadFile,
    togglePlay,
    toggleLoop,
    getFrequencyData,
    analyser: analyserRef.current,
  };
};
