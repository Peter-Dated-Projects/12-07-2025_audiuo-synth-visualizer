/**
 * Lissajous Utilities
 * 
 * THE UNIVERSAL LISSAJOUS EQUATION (applies to ALL bands):
 * 
 *   x_final = (AudioLeft * 0.7) + (sin(freqX * t + phase) * 0.3)
 *   y_final = (AudioRight * 0.7) + (sin(freqY * t) * 0.3)
 * 
 * This is a GENERIC mathematical processor. The formula never changes.
 * Visual differences between bands arise from the DATA CHARACTERISTICS:
 * 
 * • Bass (Lowpass <250Hz):
 *   - Slow oscillation: 50Hz wave = 882 samples per cycle @ 44.1kHz
 *   - Gradual value changes from sample[i] to sample[i+1]
 *   - High amplitude: Often reaches ±1.0
 *   → Result: Large, smooth, breathing shapes
 * 
 * • Mids (Bandpass 250-4kHz):
 *   - Complex waveforms: Vocals/guitars with rich harmonics
 *   - Significant stereo separation (L≠R panning)
 *   - Jagged, non-sinusoidal patterns
 *   → Result: Intricate knots and twisted loops
 * 
 * • Highs (Highpass >4kHz):
 *   - Fast oscillation: 10kHz wave = 4.4 samples per cycle
 *   - Violent jitter: sample[i]=0.8, sample[i+1]=-0.8
 *   - Stochastic (cymbals look like noise)
 *   → Result: Electric fuzz, nervous energy texture
 * 
 * • Melody (FFT-enhanced):
 *   - Full spectrum with dynamic scaling (0.5x-2.0x)
 *   - Emphasizes dominant frequencies (pitched content)
 *   - Combines characteristics of all bands
 *   → Result: Bright pulsing accents on melodic notes
 * 
 * This module contains CPU-based Lissajous curve calculations.
 * For optimal performance, use the GPU shader implementation
 * in LissajousVisualizerGPU.tsx which processes audio directly on the GPU.
 */

export type ZMode = 'parametric' | 'time' | 'frequency' | 'phase';

/**
 * Convert raw audio samples into 3D Lissajous curve coordinates.
 * 
 * This CPU-based approach calculates coordinates for every point, which can be
 * performance-intensive for high point counts. For real-time visualization,
 * the GPU shader approach is recommended.
 * 
 * @param leftChannel - Left audio channel samples (normalized -1 to 1)
 * @param rightChannel - Right audio channel samples (normalized -1 to 1)
 * @param sampleCount - Number of samples to process
 * @param frequencyRatioX - Frequency ratio for X-axis sine wave (default: 1.0)
 * @param frequencyRatioY - Frequency ratio for Y-axis sine wave (default: 1.0)
 * @param phase - Phase offset for X-axis in radians (default: 0)
 * @param enable3D - Whether to calculate Z coordinates (default: false)
 * @param zMode - Method for calculating Z-axis depth (default: 'parametric')
 * @param zScale - Scaling factor for Z-axis (default: 1.0)
 * @param frequencyRatioZ - Frequency ratio for Z-axis sine wave (default: 1.5)
 * @param phaseZ - Phase offset for Z-axis in radians (default: π/2)
 * @returns Float32Array containing interleaved [x, y, z] coordinates
 */
export function audioToLissajousPoints(
  leftChannel: Float32Array,
  rightChannel: Float32Array,
  sampleCount: number,
  frequencyRatioX: number = 1.0,
  frequencyRatioY: number = 1.0,
  phase: number = 0,
  enable3D: boolean = false,
  zMode: ZMode = 'parametric',
  zScale: number = 1.0,
  frequencyRatioZ: number = 1.5,
  phaseZ: number = Math.PI / 2
): Float32Array {
  const pointCount = Math.min(sampleCount, leftChannel.length, rightChannel.length);
  const componentsPerPoint = 3; // Always allocate 3 components for consistency
  const points = new Float32Array(pointCount * componentsPerPoint);

  for (let i = 0; i < pointCount; i++) {
    let x = leftChannel[i];
    let y = rightChannel[i];

    // Apply frequency ratio and phase transformations
    // This blends the raw audio with a perfect sine wave to ensure
    // the shape remains interesting even with quiet/mono audio.
    if (frequencyRatioX !== 1.0 || frequencyRatioY !== 1.0 || phase !== 0) {
      const t = (i / pointCount) * Math.PI * 2;
      const transformedX = Math.sin(frequencyRatioX * t + phase) * 0.5;
      const transformedY = Math.sin(frequencyRatioY * t) * 0.5;

      // Blend: 70% Original Audio, 30% Perfect Shape
      x = x * 0.7 + transformedX * 0.3;
      y = y * 0.7 + transformedY * 0.3;
    }

    if (enable3D) {
      // Calculate Z coordinate based on the selected mode
      let z = 0;

      switch (zMode) {
        case 'parametric':
          // True 3D parametric Lissajous curve
          // Uses sine waves on all three axes with independent frequencies
          const t = (i / pointCount) * Math.PI * 2;

          // Generate parametric coordinates
          const paramX = Math.sin(frequencyRatioX * t + phase);
          const paramY = Math.sin(frequencyRatioY * t);
          const paramZ = Math.sin(frequencyRatioZ * t + phaseZ);

          // Blend audio data with parametric curve
          // Stronger parametric influence (60%) for better 3D shapes
          x = x * 0.4 + paramX * 0.6;
          y = y * 0.4 + paramY * 0.6;
          z = paramZ * zScale;
          break;

        case 'time':
          // Time-based depth creates a spiral/tunnel effect
          // Older points (lower index) are pushed further back
          z = (i / pointCount - 0.5) * 2 * zScale;
          break;

        case 'frequency':
          // Use audio magnitude (loudness) for depth
          const magnitude = Math.sqrt(x * x + y * y);
          z = magnitude * zScale;
          break;

        case 'phase':
          // Use phase relationship (angle) between channels for depth
          const phaseDiff = Math.atan2(y, x);
          z = Math.sin(phaseDiff) * zScale;
          break;
      }

      points[i * 3] = x;
      points[i * 3 + 1] = y;
      points[i * 3 + 2] = z;
    } else {
      // 2D mode - keep Z at 0
      points[i * 3] = x;
      points[i * 3 + 1] = y;
      points[i * 3 + 2] = 0;
    }
  }

  return points;
}

/**
 * Creates buffer attributes for GPU rendering.
 * This pre-allocates buffers that can be updated each frame.
 * 
 * @param pointCount - Number of points in the Lissajous curve
 * @returns Object containing position buffer and index attribute
 */
export function createLissajousBuffers(pointCount: number) {
  const positions = new Float32Array(pointCount * 3);
  const indices = new Float32Array(pointCount);

  for (let i = 0; i < pointCount; i++) {
    indices[i] = i / (pointCount - 1); // Normalized 0..1
  }

  return {
    positions,
    indices,
  };
}
