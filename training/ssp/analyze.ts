// CLI: how two agents play, not just who wins. Seat-swapped matches like
// eval.ts, with every decision tallied per side — where cards come from, what
// gets given away, which pairs are played or held, when and how rounds are
// ended, and where the points come from.
//
// It also ranks how much each agent values each card family, normalised for
// how often the card was actually on offer. Every card choice becomes
// head-to-head comparisons — a discard top taken beats a blind deck draw (and
// the other top), a deck draw beats both tops, the kept card of a drawn pair
// beats the other, a crab / lobster pick beats every other card it could
// have taken — and a Bradley–Terry fit turns them into one strength per
// family. The table shows that as "prefers over a blind draw" (how often the
// agent would take this card rather than draw unseen), plus the plain rates
// (taken ÷ offered as a discard top, kept ÷ drawn).
//
//   npm run ssp:analyze -- --a nn:<hard.json> --vs nn:<easy.json>,nn:<hard.json> --games 1000 --salt
//
// (Or `python training/ssp/evaluate.py analyze bench:hard-update1000 --vs …`,
// which resolves the usual references.) Analysis may look at the full state;
// the agents themselves still only see their own observation.

import { availableParallelism } from 'node:os';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import type { SspAction, SspCard, SspState } from '@/games/sea-salt-paper/types';
import { applyAction, canEndRound, scoringOptsFor } from '@/games/sea-salt-paper/reducer';
import { tentativeScore, isValidDuoPair } from '@/games/sea-salt-paper/scoring';
import { DUO_PAIRS } from '@/games/sea-salt-paper/cards';
import { agentFactory, agentLabel, agentSeed, type SspAgent } from './agents';
import { makeJobs, type EvalJob } from './evaluate';
import { newMatch, winnerSeatOf, type SimOptions } from './sim';

type Tally = Record<string, number>;
interface Side { a: Tally; b: Tally }

const add = (t: Tally, key: string, v = 1) => { t[key] = (t[key] ?? 0) + v; };

function pairKey(x: SspCard, y: SspCard): string {
  const t = DUO_PAIRS.find(([p, q]) => (p === x.family && q === y.family) || (p === y.family && q === x.family));
  return t ? `${t[0]}+${t[1]}` : '?';
}

/** Record that the agent chose `winner` over each of `losers` (distinct, excluding itself). */
function prefer(t: Tally, winner: string, losers: Iterable<string>): void {
  for (const l of new Set(losers)) if (l !== winner) add(t, `pw.${winner}.${l}`);
}

function playablePairs(hand: SspCard[]): number {
  let n = 0;
  for (let i = 0; i < hand.length; i++) for (let j = i + 1; j < hand.length; j++) if (isValidDuoPair(hand[i], hand[j])) n++;
  return n;
}

/** One analysed match. tallies[seat] receives that seat's numbers. */
function analyseMatch(agents: SspAgent[], seed: number, opts: SimOptions, tallies: Tally[]): void {
  let s: SspState = newMatch(seed, opts, 2);
  let roundDecisions = [0, 0];
  /** The card each seat last discarded face-up, so we can see whether the opponent took it. */
  const lastDiscard: Array<number | null> = [null, null];

  const closeRound = () => {
    const sum = s.lastRoundSummary!;
    const ender = s.players.findIndex((p) => p.id === sum.endedByPlayerId);
    const totals = s.players.map((p) => sum.perPlayer.find((r) => r.playerId === p.id)!.total);
    s.players.forEach((p, seat) => {
      const t = tallies[seat];
      const row = sum.perPlayer.find((r) => r.playerId === p.id)!;
      add(t, 'rounds');
      add(t, 'roundPoints', row.total);
      add(t, 'roundDecisions', roundDecisions[seat]);
      if (totals[seat] > totals[1 - seat]) add(t, 'roundsWon');
      for (const [k, v] of Object.entries(row.breakdown ?? {})) add(t, `cat.${k}`, v);
      add(t, 'endHand', p.hand.length);
      add(t, 'endTable', p.table.length);
      if (seat === ender) {
        add(t, 'roundsIEnded');
        add(t, 'pointsWhenIEnded', row.total);
        add(t, 'oppPointsWhenIEnded', totals[1 - seat]);
        add(t, sum.endedBy === 'lastChance' ? (sum.lastChanceWon ? 'end.lcWon' : 'end.lcLost') : `end.${sum.endedBy}`);
      } else if (ender !== -1) {
        add(t, 'pointsWhenOppEnded', row.total);
      }
      add(t, 'deckLeftAtRoundEnd', s.deck.length);
    });
    roundDecisions = [0, 0];
    lastDiscard[0] = lastDiscard[1] = null;
  };

  for (let step = 0; step < 10_000 && s.phase === 'playing'; step++) {
    if (s.subPhase === 'roundEnd') {
      closeRound();
      s = applyAction(s, { type: 'nextRound' });
      continue;
    }
    const pid = s.activePlayerId!;
    const seat = s.players.findIndex((p) => p.id === pid);
    const me = s.players[seat];
    const opp = s.players[1 - seat];
    const t = tallies[seat];
    const action: SspAction | null = agents[seat].act(s, pid);
    if (!action) throw new Error(`no action in ${s.subPhase}`);
    add(t, 'decisions');
    roundDecisions[seat]++;

    switch (s.subPhase) {
      case 'awaitingAction': {
        add(t, 'acq');
        const tops = s.discards.filter((pile) => pile.length).map((pile) => pile[pile.length - 1].family);
        const locked = s.nextTurnLockedPlayerId === pid; // jellyfish: deck draw is forced, no choice
        if (!locked) for (const f of new Set(tops)) add(t, `offer.${f}`);
        if (action.type === 'drawFromDiscard') {
          const pile = s.discards[action.pile];
          const top = pile[pile.length - 1];
          add(t, 'acq.discard');
          add(t, `take.${top.family}`);
          prefer(t, top.family, ['deck', ...tops]);
          if (top.id === lastDiscard[1 - seat]) add(tallies[1 - seat], 'fed');
        } else if (!locked) {
          prefer(t, 'deck', tops);
        }
        break;
      }
      case 'awaitingKeep':
        if (action.type === 'keepFromDraw') {
          const kept = s.pendingDraw[action.keepIndex];
          const gone = s.pendingDraw[action.keepIndex === 0 ? 1 : 0];
          add(t, 'discards');
          add(t, `give.${gone.family}`);
          if (kept.family !== gone.family) {
            add(t, `drawn.${kept.family}`);
            add(t, `drawn.${gone.family}`);
            add(t, `kept.${kept.family}`);
            prefer(t, kept.family, [gone.family]);
          }
          lastDiscard[seat] = gone.id;
        }
        break;
      case 'awaitingPlayOrEnd':
        if (action.type === 'playPair') {
          const [x, y] = action.cardIds.map((id) => me.hand.find((c) => c.id === id)!);
          add(t, `pair.${pairKey(x, y)}`);
          add(t, 'pairs');
        } else if (action.type === 'playTrio') {
          add(t, 'trios');
        } else {
          add(t, 'turnEnds');
          if (playablePairs(me.hand) > 0) add(t, 'turnEndsHoldingPair');
          if (canEndRound(s)) {
            add(t, 'eligible');
            add(t, `eligible.${action.type}`);
            if (action.type !== 'pass') {
              add(t, 'calls');
              add(t, 'call.myScore', tentativeScore(me.hand, me.table, scoringOptsFor(s, me)));
              add(t, 'call.oppScore', tentativeScore(opp.hand, opp.table, scoringOptsFor(s, opp)));
              add(t, 'call.oppHand', opp.hand.length);
              add(t, 'call.deck', s.deck.length);
              add(t, 'call.myTurns', roundDecisions[seat]);
            }
          }
        }
        break;
      case 'awaitingCrabPick':
        if (action.type === 'crabPick') {
          const pile = s.discards[action.pile];
          const picked = pile.find((c) => c.id === action.cardId)!;
          add(t, 'crab');
          if (pile[pile.length - 1].id === action.cardId) add(t, 'crab.top');
          prefer(t, picked.family, pile.map((c) => c.family));
        }
        break;
      case 'awaitingSharkSteal':
        add(t, 'steal');
        break;
      case 'awaitingLobsterPick':
        if (action.type === 'lobsterPick') {
          const pool = s.pendingLobsterPick ?? [];
          add(t, 'lobster');
          prefer(t, pool.find((c) => c.id === action.cardId)!.family, pool.map((c) => c.family));
        }
        break;
      default:
        break;
    }
    s = applyAction(s, action);
  }

  const winner = winnerSeatOf(s);
  s.players.forEach((p, seat) => {
    const t = tallies[seat];
    add(t, 'matches');
    if (winner === seat) add(t, 'wins');
    add(t, 'finalScore', p.matchScore);
    add(t, 'oppFinalScore', s.players[1 - seat].matchScore);
    if (s.mermaidWinnerId === p.id) add(t, 'mermaidWins');
  });
}

interface AnalyseInput { a: string; b: string; sim: SimOptions; jobs: EvalJob[] }

function runAnalysis({ a, b, sim, jobs }: AnalyseInput): Side {
  const makeA = agentFactory(a);
  const makeB = agentFactory(b);
  const side: Side = { a: {}, b: {} };
  for (const job of jobs) {
    const agentA = makeA(agentSeed(job.seed, job.aSeat));
    const agentB = makeB(agentSeed(job.seed, 1 - job.aSeat));
    const agents = job.aSeat === 0 ? [agentA, agentB] : [agentB, agentA];
    const tallies = job.aSeat === 0 ? [side.a, side.b] : [side.b, side.a];
    analyseMatch(agents, job.seed, sim, tallies);
  }
  return side;
}

function merge(into: Tally, from: Tally): void {
  for (const [k, v] of Object.entries(from)) add(into, k, v);
}

// ---------------------------------------------------------------- report

const FAMILY_LIST = ['mermaid', 'crab', 'boat', 'fish', 'shark', 'swimmer', 'shell', 'octopus', 'penguin', 'sailor',
  'lighthouse', 'shoal', 'penguinColony', 'captain', 'jellyfish', 'lobster', 'starfish', 'seahorse', 'crabBasket'];

function rows(t: Tally): Array<[string, string]> {
  const g = (k: string) => t[k] ?? 0;
  const per = (k: string, d: string, digits = 2) => (g(d) ? (g(k) / g(d)).toFixed(digits) : '—');
  const pct = (k: string, d: string) => (g(d) ? `${((100 * g(k)) / g(d)).toFixed(1)}%` : '—');
  const topOf = (prefix: string, d: string) => FAMILY_LIST
    .map((f) => [f, g(`${prefix}.${f}`)] as const)
    .filter(([, n]) => n > 0)
    .sort((x, y) => y[1] - x[1])
    .slice(0, 4)
    .map(([f, n]) => `${f} ${((100 * n) / g(d)).toFixed(0)}%`)
    .join(', ');
  const ends = g('roundsIEnded');
  return [
    ['MATCH', ''],
    ['win rate', pct('wins', 'matches')],
    ['final score (vs opponent)', `${per('finalScore', 'matches', 1)} – ${per('oppFinalScore', 'matches', 1)}`],
    ['mermaid instant wins / 100 matches', (100 * g('mermaidWins') / Math.max(1, g('matches'))).toFixed(1)],
    ['ROUNDS', ''],
    ['rounds per match', per('rounds', 'matches', 1)],
    ['points banked per round', per('roundPoints', 'rounds')],
    ['rounds won (more points than opp)', pct('roundsWon', 'rounds')],
    ['own decisions per round', per('roundDecisions', 'rounds', 1)],
    ['deck left when a round ends', per('deckLeftAtRoundEnd', 'rounds', 1)],
    ['ENDING ROUNDS', ''],
    ['rounds this side ended', pct('roundsIEnded', 'rounds')],
    ['  by STOP', pct('end.stop', 'roundsIEnded')],
    ['  by LAST CHANCE, won', pct('end.lcWon', 'roundsIEnded')],
    ['  by LAST CHANCE, lost', pct('end.lcLost', 'roundsIEnded')],
    ['  deck ran out on its turn', pct('end.deckEmpty', 'roundsIEnded')],
    ['points when it ended the round (vs opp)', ends ? `${per('pointsWhenIEnded', 'roundsIEnded', 1)} – ${per('oppPointsWhenIEnded', 'roundsIEnded', 1)}` : '—'],
    ['points when the opponent ended it', per('pointsWhenOppEnded', 'rounds', 1)],
    ['ends round when allowed to', pct('calls', 'eligible')],
    ['  own score at the call', per('call.myScore', 'calls', 1)],
    ['  opponent\'s real score at the call', per('call.oppScore', 'calls', 1)],
    ['  opponent hand size at the call', per('call.oppHand', 'calls', 1)],
    ['  own decisions into the round', per('call.myTurns', 'calls', 1)],
    ['CARDS', ''],
    ['takes a discard top (vs drawing 2)', pct('acq.discard', 'acq')],
    ['  most taken', topOf('take', 'acq.discard')],
    ['  most given away (discarded)', topOf('give', 'discards')],
    ['its discards the opponent picks up', pct('fed', 'discards')],
    ['pairs played per round', per('pairs', 'rounds')],
    ['  crab / boat / fish / shark+swimmer', ['crab+crab', 'boat+boat', 'fish+fish', 'shark+swimmer'].map((k) => per(`pair.${k}`, 'rounds')).join(' / ')],
    ['turns ended while holding a pair', pct('turnEndsHoldingPair', 'turnEnds')],
    ['crab digs that take the visible top', pct('crab.top', 'crab')],
    ['steals per round', per('steal', 'rounds')],
    ['cards in hand / on table at round end', `${per('endHand', 'rounds', 1)} / ${per('endTable', 'rounds', 1)}`],
    ['POINT SOURCES per round (scored or not)', ''],
    ['  duo pairs', per('cat.duos', 'rounds')],
    ['  collector sets', per('cat.sets', 'rounds')],
    ['  multipliers', per('cat.multipliers', 'rounds')],
    ['  mermaid colour claims', per('cat.mermaidClaim', 'rounds')],
    ['  colour bonus (LAST CHANCE only)', per('cat.colorBonus', 'rounds')],
  ];
}

const DECK = 'deck';

/** Bradley–Terry strengths from the `pw.<winner>.<loser>` counts (MM algorithm,
 *  with one pseudo-win and pseudo-loss against the deck draw per item so
 *  rarely-seen cards stay finite). Scaled so the blind deck draw = 1. */
function cardStrengths(t: Tally): Map<string, number> {
  const items = [DECK, ...FAMILY_LIST];
  const idx = new Map(items.map((x, i) => [x, i]));
  const n = items.length;
  const wins = Array.from({ length: n }, () => new Float64Array(n));
  for (const [k, v] of Object.entries(t)) {
    if (!k.startsWith('pw.')) continue;
    const [, w, l] = k.split('.');
    if (idx.has(w) && idx.has(l)) wins[idx.get(w)!][idx.get(l)!] += v;
  }
  const d = idx.get(DECK)!;
  for (let i = 0; i < n; i++) {
    if (i === d) continue;
    wins[i][d] += 1;
    wins[d][i] += 1;
  }
  let p = new Float64Array(n).fill(1);
  for (let iter = 0; iter < 2000; iter++) {
    const next = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      let w = 0;
      let denom = 0;
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        const games = wins[i][j] + wins[j][i];
        if (!games) continue;
        w += wins[i][j];
        denom += games / (p[i] + p[j]);
      }
      next[i] = denom ? w / denom : p[i];
    }
    const scale = next[d];
    for (let i = 0; i < n; i++) next[i] /= scale;
    p = next;
  }
  return new Map(items.map((x, i) => [x, p[i]]));
}

/** Families ordered by how strongly the agent prefers them. */
function cardImportance(name: string, t: Tally): string {
  const g = (k: string) => t[k] ?? 0;
  const strength = cardStrengths(t);
  const ranked = FAMILY_LIST
    .map((f) => ({ f, s: strength.get(f)!, seen: g(`offer.${f}`) + g(`drawn.${f}`) }))
    .filter((r) => r.seen > 0)
    .sort((x, y) => y.s - x.s);
  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%`.padStart(5) : '    —');
  const lines = [
    `Card importance for ${name} (${g('matches')} matches)`,
    '',
    '  rank  card            prefers over a   takes it as    keeps it when     times',
    '                        blind draw       a discard top  drawn in a pair   seen',
  ];
  ranked.forEach((r, i) => {
    lines.push(
      `  ${String(i + 1).padStart(4)}  ${r.f.padEnd(15)} ${pct(r.s, r.s + 1).padStart(12)}   `
      + `${pct(g(`take.${r.f}`), g(`offer.${r.f}`)).padStart(12)}   ${pct(g(`kept.${r.f}`), g(`drawn.${r.f}`)).padStart(13)}   `
      + `${String(r.seen).padStart(7)}`,
    );
  });
  return lines.join('\n');
}

function report(label: [string, string], side: Side): string {
  const ra = rows(side.a);
  const rb = rows(side.b);
  const w = 42;
  const lines = [`${label[0]} (A) vs ${label[1]} (B) — ${side.a.matches ?? 0} matches, seat-swapped`, '',
    `  ${''.padEnd(w)}${'A'.padStart(16)}${'B'.padStart(16)}`];
  ra.forEach(([name, va], i) => {
    const vb = rb[i][1];
    if (!va && !vb) lines.push(`  ${name}`);
    else if (va.length > 15 || vb.length > 15) lines.push(`  ${name}`, `      A: ${va}`, `      B: ${vb}`);
    else lines.push(`  ${name.padEnd(w)}${va.padStart(16)}${vb.padStart(16)}`);
  });
  return lines.join('\n');
}

// ---------------------------------------------------------------- CLI

function parse(argv: string[]) {
  const get = (k: string, d?: string) => {
    const i = argv.indexOf(`--${k}`);
    return i === -1 ? d : argv[i + 1];
  };
  const a = get('a');
  const vs = get('vs');
  if (!a || !vs) throw new Error('usage: --a <agent> --vs <agent>[,<agent>…] [--games N] [--salt] [--pepper] [--seed S] [--workers W] [--json path]');
  return {
    a,
    vs: vs.split(','),
    games: Number(get('games', '1000')),
    seed: Number(get('seed', '700000')),
    workers: Number(get('workers', String(Math.max(1, Math.min(16, availableParallelism() - 1))))),
    sim: { extraSalt: argv.includes('--salt'), extraPepper: argv.includes('--pepper'), targetScore: Number(get('target', '40')) },
    json: get('json'),
  };
}

function inWorker(input: AnalyseInput): Promise<Side> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: input });
    w.once('message', resolve);
    w.once('error', reject);
  });
}

async function main(): Promise<void> {
  const args = parse(process.argv.slice(2));
  const out: Record<string, Side> = {};
  /** Each agent's choices pooled across every matchup it played in. */
  const byAgent = new Map<string, Tally>();
  const pool = (name: string, t: Tally) => {
    if (!byAgent.has(name)) byAgent.set(name, {});
    merge(byAgent.get(name)!, t);
  };
  for (const b of args.vs) {
    const jobs = makeJobs(args.games, args.seed);
    const shards: EvalJob[][] = Array.from({ length: Math.min(args.workers, jobs.length) }, () => []);
    jobs.forEach((j, i) => shards[Math.floor(i / 2) % shards.length].push(j));
    const parts = await Promise.all(shards.map((shard) => inWorker({ a: args.a, b, sim: args.sim, jobs: shard })));
    const side: Side = { a: {}, b: {} };
    for (const p of parts) { merge(side.a, p.a); merge(side.b, p.b); }
    out[`${agentLabel(args.a)} vs ${agentLabel(b)}`] = side;
    pool(agentLabel(args.a), side.a);
    pool(agentLabel(b), side.b);
    console.log(report([agentLabel(args.a), agentLabel(b)], side) + '\n');
  }
  for (const [name, t] of byAgent) console.log(cardImportance(name, t) + '\n');
  if (args.json) {
    const { writeFileSync } = await import('node:fs');
    writeFileSync(args.json, JSON.stringify(out, null, 2));
  }
}

if (isMainThread) {
  main().catch((e) => { console.error((e as Error).message); process.exit(1); });
} else {
  parentPort!.postMessage(runAnalysis(workerData as AnalyseInput));
}
