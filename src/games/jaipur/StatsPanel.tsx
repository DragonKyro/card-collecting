// Jaipur — the game-over "Match stats" panel: each round as a race (rupees,
// camels or hand size, move by move, each move named), where every round's
// score came from, which goods paid, how big the sales were (the bonus
// tokens), and the mix of moves with the key numbers. Data from stats.ts;
// shown only once the match is over, when every bonus value is public.

import { useMemo, useState } from 'react';
import type { PlayerId } from '@/core/types';
import {
  ChartControls, ChartNote, ChartSelect, DataTable, GroupedBar, HBarGrouped, MultiLine, StackedBar, StatsTabs,
  type Series,
} from '@/ui/MatchCharts';
import type { JaipurCardType, JaipurState } from './types';
import { CARD_INFO, GOODS, cardLabel } from './cards';
import { MOVE_KINDS, matchStats, type JaipurMatchStats, type JaipurMoveEntry, type JaipurPlayerStats } from './stats';

type Tab = 'race' | 'rounds' | 'goods' | 'sales' | 'moves';
const TABS: Array<{ key: Tab; label: string }> = [
  { key: 'race', label: 'Race' },
  { key: 'rounds', label: 'Round scores' },
  { key: 'goods', label: 'Goods' },
  { key: 'sales', label: 'Sale size' },
  { key: 'moves', label: 'Moves' },
];

/** Score sources: categorical slots 1–3, dark steps (validated on the panel's surface). */
const SOURCE_COLORS = { goods: '#3987e5', bonus: '#d95926', camel: '#199e70' };

const MOVE_LABELS: Record<JaipurMoveEntry['kind'], string> = {
  takeOne: 'Take a good',
  takeCamels: 'Take camels',
  exchange: 'Trade',
  sell: 'Sell',
};

type Metric = 'rupees' | 'herd' | 'hand';
const METRICS: Array<{ value: Metric; label: string; axis: string }> = [
  { value: 'rupees', label: 'Rupees', axis: 'Rupees' },
  { value: 'herd', label: 'Camels in herd', axis: 'Camels' },
  { value: 'hand', label: 'Cards in hand', axis: 'Cards' },
];

export function MatchStats({ state }: { state: JaipurState }) {
  const stats = useMemo(() => matchStats(state), [state]);
  if (stats.rounds.length === 0) return null;
  const seat = (id: PlayerId) => state.seats.find((s) => s.id === id);
  const name = (id: PlayerId) => seat(id)?.name ?? id;
  const color = (id: PlayerId) => seat(id)?.color ?? '#888';
  const perPlayer = (
    values: (p: JaipurPlayerStats) => number[],
    notes?: (p: JaipurPlayerStats) => Array<string | undefined>,
  ): Series[] => stats.players.map((p) => ({
    id: p.playerId, label: name(p.playerId), color: color(p.playerId), values: values(p), notes: notes?.(p),
  }));

  return (
    <StatsTabs tabs={TABS} className="jp-stats">
      {(tab) => (
        <>
          {tab === 'race' && <Race stats={stats} name={name} color={color} />}
          {tab === 'rounds' && <RoundScores state={state} stats={stats} name={name} />}
          {tab === 'goods' && (
            <>
              <HBarGrouped
                yLabels={GOODS.map((g) => CARD_INFO[g].label)}
                series={perPlayer(
                  (p) => GOODS.map((g) => p.byGood[g].rupees),
                  (p) => GOODS.map((g) => {
                    const s = p.byGood[g];
                    if (s.sales === 0) return undefined;
                    return `${s.cards} card${s.cards === 1 ? '' : 's'} in ${s.sales} sale${s.sales === 1 ? '' : 's'}${s.bonus ? ` · ₹${s.bonus} bonus` : ''}`;
                  }),
                )}
                formatX={(v) => `₹${Math.round(v)}`}
              />
              <ChartNote>Rupees from each good over the match: its goods tokens plus the bonus tokens those sales earned.</ChartNote>
            </>
          )}
          {tab === 'sales' && (
            <>
              <GroupedBar
                xLabels={['1', '2', '3', '4', '5+']}
                xTitles={['1 card', '2 cards', '3 cards (×3 bonus)', '4 cards (×4 bonus)', '5+ cards (×5 bonus)']}
                series={perPlayer(
                  (p) => p.saleSizes,
                  (p) => p.saleSizes.map((n, i) => (n > 0 ? `₹${p.saleSizeRupees[i]} in all · ₹${round1(p.saleSizeRupees[i] / n)} a sale` : undefined)),
                )}
                xLabel="Cards in the sale"
                yLabel="Sales"
              />
              <ChartNote>
                Selling 3, 4 or 5+ cards at once also earns a bonus token: ×3 worth 1–3, ×4 worth 4–6, ×5 worth 8–10.
              </ChartNote>
            </>
          )}
          {tab === 'moves' && <Moves stats={stats} name={name} color={color} perPlayer={perPlayer} />}
        </>
      )}
    </StatsTabs>
  );
}

function Race({ stats, name, color }: {
  stats: JaipurMatchStats;
  name: (id: PlayerId) => string;
  color: (id: PlayerId) => string;
}) {
  const [round, setRound] = useState(stats.rounds[stats.rounds.length - 1].round);
  const [metric, setMetric] = useState<Metric>('rupees');
  const track = stats.rounds.find((r) => r.round === round) ?? stats.rounds[0];
  const m = METRICS.find((x) => x.value === metric)!;
  const ids = Object.keys(track.rupees);
  const n = track.moves.length;
  const camel = track.summary.camelTokenTo;
  return (
    <>
      <ChartControls>
        {stats.rounds.length > 1 && (
          <ChartSelect
            label="Round"
            value={track.round}
            options={stats.rounds.map((r) => ({
              value: r.round,
              label: `Round ${r.round}${r.summary.winnerId ? ` · ${name(r.summary.winnerId)} won` : ' · tied'}`,
            }))}
            onChange={setRound}
          />
        )}
        <ChartSelect label="Show" value={metric} options={METRICS} onChange={setMetric} />
      </ChartControls>
      <MultiLine
        xLabels={['Start', ...track.moves.map((_, i) => String(i + 1)), 'End']}
        xTitles={[
          'Start of the round',
          ...track.moves.map((mv, i) => `Turn ${i + 1} · ${name(mv.playerId)} ${describeMove(mv)}`),
          `Scored · ${camel ? `camel token (+5) to ${name(camel)}` : 'no camel token (tied herds)'}`,
        ]}
        series={ids.map((id) => ({ id, label: name(id), color: color(id), values: track[metric][id] }))}
        markers={n <= 24}
        xLabel="Turn"
        yLabel={m.axis}
      />
      <ChartNote>
        {metric === 'rupees' && 'Rupees banked through the round: goods and bonus tokens as each sale is made, the camel token at the end.'}
        {metric === 'herd' && 'Camels in each herd: the bigger herd at the end takes the 5-rupee camel token, and camels pay for trades.'}
        {metric === 'hand' && 'Cards in each hand (the limit is 7): a full hand can only sell, trade or take camels.'}
        {' '}The round ended when {track.summary.endedBy === 'deck' ? 'the deck ran out' : 'three goods sold out'}.
      </ChartNote>
    </>
  );
}

function RoundScores({ state, stats, name }: { state: JaipurState; stats: JaipurMatchStats; name: (id: PlayerId) => string }) {
  const ids = state.players.map((p) => p.id);
  const cols = stats.rounds.flatMap((r) => ids.map((id) => ({ r, id, row: r.summary.perPlayer.find((x) => x.playerId === id)! })));
  const short = (s: string) => (s.length > 8 ? `${s.slice(0, 7)}…` : s);
  return (
    <>
      <StackedBar
        xLabels={cols.map((c) => `R${c.r.round} ${short(name(c.id))}`)}
        xTitles={cols.map((c) => `Round ${c.r.round} · ${name(c.id)}${c.r.summary.winnerId === c.id ? ' (won the seal)' : ''}`)}
        series={[
          { id: 'goods', label: 'Goods tokens', color: SOURCE_COLORS.goods, values: cols.map((c) => c.row.goods),
            notes: cols.map((c) => `${c.row.goodsCount} token${c.row.goodsCount === 1 ? '' : 's'}`) },
          { id: 'bonus', label: 'Bonus tokens', color: SOURCE_COLORS.bonus, values: cols.map((c) => c.row.bonus),
            notes: cols.map((c) => `${c.row.bonusCount} token${c.row.bonusCount === 1 ? '' : 's'}`) },
          { id: 'camel', label: 'Camel token', color: SOURCE_COLORS.camel, values: cols.map((c) => c.row.camel),
            notes: cols.map((c) => `herd of ${c.row.herd}`) },
        ]}
        formatY={(v) => String(Math.round(v))}
        xLabel="Round"
        yLabel="Rupees"
      />
      <ChartNote>Each round&rsquo;s rupees by source. Ties on rupees go to more bonus tokens, then more goods tokens.</ChartNote>
    </>
  );
}

function Moves({ stats, name, color, perPlayer }: {
  stats: JaipurMatchStats;
  name: (id: PlayerId) => string;
  color: (id: PlayerId) => string;
  perPlayer: (values: (p: JaipurPlayerStats) => number[]) => Series[];
}) {
  const rows: Array<{ label: string; value: (p: JaipurPlayerStats) => string }> = [
    { label: 'Rounds won', value: (p) => String(p.roundsWon) },
    { label: 'Cards sold', value: (p) => String(p.cardsSold) },
    { label: 'Average sale', value: (p) => (p.moves.sell ? `${round1(p.cardsSold / p.moves.sell)} cards` : '—') },
    { label: 'Rupees per card sold', value: (p) => (p.cardsSold ? `₹${round1(p.salesRupees / p.cardsSold)}` : '—') },
    { label: 'Bonus tokens', value: (p) => `${p.bonusTokens}${p.bonusTokens ? ` (₹${p.bonusRupees})` : ''}` },
    { label: 'Goods taken from the market', value: (p) => String(p.goodsTaken) },
    { label: 'Camels taken', value: (p) => String(p.camelsTaken) },
    { label: 'Camels traded away', value: (p) => String(p.camelsTraded) },
    { label: 'Camel tokens', value: (p) => String(p.camelTokens) },
  ];
  return (
    <>
      <GroupedBar
        xLabels={MOVE_KINDS.map((k) => MOVE_LABELS[k])}
        series={perPlayer((p) => MOVE_KINDS.map((k) => p.moves[k]))}
        yLabel="Turns"
      />
      <DataTable
        head={['', ...stats.players.map((p) => name(p.playerId))]}
        rows={rows.map((r) => ({ key: r.label, cells: [r.label, ...stats.players.map((p) => r.value(p))] }))}
      />
      <ChartNote>
        Over the whole match.{' '}
        {stats.players.map((p, i) => (
          <span key={p.playerId}>
            {i > 0 && ' · '}
            <span style={{ color: color(p.playerId) }}>{name(p.playerId)}</span>: {p.moves.takeOne + p.moves.takeCamels + p.moves.exchange + p.moves.sell} turns
          </span>
        ))}
      </ChartNote>
    </>
  );
}

/** A move in a few words: "sold 4 Cloth for ₹9 + ₹5 bonus". */
export function describeMove(m: JaipurMoveEntry): string {
  switch (m.kind) {
    case 'takeOne': return `took 1 ${cardLabel(m.good)}`;
    case 'takeCamels': return `took ${m.count} camel${m.count === 1 ? '' : 's'}`;
    case 'exchange': return `traded ${cardList(m.gave)} for ${cardList(m.took)}`;
    case 'sell': {
      const tokens = m.tokens.reduce((a, v) => a + v, 0);
      return `sold ${m.count} ${cardLabel(m.good, m.count)} for ₹${tokens}${m.bonus ? ` + ₹${m.bonus.value} bonus` : ''}`;
    }
  }
}

function cardList(types: readonly JaipurCardType[]): string {
  const counts = new Map<JaipurCardType, number>();
  for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts].map(([t, n]) => `${n} ${cardLabel(t, n)}`).join(' + ');
}

const round1 = (v: number) => String(Math.round(v * 10) / 10);
