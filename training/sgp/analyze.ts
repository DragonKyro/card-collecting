// How Sushi Go! Party agents play: seat-swapped 2-player matches on random
// menus, every decision tallied per side.
//
//   npm run sgp:analyze -- --a nn:<policy.json> --b nn:<policy.json> --games 2000 [--json out.json]
//
// Per side it reports:
//   - card priority: every first pick is a set of head-to-head wins (the card
//     taken beats each other kind in that hand), fitted with Bradley–Terry into
//     one strength per face — how often it would take that card over an
//     average one. Rates in context too (a tempura that completes a pair vs one
//     that starts one, a nigiri onto open wasabi, the second eel, …).
//   - pick style: share of picks that take the card worth most points right
//     now ("greedy"), a lower one that's worth more to the opponent ("deny"),
//     or a lower one anyway ("invest" — set-building the snapshot can't see).
//     Worth = the exact score change (round + projected desserts) from the
//     encoder's marginals, so it is myopic about majorities.
//   - waiting: when it passes over the card worth most right now, whether that
//     card comes back round and it takes it later, or the opponent takes it
//     (at 2 players the two hands bounce back and forth, and after the first
//     pass both hands are known).
//   - points by kind (per match the kind was on the menu), set completion and
//     waste, rolls and desserts, and how the special cards are used.
//
// Forced picks (one kind left in hand) don't count toward the context rates.
//
// Round-end counts come from the round summary's per-kind breakdown
// (scoring.ts), so they describe the table as it was scored.

import { writeFileSync } from 'node:fs';
import type { SushiGoAction, SushiGoCard, SushiGoCardKind, SushiGoState } from '@/games/sushi-go/types';
import { KIND_INFO } from '@/games/sushi-go/cards';
import { applyAction } from '@/games/sushi-go/reducer';
import { effectiveCard } from '@/games/sushi-go/scoring';
import { observe, type SushiGoObservation } from '@/games/sushi-go/nn/observation';
import { _internals } from '@/games/sushi-go/nn/encode';
import { FACES, FACE_COUNT, faceIndex, menuFaces } from '@/games/sushi-go/nn/faces';
import { agentFactory, agentLabel, agentSeed, type SushiGoAgent } from './agents';
import { actingSeat, newMatch, winnerSeatOf } from './sim';

const faceName = (f: number) => {
  const face = FACES[f];
  return face.variant ? `${KIND_INFO[face.kind].label} (${face.variant})` : KIND_INFO[face.kind].label;
};

interface Rate { offered: number; taken: number }

class Tally {
  matches = 0;
  wins = 0;
  draws = 0;
  score = 0;
  roundPts = 0;
  dessertPts = 0;
  /** Points by kind ('takeoutBox' = flipped cards), and matches the kind was on the menu. */
  points: Record<string, number> = {};
  onMenu: Record<string, number> = {};
  // Card priority (first picks only).
  btWins = new Array<number>(FACE_COUNT).fill(0);
  btGames: number[][] = Array.from({ length: FACE_COUNT }, () => new Array<number>(FACE_COUNT).fill(0));
  offered = new Array<number>(FACE_COUNT).fill(0);
  taken = new Array<number>(FACE_COUNT).fill(0);
  takenEarly = new Array<number>(FACE_COUNT).fill(0);
  context: Record<string, Rate> = {};
  // Pick style.
  picks = 0;
  greedy = 0;
  deny = 0;
  invest = 0;
  tookOppBest = 0;
  givenUp = 0;
  /** The card worth most now, passed over: taken later by this seat / by the opponent / by nobody. */
  skipped = 0;
  cameBack = 0;
  oppTook = 0;
  // Specials.
  doublePicks = 0;
  secondFaces = new Array<number>(FACE_COUNT).fill(0);
  menuPlays = 0;
  menuBest = 0;
  boxes = 0;
  flips = 0;
  flipFaces = new Array<number>(FACE_COUNT).fill(0);
  copies = new Array<number>(FACE_COUNT).fill(0);
  // Round-end tables (from the round summary).
  rounds: Record<string, { rounds: number; cards: number; extra: number; extra2: number }> = {};
  desserts = { pudding: 0, puddingRounds: 0, iceCream: 0, iceWasted: 0, fruit: 0 };

  rate(key: string, took: boolean): void {
    const r = (this.context[key] ??= { offered: 0, taken: 0 });
    r.offered++;
    if (took) r.taken++;
  }

  round(kind: string, cards: number, extra = 0, extra2 = 0): void {
    const r = (this.rounds[kind] ??= { rounds: 0, cards: 0, extra: 0, extra2: 0 });
    r.rounds++;
    r.cards += cards;
    r.extra += extra;
    r.extra2 += extra2;
  }
}

/** Live counts by kind on a table, as scored (special orders as their copy). */
function liveCounts(table: SushiGoCard[]): Map<SushiGoCardKind, number> {
  const m = new Map<SushiGoCardKind, number>();
  for (const c of table.map(effectiveCard)) if (!c.flipped) m.set(c.kind, (m.get(c.kind) ?? 0) + 1);
  return m;
}

function openWasabi(table: SushiGoCard[]): number {
  let open = 0;
  for (const c of table.map(effectiveCard)) {
    if (c.kind === 'wasabi' && !c.flipped) open++;
    else if (c.kind === 'nigiri' && open > 0) open--;
  }
  return open;
}

const icons = (table: SushiGoCard[], kind: 'maki' | 'uramaki') =>
  table.map(effectiveCard).filter((c) => c.kind === kind && !c.flipped).reduce((s, c) => s + Number(c.variant ?? 1), 0);

/** Per seat: cards it passed over while they were worth most to it, this round. */
type Skips = Map<number, 'open'>;

/** Record one first-card pick: priority comparisons, context rates, pick style. */
function recordPick(t: Tally, obs: SushiGoObservation, pickedIds: number[], skips: Skips): void {
  const hand = obs.hand;
  const first = hand.find((c) => c.id === pickedIds[0])!;
  const pf = faceIndex(first);
  const faces = [...new Set(hand.map(faceIndex))];
  t.picks++;
  for (const f of faces) {
    t.offered[f]++;
    if (f === pf) {
      t.taken[f]++;
      if (obs.passes < obs.dealtHandSize / 3) t.takenEarly[f]++;
    } else {
      t.btGames[pf][f]++;
      t.btGames[f][pf]++;
    }
  }
  t.btWins[pf] += faces.length - 1;
  if (pickedIds.length === 2) {
    t.doublePicks++;
    t.secondFaces[faceIndex(hand.find((c) => c.id === pickedIds[1])!)]++;
  }

  // A card passed over earlier coming back and being taken now.
  for (const id of pickedIds) {
    if (skips.has(id)) { skips.delete(id); t.cameBack++; }
  }

  // Context rates: was this kind taken when it sat in the hand in this situation?
  const me = obs.players[0];
  const opp = obs.players[1];
  const mine = liveCounts(me.table);
  const n = (k: SushiGoCardKind) => mine.get(k) ?? 0;
  const theirs = opp ? liveCounts(opp.table) : new Map<SushiGoCardKind, number>();
  const o = (k: SushiGoCardKind) => theirs.get(k) ?? 0;
  const kinds = new Set(hand.map((c) => c.kind));
  if (kinds.size > 1 || faces.length > 1) recordContexts(t, obs, first, n, o, kinds, me.table, opp?.table ?? []);

  pickStyle(t, obs, faces, pf, hand, pickedIds, skips);
}

function recordContexts(
  t: Tally,
  obs: SushiGoObservation,
  first: SushiGoCard,
  n: (k: SushiGoCardKind) => number,
  o: (k: SushiGoCardKind) => number,
  kinds: Set<SushiGoCardKind>,
  myTable: SushiGoCard[],
  oppTable: SushiGoCard[],
): void {
  const hand = obs.hand;
  const opp = obs.players[1];
  const took = (k: SushiGoCardKind, variant?: string) =>
    first.kind === k && (variant === undefined || first.variant === variant);
  const third = obs.passes < obs.dealtHandSize / 3 ? 'early' : obs.passes < (2 * obs.dealtHandSize) / 3 ? 'mid' : 'late';
  if (kinds.has('tempura')) {
    t.rate(n('tempura') % 2 === 1 ? 'tempura: completes a pair' : 'tempura: starts a pair', took('tempura'));
    if (n('tempura') % 2 === 0) t.rate(o('tempura') % 2 === 1 ? 'tempura (no use to me): opponent one short' : 'tempura (no use to me): opponent not one short', took('tempura'));
  }
  if (kinds.has('sashimi')) {
    const need = 3 - (n('sashimi') % 3);
    t.rate(need === 1 ? 'sashimi: completes a set' : need === 2 ? 'sashimi: 2nd of a set' : 'sashimi: starts a set', took('sashimi'));
    if (need === 3) t.rate(o('sashimi') % 3 === 2 ? 'sashimi (starting): opponent one short' : 'sashimi (starting): opponent not one short', took('sashimi'));
  }
  if (kinds.has('misoSoup') && opp?.knownHand) {
    const clash = opp.knownHand.some((c) => c.kind === 'misoSoup');
    t.rate(clash ? 'miso soup: opponent holds one too' : 'miso soup: opponent holds none', took('misoSoup'));
  }
  if (kinds.has('tofu') && n('tofu') === 0) t.rate(o('tofu') === 1 ? 'tofu (my first): opponent has 1' : 'tofu (my first): opponent has 0 / 2+', took('tofu'));
  if (kinds.has('eel') && n('eel') === 0) t.rate(o('eel') === 1 ? 'eel (my first): opponent has a lone one' : 'eel (my first): opponent has 0 / 2+', took('eel'));
  if (kinds.has('nigiri')) {
    const onWasabi = openWasabi(myTable) > 0 ? 'onto open wasabi' : 'no wasabi';
    for (const v of ['squid', 'salmon', 'egg']) {
      if (hand.some((c) => c.kind === 'nigiri' && c.variant === v)) t.rate(`nigiri ${v}: ${onWasabi}`, took('nigiri', v));
    }
  }
  if (kinds.has('wasabi')) t.rate(`wasabi: ${third} in round`, took('wasabi'));
  if (kinds.has('eel')) t.rate(n('eel') === 0 ? 'eel: first' : n('eel') === 1 ? 'eel: second (−3 → +7)' : 'eel: third+', took('eel'));
  if (kinds.has('tofu')) t.rate(n('tofu') === 0 ? 'tofu: first' : n('tofu') === 1 ? 'tofu: second' : 'tofu: would bust', took('tofu'));
  if (kinds.has('dumpling')) t.rate(`dumpling: holding ${Math.min(n('dumpling'), 4)}${n('dumpling') >= 4 ? '+' : ''}`, took('dumpling'));
  if (kinds.has('misoSoup')) t.rate(`miso soup: ${third} in round`, took('misoSoup'));
  if (kinds.has('maki') && opp) {
    const d = icons(myTable, 'maki') - icons(oppTable, 'maki');
    t.rate(`maki: ${d > 0 ? 'ahead' : d < 0 ? 'behind' : 'tied'} on icons`, took('maki'));
  }
  if (kinds.has('uramaki')) t.rate(`uramaki: ${icons(myTable, 'uramaki') >= 5 ? '5+ icons held' : 'under 5 held'}`, took('uramaki'));
  if (kinds.has('temaki') && opp) {
    const d = n('temaki') - (liveCounts(opp.table).get('temaki') ?? 0);
    t.rate(`temaki: ${d > 0 ? 'ahead' : d < 0 ? 'behind' : 'tied'}`, took('temaki'));
  }
  for (const k of ['pudding', 'greenTeaIceCream', 'fruit'] as const) {
    if (kinds.has(k)) t.rate(`${KIND_INFO[k].label.toLowerCase()}: round ${obs.round}`, took(k));
  }
  for (const k of ['chopsticks', 'soySauce', 'tea', 'specialOrder', 'takeoutBox', 'menu'] as const) {
    if (kinds.has(k)) t.rate(`${KIND_INFO[k].label.toLowerCase()}: ${third} in round`, took(k));
  }
}

function pickStyle(
  t: Tally,
  obs: SushiGoObservation,
  faces: number[],
  pf: number,
  hand: SushiGoCard[],
  pickedIds: number[],
  skips: Skips,
): void {
  // Pick style, on exact immediate worth (2 players: the left neighbour is the opponent).
  const opp = obs.players[1];
  if (!opp) return;
  const players = obs.players.map(_internals.asPlayer);
  const onMenu = menuFaces(obs.menu);
  const mineM = _internals.marginals(players, obs.uramakiNextPlace, 0, onMenu);
  const oppM = _internals.marginals(players, obs.uramakiNextPlace, 1, onMenu);
  let best = faces[0];
  let oppBest = faces[0];
  for (const f of faces) {
    if (mineM[f] > mineM[best]) best = f;
    if (oppM[f] > oppM[oppBest]) oppBest = f;
  }
  if (oppM[pf] === oppM[oppBest]) t.tookOppBest++;
  if (mineM[pf] >= mineM[best]) t.greedy++;
  else {
    t.givenUp += (mineM[best] - mineM[pf]) * 5;
    if (oppM[pf] - oppM[best] >= 0.2) t.deny++; // ≥1 point more to the opponent
    else t.invest++;
    // Track the best card it passed over: does it come back to us, or go to them?
    if (obs.hand.length > 2) {
      const card = hand.find((c) => faceIndex(c) === best && !pickedIds.includes(c.id));
      if (card) { skips.set(card.id, 'open'); t.skipped++; }
    }
  }
}

function recordResolution(t: Tally, obs: SushiGoObservation, action: SushiGoAction): void {
  const d = obs.decision;
  if (!d) return;
  if (d.type === 'copy' && action.type === 'copyCard') {
    t.copies[faceIndex(effectiveCard(d.targets.find((c) => c.id === action.targetId)!))]++;
  }
  if (d.type === 'menu' && action.type === 'pickMenu') {
    t.menuPlays++;
    const players = obs.players.map(_internals.asPlayer);
    const m = _internals.marginals(players, obs.uramakiNextPlace, 0, menuFaces(obs.menu));
    const playable = d.drawn.filter((c) => c.kind !== 'menu');
    const bestWorth = Math.max(...playable.map((c) => m[faceIndex(c)]));
    if (m[faceIndex(playable.find((c) => c.id === action.cardId)!)] >= bestWorth) t.menuBest++;
  }
  if (d.type === 'takeout' && action.type === 'flipCards') {
    t.boxes++;
    // The policy flips one card per decision; the last part carries the whole set.
    const flipped = [...d.chosen.map((c) => c.id), ...action.cardIds.filter((id) => !d.chosen.some((c) => c.id === id))];
    const table = obs.players[0].table;
    for (const id of new Set(flipped)) {
      const c = table.find((x) => x.id === id);
      if (c) { t.flips++; t.flipFaces[faceIndex(effectiveCard(c))]++; }
    }
  }
}

/** The leading count in a round-summary detail ("3 cards → 1 pair(s)"). */
const lead = (detail?: string) => Number(/^(\d+)/.exec(detail ?? '')?.[1] ?? 0);

function recordRound(t: Tally, s: SushiGoState, seat: number): void {
  const row = s.lastRoundSummary!.perPlayer.find((r) => r.playerId === s.players[seat].id)!;
  const opp = s.lastRoundSummary!.perPlayer.find((r) => r.playerId !== s.players[seat].id)!;
  const kind = (k: SushiGoCardKind | 'takeoutBox') => row.perKind.find((x) => x.kind === k);
  for (const k of row.perKind) t.points[k.kind] = (t.points[k.kind] ?? 0) + k.points;
  const menu = new Set(s.config.menu);
  const tem = kind('tempura');
  if (tem) t.round('tempura', lead(tem.detail), lead(tem.detail) % 2);
  const sas = kind('sashimi');
  if (sas) t.round('sashimi', lead(sas.detail), lead(sas.detail) % 3);
  const tofu = kind('tofu');
  if (tofu) t.round('tofu', lead(tofu.detail), lead(tofu.detail) >= 3 ? 1 : 0, lead(tofu.detail) === 2 ? 1 : 0);
  const eel = kind('eel');
  if (eel) t.round('eel', lead(eel.detail), lead(eel.detail) === 1 ? 1 : 0);
  const dum = kind('dumpling');
  if (menu.has('dumpling')) t.round('dumpling', dum ? lead(dum.detail) : 0);
  const nig = kind('nigiri');
  if (nig) t.round('nigiri', lead(nig.detail), Number(/(\d+) tripled/.exec(nig.detail ?? '')?.[1] ?? 0));
  if (menu.has('maki')) {
    const pts = kind('maki')?.points ?? 0;
    t.round('maki', 1, pts >= 6 ? 1 : 0, pts === 0 ? 1 : 0);
  }
  if (menu.has('temaki')) {
    const pts = kind('temaki')?.points ?? 0;
    t.round('temaki', 1, pts > 0 ? 1 : 0, pts < 0 ? 1 : 0);
  }
  if (menu.has('uramaki')) t.round('uramaki', 1, kind('uramaki')?.points ?? 0);
  if (menu.has('misoSoup')) t.round('misoSoup', lead(kind('misoSoup')?.detail));
  if (menu.has('soySauce') && kind('soySauce')) t.round('soySauce', 1, (kind('soySauce')!.points > 0) ? 1 : 0);
  if (menu.has('tea') && kind('tea')) t.round('tea', lead(kind('tea')!.detail), kind('tea')!.points);
  t.round('round total', 1, row.total, row.total - opp.total);
}

function recordMatch(t: Tally, s: SushiGoState, seat: number): void {
  t.matches++;
  const winner = winnerSeatOf(s);
  if (winner === seat) t.wins++;
  else if (winner === null) t.draws++;
  const p = s.players[seat];
  t.score += s.finalScores?.[p.id] ?? 0;
  t.roundPts += p.scoreByRound.reduce((a, b) => a + b, 0);
  t.dessertPts += p.dessertScore;
  for (const k of s.config.menu) t.onMenu[k] = (t.onMenu[k] ?? 0) + 1;
  const dessert = s.config.menu.find((k) => KIND_INFO[k].category === 'dessert')!;
  t.points[dessert] = (t.points[dessert] ?? 0) + p.dessertScore;
  const pile = p.dessertPile.map(effectiveCard);
  if (dessert === 'pudding') { t.desserts.pudding += pile.length; t.desserts.puddingRounds++; }
  if (dessert === 'greenTeaIceCream') { t.desserts.iceCream += pile.length; t.desserts.iceWasted += pile.length % 4; }
  if (dessert === 'fruit') t.desserts.fruit++;
}

function play(agents: SushiGoAgent[], tallies: Tally[], seed: number): void {
  let s = newMatch(seed, { menu: 'random' });
  const skips: Skips[] = [new Map(), new Map()];
  for (let step = 0; step < 5000 && s.phase === 'playing'; step++) {
    if (s.subPhase === 'roundEnd') {
      s = applyAction(s, { type: 'nextRound' });
      continue;
    }
    const seat = actingSeat(s);
    const pid = s.players[seat].id;
    const obs = observe(s, pid);
    const action = agents[seat].act(s, pid);
    if (!action) throw new Error(`${agents[seat].name} had no move in ${s.subPhase}`);
    if (action.type === 'submitPick') {
      // The opponent taking a card this seat passed over.
      for (const id of action.cardIds) {
        if (skips[1 - seat].has(id)) { skips[1 - seat].delete(id); tallies[1 - seat].oppTook++; }
      }
      recordPick(tallies[seat], obs, action.cardIds, skips[seat]);
    } else recordResolution(tallies[seat], obs, action);
    s = applyAction(s, action);
    // Only an agent's move can end a round (game over follows a nextRound click).
    if (s.subPhase === 'roundEnd') {
      [0, 1].forEach((k) => recordRound(tallies[k], s, k));
      skips.forEach((m) => m.clear());
    }
  }
  [0, 1].forEach((k) => recordMatch(tallies[k], s, k));
}

/** Bradley–Terry strengths (MM updates, a pseudo-game vs strength 1 each), geometric mean 1. */
function bradleyTerry(wins: number[], games: number[][]): number[] {
  const n = wins.length;
  let p = new Array<number>(n).fill(1);
  for (let it = 0; it < 300; it++) {
    const next = p.map((pi, i) => {
      let denom = 1 / (pi + 1);
      for (let j = 0; j < n; j++) if (games[i][j]) denom += games[i][j] / (pi + p[j]);
      return (wins[i] + 0.5) / denom;
    });
    const g = Math.exp(next.reduce((s, v) => s + Math.log(v), 0) / n);
    p = next.map((v) => v / g);
  }
  return p;
}

function report(name: string, t: Tally): string {
  const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(0)}%` : '—');
  const f1 = (v: number) => v.toFixed(1);
  const lines: string[] = [];
  const m = Math.max(1, t.matches);
  lines.push(`## ${name}`, '');
  lines.push(`${t.matches} matches · won ${pct(t.wins, t.matches)} · drew ${pct(t.draws, t.matches)} · avg score ${f1(t.score / m)} `
    + `(rounds ${f1(t.roundPts / m)}, desserts ${f1(t.dessertPts / m)})`);
  const tot = t.rounds['round total'];
  if (tot) lines.push(`avg round ${f1(tot.extra / tot.rounds)} pts, margin ${f1(tot.extra2 / tot.rounds)}`);
  lines.push('', '### Card priority (Bradley–Terry over first picks: % it takes this over an average card)', '');
  const p = bradleyTerry(t.btWins, t.btGames);
  const ranked = FACES.map((_, i) => i).filter((i) => t.offered[i] >= 150).sort((a, b) => p[b] - p[a]);
  lines.push('| face | strength | taken when in hand | taken early (of its takes) |', '|---|---:|---:|---:|');
  for (const i of ranked) {
    lines.push(`| ${faceName(i)} | ${((100 * p[i]) / (p[i] + 1)).toFixed(0)}% | ${pct(t.taken[i], t.offered[i])} | ${pct(t.takenEarly[i], t.taken[i])} |`);
  }
  lines.push('', '### In context (taken / times it was in hand)', '', '| situation | taken | n |', '|---|---:|---:|');
  for (const [k, r] of Object.entries(t.context).sort(([a], [b]) => a.localeCompare(b))) {
    if (r.offered >= 100) lines.push(`| ${k} | ${pct(r.taken, r.offered)} | ${r.offered} |`);
  }
  lines.push('', '### Pick style (first picks, exact immediate worth)', '');
  lines.push(`greedy (most points now) ${pct(t.greedy, t.picks)} · invest ${pct(t.invest, t.picks)} · deny ${pct(t.deny, t.picks)} `
    + `· took the card worth most to the opponent ${pct(t.tookOppBest, t.picks)} · avg points given up when not greedy `
    + `${f1(t.givenUp / Math.max(1, t.invest + t.deny))}`);
  lines.push(`passed over the card worth most now (with 3+ cards in hand) ${pct(t.skipped, t.picks)} of picks: `
    + `it came back and was taken later ${pct(t.cameBack, t.skipped)}, the opponent took it ${pct(t.oppTook, t.skipped)}`);
  lines.push(`chopsticks double picks ${f1(t.doublePicks / m)}/match`);
  lines.push('', '### Points per match the kind was on the menu', '', '| kind | pts / match | |', '|---|---:|---|');
  const kinds = Object.keys(t.points).filter((k) => (t.onMenu[k] ?? 0) >= 50);
  for (const k of kinds.sort((a, b) => t.points[b] / t.onMenu[b] - t.points[a] / t.onMenu[a])) {
    const onM = t.onMenu[k];
    lines.push(`| ${k === 'takeoutBox' ? 'flipped (takeout box)' : KIND_INFO[k as SushiGoCardKind].label} | ${f1(t.points[k] / onM)} | on menu in ${onM} |`);
  }
  const r = t.rounds;
  const per = (k: string) => r[k] ?? { rounds: 0, cards: 0, extra: 0, extra2: 0 };
  lines.push('', '### Sets, rolls, desserts (per round the kind was played / on the menu)', '');
  const tem = per('tempura'); if (tem.rounds) lines.push(`tempura: ${f1(tem.cards / tem.rounds)} cards/round, left an unpaired one ${pct(tem.extra, tem.rounds)} of rounds`);
  const sas = per('sashimi'); if (sas.rounds) lines.push(`sashimi: ${f1(sas.cards / sas.rounds)} cards/round, ${pct(sas.extra, sas.cards)} of sashimi wasted (incomplete sets)`);
  const dum = per('dumpling'); if (dum.rounds) lines.push(`dumpling: ${f1(dum.cards / dum.rounds)} per round on the menu`);
  const tofu = per('tofu'); if (tofu.rounds) lines.push(`tofu: ${f1(tofu.cards / tofu.rounds)} cards/round, exactly 2 in ${pct(tofu.extra2, tofu.rounds)}, busted (3+) in ${pct(tofu.extra, tofu.rounds)}`);
  const eel = per('eel'); if (eel.rounds) lines.push(`eel: ${f1(eel.cards / eel.rounds)} cards/round, stuck with a lone eel (−3) ${pct(eel.extra, eel.rounds)}`);
  const nig = per('nigiri'); if (nig.rounds) lines.push(`nigiri: ${f1(nig.cards / nig.rounds)} per round, ${f1(nig.extra / nig.rounds)} tripled on wasabi`);
  const miso = per('misoSoup'); if (miso.rounds) lines.push(`miso soup: ${f1(miso.cards / miso.rounds)} scored per round on the menu`);
  const maki = per('maki'); if (maki.rounds) lines.push(`maki: won the most icons ${pct(maki.extra, maki.rounds)} of rounds, scored 0 ${pct(maki.extra2, maki.rounds)}`);
  const temk = per('temaki'); if (temk.rounds) lines.push(`temaki: +4 ${pct(temk.extra, temk.rounds)} of rounds`);
  const ura = per('uramaki'); if (ura.rounds) lines.push(`uramaki: ${f1(ura.extra / ura.rounds)} pts/round on the menu`);
  const soy = per('soySauce'); if (soy.rounds) lines.push(`soy sauce: scored in ${pct(soy.extra, soy.rounds)} of rounds it was played`);
  const tea = per('tea'); if (tea.rounds) lines.push(`tea: ${f1(tea.extra / tea.cards)} pts per tea played`);
  const d = t.desserts;
  if (d.puddingRounds) lines.push(`pudding: ${f1(d.pudding / d.puddingRounds)} puddings per match`);
  if (t.onMenu.greenTeaIceCream) lines.push(`green tea ice cream: ${f1(d.iceCream / t.onMenu.greenTeaIceCream)} per match, ${f1(d.iceWasted / t.onMenu.greenTeaIceCream)} left over (not in a set of 4)`);
  lines.push('', '### Special cards', '');
  const top = (counts: number[], k = 5) => counts.map((c, i) => [i, c] as const).filter(([, c]) => c > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, k).map(([i, c]) => `${faceName(i)} ${c}`).join(', ') || '—';
  lines.push(`chopsticks second cards: ${top(t.secondFaces)}`);
  lines.push(`special order copies: ${top(t.copies)}`);
  lines.push(`menu: ${t.menuPlays} plays, took the best-scoring draw ${pct(t.menuBest, t.menuPlays)}`);
  lines.push(`takeout box: ${t.boxes} boxes, ${f1(t.flips / Math.max(1, t.boxes))} flips each; flipped: ${top(t.flipFaces)}`);
  return lines.join('\n');
}

function parseArgs(argv: string[]) {
  const flags = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) flags.set(argv[i].replace(/^--/, ''), argv[i + 1]);
  if (!flags.get('a') || !flags.get('b')) throw new Error('usage: --a <agent> --b <agent> [--games N] [--seed S] [--json out.json]');
  return {
    a: flags.get('a')!, b: flags.get('b')!,
    games: Number(flags.get('games') ?? 1000), seed: Number(flags.get('seed') ?? 700_000), json: flags.get('json'),
  };
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const makeA = agentFactory(args.a);
  const makeB = agentFactory(args.b);
  const ta = new Tally();
  const tb = new Tally();
  const t0 = performance.now();
  for (let i = 0; i < Math.ceil(args.games / 2); i++) {
    const seed = args.seed + i;
    play([makeA(agentSeed(seed, 0)), makeB(agentSeed(seed, 1))], [ta, tb], seed);
    play([makeB(agentSeed(seed, 0)), makeA(agentSeed(seed, 1))], [tb, ta], seed);
  }
  const same = args.a === args.b;
  if (same) {
    // A mirror match: both seats are the same agent, so pool them.
    for (const key of Object.keys(tb) as (keyof Tally)[]) {
      const va = ta[key] as unknown;
      const vb = tb[key] as unknown;
      if (typeof va === 'number') (ta as unknown as Record<string, number>)[key] = va + (vb as number);
    }
    mergeDeep(ta, tb);
  }
  console.log(`# Sushi Go! Party: ${agentLabel(args.a)} vs ${agentLabel(args.b)} — ${ta.matches} matches in ${((performance.now() - t0) / 1000).toFixed(0)}s\n`);
  console.log(report(same ? `${agentLabel(args.a)} (mirror, both seats)` : `A: ${agentLabel(args.a)}`, ta));
  if (!same) console.log('\n' + report(`B: ${agentLabel(args.b)}`, tb));
  if (args.json) writeFileSync(args.json, JSON.stringify({ a: ta, b: same ? null : tb }));
}

/** Pool the non-scalar tallies of a mirror's second seat into the first. */
function mergeDeep(ta: Tally, tb: Tally): void {
  const addArr = (x: number[], y: number[]) => y.forEach((v, i) => { x[i] += v; });
  for (const k of ['btWins', 'offered', 'taken', 'takenEarly', 'secondFaces', 'flipFaces', 'copies'] as const) addArr(ta[k], tb[k]);
  // (scalar counters — skipped / cameBack / oppTook etc. — are summed by the caller)
  ta.btGames.forEach((row, i) => addArr(row, tb.btGames[i]));
  for (const [k, v] of Object.entries(tb.points)) ta.points[k] = (ta.points[k] ?? 0) + v;
  for (const [k, v] of Object.entries(tb.onMenu)) ta.onMenu[k] = (ta.onMenu[k] ?? 0) + v;
  for (const [k, v] of Object.entries(tb.context)) {
    const r = (ta.context[k] ??= { offered: 0, taken: 0 });
    r.offered += v.offered;
    r.taken += v.taken;
  }
  for (const [k, v] of Object.entries(tb.rounds)) {
    const r = (ta.rounds[k] ??= { rounds: 0, cards: 0, extra: 0, extra2: 0 });
    r.rounds += v.rounds; r.cards += v.cards; r.extra += v.extra; r.extra2 += v.extra2;
  }
  for (const k of Object.keys(tb.desserts) as (keyof Tally['desserts'])[]) ta.desserts[k] += tb.desserts[k];
}

main();
