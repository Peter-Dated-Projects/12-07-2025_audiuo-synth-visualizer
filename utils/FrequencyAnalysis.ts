/**
 * Frequency Analysis Utilities for Dynamic Lissajous Parameter Generation
 * 
 * This module provides three methods for extracting representative frequencies
 * from complex audio signals to drive Lissajous figure parameters:
 * 
 * 1. Dominant Pitch (Peak Detection) - Finds the loudest frequency
 * 2. Spectral Centroid (Brightness) - Calculates weighted center of spectrum
 * 3. Band Power (Volume-to-Frequency) - Maps volume levels to frequency parameters
 */

export interface FrequencyResult {
  freqA: number; // Frequency for X-axis (or primary parameter)
  freqB: number; // Frequency for Z-axis (or secondary parameter)
  complexity: number; // Overall complexity/energy (0-1)
}

export enum FrequencyMethod {
  DOMINANT_PITCH = 'dominant_pitch',
  SPECTRAL_CENTROID = 'spectral_centroid',
  BAND_POWER = 'band_power'
}

export interface FrequencyAnalysisConfig {
  method: FrequencyMethod;
  baseFrequency: number; // Base frequency for Lissajous (e.g., 3.0)
  multiplier: number; // Scaling factor for audio influence
  minFreq: number; // Minimum frequency clamp (e.g., 1.0)
  maxFreq: number; // Maximum frequency clamp (e.g., 12.0)
  smoothing: number; // Smoothing factor (0-1, higher = more smooth)
}

export const DEFAULT_CONFIG: FrequencyAnalysisConfig = {
  method: FrequencyMethod.BAND_POWER,
  baseFrequency: 3.0,
  multiplier: 5.0,
  minFreq: 1.0,
  maxFreq: 12.0,
  smoothing: 0.1
};

/**
 * Frequency Analysis Class
 * Provides multiple methods for extracting Lissajous parameters from audio data
 */
export class FrequencyAnalyzer {
  private config: FrequencyAnalysisConfig;
  private sampleRate: number;
  private fftSize: number;
  private freqResolution: number;
  
  // Smoothing state
  private prevFreqA: number;
  private prevFreqB: number;
  private prevComplexity: number;

  constructor(analyser: AnalyserNode, config: Partial<FrequencyAnalysisConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.sampleRate = analyser.context.sampleRate;
    this.fftSize = analyser.fftSize;
    this.freqResolution = this.sampleRate / this.fftSize; // Hz per bin
    
    // Initialize smoothing state
    this.prevFreqA = this.config.baseFrequency;
    this.prevFreqB = this.config.baseFrequency;
    this.prevComplexity = 0;
  }

  /**
   * Main analysis method - dispatches to appropriate algorithm
   */
  analyze(frequencyData: Uint8Array | Float32Array): FrequencyResult {
    let result: FrequencyResult;
    
    switch (this.config.method) {
      case FrequencyMethod.DOMINANT_PITCH:
        result = this.analyzeDominantPitch(frequencyData);
        break;
      case FrequencyMethod.SPECTRAL_CENTROID:
        result = this.analyzeSpectralCentroid(frequencyData);
        break;
      case FrequencyMethod.BAND_POWER:
      default:
        result = this.analyzeBandPower(frequencyData);
        break;
    }
    
    // Apply smoothing
    result.freqA = this.lerp(this.prevFreqA, result.freqA, this.config.smoothing);
    result.freqB = this.lerp(this.prevFreqB, result.freqB, this.config.smoothing);
    result.complexity = this.lerp(this.prevComplexity, result.complexity, this.config.smoothing);
    
    // Store for next frame
    this.prevFreqA = result.freqA;
    this.prevFreqB = result.freqB;
    this.prevComplexity = result.complexity;
    
    return result;
  }

  /**
   * Method 1: Dominant Pitch (Peak Detection)
   * Finds the two loudest frequencies in the spectrum
   */
  private analyzeDominantPitch(frequencyData: Uint8Array | Float32Array): FrequencyResult {
    let max1 = -1;
    let max1Index = -1;
    let max2 = -1;
    let max2Index = -1;
    
    // Search first half of spectrum (ignore very high frequencies)
    const searchRange = Math.min(frequencyData.length, 256);
    
    for (let i = 1; i < searchRange; i++) { // Skip DC component (index 0)
      const val = frequencyData[i];
      
      if (val > max1) {
        max2 = max1;
        max2Index = max1Index;
        max1 = val;
        max1Index = i;
      } else if (val > max2) {
        max2 = val;
        max2Index = i;
      }
    }
    
    // Convert bin indices to Hz
    const freq1Hz = max1Index * this.freqResolution;
    const freq2Hz = max2Index * this.freqResolution;
    
    // Map Hz to Lissajous parameter range (1-12)
    // Use logarithmic mapping for more musical response
    const freqA = this.mapFrequencyToParameter(freq1Hz);
    const freqB = this.mapFrequencyToParameter(freq2Hz);
    
    // Calculate complexity based on peak magnitudes
    const maxValue = frequencyData instanceof Uint8Array ? 255 : 1;
    const complexity = Math.max(max1, max2) / maxValue;
    
    return { freqA, freqB, complexity };
  }

  /**
   * Method 2: Spectral Centroid (Brightness)
   * Calculates the weighted center of gravity of the spectrum
   */
  private analyzeSpectralCentroid(frequencyData: Uint8Array | Float32Array): FrequencyResult {
    let weightedSum = 0;
    let totalMagnitude = 0;
    
    // Calculate centroid
    for (let i = 1; i < frequencyData.length; i++) {
      const magnitude = frequencyData[i];
      const frequency = i * this.freqResolution;
      
      weightedSum += frequency * magnitude;
      totalMagnitude += magnitude;
    }
    
    const centroidHz = totalMagnitude > 0 ? weightedSum / totalMagnitude : 0;
    
    // For freqB, calculate a secondary centroid using just the upper half
    const midPoint = Math.floor(frequencyData.length / 2);
    let weightedSumHigh = 0;
    let totalMagnitudeHigh = 0;
    
    for (let i = midPoint; i < frequencyData.length; i++) {
      const magnitude = frequencyData[i];
      const frequency = i * this.freqResolution;
      
      weightedSumHigh += frequency * magnitude;
      totalMagnitudeHigh += magnitude;
    }
    
    const centroidHighHz = totalMagnitudeHigh > 0 ? weightedSumHigh / totalMagnitudeHigh : centroidHz;
    
    // Map to parameters
    const freqA = this.mapFrequencyToParameter(centroidHz);
    const freqB = this.mapFrequencyToParameter(centroidHighHz);
    
    // Complexity based on spectral spread
    const maxValue = frequencyData instanceof Uint8Array ? 255 : 1;
    const avgMagnitude = totalMagnitude / frequencyData.length;
    const complexity = avgMagnitude / maxValue;
    
    return { freqA, freqB, complexity };
  }

  /**
   * Method 3: Band Power (Volume-to-Frequency Mapping)
   * Maps volume levels of frequency bands to Lissajous parameters
   * This is the most stable and visually pleasing method
   */
  private analyzeBandPower(frequencyData: Uint8Array | Float32Array): FrequencyResult {
    // Define frequency bands (in Hz)
    const bassRange = { min: 0, max: 150 };      // Sub-bass and bass
    const midRange = { min: 150, max: 2000 };    // Mids (vocals, guitars)
    const trebleRange = { min: 2000, max: 8000 }; // Highs (cymbals, brightness)
    
    // Convert Hz to bin indices
    const bassBins = {
      min: Math.floor(bassRange.min / this.freqResolution),
      max: Math.floor(bassRange.max / this.freqResolution)
    };
    
    const midBins = {
      min: Math.floor(midRange.min / this.freqResolution),
      max: Math.floor(midRange.max / this.freqResolution)
    };
    
    const trebleBins = {
      min: Math.floor(trebleRange.min / this.freqResolution),
      max: Math.min(Math.floor(trebleRange.max / this.freqResolution), frequencyData.length - 1)
    };
    
    // Calculate band averages
    const bassLevel = this.getAverageMagnitude(frequencyData, bassBins.min, bassBins.max);
    const midLevel = this.getAverageMagnitude(frequencyData, midBins.min, midBins.max);
    const trebleLevel = this.getAverageMagnitude(frequencyData, trebleBins.min, trebleBins.max);
    
    // Map to parameters
    // freqA (X-axis) controlled by bass + mids (rhythm and body)
    // freqB (Z-axis) controlled by mids + treble (melody and brightness)
    const freqA = this.config.baseFrequency + (bassLevel * 0.6 + midLevel * 0.4) * this.config.multiplier;
    const freqB = this.config.baseFrequency + (midLevel * 0.4 + trebleLevel * 0.6) * this.config.multiplier;
    
    // Clamp to valid range
    const clampedFreqA = Math.max(this.config.minFreq, Math.min(this.config.maxFreq, freqA));
    const clampedFreqB = Math.max(this.config.minFreq, Math.min(this.config.maxFreq, freqB));
    
    // Overall complexity is the average energy
    const complexity = (bassLevel + midLevel + trebleLevel) / 3;
    
    return { 
      freqA: clampedFreqA, 
      freqB: clampedFreqB, 
      complexity 
    };
  }

  /**
   * Helper: Calculate average magnitude in a frequency range
   */
  private getAverageMagnitude(data: Uint8Array | Float32Array, startBin: number, endBin: number): number {
    let sum = 0;
    let count = 0;
    
    for (let i = startBin; i <= endBin && i < data.length; i++) {
      sum += data[i];
      count++;
    }
    
    const maxValue = data instanceof Uint8Array ? 255 : 1;
    return count > 0 ? (sum / count) / maxValue : 0;
  }

  /**
   * Helper: Map frequency in Hz to Lissajous parameter (1-12)
   * Uses logarithmic mapping for more musical response
   */
  private mapFrequencyToParameter(frequencyHz: number): number {
    if (frequencyHz <= 0) return this.config.baseFrequency;
    
    // Musical frequency mapping: A0 (27.5 Hz) to C8 (4186 Hz)
    // Map logarithmically to 1-12 range
    const minHz = 27.5;  // A0
    const maxHz = 4186;  // C8
    
    const clampedHz = Math.max(minHz, Math.min(maxHz, frequencyHz));
    const normalized = (Math.log(clampedHz) - Math.log(minHz)) / (Math.log(maxHz) - Math.log(minHz));
    
    // Map to parameter range with base frequency
    const param = this.config.minFreq + normalized * (this.config.maxFreq - this.config.minFreq);
    
    return Math.max(this.config.minFreq, Math.min(this.config.maxFreq, param));
  }

  /**
   * Helper: Linear interpolation for smoothing
   */
  private lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<FrequencyAnalysisConfig>) {
    this.config = { ...this.config, ...config };
  }

  getConfig(): FrequencyAnalysisConfig {
    return { ...this.config };
  }
}

/**
 * Standalone helper function for Band Power method (most common use case)
 * Can be used without instantiating the full analyzer
 */
export function calculateBandPowerFrequencies(
  frequencyData: Uint8Array | Float32Array,
  sampleRate: number,
  fftSize: number,
  baseFrequency: number = 3.0,
  multiplier: number = 5.0
): FrequencyResult {
  const freqResolution = sampleRate / fftSize;
  
  // Define bands
  const bassBins = {
    min: 0,
    max: Math.floor(150 / freqResolution)
  };
  
  const midBins = {
    min: Math.floor(150 / freqResolution),
    max: Math.floor(2000 / freqResolution)
  };
  
  const trebleBins = {
    min: Math.floor(2000 / freqResolution),
    max: Math.min(Math.floor(8000 / freqResolution), frequencyData.length - 1)
  };
  
  // Calculate averages
  const getAvg = (start: number, end: number) => {
    let sum = 0;
    let count = 0;
    for (let i = start; i <= end && i < frequencyData.length; i++) {
      sum += frequencyData[i];
      count++;
    }
    const maxValue = frequencyData instanceof Uint8Array ? 255 : 1;
    return count > 0 ? (sum / count) / maxValue : 0;
  };
  
  const bass = getAvg(bassBins.min, bassBins.max);
  const mid = getAvg(midBins.min, midBins.max);
  const treble = getAvg(trebleBins.min, trebleBins.max);
  
  // Calculate frequencies
  const freqA = baseFrequency + (bass * 0.6 + mid * 0.4) * multiplier;
  const freqB = baseFrequency + (mid * 0.4 + treble * 0.6) * multiplier;
  
  return {
    freqA: Math.max(1, Math.min(12, freqA)),
    freqB: Math.max(1, Math.min(12, freqB)),
    complexity: (bass + mid + treble) / 3
  };
}
