import React from "react";

interface FrequencyBand {
  id: string;
  label: string;
  min: number;
  max: number;
  color: string;
  amplitude: number;
}

interface SidebarProps {
  bands: FrequencyBand[];
  onBandChange: (id: string, newBand: Partial<FrequencyBand>) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ bands, onBandChange }) => {
  return (
    <div className="w-64 h-full bg-zinc-900 border-l border-zinc-800 p-6 flex flex-col gap-6 overflow-y-auto z-30">
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
        {/* Container for lil-gui */}
        <div id="visualizer-controls-container" className="mb-4 relative z-50" />

        <p className="text-zinc-600 text-[10px] leading-relaxed">
          Drag the vertical lines in the spectrum analyzer below the visualizer to adjust frequency
          ranges.
        </p>
      </div>
    </div>
  );
};
