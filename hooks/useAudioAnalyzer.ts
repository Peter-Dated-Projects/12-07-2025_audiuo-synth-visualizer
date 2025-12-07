import { useRef, useState, useEffect, useCallback } from "react";
import { MultiBandAnalyzer, FrequencyBand, BandData } from "../utils/MultiBandAnalyzer";

// --- IndexedDB Helpers ---
const DB_NAME = "AudioVisualizerDB";
const STORE_NAME = "files";
const SETTINGS_STORE_NAME = "settings";
const FILE_KEY = "lastPlayed";
const SETTINGS_KEY = "userSettings";

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2); // Increment version
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(SETTINGS_STORE_NAME)) {
        db.createObjectStore(SETTINGS_STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const saveSettingsToDB = async (settings: any) => {
  try {
    const db = await openDB();
    const tx = db.transaction(SETTINGS_STORE_NAME, "readwrite");
    const store = tx.objectStore(SETTINGS_STORE_NAME);
    store.put(settings, SETTINGS_KEY);
  } catch (err) {
    console.error("Failed to save settings to DB:", err);
  }
};

export const getSettingsFromDB = async (): Promise<any | null> => {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(SETTINGS_STORE_NAME, "readonly");
      const store = tx.objectStore(SETTINGS_STORE_NAME);
      const request = store.get(SETTINGS_KEY);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  } catch (err) {
    console.error("Failed to get settings from DB:", err);
    return null;
  }
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
  const gainNodeRef = useRef<GainNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | MediaStreamAudioSourceNode | null>(null);
  const fileSourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const multiBandRef = useRef<MultiBandAnalyzer | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [isLooping, setIsLooping] = useState(false);
  const [isSystemAudio, setIsSystemAudio] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const previousVolumeRef = useRef<number>(1.0);
  const [isReady, setIsReady] = useState(false);

  // Load settings on mount
  useEffect(() => {
    const loadSettings = async () => {
      const settings = await getSettingsFromDB();
      if (settings && typeof settings.isLooping === 'boolean') {
        setIsLooping(settings.isLooping);
        if (audioRef.current) {
          audioRef.current.loop = settings.isLooping;
        }
      }
    };
    loadSettings();
  }, []);

  // Initialize Audio Context
  const initAudio = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      const ctx = new AudioContextClass();
      audioContextRef.current = ctx;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.8;
      analyserRef.current = analyser;

      const gainNode = ctx.createGain();
      gainNode.gain.value = 1.0;
      gainNodeRef.current = gainNode;

      // Initialize multi-band analyzer
      const multiBand = new MultiBandAnalyzer(ctx, 2048);
      multiBandRef.current = multiBand;

      gainNode.connect(ctx.destination);
    }

    const ctx = audioContextRef.current!;

    if (audioRef.current) {
      // Create file source if needed (only once)
      if (!fileSourceRef.current) {
        fileSourceRef.current = ctx.createMediaElementSource(audioRef.current);
      }

      // Connect file source if not already connected
      if (sourceRef.current !== fileSourceRef.current) {
        if (sourceRef.current) {
          sourceRef.current.disconnect();
        }

        const source = fileSourceRef.current!;
        
        // Connect multi-band analyzer
        if (multiBandRef.current && gainNodeRef.current && analyserRef.current) {
          multiBandRef.current.connect(source, gainNodeRef.current);
          source.connect(analyserRef.current);
          analyserRef.current.connect(gainNodeRef.current);
        }
        
        sourceRef.current = source;
      }
      setIsReady(true);
    }
  }, []);

  const stopSystemAudio = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    
    // Disconnect stream source
    if (sourceRef.current) {
      sourceRef.current.disconnect();
    }

    setIsSystemAudio(false);
    setIsPlaying(false);
    
    // Restore file source if available
    if (fileSourceRef.current && multiBandRef.current && gainNodeRef.current && analyserRef.current) {
      const source = fileSourceRef.current;
      multiBandRef.current.connect(source, gainNodeRef.current);
      source.connect(analyserRef.current);
      analyserRef.current.connect(gainNodeRef.current);
      sourceRef.current = source;
      
      // Restore volume
      gainNodeRef.current.gain.value = previousVolumeRef.current;
    } else {
      sourceRef.current = null;
      // Restore volume even if no source
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = previousVolumeRef.current;
      }
    }
  }, []);

  const startSystemAudio = useCallback(async () => {
    try {
      // Request screen sharing with audio
      // We request a very small video size since we only care about audio
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { width: 1, height: 1 },
        audio: true
      });

      // Check if we got an audio track
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack) {
        alert("No system audio shared. Please make sure to check 'Share system audio' in the browser dialog.");
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      // Stop existing audio if playing
      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }

      // Initialize context if needed
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        audioContextRef.current = ctx;

        const analyser = ctx.createAnalyser();
        analyser.fftSize = 1024;
        analyser.smoothingTimeConstant = 0.8;
        analyserRef.current = analyser;

        const gainNode = ctx.createGain();
        gainNode.gain.value = 1.0;
        gainNodeRef.current = gainNode;

        const multiBand = new MultiBandAnalyzer(ctx, 2048);
        multiBandRef.current = multiBand;
        
        gainNode.connect(ctx.destination);
      }

      const ctx = audioContextRef.current!;

      if (ctx.state === "suspended") {
        await ctx.resume();
      }

      // Disconnect old source if it exists
      if (sourceRef.current) {
        sourceRef.current.disconnect();
      }

      // Create new source from stream
      const source = ctx.createMediaStreamSource(stream);
      sourceRef.current = source;

      // Connect to analyzer chain
      if (multiBandRef.current && gainNodeRef.current && analyserRef.current) {
        multiBandRef.current.connect(source, gainNodeRef.current);
        source.connect(analyserRef.current);
        analyserRef.current.connect(gainNodeRef.current);
        
        // Mute output to prevent feedback loop when using system audio
        // We set gain to 0 instead of disconnecting, to ensure the audio graph remains active
        previousVolumeRef.current = gainNodeRef.current.gain.value;
        gainNodeRef.current.gain.value = 0;
      }

      streamRef.current = stream;
      setIsSystemAudio(true);
      setIsReady(true);
      setIsPlaying(true);

      // Handle stream ending (user stops sharing)
      audioTrack.onended = () => {
        stopSystemAudio();
      };

    } catch (err) {
      console.error("Error starting system audio:", err);
    }
  }, [stopSystemAudio]);

  const setGlobalVolume = useCallback((volume: number) => {
    previousVolumeRef.current = volume;
    if (gainNodeRef.current && !isSystemAudio) {
      gainNodeRef.current.gain.value = volume;
    }
  }, [isSystemAudio]);

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
          
          // Attempt to autoplay
          try {
            initAudio();
            // Try to resume context if suspended (might fail without user gesture)
            if (audioContextRef.current?.state === 'suspended') {
              audioContextRef.current.resume().catch(() => {});
            }
            await audioRef.current.play();
            setIsPlaying(true);
          } catch (err) {
            console.log("Autoplay prevented:", err);
            setIsPlaying(false);
          }
        }
      }
    };
    loadCachedFile();
  }, [initAudio]);

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

  const toggleLoop = async () => {
    if (audioRef.current) {
      const newLoopState = !isLooping;
      audioRef.current.loop = newLoopState;
      setIsLooping(newLoopState);
      
      // Update settings in DB
      const currentSettings = await getSettingsFromDB() || {};
      await saveSettingsToDB({ ...currentSettings, isLooping: newLoopState });
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

  // Get band data for Lissajous visualization
  const getBandData = useCallback((band: FrequencyBand): BandData => {
    if (!multiBandRef.current) {
      return {
        left: new Float32Array(2048),
        right: new Float32Array(2048),
        energy: 0,
      };
    }
    return multiBandRef.current.getBandData(band);
  }, []);

  // Get all band energies
  const getBandEnergies = useCallback(() => {
    if (!multiBandRef.current) {
      return { full: 0, bass: 0, mids: 0, highs: 0, melody: 0 };
    }
    return multiBandRef.current.getBandEnergies();
  }, []);

  // Cleanup
  useEffect(() => {
    return () => {
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  useEffect(() => {
    return () => {
      if (multiBandRef.current) multiBandRef.current.dispose();
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
    getBandData,
    getBandEnergies,
    analyser: analyserRef.current,
    multiBandAnalyzer: multiBandRef.current,
    setGlobalVolume,
    startSystemAudio,
    stopSystemAudio,
    isSystemAudio,
  };
};
