// Head-to-head evaluation of two Sushi Go! Party agents. Every seed is played
// twice with the seats swapped, so both agents see the same menu and deal
// from both chairs — that cancels seat advantage and a good part of the luck.

import { agentFactory, agentLabel, agentSeed, type SushiGoAgent } from './agents';
import { playMatch, type MatchResult, type SimOptions } from './sim';

export interface EvalJob {
  seed: number;
  /** Seat agent A sits in; B takes the other. */
  aSeat: 0 | 1;
}

export interface JobResult {
  job: EvalJob;
  result: MatchResult;
}

export interface MatchupSpec {
  a: string;
  b: string;
  sim: SimOptions;
}

/** `games` rounded up to an even number of seat-swapped matches. */
export function makeJobs(games: number, seed: number): EvalJob[] {
  const jobs: EvalJob[] = [];
  for (let i = 0; i < Math.ceil(games / 2); i++) {
    jobs.push({ seed: seed + i, aSeat: 0 }, { seed: seed + i, aSeat: 1 });
  }
  return jobs;
}

export function runJobs(spec: MatchupSpec, jobs: EvalJob[]): JobResult[] {
  const makeA = agentFactory(spec.a);
  const makeB = agentFactory(spec.b);
  return jobs.map((job) => {
    const agents: SushiGoAgent[] = job.aSeat === 0
      ? [makeA(agentSeed(job.seed, 0)), makeB(agentSeed(job.seed, 1))]
      : [makeB(agentSeed(job.seed, 0)), makeA(agentSeed(job.seed, 1))];
    return { job, result: playMatch(agents, job.seed, spec.sim) };
  });
}

export interface SideSummary {
  name: string;
  wins: number;
  draws: number;
  losses: number;
  /** Matches this agent forfeited by returning nothing, throwing, or making an illegal move. */
  errors: number;
  avgScore: number;
  avgRoundPoints: number;
  avgDessertPoints: number;
  usPerDecision: number;
}

export interface EvalSummary {
  matches: number;
  a: SideSummary;
  b: SideSummary;
  /** A's points per match: win = 1, draw = ½. */
  aScore: number;
  aScoreCi95: [number, number];
  /** A's average final score minus B's. */
  aMargin: number;
  /** Share of decided matches won by whoever sat in seat 0. */
  seat0WinRate: number;
  seat0WinRateCi95: [number, number];
  /** Per seed: A won both seatings / they split / B won both. */
  pairs: { aSwept: number; split: number; bSwept: number };
  avgSteps: number;
  truncated: number;
  firstErrors: string[];
}

export function wilson(p: number, n: number, z = 1.96): [number, number] {
  if (n === 0) return [0, 1];
  const d = 1 + (z * z) / n;
  const centre = (p + (z * z) / (2 * n)) / d;
  const half = (z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n))) / d;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}

/** A's points for one match: 1 win, ½ draw / truncation, 0 loss or A's own error. */
function aPoints({ job, result }: JobResult): number {
  if (result.outcome === 'error') return result.error!.seat === job.aSeat ? 0 : 1;
  if (result.outcome === 'truncated' || result.winnerSeat === null) return 0.5;
  return result.winnerSeat === job.aSeat ? 1 : 0;
}

export function summarize(spec: MatchupSpec, results: JobResult[]): EvalSummary {
  const side = (name: string, isA: boolean): SideSummary => {
    let wins = 0, draws = 0, losses = 0, errors = 0;
    let score = 0, roundPts = 0, dessertPts = 0, decisions = 0, ms = 0;
    for (const r of results) {
      const seat = isA ? r.job.aSeat : 1 - r.job.aSeat;
      const pts = isA ? aPoints(r) : 1 - aPoints(r);
      if (pts === 1) wins++;
      else if (pts === 0) losses++;
      else draws++;
      if (r.result.outcome === 'error' && r.result.error!.seat === seat) errors++;
      const st = r.result.seats[seat];
      score += r.result.scores[seat];
      roundPts += st.roundPoints;
      dessertPts += st.dessertPoints;
      decisions += st.decisions;
      ms += st.thinkMs;
    }
    const n = Math.max(1, results.length);
    return {
      name, wins, draws, losses, errors,
      avgScore: score / n,
      avgRoundPoints: roundPts / n,
      avgDessertPoints: dessertPts / n,
      usPerDecision: decisions ? (ms * 1000) / decisions : 0,
    };
  };

  const n = results.length;
  const aScore = n ? results.reduce((s, r) => s + aPoints(r), 0) / n : 0;
  const decided = results.filter((r) => r.result.outcome === 'finished' && r.result.winnerSeat !== null);
  const seat0 = decided.length ? decided.filter((r) => r.result.winnerSeat === 0).length / decided.length : 0;

  const bySeed = new Map<number, number>();
  for (const r of results) bySeed.set(r.job.seed, (bySeed.get(r.job.seed) ?? 0) + aPoints(r));
  const pairs = { aSwept: 0, split: 0, bSwept: 0 };
  for (const v of bySeed.values()) {
    if (v === 2) pairs.aSwept++;
    else if (v === 0) pairs.bSwept++;
    else pairs.split++;
  }
  const a = side(agentLabel(spec.a), true);
  const b = side(agentLabel(spec.b), false);
  return {
    matches: n,
    a,
    b,
    aScore,
    aScoreCi95: wilson(aScore, n),
    aMargin: a.avgScore - b.avgScore,
    seat0WinRate: seat0,
    seat0WinRateCi95: wilson(seat0, decided.length),
    pairs,
    avgSteps: n ? results.reduce((s, r) => s + r.result.steps, 0) / n : 0,
    truncated: results.filter((r) => r.result.outcome === 'truncated').length,
    firstErrors: results
      .filter((r) => r.result.outcome === 'error')
      .slice(0, 5)
      .map((r) => `seed ${r.job.seed} seat ${r.result.error!.seat}: ${r.result.error!.message}`),
  };
}

const pct = (v: number) => (Number.isNaN(v) ? '—' : `${(v * 100).toFixed(1)}%`);
const ci = ([lo, hi]: [number, number]) => `95% CI ${pct(lo)}–${pct(hi)}`;

export function formatReport(spec: MatchupSpec, s: EvalSummary, meta: { seconds: number; workers: number }): string {
  const menu = !spec.sim.menu || spec.sim.menu === 'random' ? 'random menu per seed' : spec.sim.menu.join(', ');
  const row = (label: string, a: string, b: string) => `  ${label.padEnd(26)}${a.padStart(12)}${b.padStart(12)}`;
  const f = (v: number, d = 2) => v.toFixed(d);
  const lines = [
    `Sushi Go! Party: ${s.a.name} (A) vs ${s.b.name} (B)`,
    `  2 players · ${menu} · ${s.matches} matches (${s.matches / 2} seeds × both seatings)`,
    `  ${meta.workers} worker${meta.workers === 1 ? '' : 's'} · ${f(meta.seconds, 1)}s · ${f(s.matches / Math.max(meta.seconds, 1e-9), 0)} matches/s`,
    '',
    `  A score ${pct(s.aScore)}  (${ci(s.aScoreCi95)})   W ${s.a.wins} / D ${s.a.draws} / L ${s.a.losses}`,
    `  seed pairs: A won both ${s.pairs.aSwept} · split ${s.pairs.split} · B won both ${s.pairs.bSwept}`,
    '',
    row('', 'A', 'B'),
    row('avg final score', f(s.a.avgScore, 1), f(s.b.avgScore, 1)),
    row('  from rounds', f(s.a.avgRoundPoints, 1), f(s.b.avgRoundPoints, 1)),
    row('  from desserts', f(s.a.avgDessertPoints, 1), f(s.b.avgDessertPoints, 1)),
    row('µs / decision', f(s.a.usPerDecision, 0), f(s.b.usPerDecision, 0)),
    row('forfeits (illegal / none)', String(s.a.errors), String(s.b.errors)),
    '',
    `  seat 0 won ${pct(s.seat0WinRate)} of decided matches (${ci(s.seat0WinRateCi95)})`,
    `  ${f(s.avgSteps, 0)} actions per match · ${s.truncated} truncated`,
  ];
  if (s.firstErrors.length) lines.push('', '  first forfeits:', ...s.firstErrors.map((e) => `    ${e}`));
  return lines.join('\n');
}
