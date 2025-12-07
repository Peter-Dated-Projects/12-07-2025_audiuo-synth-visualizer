import * as THREE from "three";

export class AudioNormalizer {
  public texture: THREE.DataTexture;
  public normalizedData: Float32Array;
  private size: number;
  private smoothing: number;

  constructor(size: number = 1024, smoothing: number = 0.2) {
    this.size = size;
    this.smoothing = smoothing;
    this.normalizedData = new Float32Array(size);

    // Create DataTexture (RedFormat, FloatType for precision)
    this.texture = new THREE.DataTexture(
      this.normalizedData,
      size,
      1,
      THREE.RedFormat,
      THREE.FloatType
    );
    this.texture.needsUpdate = true;
  }

  update(rawData: Uint8Array) {
    const totalBins = this.size;
    // Ensure we don't go out of bounds if rawData is smaller
    const length = Math.min(rawData.length, totalBins);
    const boostStrength = 2.0; 

    for (let i = 0; i < length; i++) {
      // 1. Normalize (0-255 -> 0.0-1.0)
      let val = rawData[i] / 255.0;

      // 2. Noise Gate (Soft Knee)
      // If value < 0.15, smoothly fade it to 0.0 to remove background hiss.
      const threshold = 0.15;
      if (val < threshold) {
        // Quadratic falloff for smoothness
        val = val * (val / threshold); 
      }

      // 3. Pink Noise Compensation (Linear Boost)
      // Higher frequencies usually have less energy, so we boost them.
      val = val * (1.0 + (i / totalBins) * boostStrength);

      // 4. Temporal Smoothing (EMA)
      // current = lerp(previous, new, 0.2)
      this.normalizedData[i] = THREE.MathUtils.lerp(this.normalizedData[i], val, this.smoothing);
    }

    this.texture.needsUpdate = true;
  }

  dispose() {
    this.texture.dispose();
  }
}
