// Lazy-loaded Plotly wrapper. The plotly bundle is heavy (~1MB even with the
// "basic" build), so we only import it when the GameOver screen actually
// renders. The factory binds react-plotly.js to the basic dist on first use
// and the resulting component is cached at module scope.

import { useEffect, useState, createElement, type ComponentType } from 'react';
import type { Data, Layout, Config } from 'plotly.js';
import type { PlotParams } from 'react-plotly.js';

let plotComponentPromise: Promise<ComponentType<PlotParams>> | null = null;

function loadPlotComponent(): Promise<ComponentType<PlotParams>> {
  if (plotComponentPromise) return plotComponentPromise;
  plotComponentPromise = (async () => {
    const [factoryMod, plotlyMod] = await Promise.all([
      import('react-plotly.js/factory'),
      import('plotly.js-basic-dist-min'),
    ]);
    const createPlotComponent = (factoryMod as unknown as { default: (p: unknown) => ComponentType<PlotParams> }).default;
    const Plotly = (plotlyMod as unknown as { default: unknown }).default ?? plotlyMod;
    return createPlotComponent(Plotly);
  })();
  return plotComponentPromise;
}

export function PlotlyChart({ data, layout, config, style }: {
  data: Data[];
  layout: Partial<Layout>;
  config?: Partial<Config>;
  style?: React.CSSProperties;
}) {
  const [Plot, setPlot] = useState<ComponentType<PlotParams> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    loadPlotComponent().then((P) => {
      if (alive) setPlot(() => P);
    }).catch((e: unknown) => {
      if (alive) setErr(e instanceof Error ? e.message : String(e));
    });
    return () => { alive = false; };
  }, []);

  if (err) {
    return (
      <div style={{ ...style, padding: 12, color: '#c0392b', fontSize: 12, border: '1px solid #c0392b', borderRadius: 6 }}>
        Chart failed to load: {err}
      </div>
    );
  }
  if (!Plot) {
    return (
      <div style={{ ...style, display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 200, color: 'var(--paper-ink)', opacity: 0.6, fontSize: 12 }}>
        Loading chart…
      </div>
    );
  }

  // createElement rather than JSX so we can pass the component into a generic
  // ComponentType<PlotParams> without TS jumping through hoops.
  return createElement(Plot, {
    data,
    layout: {
      autosize: true,
      margin: { t: 8, r: 140, b: 36, l: 56 },
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
      font: { family: 'system-ui, sans-serif', color: '#1c1a2e', size: 11 },
      showlegend: true,
      legend: {
        orientation: 'v',
        x: 1.02,
        xanchor: 'left',
        y: 1,
        yanchor: 'top',
        font: { size: 11 },
        bgcolor: 'rgba(255,255,255,0.6)',
      },
      hovermode: 'x unified',
      hoverlabel: { bgcolor: '#fff', font: { color: '#1c1a2e' } },
      ...layout,
    },
    config: {
      displayModeBar: false,
      responsive: true,
      ...config,
    },
    style: { width: '100%', height: 320, ...style },
    useResizeHandler: true,
  });
}
