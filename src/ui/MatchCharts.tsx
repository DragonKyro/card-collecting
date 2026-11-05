// Post-game match stats: hand-rolled SVG charts and the tabbed panel that
// holds them. Game-agnostic and dependency-free; each game's GameOver view
// turns its own state into series and lays the tabs out (SSP, Sushi Go,
// Jaipur).
//
//   StatsTabs    the panel: a title, a Chart / Table switch and one tab per
//                view (`children(activeTab)` renders the active one)
//   ChartSelect  a labelled dropdown above a chart (round, player, metric)
//   MultiLine    lines over a categorical x axis
//   GroupedBar   side-by-side bars per x category
//   StackedBar   stacked bars per x category (tooltip adds a total)
//   HBarGrouped  horizontal grouped bars over categorical rows
//   Pie          part-to-whole, legend with percentages
//
// Every chart answers hover / tap with one tooltip for the whole category
// (each series' value there, plus its `notes`), has a legend that hides and
// shows series (colors follow the series, never its position), and renders
// as a plain table when the panel is switched to Table — so no value is only
// reachable by hovering. Charts measure their own width, so text keeps its
// size on a phone; values may be negative. Colors and ink come from the
// `--mc-*` custom properties on `.match-stats` (theme.css), which a game can
// override for a dark panel.

import {
  createContext, useCallback, useContext, useRef, useState, type CSSProperties, type ReactNode,
} from 'react';

export interface Series {
  /** Stable id for React keys and the legend toggle. */
  id: string;
  /** Legend, tooltip and table label. */
  label: string;
  color: string;
  /** One value per category. */
  values: number[];
  /** Optional text per category, shown after the value in the tooltip and the table. */
  notes?: Array<string | undefined>;
  /** A reference series (e.g. the deck's make-up): drawn as a faint dashed outline. */
  baseline?: boolean;
}

interface XLayout {
  /** One label per category (thinned on the axis when crowded). */
  xLabels: string[];
  /** Longer per-category titles for the tooltip and the table (default: the label). */
  xTitles?: string[];
  series: Series[];
  yLabel?: string;
  xLabel?: string;
  /** Plot height in CSS pixels (axes included). Default 280. */
  height?: number;
  formatY?: (v: number) => string;
}

// ============================================================
// PANEL
// ============================================================

type View = 'chart' | 'table';
const ViewContext = createContext<View>('chart');

export interface StatsTab<T extends string> {
  key: T;
  label: string;
  /** False for a tab that is already a table (hides the Chart / Table switch). */
  table?: boolean;
}

export function StatsTabs<T extends string>({ tabs, title = 'Match stats', className, children }: {
  tabs: Array<StatsTab<T>>;
  title?: string;
  className?: string;
  children: (active: T) => ReactNode;
}) {
  const [active, setActive] = useState<T>(tabs[0].key);
  const [view, setView] = useState<View>('chart');
  const tab = tabs.find((t) => t.key === active) ?? tabs[0];
  return (
    <section className={`match-stats${className ? ` ${className}` : ''}`} aria-label={title}>
      <div className="match-stats-head">
        <h2>📊 {title}</h2>
        {tab.table !== false && (
          <div className="match-stats-view" role="group" aria-label="Show as">
            {(['chart', 'table'] as const).map((v) => (
              <button
                key={v}
                type="button"
                aria-pressed={view === v}
                className={view === v ? 'active' : ''}
                onClick={() => setView(v)}
              >
                {v === 'chart' ? 'Chart' : 'Table'}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="match-stats-tabs" role="tablist">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={active === t.key}
            className={active === t.key ? 'active' : ''}
            onClick={() => setActive(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="match-stats-panel" role="tabpanel">
        <ViewContext.Provider value={view}>{children(tab.key)}</ViewContext.Provider>
      </div>
    </section>
  );
}

export function ChartSelect<T extends string | number>({ label, value, options, onChange }: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
}) {
  return (
    <label className="mc-select">
      <span>{label}</span>
      <select
        value={String(value)}
        onChange={(e) => {
          const hit = options.find((o) => String(o.value) === e.target.value);
          if (hit) onChange(hit.value);
        }}
      >
        {options.map((o) => <option key={String(o.value)} value={String(o.value)}>{o.label}</option>)}
      </select>
    </label>
  );
}

/** A row of controls above a chart. */
export function ChartControls({ children }: { children: ReactNode }) {
  return <div className="mc-controls">{children}</div>;
}

/** A short explanatory line under a chart. */
export function ChartNote({ children }: { children: ReactNode }) {
  return <p className="mc-note">{children}</p>;
}

// ============================================================
// MULTI-LINE
// ============================================================

export function MultiLine({ markers = true, ...props }: XLayout & {
  /** Dots on every point (off for long series). */
  markers?: boolean;
}) {
  const { xLabels, series, formatY } = props;
  const visible = useVisible(series);
  const fmt = formatY ?? defaultFormat;
  return (
    <XChart {...props} visible={visible} fmt={fmt} scale={scaleFor(visible.flatMap((s) => s.values))}
      renderSeries={(g) => visible.map((s) => (
        <g key={s.id}>
          <polyline
            points={s.values.map((v, i) => `${g.x(i)},${g.y(v)}`).join(' ')}
            fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round"
          />
          {(markers || xLabels.length === 1) && s.values.map((v, i) => (
            <circle key={i} cx={g.x(i)} cy={g.y(v)} r={4} fill={s.color} className="mc-marker" />
          ))}
        </g>
      ))}
    />
  );
}

// ============================================================
// GROUPED BAR
// ============================================================

export function GroupedBar(props: XLayout) {
  const visible = useVisible(props.series);
  const fmt = props.formatY ?? defaultFormat;
  const n = Math.max(1, visible.length);
  return (
    <XChart {...props} visible={visible} fmt={fmt} scale={scaleFor(visible.flatMap((s) => s.values))}
      renderSeries={(g) => {
        const slot = g.bandWidth * 0.72;
        const barW = slot / n;
        return visible.map((s, si) => (
          <g key={s.id}>
            {s.values.map((v, i) => {
              const left = g.x(i) - slot / 2 + si * barW;
              const top = Math.min(g.y(v), g.y(0));
              return (
                <rect key={i} x={left + 1} y={top} width={Math.max(1, barW - 2)}
                      height={Math.abs(g.y(0) - g.y(v))} {...barPaint(s)} />
              );
            })}
          </g>
        ));
      }}
    />
  );
}

// ============================================================
// STACKED BAR
// ============================================================

/** Stacks the positive values of every visible series per x category. */
export function StackedBar(props: XLayout) {
  const visible = useVisible(props.series);
  const fmt = props.formatY ?? defaultFormat;
  const totals = props.xLabels.map((_, xi) => visible.reduce((sum, s) => sum + Math.max(0, s.values[xi] ?? 0), 0));
  return (
    <XChart {...props} visible={visible} fmt={fmt} scale={scaleFor(totals)} totals={totals}
      renderSeries={(g) => {
        const barW = g.bandWidth * 0.62;
        return props.xLabels.map((_, xi) => {
          let acc = 0;
          return (
            <g key={xi}>
              {visible.map((s) => {
                const v = s.values[xi] ?? 0;
                if (v <= 0) return null;
                const top = g.y(acc + v);
                const bottom = g.y(acc);
                acc += v;
                // A 2px gap between segments, taken from the top of each.
                return (
                  <rect key={s.id} x={g.x(xi) - barW / 2} y={top + 1} width={barW}
                        height={Math.max(0, bottom - top - 2)} {...barPaint(s)} />
                );
              })}
            </g>
          );
        });
      }}
    />
  );
}

// ============================================================
// HORIZONTAL GROUPED BAR
// ============================================================

export function HBarGrouped({ yLabels, series, formatX, xTickSuffix, rowHeight = 46 }: {
  yLabels: string[];
  series: Series[];
  formatX?: (v: number) => string;
  /** Tick suffix for the default formatter (e.g. '%'). */
  xTickSuffix?: string;
  rowHeight?: number;
}) {
  const visible = useVisible(series);
  const view = useContext(ViewContext);
  const fmt = formatX ?? ((v: number) => `${defaultFormat(v)}${xTickSuffix ?? ''}`);
  const [ref, W] = useMeasuredWidth();
  const [hover, setHover] = useState<number | null>(null);
  if (view === 'table') {
    return <SeriesTable categoryHead="" categories={yLabels} series={series} fmt={fmt} />;
  }
  const scale = scaleFor(visible.flatMap((s) => s.values));
  const H = Math.max(180, yLabels.length * rowHeight + 48);
  const padL = Math.min(130, Math.max(70, W * 0.24));
  const padR = 16;
  const padT = 10;
  const padB = 30;
  const innerW = Math.max(10, W - padL - padR);
  const innerH = H - padT - padB;
  const bandH = innerH / Math.max(1, yLabels.length);
  const x = (v: number) => padL + ((v - scale.min) / (scale.max - scale.min)) * innerW;
  const yBand = (yi: number) => padT + yi * bandH;
  const pick = (clientY: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const yi = Math.floor((clientY - rect.top - padT) / bandH);
    setHover(yi >= 0 && yi < yLabels.length ? yi : null);
  };
  return (
    <ChartFrame legend={<SeriesLegend series={visible.toggleable} />}>
      <div ref={ref} className="mc-plot">
        <svg
          width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`${visible.map((s) => s.label).join(', ')} by ${yLabels.join(', ')}`}
          onPointerMove={(e) => pick(e.clientY, e.currentTarget)}
          onPointerDown={(e) => pick(e.clientY, e.currentTarget)}
          onPointerLeave={() => setHover(null)}
        >
          {scale.ticks.map((t) => (
            <g key={t}>
              <line x1={x(t)} y1={padT} x2={x(t)} y2={padT + innerH} className={t === 0 ? 'mc-axis' : 'mc-grid'} />
              <text x={x(t)} y={H - 10} textAnchor="middle" className="mc-tick">{fmt(t)}</text>
            </g>
          ))}
          {hover != null && (
            <rect x={padL} y={yBand(hover)} width={innerW} height={bandH} className="mc-hover" />
          )}
          {yLabels.map((lbl, yi) => {
            const slot = bandH * 0.72;
            const barH = slot / Math.max(1, visible.length);
            return (
              <g key={lbl}>
                <text x={padL - 8} y={yBand(yi) + bandH / 2 + 4} textAnchor="end" className="mc-label">
                  {clip(lbl, Math.floor(padL / 7))}
                </text>
                {visible.map((s, si) => {
                  const v = s.values[yi] ?? 0;
                  const y = yBand(yi) + (bandH - slot) / 2 + si * barH;
                  return (
                    <rect key={s.id} x={Math.min(x(0), x(v))} y={y + 1} width={Math.abs(x(v) - x(0))}
                          height={Math.max(1, barH - 2)} {...barPaint(s)} />
                  );
                })}
              </g>
            );
          })}
        </svg>
        {hover != null && (
          <Tooltip left={null} top={((yBand(hover) + bandH / 2) / H) * 100}>
            <TooltipBody title={yLabels[hover]} rows={tooltipRows(visible, hover, fmt)} />
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}

// ============================================================
// PIE
// ============================================================

export function Pie({ slices, height = 260 }: {
  slices: Array<{ label: string; color: string; value: number }>;
  height?: number;
}) {
  const view = useContext(ViewContext);
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0);
  const pct = (v: number) => (total > 0 ? `${((v / total) * 100).toFixed(0)}%` : '—');
  if (view === 'table') {
    return (
      <DataTable
        head={['', 'Count', 'Share']}
        rows={slices.map((s) => ({ key: s.label, color: s.color, cells: [s.label, String(s.value), pct(s.value)] }))}
      />
    );
  }
  const W = height;
  const H = height;
  const r = H / 2 - 8;
  const cx = W / 2;
  const cy = H / 2;
  let acc = 0;
  return (
    <ChartFrame legend={(
      <div className="mc-legend">
        {slices.map((s, i) => (
          <div key={i} className="mc-legend-row">
            <span className="swatch" style={{ background: s.color }} />
            <span className="lbl">{s.label}</span>
            <span className="num">{pct(s.value)}</span>
          </div>
        ))}
      </div>
    )}>
      <div className="mc-plot mc-plot-pie">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img"
             aria-label={slices.map((s) => `${s.label} ${pct(s.value)}`).join(', ')}>
          {slices.length === 1 ? (
            <circle cx={cx} cy={cy} r={r} fill={slices[0].color} />
          ) : slices.map((s, i) => {
            const a0 = (acc / total) * Math.PI * 2 - Math.PI / 2;
            acc += s.value;
            const a1 = (acc / total) * Math.PI * 2 - Math.PI / 2;
            const large = a1 - a0 > Math.PI ? 1 : 0;
            const d = `M ${cx} ${cy} L ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} `
              + `A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(a1)} ${cy + r * Math.sin(a1)} Z`;
            return (
              <path key={i} d={d} fill={s.color} className="mc-slice"
                    onPointerEnter={() => setHover(i)} onPointerDown={() => setHover(i)}
                    onPointerLeave={() => setHover(null)} />
            );
          })}
        </svg>
        {hover != null && slices[hover] && (
          <Tooltip left={50} top={12}>
            <TooltipBody title={slices[hover].label}
                         rows={[{ label: 'Count', color: slices[hover].color, value: `${slices[hover].value} (${pct(slices[hover].value)})` }]} />
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}

// ============================================================
// TABLES
// ============================================================

/** A plain table with an optional color swatch on each row's first cell. */
export function DataTable({ head, rows, className }: {
  head: string[];
  rows: Array<{ key: string; cells: ReactNode[]; color?: string; className?: string }>;
  className?: string;
}) {
  return (
    <div className="mc-table-wrap">
      <table className={`mc-table${className ? ` ${className}` : ''}`}>
        <thead>
          <tr>{head.map((h, i) => <th key={i} className={i > 0 ? 'num' : ''}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.className}>
              {r.cells.map((c, i) => (
                <td key={i} className={i > 0 ? 'num' : ''}>
                  {i === 0 && r.color && <span className="swatch" style={{ background: r.color }} />}
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The table view of a chart: one row per category, one column per series. */
function SeriesTable({ categoryHead, categories, series, fmt, totals }: {
  categoryHead: string;
  categories: string[];
  series: Series[];
  fmt: (v: number) => string;
  totals?: number[];
}) {
  return (
    <DataTable
      head={[categoryHead, ...series.map((s) => s.label), ...(totals ? ['Total'] : [])]}
      rows={categories.map((c, ci) => ({
        key: `${ci}:${c}`,
        cells: [
          c,
          ...series.map((s) => {
            const note = s.notes?.[ci];
            return note ? <>{fmt(s.values[ci] ?? 0)} <span className="mc-cell-note">{note}</span></> : fmt(s.values[ci] ?? 0);
          }),
          ...(totals ? [fmt(totals[ci] ?? 0)] : []),
        ],
      }))}
    />
  );
}

// ============================================================
// INTERNALS
// ============================================================

const defaultFormat = (v: number): string => String(Math.round(v * 100) / 100);

/** Truncate an axis label to `n` characters. */
function clip(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, Math.max(1, n - 1))}…` : s;
}

function barPaint(s: Series): { fill: string; fillOpacity?: number; stroke?: string; strokeDasharray?: string } {
  return s.baseline
    ? { fill: s.color, fillOpacity: 0.35, stroke: s.color, strokeDasharray: '3 2' }
    : { fill: s.color };
}

export interface Scale { min: number; max: number; ticks: number[] }

/** A value axis covering `values` and 0, on round steps (1 / 2 / 2.5 / 5 × 10^k). */
export function scaleFor(values: number[], tickCount = 5): Scale {
  const lo = Math.min(0, ...values.filter(Number.isFinite));
  let hi = Math.max(0, ...values.filter(Number.isFinite));
  if (hi === lo) hi = lo + 1;
  const step = niceStep((hi - lo) / (tickCount - 1));
  const min = Math.floor(lo / step + 1e-9) * step;
  const max = Math.ceil(hi / step - 1e-9) * step;
  const ticks: number[] = [];
  for (let t = min; t <= max + step / 2; t += step) ticks.push(Math.round(t / step) * step);
  return { min, max, ticks: ticks.map((t) => Number(t.toPrecision(12))) };
}

function niceStep(raw: number): number {
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
}

type ToggleableSeries = Series & { active: boolean; onToggle: () => void };

/** Series the legend hasn't hidden, plus the legend's view of all of them. */
function useVisible(series: Series[]): Series[] & { toggleable: ToggleableSeries[] } {
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const visible = series.filter((s) => !hidden.has(s.id));
  return Object.assign(visible, {
    toggleable: series.map((s) => ({
      ...s,
      active: !hidden.has(s.id),
      onToggle: () => setHidden((prev) => {
        const next = new Set(prev);
        if (next.has(s.id)) next.delete(s.id); else next.add(s.id);
        return next;
      }),
    })),
  });
}

/** The width of the element the returned callback ref is attached to, kept up
 *  to date (720 until measured, and where there is no ResizeObserver). A
 *  callback ref, so a plot mounted later (Table → Chart) is measured too. */
function useMeasuredWidth(fallback = 720): [(el: HTMLDivElement | null) => void, number] {
  const [width, setWidth] = useState(fallback);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLDivElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const measure = (w: number) => { if (w > 0) setWidth(Math.round(w)); };
    measure(el.getBoundingClientRect().width);
    observer.current = new ResizeObserver((entries) => measure(entries[0]?.contentRect.width ?? 0));
    observer.current.observe(el);
  }, []);
  return [ref, width];
}

interface AxisGrid {
  x: (i: number) => number;
  y: (v: number) => number;
  bandWidth: number;
}

function tooltipRows(series: Series[], i: number, fmt: (v: number) => string) {
  return series.map((s) => ({
    label: s.label, color: s.color, value: fmt(s.values[i] ?? 0), note: s.notes?.[i],
  }));
}

/** Which x labels to draw (~6.5px per character at 11px): every k-th, k sized to
 *  a typical label so long runs step regularly; a label that would still touch
 *  the one before is skipped, and the last one always shows. */
export function visibleTicks(labels: string[], bandWidth: number): Set<number> {
  const charW = 6.5;
  const gap = 6;
  const lens = labels.map((l) => l.length).sort((a, b) => a - b);
  const typical = lens[Math.floor(lens.length / 2)] ?? 1;
  const every = Math.max(1, Math.ceil((typical * charW + gap) / bandWidth));
  const center = (i: number) => bandWidth * (i + 0.5);
  const half = (i: number) => (labels[i].length * charW) / 2;
  const shown: number[] = [];
  const last = labels.length - 1;
  for (let i = 0; i <= last; i++) {
    if (i % every !== 0 && i !== last) continue;
    const prev = shown[shown.length - 1];
    const fits = prev === undefined || center(i) - half(i) >= center(prev) + half(prev) + gap;
    if (fits) shown.push(i);
    else if (i === last) { shown.pop(); shown.push(i); }
  }
  return new Set(shown);
}

/** Axes, grid, hover band and tooltip shared by the x-categorical charts. */
function XChart({
  xLabels, xTitles, yLabel, xLabel, height = 280, visible, fmt, scale, totals, renderSeries,
}: XLayout & {
  visible: Series[] & { toggleable: ToggleableSeries[] };
  fmt: (v: number) => string;
  scale: Scale;
  totals?: number[];
  renderSeries: (g: AxisGrid) => ReactNode;
}) {
  const view = useContext(ViewContext);
  const [ref, W] = useMeasuredWidth();
  const [hover, setHover] = useState<number | null>(null);
  const titles = xTitles ?? xLabels;
  if (view === 'table') {
    return <SeriesTable categoryHead={xLabel ?? ''} categories={titles} series={visible.toggleable} fmt={fmt} totals={totals} />;
  }
  const H = height;
  const padL = yLabel ? 54 : 40;
  const padR = 12;
  const padT = 12;
  const padB = xLabel ? 40 : 26;
  const innerW = Math.max(10, W - padL - padR);
  const innerH = H - padT - padB;
  const n = Math.max(1, xLabels.length);
  const bandWidth = innerW / n;
  const x = (i: number) => padL + bandWidth * (i + 0.5);
  const y = (v: number) => padT + innerH - ((v - scale.min) / (scale.max - scale.min)) * innerH;
  const ticks = visibleTicks(xLabels, bandWidth);
  const showTick = (i: number) => ticks.has(i);
  const pick = (clientX: number, el: SVGSVGElement) => {
    const rect = el.getBoundingClientRect();
    const i = Math.floor((clientX - rect.left - padL) / bandWidth);
    setHover(i >= 0 && i < xLabels.length ? i : null);
  };
  const rows = hover != null ? tooltipRows(visible, hover, fmt) : [];
  if (hover != null && totals) rows.push({ label: 'Total', color: 'transparent', value: fmt(totals[hover] ?? 0), note: undefined });
  const hoverLeft = hover != null ? (x(hover) / W) * 100 : 0;
  return (
    <ChartFrame legend={<SeriesLegend series={visible.toggleable} />}>
      <div ref={ref} className="mc-plot">
        <svg
          width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img"
          aria-label={`${visible.map((s) => s.label).join(', ')}${yLabel ? ` — ${yLabel}` : ''} by ${xLabel ?? 'category'}`}
          onPointerMove={(e) => pick(e.clientX, e.currentTarget)}
          onPointerDown={(e) => pick(e.clientX, e.currentTarget)}
          onPointerLeave={() => setHover(null)}
        >
          {scale.ticks.map((t) => (
            <g key={t}>
              <line x1={padL} y1={y(t)} x2={W - padR} y2={y(t)} className={t === 0 ? 'mc-axis' : 'mc-grid'} />
              <text x={padL - 6} y={y(t) + 4} textAnchor="end" className="mc-tick">{fmt(t)}</text>
            </g>
          ))}
          {hover != null && (
            <rect x={x(hover) - bandWidth / 2} y={padT} width={bandWidth} height={innerH} className="mc-hover" />
          )}
          {xLabels.map((lbl, i) => showTick(i) && (
            <text key={i} x={x(i)} y={padT + innerH + 16} textAnchor="middle" className="mc-tick">{lbl}</text>
          ))}
          {yLabel && (
            <text x={12} y={padT + innerH / 2} transform={`rotate(-90 12 ${padT + innerH / 2})`}
                  textAnchor="middle" className="mc-label">{yLabel}</text>
          )}
          {xLabel && (
            <text x={padL + innerW / 2} y={H - 4} textAnchor="middle" className="mc-label">{xLabel}</text>
          )}
          {renderSeries({ x, y, bandWidth })}
        </svg>
        {hover != null && (
          <Tooltip left={hoverLeft} top={14}>
            <TooltipBody title={titles[hover]} rows={rows} />
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}

function TooltipBody({ title, rows }: {
  title: ReactNode;
  rows: Array<{ label: string; color: string; value: string; note?: string }>;
}) {
  return (
    <>
      <div className="mc-tooltip-title">{title}</div>
      {rows.map((r, i) => (
        <div key={i} className="mc-tooltip-row">
          {r.color === 'transparent' ? <span className="swatch-gap" /> : <span className="swatch" style={{ background: r.color }} />}
          <span className="lbl">{r.label}</span>
          <span className="num">{r.value}</span>
          {r.note && <span className="mc-tooltip-note">{r.note}</span>}
        </div>
      ))}
    </>
  );
}

/** A tooltip at `left`% across the plot (null = the right edge) and `top`% down.
 *  Near either side it hangs inward so it stays on screen. */
function Tooltip({ left, top, children }: { left: number | null; top: number; children: ReactNode }) {
  const style: CSSProperties = { top: `${top}%` };
  if (left == null) {
    style.right = 8;
    style.transform = 'translateY(-50%)';
  } else if (left < 30) {
    style.left = `${left}%`;
    style.transform = 'translate(12px, 0)';
  } else if (left > 70) {
    style.right = `${100 - left}%`;
    style.transform = 'translate(-12px, 0)';
  } else {
    style.left = `${left}%`;
    style.transform = 'translate(-50%, 0)';
  }
  return <div className="mc-tooltip" style={style}>{children}</div>;
}

function SeriesLegend({ series }: { series: ToggleableSeries[] }) {
  return (
    <div className="mc-legend">
      {series.map((s) => (
        <button
          key={s.id}
          type="button"
          onClick={s.onToggle}
          aria-pressed={s.active}
          className={`mc-legend-row${s.active ? '' : ' off'}`}
          title={s.active ? `Hide ${s.label}` : `Show ${s.label}`}
        >
          <span className={`swatch${s.baseline ? ' baseline' : ''}`} style={{ background: s.color }} />
          <span className="lbl">{s.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Plot beside its legend (legend below on narrow screens). */
function ChartFrame({ legend, children }: { legend: ReactNode; children: ReactNode }) {
  return <div className="mc-chart">{children}{legend}</div>;
}
