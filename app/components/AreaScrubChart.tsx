'use client';

import { useId, useRef, useState } from 'react';
import { YAxis, ResponsiveContainer, Area, AreaChart } from 'recharts';

/**
 * The portfolio page's chart, for any price series: one line coloured by
 * whether the window is up or down, a fading fill, no axes, grid or legend.
 *
 * Hovering reads the value off the drawn curve itself, so the marker glides
 * along the line rather than snapping between points. Press and drag to
 * measure: the span is shaded and the readout gives the change across it.
 *
 * Mirrors ScrubChart in Dashboard.tsx; fold that one into this once the
 * portfolio page's in-flight changes have landed.
 */

const C = {
  green: 'var(--bg-00ff41)', red: 'var(--bg-ff3333)',
  border: 'var(--bg-2a2a2a)', label: 'var(--fg-888888)', text: 'var(--fg-e0e0e0)',
};
const CHART_TOP = 4;

export interface ChartPoint { value: number; label: string }

// `w` is the chart's width when the point was taken, so render never reads the DOM.
type ScrubPoint = { x: number; y: number; value: number; label: string; w: number };

export default function AreaScrubChart({ series, height, format }: {
  series: ChartPoint[];
  height: number;
  /** Formats a value for the readout, e.g. "$187.20". */
  format: (v: number) => string;
}) {
  const gradientId = useId().replace(/:/g, '');
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<ScrubPoint | null>(null);
  const [anchor, setAnchor] = useState<ScrubPoint | null>(null);

  const values = series.map(p => p.value);
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const pad = (hi - lo) * 0.12 || hi * 0.02;
  const domain: [number, number] = [lo - pad, hi + pad];
  const trend = values[values.length - 1] >= values[0] ? C.green : C.red;

  const sample = (clientX: number): ScrubPoint | null => {
    const wrap = wrapRef.current;
    const path = wrap?.querySelector<SVGPathElement>('.recharts-area-curve');
    const svg = path?.ownerSVGElement;
    if (!wrap || !path || !svg) return null;

    const wrapBox = wrap.getBoundingClientRect();
    const svgBox = svg.getBoundingClientRect();
    const total = path.getTotalLength();
    const startX = path.getPointAtLength(0).x;
    const endX = path.getPointAtLength(total).x;
    if (endX <= startX) return null;
    const x = Math.min(endX, Math.max(startX, clientX - svgBox.left));

    // x only ever increases along the line, so bisect the length for this x.
    let a = 0, b = total;
    for (let i = 0; i < 24; i++) {
      const mid = (a + b) / 2;
      if (path.getPointAtLength(mid).x < x) a = mid; else b = mid;
    }
    const pt = path.getPointAtLength((a + b) / 2);

    const plotH = svgBox.height - CHART_TOP;
    const value = domain[1] - ((pt.y - CHART_TOP) / plotH) * (domain[1] - domain[0]);
    const idx = Math.round(((x - startX) / (endX - startX)) * (series.length - 1));

    return {
      x: svgBox.left - wrapBox.left + x,
      y: svgBox.top - wrapBox.top + pt.y,
      value,
      label: series[idx].label,
      w: wrapBox.width,
    };
  };

  const onDown = (e: React.PointerEvent) => {
    const p = sample(e.clientX);
    if (!p) return;
    // Keep receiving moves if the drag leaves the chart.
    e.currentTarget.setPointerCapture(e.pointerId);
    setAnchor(p);
    setHover(p);
  };
  const onMove = (e: React.PointerEvent) => setHover(sample(e.clientX));
  const onUp = () => setAnchor(null);
  const onLeave = () => { if (!anchor) setHover(null); };

  const width = hover?.w ?? 0;
  const measuring = anchor !== null && hover !== null && Math.abs(hover.x - anchor.x) > 2;
  const [from, to] = measuring
    ? (anchor!.x <= hover!.x ? [anchor!, hover!] : [hover!, anchor!])
    : [null, null];
  const delta = from && to ? to.value - from.value : 0;
  const pct = from && from.value ? (delta / from.value) * 100 : 0;
  const deltaColor = delta >= 0 ? C.green : C.red;

  // The readout sits beside the cursor, flipped to the left near the right edge.
  const flip = hover !== null && hover.x > width - 190;

  const marker = (p: ScrubPoint, color: string) => (
    <>
      <div style={{
        position: 'absolute', left: p.x, top: 10, bottom: 0, width: 0,
        borderLeft: `1px dashed ${C.label}`, pointerEvents: 'none',
      }} />
      <div style={{
        position: 'absolute', left: p.x - 4, top: p.y - 4, width: 8, height: 8,
        borderRadius: '50%', background: color, pointerEvents: 'none',
      }} />
    </>
  );

  return (
    <div
      ref={wrapRef}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => { setAnchor(null); setHover(null); }}
      onPointerLeave={onLeave}
      style={{ position: 'relative', touchAction: 'pan-y', cursor: 'crosshair', userSelect: 'none' }}
    >
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={series} margin={{ top: CHART_TOP, right: 0, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={trend} stopOpacity={0.22} />
                <stop offset="100%" stopColor={trend} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis domain={domain} hide />
            <Area
              type="monotone" dataKey="value" stroke={trend} strokeWidth={2}
              fill={`url(#${gradientId})`} dot={false} activeDot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {from && to && (
        <div style={{
          position: 'absolute', left: from.x, width: to.x - from.x, top: 10, bottom: 0,
          background: deltaColor, opacity: 0.08, pointerEvents: 'none',
        }} />
      )}
      {from && to && marker(from, deltaColor)}
      {hover && marker(hover, measuring ? deltaColor : trend)}
      {hover && (
        <div style={{
          position: 'absolute', top: 14,
          left: flip ? undefined : hover.x + 10,
          right: flip ? width - hover.x + 10 : undefined,
          background: 'var(--bg-0d0d0d)', border: `1px solid ${C.border}`,
          padding: '6px 10px', pointerEvents: 'none', whiteSpace: 'nowrap',
          fontFamily: 'Courier New, monospace',
        }}>
          {from && to ? (
            <>
              <div style={{ color: C.label, fontSize: '10px', letterSpacing: '1px' }}>{from.label} → {to.label}</div>
              <div style={{ color: deltaColor, fontSize: '13px', fontWeight: 'bold', marginTop: '2px' }}>
                {delta >= 0 ? '▲' : '▼'} {format(Math.abs(delta))} ({delta >= 0 ? '+' : '−'}{Math.abs(pct).toFixed(2)}%)
              </div>
            </>
          ) : (
            <>
              <div style={{ color: C.label, fontSize: '10px', letterSpacing: '1px' }}>{hover.label}</div>
              <div style={{ color: C.text, fontSize: '13px', fontWeight: 'bold', marginTop: '2px' }}>{format(hover.value)}</div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
