import { describe, it, expect, afterEach } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { GroupedBar, HBarGrouped, StatsTabs, scaleFor, visibleTicks } from './MatchCharts';

afterEach(cleanup);

describe('match charts', () => {
  it('puts the value axis on round steps that cover 0 and negatives', () => {
    expect(scaleFor([3, 37])).toEqual({ min: 0, max: 40, ticks: [0, 10, 20, 30, 40] });
    const s = scaleFor([-9, 18]);
    expect(s.min).toBeLessThanOrEqual(-9);
    expect(s.max).toBeGreaterThanOrEqual(18);
    expect(s.ticks).toContain(0);
    expect(scaleFor([0, 0]).max).toBeGreaterThan(0);
    expect(scaleFor([0.2, 0.37]).ticks.every((t) => Number.isFinite(t))).toBe(true);
  });

  it('thins crowded x labels regularly and always keeps the last', () => {
    // Short labels with one long one: nothing needs to go.
    expect([...visibleTicks(['Start', 'R1', 'R2', 'R3', 'Desserts'], 60)]).toEqual([0, 1, 2, 3, 4]);
    const turns = ['Start', ...Array.from({ length: 40 }, (_, i) => String(i + 1)), 'End'];
    const shown = [...visibleTicks(turns, 8)];
    expect(shown.length).toBeLessThan(turns.length / 2);
    expect(shown.at(-1)).toBe(turns.length - 1);
    expect(shown[0]).toBe(0);
  });

  it('switches every chart to a table, notes included', () => {
    const series = [
      { id: 'a', label: 'Ana', color: '#e64a4a', values: [3, -2], notes: ['3 cards', undefined] },
      { id: 'b', label: 'Bo', color: '#3a6ec9', values: [1, 4] },
    ];
    const view = render(
      <StatsTabs tabs={[{ key: 'bars', label: 'Bars' }, { key: 'rows', label: 'Rows' }]}>
        {(tab) => (tab === 'bars'
          ? <GroupedBar xLabels={['X', 'Y']} series={series} xLabel="Thing" />
          : <HBarGrouped yLabels={['X', 'Y']} series={series} />)}
      </StatsTabs>,
    );
    expect(view.container.querySelector('svg')).not.toBeNull();
    fireEvent.click(view.getByRole('button', { name: 'Table' }));
    const cells = () => Array.from(view.container.querySelectorAll('tbody tr')).map((tr) => Array.from(tr.querySelectorAll('td')).map((td) => td.textContent));
    expect(cells()).toEqual([['X', '3 3 cards', '1'], ['Y', '-2', '4']]);
    // The view sticks across tabs.
    fireEvent.click(view.getByRole('tab', { name: 'Rows' }));
    expect(cells()).toEqual([['X', '3 3 cards', '1'], ['Y', '-2', '4']]);
    fireEvent.click(view.getByRole('button', { name: 'Chart' }));
    expect(view.container.querySelector('svg')).not.toBeNull();
    // The legend hides a series without repainting the other.
    fireEvent.click(view.getByRole('button', { name: 'Ana' }));
    const fills = Array.from(view.container.querySelectorAll('svg rect[fill]')).map((r) => r.getAttribute('fill'));
    expect(fills).not.toContain('#e64a4a');
    expect(fills).toContain('#3a6ec9');
  });
});
