// Hand-rolled SVG chart primitives for the SSP match-stats panel. Light,
// dependency-free replacements for the previous Plotly-based components.
//
// All charts:
//   - Render in a 100%-width SVG that scales to the container; intrinsic
//     coords use viewBox so the design ratios stay constant.
//   - Use a shared legend on the right (per design).
//   - Provide a unified-hover surface (one vertical or horizontal cursor
//     band) so all series for a given x or y show simultaneously.
//
// Five primitives:
//   - MultiLine   : multi-series line chart over a categorical x-axis.
//   - GroupedBar  : multi-series grouped bar chart over a categorical x.
//   - StackedBar  : multi-series stacked bar chart over a categorical x.
//   - HBarGrouped : horizontal grouped bars over a categorical y (used
//                   for family/color frequency charts, with y-unified hover).
//   - Pie         : simple pie chart with right-side legend.
//
// Hover behavior:
//   - For x-axis charts the cursor is a vertical band; hovering anywhere on
//     the chart surface snaps the cursor to the nearest x category. A
//     tooltip lists every series' value at that x.
//   - For y-axis charts (HBarGrouped) the cursor is a horizontal band; the
//     tooltip lists every series' value for that y category.
//   - The pie chart shows per-slice tooltips on hover.

import { useRef, useState, type ReactNode } from 'react';

interface Series {
  /** Stable id for React keying and tooltip rows. */
  id: string;
  /** Display label (shown in legend + tooltip). */
  label: string;
  /** Bar/line color. */
  color: string;
  /** y-value per x category. */
  values: number[];
}

interface BaseLayout {
  /** y-axis title (rotated, on left). */
  yLabel?: string;
  /** x-axis title (centered, below). */
  xLabel?: string;
  /** Render the y-axis ticks with this suffix (e.g. '%'). */
  yTickSuffix?: string;
  /** Override the chart height in CSS pixels. Default 320. */
  height?: number;
  /** Number formatter for tooltip + tick labels. Defaults to integer. */
  formatY?: (v: number) => string;
}

// ============================================================
// MULTI-LINE
// ============================================================

export function MultiLine({ xLabels, series, yLabel, xLabel, height = 320, formatY }: BaseLayout & {
  xLabels: string[];
  series: Series[];
}) {
  const visible = useVisible(series);
  const max = niceMax(Math.max(1, ...visible.flatMap((s) => s.values)));
  const fmt = formatY ?? ((v: number) => String(Math.round(v)));
  return (
    <ChartFrame height={height}>
      <ChartBody
        kind="x"
        xLabels={xLabels}
        max={max}
        yLabel={yLabel}
        xLabel={xLabel}
        formatY={fmt}
        tooltipRows={(xi) => visible.map((s) => ({
          label: s.label, color: s.color, value: fmt(s.values[xi] ?? 0),
        }))}
        renderSeries={(g) => visible.map((s) => (
          <g key={s.id}>
            <polyline
              points={s.values.map((v, i) => `${g.x(i)},${g.y(v)}`).join(' ')}
              fill="none" stroke={s.color} strokeWidth={2.5} strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            {s.values.map((v, i) => (
              <circle key={i} cx={g.x(i)} cy={g.y(v)} r={3} fill={s.color} />
            ))}
          </g>
        ))}
      />
      <SeriesLegend series={visible.toggleable} />
    </ChartFrame>
  );
}

// ============================================================
// GROUPED BAR (vertical, multi-series per x)
// ============================================================

export function GroupedBar({ xLabels, series, yLabel, xLabel, height = 320, formatY }: BaseLayout & {
  xLabels: string[];
  series: Series[];
}) {
  const visible = useVisible(series);
  const max = niceMax(Math.max(1, ...visible.flatMap((s) => s.values)));
  const fmt = formatY ?? ((v: number) => String(Math.round(v * 100) / 100));
  const nSeries = Math.max(1, visible.length);
  return (
    <ChartFrame height={height}>
      <ChartBody
        kind="x"
        xLabels={xLabels}
        max={max}
        yLabel={yLabel}
        xLabel={xLabel}
        formatY={fmt}
        tooltipRows={(xi) => visible.map((s) => ({
          label: s.label, color: s.color, value: fmt(s.values[xi] ?? 0),
        }))}
        renderSeries={(g) => {
          const slot = g.bandWidth * 0.7;
          const barW = slot / nSeries;
          return visible.map((s, si) => (
            <g key={s.id}>
              {s.values.map((v, i) => {
                const cx = g.x(i) - slot / 2 + si * barW + barW / 2;
                const yTop = g.y(v);
                const yBase = g.y(0);
                return (
                  <rect key={i} x={cx - barW / 2} y={Math.min(yTop, yBase)}
                        width={barW * 0.92} height={Math.abs(yBase - yTop)}
                        fill={s.color} />
                );
              })}
            </g>
          ));
        }}
      />
      <SeriesLegend series={visible.toggleable} />
    </ChartFrame>
  );
}

// ============================================================
// STACKED BAR (single x category, layered series)
// ============================================================

export function StackedBar({ xLabels, series, yLabel, xLabel, height = 320, formatY }: BaseLayout & {
  xLabels: string[];
  series: Series[];
}) {
  const visible = useVisible(series);
  // Stacked y-max = max sum-of-visible across all xs.
  let max = 1;
  for (let xi = 0; xi < xLabels.length; xi++) {
    let sum = 0;
    for (const s of visible) sum += s.values[xi] ?? 0;
    if (sum > max) max = sum;
  }
  max = niceMax(max);
  const fmt = formatY ?? ((v: number) => String(Math.round(v)));
  return (
    <ChartFrame height={height}>
      <ChartBody
        kind="x"
        xLabels={xLabels}
        max={max}
        yLabel={yLabel}
        xLabel={xLabel}
        formatY={fmt}
        tooltipRows={(xi) => {
          let runningTotal = 0;
          const rows = visible.map((s) => {
            const v = s.values[xi] ?? 0;
            runningTotal += v;
            return { label: s.label, color: s.color, value: fmt(v) };
          });
          rows.push({ label: 'Total', color: '#444', value: fmt(runningTotal) });
          return rows;
        }}
        renderSeries={(g) => {
          const barW = g.bandWidth * 0.65;
          // For each x, layer rectangles from bottom up.
          return xLabels.map((_, xi) => {
            let acc = 0;
            return (
              <g key={xi}>
                {visible.map((s) => {
                  const v = s.values[xi] ?? 0;
                  if (v <= 0) return null;
                  const yTop = g.y(acc + v);
                  const yBot = g.y(acc);
                  acc += v;
                  return (
                    <rect key={s.id}
                          x={g.x(xi) - barW / 2}
                          y={yTop} width={barW}
                          height={Math.max(0, yBot - yTop)}
                          fill={s.color} />
                  );
                })}
              </g>
            );
          });
        }}
      />
      <SeriesLegend series={visible.toggleable} />
    </ChartFrame>
  );
}

// ============================================================
// HORIZONTAL GROUPED BAR (categorical y, multi-series, y-unified hover)
// ============================================================

export function HBarGrouped({ yLabels, series, xTickSuffix, height, formatX }: {
  yLabels: string[];
  series: Series[];
  xTickSuffix?: string;
  height?: number;
  formatX?: (v: number) => string;
}) {
  const visible = useVisible(series);
  const max = niceMax(Math.max(1, ...visible.flatMap((s) => s.values)));
  const fmt = formatX ?? ((v: number) => `${(Math.round(v * 10) / 10).toString()}${xTickSuffix ?? ''}`);
  const rowHeight = 52;
  const computedHeight = height ?? Math.max(360, yLabels.length * rowHeight + 60);
  const W = 720;
  const H = computedHeight;
  const padL = 110;
  const padR = 30;
  const padT = 16;
  const padB = 32;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const bandH = innerH / Math.max(1, yLabels.length);
  const ink = 'rgba(28, 26, 46, 0.7)';
  const inkLight = 'rgba(28, 26, 46, 0.12)';
  const [hoverY, setHoverY] = useState<number | null>(null);

  const yBand = (yi: number) => padT + yi * bandH;

  return (
    <ChartFrame height={computedHeight}>
      <div style={{ position: 'relative', flex: 1 }}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          width="100%"
          height={computedHeight}
          preserveAspectRatio="none"
          onMouseMove={(e) => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const ny = ((e.clientY - rect.top) / rect.height) * H;
            const yi = Math.floor((ny - padT) / bandH);
            setHoverY(yi >= 0 && yi < yLabels.length ? yi : null);
          }}
          onMouseLeave={() => setHoverY(null)}
        >
          {/* x-axis grid + ticks */}
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={padL + f * innerW} y1={padT} x2={padL + f * innerW} y2={padT + innerH}
                    stroke={inkLight} strokeDasharray="3 3" />
              <text x={padL + f * innerW} y={H - 10} fontSize={11} textAnchor="middle" fill={ink}>
                {fmt(f * max)}
              </text>
            </g>
          ))}
          {/* hover band */}
          {hoverY != null && (
            <rect x={padL} y={yBand(hoverY)} width={innerW} height={bandH}
                  fill="rgba(0,0,0,0.06)" />
          )}
          {/* category labels + bars */}
          {yLabels.map((lbl, yi) => {
            const cy = yBand(yi) + bandH / 2;
            const slot = bandH * 0.7;
            const barH = slot / Math.max(1, visible.length);
            return (
              <g key={lbl}>
                <text x={padL - 6} y={cy + 3} fontSize={11} textAnchor="end" fill={ink}>
                  {lbl}
                </text>
                {visible.map((s, si) => {
                  const v = s.values[yi] ?? 0;
                  const w = (v / max) * innerW;
                  const y = yBand(yi) + (bandH - slot) / 2 + si * barH;
                  return (
                    <rect key={s.id} x={padL} y={y} width={w} height={barH * 0.88}
                          fill={s.color}
                          fillOpacity={s.id === 'deck' ? 0.5 : 1}
                          stroke={s.id === 'deck' ? '#444' : 'none'}
                          strokeDasharray={s.id === 'deck' ? '3 2' : undefined} />
                  );
                })}
              </g>
            );
          })}
        </svg>
        {/* y-unified tooltip */}
        {hoverY != null && (
          <Tooltip x={'auto'} y={(yBand(hoverY) + bandH / 2) / H * 100}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{yLabels[hoverY]}</div>
            {visible.map((s) => (
              <div key={s.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ width: 10, height: 10, background: s.color, borderRadius: 2 }} />
                <span>{s.label}</span>
                <span style={{ marginLeft: 'auto' }}>{fmt(s.values[hoverY] ?? 0)}</span>
              </div>
            ))}
          </Tooltip>
        )}
      </div>
      <SeriesLegend series={visible.toggleable} />
    </ChartFrame>
  );
}

// ============================================================
// PIE
// ============================================================

export function Pie({ slices, height = 300 }: {
  slices: Array<{ label: string; color: string; value: number }>;
  height?: number;
}) {
  const total = slices.reduce((a, s) => a + s.value, 0);
  const [hover, setHover] = useState<number | null>(null);
  const W = 320;
  const H = height;
  const r = Math.min(W, H) / 2 - 12;
  const cx = W / 2;
  const cy = H / 2;
  let acc = 0;
  return (
    <ChartFrame height={height}>
      <div style={{ position: 'relative', flex: 1 }}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="xMidYMid meet">
          {slices.length === 1 ? (
            <circle cx={cx} cy={cy} r={r} fill={slices[0].color} stroke="#fff" strokeWidth={1} />
          ) : (
            slices.map((s, i) => {
              const startA = (acc / total) * Math.PI * 2 - Math.PI / 2;
              acc += s.value;
              const endA = (acc / total) * Math.PI * 2 - Math.PI / 2;
              const x1 = cx + r * Math.cos(startA);
              const y1 = cy + r * Math.sin(startA);
              const x2 = cx + r * Math.cos(endA);
              const y2 = cy + r * Math.sin(endA);
              const largeArc = endA - startA > Math.PI ? 1 : 0;
              const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
              return (
                <path key={i} d={d} fill={s.color}
                      stroke="#fff" strokeWidth={1}
                      onMouseEnter={() => setHover(i)}
                      onMouseLeave={() => setHover(null)} />
              );
            })
          )}
        </svg>
        {hover != null && (
          <Tooltip x={50} y={10}>
            <div style={{ fontWeight: 600 }}>{slices[hover].label}</div>
            <div style={{ opacity: 0.7 }}>
              {slices[hover].value} ({((slices[hover].value / total) * 100).toFixed(0)}%)
            </div>
          </Tooltip>
        )}
      </div>
      <div className="ssp-svg-legend">
        {slices.map((s, i) => (
          <div key={i} className="ssp-svg-legend-row">
            <span className="swatch" style={{ background: s.color }} />
            <span className="lbl">{s.label}</span>
            <span className="num">{((s.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </ChartFrame>
  );
}

// ============================================================
// INTERNALS
// ============================================================

/** Right-side legend with toggleable series. */
function SeriesLegend({ series }: {
  series: Array<{ id: string; label: string; color: string; active: boolean; onToggle: () => void }>;
}) {
  return (
    <div className="ssp-svg-legend">
      {series.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={s.onToggle}
          className="ssp-svg-legend-row"
          style={{
            opacity: s.active ? 1 : 0.35,
            textDecoration: s.active ? 'none' : 'line-through',
          }}
        >
          <span className="swatch" style={{ background: s.color }} />
          <span className="lbl">{s.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Hook to track per-series visibility toggles. Returns a thin array-like that
 *  supports the .flatMap and .map calls the chart bodies make, plus a
 *  `toggleable` view for the legend. */
function useVisible(series: Series[]) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const visible = series.filter((s) => !hidden.has(s.id));
  return Object.assign(visible, {
    toggleable: series.map((s) => ({
      ...s, active: !hidden.has(s.id),
      onToggle: () => setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
        return next;
      }),
    })),
  });
}

interface AxisGrid {
  x: (i: number) => number;
  y: (v: number) => number;
  bandWidth: number;
}

/** Shared axis + grid renderer for x-categorical charts (line + grouped bar
 *  + stacked bar). Hover snaps to the nearest x category and emits a unified
 *  tooltip via `tooltipRows`. */
function ChartBody({
  kind, xLabels, max, yLabel, xLabel, formatY, renderSeries, tooltipRows,
}: {
  kind: 'x';
  xLabels: string[];
  max: number;
  yLabel?: string;
  xLabel?: string;
  formatY: (v: number) => string;
  renderSeries: (g: AxisGrid) => ReactNode;
  tooltipRows: (xi: number) => Array<{ label: string; color: string; value: string }>;
}) {
  void kind;
  const W = 720;
  const H = 280;
  const padL = 56;
  const padR = 24;
  const padT = 14;
  const padB = 40;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const n = Math.max(1, xLabels.length);
  const bandWidth = innerW / n;
  const x = (i: number) => padL + bandWidth * (i + 0.5);
  const y = (v: number) => padT + innerH - (v / max) * innerH;
  const ink = 'rgba(28, 26, 46, 0.7)';
  const inkLight = 'rgba(28, 26, 46, 0.12)';
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const [hoverX, setHoverX] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  return (
    <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        width="100%" height={H}
        preserveAspectRatio="none"
        style={{ display: 'block' }}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const nx = ((e.clientX - rect.left) / rect.width) * W;
          const idx = Math.floor((nx - padL) / bandWidth);
          setHoverX(idx >= 0 && idx < xLabels.length ? idx : null);
        }}
        onMouseLeave={() => setHoverX(null)}
      >
        {/* y-axis grid + tick labels */}
        {ticks.map((f) => (
          <g key={f}>
            <line x1={padL} y1={padT + (1 - f) * innerH} x2={W - padR} y2={padT + (1 - f) * innerH}
                  stroke={inkLight} strokeDasharray="3 3" />
            <text x={padL - 8} y={padT + (1 - f) * innerH + 4} fontSize={11} textAnchor="end" fill={ink}>
              {formatY(f * max)}
            </text>
          </g>
        ))}
        {/* hover band */}
        {hoverX != null && (
          <rect x={x(hoverX) - bandWidth / 2} y={padT} width={bandWidth} height={innerH}
                fill="rgba(0,0,0,0.06)" />
        )}
        {/* x-axis tick labels */}
        {xLabels.map((lbl, i) => (
          <text key={i} x={x(i)} y={H - 12} fontSize={11} textAnchor="middle" fill={ink}>
            {lbl}
          </text>
        ))}
        {/* y-label (rotated) */}
        {yLabel && (
          <text x={14} y={padT + innerH / 2} fontSize={11} fill={ink}
                transform={`rotate(-90 14 ${padT + innerH / 2})`} textAnchor="middle">
            {yLabel}
          </text>
        )}
        {/* x-label */}
        {xLabel && (
          <text x={padL + innerW / 2} y={H - 1} fontSize={11} textAnchor="middle" fill={ink}>
            {xLabel}
          </text>
        )}
        {renderSeries({ x, y, bandWidth })}
      </svg>
      {hoverX != null && (
        <Tooltip x={(x(hoverX) / W) * 100} y={10}>
          <div style={{ fontWeight: 600, marginBottom: 4 }}>{xLabels[hoverX]}</div>
          {tooltipRows(hoverX).map((r, i) => (
            <div key={i} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ width: 10, height: 10, background: r.color, borderRadius: 2 }} />
              <span>{r.label}</span>
              <span style={{ marginLeft: 'auto' }}>{r.value}</span>
            </div>
          ))}
        </Tooltip>
      )}
    </div>
  );
}

/** Floating tooltip positioned by % of parent width/height (or 'auto' to
 *  anchor at the right edge of the chart area). */
function Tooltip({ x, y, children }: { x: number | 'auto'; y: number; children: ReactNode }) {
  const style: React.CSSProperties = {
    position: 'absolute',
    top: `${y}%`,
    background: '#fff',
    color: 'var(--paper-ink)',
    border: '1px solid rgba(0,0,0,0.15)',
    borderRadius: 4,
    padding: '6px 8px',
    fontSize: 11,
    minWidth: 140,
    boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
    pointerEvents: 'none',
    transform: 'translateY(-50%)',
  };
  if (x === 'auto') {
    style.right = 8;
  } else {
    style.left = `${x}%`;
    style.transform = 'translate(-50%, -50%)';
  }
  return <div style={style}>{children}</div>;
}

/** Layout shell: row of chart-body + legend. */
function ChartFrame({ height, children }: { height: number; children: ReactNode }) {
  return (
    <div
      className="ssp-svg-chart"
      style={{
        display: 'flex', gap: 12, alignItems: 'stretch',
        minHeight: height,
        marginBottom: 12,
      }}
    >
      {children}
    </div>
  );
}

/** Round a max value up to a "nice" number (1, 2, 5 × 10^k). */
export function niceMax(raw: number): number {
  if (raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const mag = Math.pow(10, exp);
  const norm = raw / mag;
  let nice: number;
  if (norm <= 1) nice = 1;
  else if (norm <= 2) nice = 2;
  else if (norm <= 5) nice = 5;
  else nice = 10;
  return nice * mag;
}
