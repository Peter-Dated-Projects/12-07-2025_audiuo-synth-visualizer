import React, { useRef, useEffect, useState } from "react";

interface FrequencyBand {
  id: string;
  label: string;
  min: number;
  max: number;
  color: string;
  amplitude: number;
}

interface SpectrumAnalyzerProps {
  analyser: AnalyserNode | null;
  bands: FrequencyBand[];
  onBandChange: (id: string, newBand: Partial<FrequencyBand>) => void;
}

export const SpectrumAnalyzer: React.FC<SpectrumAnalyzerProps> = ({
  analyser,
  bands,
  onBandChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const smoothedDataRef = useRef<Float32Array | null>(null);
  const [hoveredSeparator, setHoveredSeparator] = useState<{
    bandId: string;
    edge: "min" | "max";
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    if (!analyser || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount; // 1024
    const dataArray = new Uint8Array(bufferLength);

    // Initialize smoothed data
    if (!smoothedDataRef.current || smoothedDataRef.current.length !== bufferLength) {
      smoothedDataRef.current = new Float32Array(bufferLength);
    }
    const smoothedData = smoothedDataRef.current;

    let animationId: number;

    const draw = () => {
      animationId = requestAnimationFrame(draw);

      analyser.getByteFrequencyData(dataArray);

      // Resize canvas to match display size
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }

      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);

      // Draw Frequency Bars
      // We only care about the first ~256 bins (up to ~11kHz) as that's where most visual action is
      const relevantBins = 256;
      const barWidth = width / relevantBins;

      for (let i = 0; i < relevantBins; i++) {
        // Smoothing
        const targetValue = dataArray[i];
        smoothedData[i] += (targetValue - smoothedData[i]) * 0.2;

        // Determine which band this bin belongs to
        let color = "#333"; // Default gray
        for (const band of bands) {
          if (i >= band.min && i <= band.max) {
            color = band.color;
            break;
          }
        }

        // Logarithmic Amplitude Scale
        // Map 0-255 to 0-1 logarithmically
        const val = Math.max(0, smoothedData[i]);
        const percent = Math.log10(val + 1) / Math.log10(256);

        const barHeight = Math.min(height, height * percent);

        ctx.fillStyle = color;
        ctx.fillRect(i * barWidth, height - barHeight, barWidth, barHeight);
      }

      // Draw Band Separators/Overlays
      bands.forEach((band) => {
        const minX = (band.min / relevantBins) * width;
        const maxX = (band.max / relevantBins) * width;

        // Semi-transparent overlay
        ctx.fillStyle = band.color + "33"; // 20% opacity
        ctx.fillRect(minX, 0, maxX - minX, height);

        // Edges
        ctx.fillStyle = "#fff";
        // Min Edge
        ctx.fillRect(minX - 1, 0, 2, height);
        // Max Edge
        ctx.fillRect(maxX - 1, 0, 2, height);

        // Label
        ctx.fillStyle = "#fff";
        ctx.font = "10px monospace";
        ctx.fillText(band.label, minX + 4, 12);
      });
    };

    draw();

    return () => cancelAnimationFrame(animationId);
  }, [analyser, bands]);

  // Interaction Logic (Simplified for MVP)
  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) return; // Handled by global mouse move if we implemented it, but for now local is fine

    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    const x = e.clientX - rect.left;
    const width = rect.width;
    const relevantBins = 256;
    const binIndex = Math.floor((x / width) * relevantBins);

    // Check if hovering near an edge
    const threshold = 5; // bins
    let found = null;

    for (const band of bands) {
      if (Math.abs(binIndex - band.min) < threshold) {
        found = { bandId: band.id, edge: "min" as const };
      } else if (Math.abs(binIndex - band.max) < threshold) {
        found = { bandId: band.id, edge: "max" as const };
      }
    }

    setHoveredSeparator(found);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (hoveredSeparator) {
      setIsDragging(true);

      const handleGlobalMove = (moveEvent: MouseEvent) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = moveEvent.clientX - rect.left;
        const width = rect.width;
        const relevantBins = 256;
        let newBin = Math.floor((x / width) * relevantBins);
        newBin = Math.max(0, Math.min(newBin, relevantBins - 1));

        const band = bands.find((b) => b.id === hoveredSeparator.bandId);
        if (!band) return;

        if (hoveredSeparator.edge === "min") {
          // Ensure min < max
          if (newBin < band.max - 1) {
            onBandChange(band.id, { min: newBin });
          }
        } else {
          // Ensure max > min
          if (newBin > band.min + 1) {
            onBandChange(band.id, { max: newBin });
          }
        }
      };

      const handleGlobalUp = () => {
        setIsDragging(false);
        window.removeEventListener("mousemove", handleGlobalMove);
        window.removeEventListener("mouseup", handleGlobalUp);
      };

      window.addEventListener("mousemove", handleGlobalMove);
      window.addEventListener("mouseup", handleGlobalUp);
    }
  };

  return (
    <div
      ref={containerRef}
      className="w-full h-[50px] bg-black relative cursor-crosshair select-none"
      onMouseMove={handleMouseMove}
      onMouseDown={handleMouseDown}
      style={{ cursor: hoveredSeparator ? "ew-resize" : "crosshair" }}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />
    </div>
  );
};
