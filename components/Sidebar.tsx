import React, { useState } from "react";

interface FrequencyBand {
  id: string;
  label: string;
  min: number;
  max: number;
  color: string;
  amplitude: number;
}

export interface FrequencyAnalysisSettings {
  useDynamicFreq: boolean;
  method: "dominant_pitch" | "spectral_centroid" | "band_power";
  baseFrequency: number;
  multiplier: number;
  minFreq: number;
  maxFreq: number;
  smoothing: number;
}

interface SidebarProps {
  bands: FrequencyBand[];
  onBandChange: (id: string, newBand: Partial<FrequencyBand>) => void;
  visualizerType: "spectrum" | "lissajous" | "harmonic";
  onVisualizerTypeChange: (type: "spectrum" | "lissajous" | "harmonic") => void;
  frequencySettings?: FrequencyAnalysisSettings;
  onFrequencySettingsChange?: (settings: Partial<FrequencyAnalysisSettings>) => void;
  presets?: Record<string, FrequencyBand[]>;
  currentPreset?: string;
  onPresetChange?: (presetName: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  bands,
  onBandChange,
  visualizerType,
  onVisualizerTypeChange,
  frequencySettings = {
    useDynamicFreq: true,
    method: "band_power",
    baseFrequency: 3.0,
    multiplier: 5.0,
    minFreq: 1.0,
    maxFreq: 12.0,
    smoothing: 0.1,
  },
  onFrequencySettingsChange = () => {},
  presets,
  currentPreset = "default",
  onPresetChange = () => {},
}) => {
  const [showAdvanced, setShowAdvanced] = useState(false);
  return (
    <div className="w-64 h-full bg-zinc-900 border-l border-zinc-800 p-6 flex flex-col gap-6 overflow-y-auto z-30">
      {/* Visualizer Selector */}
      <div className="flex flex-col gap-2 border-b border-zinc-800 pb-4">
        <h2 className="text-zinc-100 font-mono text-sm uppercase tracking-wider">
          Visualizer Mode
        </h2>
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <button
              onClick={() => onVisualizerTypeChange("spectrum")}
              className={`flex-1 py-1 px-2 text-xs font-mono uppercase rounded border ${
                visualizerType === "spectrum"
                  ? "bg-zinc-100 text-zinc-900 border-zinc-100"
                  : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500"
              }`}
            >
              Spectrum
            </button>
            <button
              onClick={() => onVisualizerTypeChange("lissajous")}
              className={`flex-1 py-1 px-2 text-xs font-mono uppercase rounded border ${
                visualizerType === "lissajous"
                  ? "bg-zinc-100 text-zinc-900 border-zinc-100"
                  : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500"
              }`}
            >
              Lissajous
            </button>
          </div>
          <button
            onClick={() => onVisualizerTypeChange("harmonic")}
            className={`w-full py-1 px-2 text-xs font-mono uppercase rounded border ${
              visualizerType === "harmonic"
                ? "bg-zinc-100 text-zinc-900 border-zinc-100"
                : "bg-zinc-900 text-zinc-400 border-zinc-700 hover:border-zinc-500"
            }`}
          >
            Harmonic (Restored)
          </button>
        </div>
      </div>

      {/* Preset Selector */}
      {presets && (
        <div className="flex flex-col gap-2 border-b border-zinc-800 pb-4">
          <h2 className="text-zinc-100 font-mono text-sm uppercase tracking-wider">
            Frequency Preset
          </h2>
          <select
            value={currentPreset}
            onChange={(e) => onPresetChange(e.target.value)}
            className="w-full px-3 py-2 bg-zinc-800 text-zinc-100 border border-zinc-700 rounded font-mono text-xs focus:outline-none focus:border-zinc-500 hover:border-zinc-500 transition-colors"
          >
            {Object.keys(presets).map((presetName) => (
              <option key={presetName} value={presetName}>
                {presetName
                  .split("-")
                  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(" ")}
              </option>
            ))}
          </select>
          <p className="text-zinc-500 text-[10px] font-mono leading-relaxed">
            Quick configurations for different audio styles. Changes affect all 4 frequency bands.
          </p>
        </div>
      )}

      {/* Frequency Analysis Settings (only show for Lissajous) */}
      {visualizerType === "lissajous" && (
        <div className="flex flex-col gap-3 border-b border-zinc-800 pb-4">
          <h2 className="text-zinc-100 font-mono text-sm uppercase tracking-wider">
            Dynamic Frequencies
          </h2>

          {/* Enable/Disable Toggle */}
          <div className="flex items-center justify-between">
            <label className="text-zinc-400 text-xs">Enable Dynamic</label>
            <input
              type="checkbox"
              checked={frequencySettings.useDynamicFreq}
              onChange={(e) => onFrequencySettingsChange({ useDynamicFreq: e.target.checked })}
              className="w-4 h-4 cursor-pointer"
            />
          </div>

          {frequencySettings.useDynamicFreq && (
            <>
              {/* Method Selection */}
              <div className="flex flex-col gap-2">
                <label className="text-zinc-600 text-[10px] uppercase">Method</label>
                <select
                  value={frequencySettings.method}
                  onChange={(e) => onFrequencySettingsChange({ method: e.target.value as any })}
                  className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 font-mono focus:border-red-500 outline-none"
                >
                  <option value="band_power">Band Power (Recommended)</option>
                  <option value="dominant_pitch">Dominant Pitch</option>
                  <option value="spectral_centroid">Spectral Centroid</option>
                </select>
              </div>

              {/* Method Description */}
              <div className="bg-zinc-950 border border-zinc-800 rounded p-2">
                <p className="text-zinc-500 text-[10px] leading-relaxed">
                  {frequencySettings.method === "band_power" && (
                    <>
                      <span className="text-zinc-400 font-semibold">Band Power:</span> Maps
                      bass/treble volume to frequencies. Most stable and visually pleasing.
                    </>
                  )}
                  {frequencySettings.method === "dominant_pitch" && (
                    <>
                      <span className="text-zinc-400 font-semibold">Dominant Pitch:</span> Uses the
                      loudest frequencies. Can be jittery but very reactive.
                    </>
                  )}
                  {frequencySettings.method === "spectral_centroid" && (
                    <>
                      <span className="text-zinc-400 font-semibold">Spectral Centroid:</span> Tracks
                      the "brightness" of sound. Smooth and texture-focused.
                    </>
                  )}
                </p>
              </div>

              {/* Advanced Settings Toggle */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-zinc-500 hover:text-zinc-300 text-[10px] uppercase text-left"
              >
                {showAdvanced ? "▼" : "▶"} Advanced Settings
              </button>

              {showAdvanced && (
                <div className="flex flex-col gap-3 pl-3 border-l-2 border-zinc-800">
                  {/* Base Frequency */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between">
                      <label className="text-zinc-600 text-[10px] uppercase">Base Frequency</label>
                      <span className="text-zinc-500 text-[10px] font-mono">
                        {frequencySettings.baseFrequency.toFixed(1)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="10"
                      step="0.5"
                      value={frequencySettings.baseFrequency}
                      onChange={(e) =>
                        onFrequencySettingsChange({ baseFrequency: parseFloat(e.target.value) })
                      }
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-zinc-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:hover:bg-white"
                    />
                  </div>

                  {/* Multiplier */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between">
                      <label className="text-zinc-600 text-[10px] uppercase">Multiplier</label>
                      <span className="text-zinc-500 text-[10px] font-mono">
                        {frequencySettings.multiplier.toFixed(1)}x
                      </span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="15"
                      step="0.5"
                      value={frequencySettings.multiplier}
                      onChange={(e) =>
                        onFrequencySettingsChange({ multiplier: parseFloat(e.target.value) })
                      }
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-zinc-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:hover:bg-white"
                    />
                  </div>

                  {/* Smoothing */}
                  <div className="flex flex-col gap-1">
                    <div className="flex justify-between">
                      <label className="text-zinc-600 text-[10px] uppercase">Smoothing</label>
                      <span className="text-zinc-500 text-[10px] font-mono">
                        {(frequencySettings.smoothing * 100).toFixed(0)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0.01"
                      max="0.5"
                      step="0.01"
                      value={frequencySettings.smoothing}
                      onChange={(e) =>
                        onFrequencySettingsChange({ smoothing: parseFloat(e.target.value) })
                      }
                      className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-zinc-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:hover:bg-white"
                    />
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      <h2 className="text-zinc-100 font-mono text-sm uppercase tracking-wider border-b border-zinc-800 pb-2">
        Frequency Bands
      </h2>

      <div className="flex flex-col gap-6">
        {bands.map((band) => (
          <div key={band.id} className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-zinc-400 text-xs font-mono uppercase">{band.label}</span>
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: band.color }} />
            </div>

            {/* Color Picker */}
            <div className="flex items-center gap-2">
              <label className="text-zinc-600 text-[10px] uppercase">Color</label>
              <input
                type="color"
                value={band.color}
                onChange={(e) => onBandChange(band.id, { color: e.target.value })}
                className="w-full h-6 bg-transparent border-none cursor-pointer"
              />
            </div>

            {/* Amplitude Slider */}
            <div className="flex flex-col gap-1">
              <div className="flex justify-between">
                <label className="text-zinc-600 text-[10px] uppercase">Amplitude</label>
                <span className="text-zinc-500 text-[10px] font-mono">
                  {band.amplitude.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={band.amplitude}
                onChange={(e) => onBandChange(band.id, { amplitude: parseFloat(e.target.value) })}
                className="w-full h-1 bg-zinc-800 rounded-lg appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-zinc-400 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:hover:bg-white"
              />
            </div>

            {/* Range Inputs (Manual Control) */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label className="text-zinc-600 text-[10px] uppercase">Min</label>
                <input
                  type="number"
                  value={band.min}
                  onChange={(e) => onBandChange(band.id, { min: parseInt(e.target.value) })}
                  className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 font-mono focus:border-red-500 outline-none"
                />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-zinc-600 text-[10px] uppercase">Max</label>
                <input
                  type="number"
                  value={band.max}
                  onChange={(e) => onBandChange(band.id, { max: parseInt(e.target.value) })}
                  className="bg-zinc-950 border border-zinc-800 rounded px-2 py-1 text-xs text-zinc-300 font-mono focus:border-red-500 outline-none"
                />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-auto pt-6 border-t border-zinc-800">
        <p className="text-zinc-600 text-[10px] leading-relaxed">
          Drag the vertical lines in the spectrum analyzer below the visualizer to adjust frequency
          ranges.
        </p>
      </div>
    </div>
  );
};
