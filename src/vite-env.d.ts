/// <reference types="vite/client" />

// The basic-dist Plotly bundle ships without its own types but exports the
// same shape as the full `plotly.js` module's default export.
declare module 'plotly.js-basic-dist-min' {
  const Plotly: typeof import('plotly.js');
  export default Plotly;
}

// `react-plotly.js/factory` re-exports a factory function that binds the
// component to a specific Plotly build.
declare module 'react-plotly.js/factory' {
  import type { ComponentType } from 'react';
  import type { PlotParams } from 'react-plotly.js';
  const createPlotComponent: (plotly: unknown) => ComponentType<PlotParams>;
  export default createPlotComponent;
}
