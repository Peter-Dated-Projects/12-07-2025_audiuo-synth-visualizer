/**
 * Multi-Band Audio Analyzer
 * 
 * Implements frequency band separation using Web Audio API BiquadFilterNodes.
 * Creates independent stereo analyzers for Bass, Mids, Highs, and Melody bands.
 * 
 * CRITICAL CONCEPT: All bands use the SAME Lissajous equation:
 *   x = (AudioLeft * 0.7) + (sin(ωt) * 0.3)
 *   y = (AudioRight * 0.7) + (sin(ωt) * 0.3)
 * 
 * Visual differences arise from DATA CHARACTERISTICS of each filtered band:
 * 
 * • Bass (<250Hz): Slow oscillation, high amplitude
 *   → Large, smooth, breathing outer shell
 *   → Changes gradually sample-to-sample (50Hz = 20ms period)
 *   → Often reaches ±1.0 amplitude (most energy)
 * 
 * • Mids (250-4000Hz): Complex harmonics, stereo separation
 *   → Intricate knots and loops (the "body" of the figure)
 *   → Rich in vocals/guitars with jagged waveforms
 *   → Maximum stereo field width (L/R panning)
 * 
 * • Highs (>4000Hz): Fast oscillation, stochastic/noisy
 *   → Electric fuzz texture, nervous energy
 *   → Rapid sample-to-sample changes (10kHz flips every 0.1ms)
 *   → Cymbals appear as random noise in time domain
 * 
 * • Melody (FFT): Full spectrum + dominant frequency emphasis
 *   → Bright pulsing highlights on melodic notes
 *   → Dynamically scaled (0.5x to 2.0x) based on pitch detection
 *   → Accents the musical key, not the beat
 * 
 * Architecture:
 * Source → Splitter (L/R) → BiquadFilters → Band Analyzers
 *                         ↓
 *                    Main Analyzers
 * 
 * Total: 8 Analyzers (4 bands × 2 channels)
 */

export type FrequencyBand = 'bass' | 'mids' | 'highs' | 'melody' | 'full';

export interface BandAnalyzers {
  left: AnalyserNode;
  right: AnalyserNode;
}

export interface BandData {
  left: Float32Array;
  right: Float32Array;
  energy: number; // 0-1 normalized energy level
}

/**
 * Multi-band audio filtering system using Web Audio API.
 * 
 * Band Definitions:
 * - Bass: Lowpass @ 250 Hz (sub-bass and bass fundamentals)
 * - Mids: Bandpass @ 2125 Hz (vocals, instruments: ~250-4000 Hz)
 * - Highs: Highpass @ 4000 Hz (cymbals, air, brilliance)
 * - Melody: FFT-based dominant frequency detection
 * - Full: Unfiltered stereo signal
 */
export class MultiBandAnalyzer {
  private audioContext: AudioContext;
  private source: AudioNode | null = null;
  private splitter: ChannelSplitterNode;
  private merger: ChannelMergerNode;
  
  // Filters
  private bassFilterL: BiquadFilterNode;
  private bassFilterR: BiquadFilterNode;
  private midsFilterL: BiquadFilterNode;
  private midsFilterR: BiquadFilterNode;
  private highsFilterL: BiquadFilterNode;
  private highsFilterR: BiquadFilterNode;
  
  // Analyzers (8 total: 4 bands × 2 channels)
  private analyzers: Map<FrequencyBand, BandAnalyzers>;
  
  // Data buffers
  private buffers: Map<FrequencyBand, BandData>;
  
  // FFT data for melody detection
  private frequencyData: Uint8Array;
  
  constructor(audioContext: AudioContext, fftSize: number = 2048) {
    this.audioContext = audioContext;
    
    // Create splitter/merger for stereo routing
    this.splitter = audioContext.createChannelSplitter(2);
    this.merger = audioContext.createChannelMerger(2);
    
    // --- Create Band Filters ---
    
    // Bass: Lowpass @ 250 Hz
    this.bassFilterL = this.createFilter('lowpass', 250);
    this.bassFilterR = this.createFilter('lowpass', 250);
    
    // Mids: Bandpass @ 2125 Hz (centered between 250-4000)
    this.midsFilterL = this.createFilter('bandpass', 2125);
    this.midsFilterR = this.createFilter('bandpass', 2125);
    
    // Highs: Highpass @ 4000 Hz
    this.highsFilterL = this.createFilter('highpass', 4000);
    this.highsFilterR = this.createFilter('highpass', 4000);
    
    // --- Create Analyzers for Each Band ---
    this.analyzers = new Map();
    
    // Full spectrum (unfiltered)
    this.analyzers.set('full', {
      left: this.createAnalyzer(fftSize),
      right: this.createAnalyzer(fftSize),
    });
    
    // Bass
    this.analyzers.set('bass', {
      left: this.createAnalyzer(fftSize),
      right: this.createAnalyzer(fftSize),
    });
    
    // Mids
    this.analyzers.set('mids', {
      left: this.createAnalyzer(fftSize),
      right: this.createAnalyzer(fftSize),
    });
    
    // Highs
    this.analyzers.set('highs', {
      left: this.createAnalyzer(fftSize),
      right: this.createAnalyzer(fftSize),
    });
    
    // Melody (uses full spectrum with FFT analysis)
    this.analyzers.set('melody', {
      left: this.createAnalyzer(fftSize),
      right: this.createAnalyzer(fftSize),
    });
    
    // Initialize buffers
    this.buffers = new Map();
    ['full', 'bass', 'mids', 'highs', 'melody'].forEach((band) => {
      this.buffers.set(band as FrequencyBand, {
        left: new Float32Array(fftSize),
        right: new Float32Array(fftSize),
        energy: 0,
      });
    });
    
    this.frequencyData = new Uint8Array(fftSize / 2);
  }
  
  /**
   * Create a BiquadFilterNode with specified type and frequency.
   */
  private createFilter(
    type: BiquadFilterType,
    frequency: number
  ): BiquadFilterNode {
    const filter = this.audioContext.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = 1.0; // Standard Q value
    return filter;
  }
  
  /**
   * Create an AnalyserNode with specified FFT size.
   */
  private createAnalyzer(fftSize: number): AnalyserNode {
    const analyser = this.audioContext.createAnalyser();
    analyser.fftSize = fftSize;
    analyser.smoothingTimeConstant = 0.75; // Smooth but responsive
    return analyser;
  }
  
  /**
   * Connect audio source and set up routing.
   * 
   * Routing:
   * Source → Splitter (L/R)
   *   ├─ Channel 0 (Left) → Filters → Analyzers
   *   └─ Channel 1 (Right) → Filters → Analyzers
   * 
   * All paths merge back to destination via merger.
   */
  connect(source: AudioNode, destination: AudioNode): void {
    this.source = source;
    
    // Connect source to splitter
    source.connect(this.splitter);
    
    // --- Full Spectrum (Unfiltered) ---
    this.splitter.connect(this.analyzers.get('full')!.left, 0);
    this.splitter.connect(this.analyzers.get('full')!.right, 1);
    
    // --- Bass Band ---
    this.splitter.connect(this.bassFilterL, 0);
    this.splitter.connect(this.bassFilterR, 1);
    this.bassFilterL.connect(this.analyzers.get('bass')!.left);
    this.bassFilterR.connect(this.analyzers.get('bass')!.right);
    
    // --- Mids Band ---
    this.splitter.connect(this.midsFilterL, 0);
    this.splitter.connect(this.midsFilterR, 1);
    this.midsFilterL.connect(this.analyzers.get('mids')!.left);
    this.midsFilterR.connect(this.analyzers.get('mids')!.right);
    
    // --- Highs Band ---
    this.splitter.connect(this.highsFilterL, 0);
    this.splitter.connect(this.highsFilterR, 1);
    this.highsFilterL.connect(this.analyzers.get('highs')!.left);
    this.highsFilterR.connect(this.analyzers.get('highs')!.right);
    
    // --- Melody Band (same as full, but with FFT processing) ---
    this.splitter.connect(this.analyzers.get('melody')!.left, 0);
    this.splitter.connect(this.analyzers.get('melody')!.right, 1);
    
    // Merge back to destination for audio output
    this.splitter.connect(this.merger, 0, 0);
    this.splitter.connect(this.merger, 1, 1);
    this.merger.connect(destination);
  }
  
  /**
   * Get time-domain data for a specific band.
   * 
   * @param band - Frequency band to retrieve
   * @returns BandData with left/right channels and energy level
   */
  getBandData(band: FrequencyBand): BandData {
    const analyzers = this.analyzers.get(band);
    if (!analyzers) {
      console.warn(`Band ${band} not found`);
      return {
        left: new Float32Array(2048),
        right: new Float32Array(2048),
        energy: 0,
      };
    }
    
    const buffer = this.buffers.get(band)!;
    
    // Get time-domain data (waveform)
    // @ts-expect-error - Web Audio API type issue with ArrayBufferLike
    analyzers.left.getFloatTimeDomainData(buffer.left);
    // @ts-expect-error - Web Audio API type issue with ArrayBufferLike
    analyzers.right.getFloatTimeDomainData(buffer.right);
    
    // Special processing for melody band
    if (band === 'melody') {
      this.processMelodyBand(buffer);
    }
    
    // Calculate energy (RMS)
    buffer.energy = this.calculateEnergy(buffer.left, buffer.right);
    
    return buffer;
  }
  
  /**
   * Process melody band using FFT to detect dominant frequencies.
   * 
   * Algorithm:
   * 1. Get frequency spectrum via FFT
   * 2. Find dominant frequency bins
   * 3. Calculate energy in dominant bins
   * 4. Scale time-domain data based on dominant frequency energy
   */
  private processMelodyBand(buffer: BandData): void {
    const analyzer = this.analyzers.get('melody')!.left;
    
    // Get frequency data
    // @ts-expect-error - Web Audio API type issue with ArrayBufferLike
    analyzer.getByteFrequencyData(this.frequencyData);
    
    // Find dominant frequencies (top 10% of bins)
    const threshold = this.findFrequencyThreshold(this.frequencyData, 0.7);
    
    // Calculate energy in dominant bins
    let dominantEnergy = 0;
    let dominantCount = 0;
    
    for (let i = 0; i < this.frequencyData.length; i++) {
      if (this.frequencyData[i] >= threshold) {
        dominantEnergy += this.frequencyData[i] / 255;
        dominantCount++;
      }
    }
    
    if (dominantCount > 0) {
      dominantEnergy /= dominantCount;
      
      // Scale time-domain data to emphasize melodic moments
      const scale = 0.5 + dominantEnergy * 1.5; // 0.5 to 2.0x scale
      
      for (let i = 0; i < buffer.left.length; i++) {
        buffer.left[i] *= scale;
        buffer.right[i] *= scale;
      }
    }
  }
  
  /**
   * Find frequency threshold for top percentile of energy.
   */
  private findFrequencyThreshold(
    frequencyData: Uint8Array,
    percentile: number
  ): number {
    const sorted = Array.from(frequencyData).sort((a, b) => b - a);
    const index = Math.floor(sorted.length * (1 - percentile));
    return sorted[index] || 0;
  }
  
  /**
   * Calculate RMS energy from stereo time-domain data.
   */
  private calculateEnergy(left: Float32Array, right: Float32Array): number {
    let sumSquares = 0;
    const length = Math.min(left.length, right.length);
    
    for (let i = 0; i < length; i++) {
      sumSquares += left[i] * left[i] + right[i] * right[i];
    }
    
    return Math.sqrt(sumSquares / (length * 2));
  }
  
  /**
   * Get all band data at once.
   */
  getAllBands(): Map<FrequencyBand, BandData> {
    const bands: FrequencyBand[] = ['full', 'bass', 'mids', 'highs', 'melody'];
    const result = new Map<FrequencyBand, BandData>();
    
    bands.forEach((band) => {
      result.set(band, this.getBandData(band));
    });
    
    return result;
  }
  
  /**
   * Get band energy levels (for UI/controls).
   */
  getBandEnergies(): Record<FrequencyBand, number> {
    return {
      full: this.getBandData('full').energy,
      bass: this.getBandData('bass').energy,
      mids: this.getBandData('mids').energy,
      highs: this.getBandData('highs').energy,
      melody: this.getBandData('melody').energy,
    };
  }
  
  /**
   * Update filter parameters dynamically.
   */
  updateFilterFrequency(band: 'bass' | 'mids' | 'highs', frequency: number): void {
    switch (band) {
      case 'bass':
        this.bassFilterL.frequency.value = frequency;
        this.bassFilterR.frequency.value = frequency;
        break;
      case 'mids':
        this.midsFilterL.frequency.value = frequency;
        this.midsFilterR.frequency.value = frequency;
        break;
      case 'highs':
        this.highsFilterL.frequency.value = frequency;
        this.highsFilterR.frequency.value = frequency;
        break;
    }
  }
  
  /**
   * Cleanup resources.
   */
  dispose(): void {
    this.analyzers.clear();
    this.buffers.clear();
  }
}

/**
 * Example Usage:
 * 
 * ```typescript
 * const audioContext = new AudioContext();
 * const source = audioContext.createMediaElementSource(audioElement);
 * const multiBand = new MultiBandAnalyzer(audioContext, 2048);
 * 
 * multiBand.connect(source, audioContext.destination);
 * 
 * // In animation loop
 * const bassData = multiBand.getBandData('bass');
 * const midsData = multiBand.getBandData('mids');
 * const highsData = multiBand.getBandData('highs');
 * 
 * // Use left/right channels for Lissajous
 * <LissajousVisualizerGPU
 *   leftChannel={bassData.left}
 *   rightChannel={bassData.right}
 *   color="#ff0000"
 * />
 * ```
 */
