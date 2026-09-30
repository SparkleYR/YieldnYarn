"use client";

import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";

export interface PriceTrendPoint {
  date: string;
  price: number;
}

const WIDTH = 600;
const HEIGHT = 200;
const PAD_LEFT = 44;
const PAD_RIGHT = 16;
const PAD_TOP = 16;
const PAD_BOTTOM = 24;

/**
 * A single-series price trend line chart: 2px line, ~10% area wash, hairline
 * gridlines, an end marker with a direct label, and a hover crosshair +
 * tooltip. No legend — a single series is identified by the chart title.
 */
export function PriceTrendChart({
  data,
  unit = "₹/qtl",
  className,
}: {
  data: PriceTrendPoint[];
  unit?: string;
  className?: string;
}) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);

  const { points, yTicks, plotW, plotH } = useMemo(() => {
    const plotW = WIDTH - PAD_LEFT - PAD_RIGHT;
    const plotH = HEIGHT - PAD_TOP - PAD_BOTTOM;
    const prices = data.map((d) => d.price);
    const min = Math.min(...prices);
    const max = Math.max(...prices);
    const yPad = (max - min) * 0.15 || max * 0.1 || 1;
    const yMin = min - yPad;
    const yMax = max + yPad;

    const xScale = (i: number) =>
      PAD_LEFT + (data.length === 1 ? 0 : (i / (data.length - 1)) * plotW);
    const yScale = (v: number) =>
      PAD_TOP + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

    const points = data.map((d, i) => ({ x: xScale(i), y: yScale(d.price), ...d }));

    const steps = 3;
    const yTicks = Array.from({ length: steps + 1 }, (_, i) => {
      const value = yMin + (i / steps) * (yMax - yMin);
      return { value, y: yScale(value) };
    });

    return { points, yTicks, plotW, plotH };
  }, [data]);

  const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x},${p.y}`).join(" ");
  const areaPath = `${linePath} L${points[points.length - 1].x},${PAD_TOP + plotH} L${points[0].x},${PAD_TOP + plotH} Z`;

  const last = points[points.length - 1];
  const hovered = hoverIndex !== null ? points[hoverIndex] : null;

  function handlePointerMove(e: React.PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * WIDTH;
    let nearest = 0;
    let nearestDist = Infinity;
    points.forEach((p, i) => {
      const dist = Math.abs(p.x - px);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = i;
      }
    });
    setHoverIndex(nearest);
  }

  return (
    <div className={cn("relative w-full", className)}>
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="w-full"
        role="img"
        aria-label={`Price trend, ${data[0]?.date} to ${data[data.length - 1]?.date}, ending at ${unit} ${last.price}`}
      >
        {/* gridlines */}
        {yTicks.map((tick) => (
          <g key={tick.value}>
            <line
              x1={PAD_LEFT}
              x2={WIDTH - PAD_RIGHT}
              y1={tick.y}
              y2={tick.y}
              className="stroke-border-muted"
              strokeWidth={1}
            />
            <text
              x={PAD_LEFT - 8}
              y={tick.y}
              textAnchor="end"
              dominantBaseline="middle"
              className="fill-muted-2 text-[11px] font-semibold"
            >
              {Math.round(tick.value)}
            </text>
          </g>
        ))}

        {/* area wash */}
        <path d={areaPath} fill="#047857" fillOpacity={0.1} stroke="none" />

        {/* line */}
        <path
          d={linePath}
          fill="none"
          stroke="#047857"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* end marker */}
        <circle cx={last.x} cy={last.y} r={4} fill="#047857" stroke="var(--color-surface)" strokeWidth={2} />
        <text x={last.x} y={last.y - 12} textAnchor="end" className="fill-heading text-xs font-bold">
          {unit} {last.price.toLocaleString("en-IN")}
        </text>

        {/* crosshair */}
        {hovered && (
          <>
            <line
              x1={hovered.x}
              x2={hovered.x}
              y1={PAD_TOP}
              y2={PAD_TOP + plotH}
              className="stroke-border"
              strokeWidth={1}
            />
            <circle
              cx={hovered.x}
              cy={hovered.y}
              r={4}
              fill="#047857"
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
          </>
        )}

        {/* hover hit layer */}
        <rect
          x={PAD_LEFT}
          y={0}
          width={plotW}
          height={HEIGHT}
          fill="transparent"
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setHoverIndex(null)}
        />
      </svg>

      {hovered && (
        <div
          className="pointer-events-none absolute top-2 flex -translate-x-1/2 flex-col gap-0.5 rounded-lg border border-border bg-card px-3 py-2 text-sm shadow-lg"
          style={{ left: `${(hovered.x / WIDTH) * 100}%` }}
        >
          <span className="text-muted-2">{hovered.date}</span>
          <span className="font-semibold text-heading">
            {unit} {hovered.price.toLocaleString("en-IN")}
          </span>
        </div>
      )}
    </div>
  );
}
