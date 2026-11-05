// Sushi Go! Party — the game-over "Match stats" panel: how the score built up,
// which cards the points came from (and how many points each card was worth),
// what everyone took, and a turn-by-turn record of every pick, so a player can
// see what they passed up and what the others went for. Data from stats.ts.

import { useMemo, useState, type CSSProperties } from 'react';
import type { PlayerId } from '@/core/types';
import {
  ChartControls, ChartNote, ChartSelect, DataTable, HBarGrouped, MultiLine, StatsTabs, type Series,
} from '@/ui/MatchCharts';
import type { SushiGoCardKind, SushiGoState } from './types';
import { KIND_INFO, cardColor } from './cards';
import { variantLabel } from './Card';
import { ENABLER_KINDS, matchStats, type SgpMatchStats, type SgpTurnEvent } from './stats';

type Tab = 'score' | 'points' | 'cards' | 'picks';
const TABS: Array<{ key: Tab; label: string; table?: boolean }> = [
  { key: 'score', label: 'Score' },
  { key: 'points', label: 'Points by card' },
  { key: 'cards', label: 'Cards taken' },
  { key: 'picks', label: 'Picks', table: false },
];

/** Kinds whose variant is only the resolution-order number in the corner. */
const ORDER_NUMBERED: ReadonlySet<SushiGoCardKind> = new Set(['chopsticks', 'spoon', 'menu', 'takeoutBox']);

export function MatchStats({ state }: { state: SushiGoState }) {
  const stats = useMemo(() => matchStats(state), [state]);
  if (stats.rounds === 0) return null;
  const seat = (id: PlayerId) => state.seats.find((s) => s.id === id);
  const name = (id: PlayerId) => seat(id)?.name ?? id;
  const color = (id: PlayerId) => seat(id)?.color ?? '#888';
  const perPlayer = (values: (p: SgpMatchStats['players'][number]) => number[], notes?: (p: SgpMatchStats['players'][number]) => Array<string | undefined>): Series[] =>
    stats.players.map((p) => ({ id: p.playerId, label: name(p.playerId), color: color(p.playerId), values: values(p), notes: notes?.(p) }));

  return (
    <StatsTabs tabs={TABS}>
      {(tab) => (
        <>
          {tab === 'score' && <ScoreChart stats={stats} series={perPlayer((p) => p.cumulative)} />}
          {tab === 'points' && <PointsChart stats={stats} perPlayer={perPlayer} />}
          {tab === 'cards' && (
            <>
              <HBarGrouped
                yLabels={stats.menu.map((k) => KIND_INFO[k].label)}
                series={perPlayer((p) => stats.menu.map((k) => p.takenByKind[k] ?? 0))}
              />
              <ChartNote>
                Every card brought to the table over the match: picks from the hand, cards played off a menu, and
                cards a spoon fetched.
              </ChartNote>
            </>
          )}
          {tab === 'picks' && <PickTimeline state={state} stats={stats} name={name} color={color} />}
        </>
      )}
    </StatsTabs>
  );
}

function ScoreChart({ stats, series }: { stats: SgpMatchStats; series: Series[] }) {
  const rounds = Array.from({ length: stats.rounds }, (_, i) => i + 1);
  const withDesserts = (series[0]?.values.length ?? 0) > stats.rounds + 1;
  return (
    <>
      <MultiLine
        xLabels={['Start', ...rounds.map((r) => `R${r}`), ...(withDesserts ? ['Desserts'] : [])]}
        xTitles={['Start', ...rounds.map((r) => `After round ${r}`), ...(withDesserts ? ['Final, with desserts'] : [])]}
        series={series}
        xLabel="Round"
        yLabel="Points"
      />
      <ChartNote>Running total after each round; desserts are scored once, at the end.</ChartNote>
    </>
  );
}

function PointsChart({ stats, perPlayer }: {
  stats: SgpMatchStats;
  perPlayer: (values: (p: SgpMatchStats['players'][number]) => number[], notes?: (p: SgpMatchStats['players'][number]) => Array<string | undefined>) => Series[];
}) {
  const kinds = stats.menu.filter((k) => !ENABLER_KINDS.has(k));
  const enablers = stats.menu.filter((k) => ENABLER_KINDS.has(k));
  const note = (p: SgpMatchStats['players'][number], k: SushiGoCardKind): string | undefined => {
    const n = p.scoredAsByKind[k] ?? 0;
    if (n <= 0) return undefined;
    const pts = p.pointsByKind[k] ?? 0;
    const each = k === 'takeoutBox' ? 'per box' : 'per card';
    return `${n} ${k === 'takeoutBox' ? `box${n === 1 ? '' : 'es'}` : `card${n === 1 ? '' : 's'}`} · ${round1(pts / n)} ${each}`;
  };
  return (
    <>
      <HBarGrouped
        yLabels={kinds.map((k) => (k === 'takeoutBox' ? 'Takeout (flipped)' : KIND_INFO[k].label))}
        series={perPlayer((p) => kinds.map((k) => p.pointsByKind[k] ?? 0), (p) => kinds.map((k) => note(p, k)))}
      />
      <ChartNote>
        Points over the whole match, with points per card in the tooltip and the table: a set left incomplete
        shows up as cards that scored nothing.
        {enablers.length > 0 && <> {enablerNote(enablers)}</>}
      </ChartNote>
    </>
  );
}

function enablerNote(kinds: SushiGoCardKind[]): string {
  const parts: string[] = [];
  if (kinds.includes('wasabi')) parts.push('wasabi’s triple counts under Nigiri');
  if (kinds.includes('specialOrder')) parts.push('a special order scores as the card it copied');
  const helpers = kinds.filter((k) => k === 'chopsticks' || k === 'spoon' || k === 'menu').map((k) => KIND_INFO[k].label.toLowerCase());
  if (helpers.length > 0) parts.push(`${listOf(helpers)} score through the cards they bring`);
  const s = parts.join('; ');
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}.`;
}

function PickTimeline({ state, stats, name, color }: {
  state: SushiGoState;
  stats: SgpMatchStats;
  name: (id: PlayerId) => string;
  color: (id: PlayerId) => string;
}) {
  const [round, setRound] = useState(1);
  const turns = stats.turns.filter((t) => t.round === round);
  const ids = state.players.map((p) => p.id);
  const totals = state.roundHistory.find((r) => r.round === round)?.perPlayer;
  return (
    <>
      <ChartControls>
        <ChartSelect
          label="Round"
          value={round}
          options={Array.from({ length: stats.rounds }, (_, i) => ({ value: i + 1, label: `Round ${i + 1}` }))}
          onChange={setRound}
        />
      </ChartControls>
      <DataTable
        className="sgp-picks"
        head={['Turn', ...ids.map(name)]}
        rows={[
          ...turns.map((t) => ({
            key: `t${t.turn}`,
            cells: [
              String(t.turn),
              ...ids.map((id) => (
                <div key={id} className="sgp-pick-cell">
                  {(t.picks[id] ?? []).map((c, i) => <CardChip key={i} card={c} />)}
                  {(t.events[id] ?? []).map((e, i) => <div key={`e${i}`} className="sgp-pick-event">{eventText(e, name)}</div>)}
                </div>
              )),
            ],
          })),
          {
            key: 'total',
            className: 'sgp-picks-total',
            cells: ['Round score', ...ids.map((id) => String(totals?.find((r) => r.playerId === id)?.total ?? 0))],
          },
        ]}
      />
      <ChartNote>
        Hands pass to the left, so each column took its next turn from the hand of the column before it
        {ids.length > 1 && <> ({ids.map((id, i) => <span key={id} style={{ color: color(id) }}>{i > 0 ? ' → ' : ''}{name(id)}</span>)} → {name(ids[0])})</>}.
      </ChartNote>
    </>
  );
}

function CardChip({ card }: { card: { kind: SushiGoCardKind; variant?: string } }) {
  const info = KIND_INFO[card.kind];
  const variant = card.variant && !ORDER_NUMBERED.has(card.kind) ? variantLabel({ id: -1, ...card }) : '';
  return (
    <span className="sgp-chip" style={{ '--chip': cardColor(card.kind) } as CSSProperties}>
      {info.label}{variant && <span className="sgp-chip-variant"> · {variant}</span>}
    </span>
  );
}

function eventText(e: SgpTurnEvent, name: (id: PlayerId) => string): string {
  const card = (c: { kind: SushiGoCardKind; variant?: string }) =>
    `${KIND_INFO[c.kind].label}${c.variant && !ORDER_NUMBERED.has(c.kind) ? ` (${variantLabel({ id: -1, ...c })})` : ''}`;
  switch (e.type) {
    case 'copy': return e.card ? `Special order copied ${card(e.card)}` : 'Special order had nothing to copy';
    case 'spoon': return e.fromId ? `Spoon: got ${card(e.asked)} from ${name(e.fromId)}` : `Spoon: asked for ${card(e.asked)}, nobody had one`;
    case 'gaveSpoon': return `Gave ${card(e.asked)} to ${name(e.toId)}'s spoon`;
    case 'menu': return e.card ? `Menu: played ${card(e.card)}` : 'Menu: nothing playable';
    case 'flipped': return `Takeout box flipped ${e.count} card${e.count === 1 ? '' : 's'}`;
    case 'misoDiscarded': return 'Miso soup clashed and was discarded';
    case 'uramaki': return `Uramaki claimed +${e.points}`;
  }
}

const round1 = (v: number) => String(Math.round(v * 10) / 10);

function listOf(items: string[]): string {
  return items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}
