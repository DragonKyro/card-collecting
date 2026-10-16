// Sushi Go! Party scoring.
//
// Two layers:
//   - per-round scoring: nigiri (+ wasabi triple), tempura, sashimi, dumpling,
//     onigiri sets, tofu, edamame, eel, miso soup, maki / temaki majorities,
//     uramaki places, soy sauce, tea, and cards flipped by a takeout box.
//   - end-of-match scoring: pudding (most/fewest), ice cream (sets of 4), fruit
//     (per-type tiered scoring).
//
// All scoring is pure — given player tables + (for competitive cards) all
// players' tables, returns scores. The reducer calls these to commit per-round
// totals. A special order scores as the card it copies (`effectiveCard`); a
// flipped card scores 2 and counts as nothing else.

import type { PlayerId } from '@/core/types';
import type { SushiGoCard, SushiGoCardKind, SushiGoPlayer } from './types';
import { nigiriPoints, colorGroup } from './cards';

export interface KindScore {
  kind: SushiGoCardKind;
  points: number;
  detail?: string;
}

/** Uramaki places, in the order players reach 10 icons. */
export const URAMAKI_PLACES = [8, 5, 2];

/** Compute every player's points for one round. Some scoring depends on other
 *  players (maki/uramaki/temaki/soy-sauce/edamame); `uramakiNextPlace` is the
 *  first uramaki place nobody has claimed yet this round. */
export function scoreRound(players: SushiGoPlayer[], uramakiNextPlace = 0): Record<PlayerId, KindScore[]> {
  const uramaki = uramakiRoundPoints(players, uramakiNextPlace);
  const out: Record<PlayerId, KindScore[]> = {};
  for (const p of players) out[p.id] = scoreRoundForPlayer(p, players, uramaki[p.id]);
  return out;
}

function scoreRoundForPlayer(player: SushiGoPlayer, all: SushiGoPlayer[], uramakiPts: number): KindScore[] {
  const scores: KindScore[] = [];
  const table = effectiveTable(player);
  const live = table.filter((c) => !c.flipped);

  // Pre-count what's on table for quick lookups.
  const byKind = new Map<SushiGoCardKind, SushiGoCard[]>();
  for (const c of live) {
    if (!byKind.has(c.kind)) byKind.set(c.kind, []);
    byKind.get(c.kind)!.push(c);
  }
  const anyoneHas = (kind: SushiGoCardKind) => all.some((p) => liveCards(p).some((c) => c.kind === kind));

  // ----- Nigiri (with earlier wasabi → triple) -----
  scores.push(...scoreNigiri(table));

  // ----- Appetizers -----
  if (byKind.has('tempura')) {
    const n = byKind.get('tempura')!.length;
    const pts = Math.floor(n / 2) * 5;
    scores.push({ kind: 'tempura', points: pts, detail: `${n} cards → ${Math.floor(n / 2)} pair(s)` });
  }
  if (byKind.has('sashimi')) {
    const n = byKind.get('sashimi')!.length;
    const pts = Math.floor(n / 3) * 10;
    scores.push({ kind: 'sashimi', points: pts, detail: `${n} cards → ${Math.floor(n / 3)} set(s)` });
  }
  if (byKind.has('dumpling')) {
    const n = byKind.get('dumpling')!.length;
    const table = [0, 1, 3, 6, 10, 15];
    const pts = table[Math.min(n, 5)];
    scores.push({ kind: 'dumpling', points: pts, detail: `${n} cards` });
  }
  if (byKind.has('mizuOnigiri')) {
    const sets = onigiriSets(byKind.get('mizuOnigiri')!);
    const table = [0, 1, 4, 9, 16];
    const pts = sets.reduce((s, size) => s + table[size], 0);
    const detail = sets.length === 1
      ? `${sets[0]} unique shape${sets[0] === 1 ? '' : 's'}`
      : `sets of ${sets.join(' + ')}`;
    scores.push({ kind: 'mizuOnigiri', points: pts, detail });
  }
  if (byKind.has('tofu')) {
    const n = byKind.get('tofu')!.length;
    const pts = n === 1 ? 2 : n === 2 ? 6 : 0;
    scores.push({ kind: 'tofu', points: pts, detail: `${n} cards${n >= 3 ? ' (busted)' : ''}` });
  }
  if (byKind.has('edamame')) {
    // Each edamame scores 1 per opponent with any edamame, capped at 4.
    const myCount = byKind.get('edamame')!.length;
    const othersWithEdamame = all.filter((q) =>
      q.id !== player.id && liveCards(q).some((c) => c.kind === 'edamame'),
    ).length;
    const perCard = Math.min(othersWithEdamame, 4);
    const pts = myCount * perCard;
    scores.push({ kind: 'edamame', points: pts, detail: `${myCount} × ${perCard}` });
  }
  if (byKind.has('eel')) {
    const n = byKind.get('eel')!.length;
    const pts = n === 1 ? -3 : 7;
    scores.push({ kind: 'eel', points: pts, detail: `${n} eel` });
  }
  if (byKind.has('misoSoup')) {
    const n = byKind.get('misoSoup')!.length;
    scores.push({ kind: 'misoSoup', points: n * 3, detail: `${n} soup${n === 1 ? '' : 's'}` });
  }

  // ----- Rolls -----
  if (anyoneHas('maki')) {
    scores.push({ kind: 'maki', points: makiPointsForPlayer(player, all) });
  }
  if (anyoneHas('temaki')) {
    scores.push({ kind: 'temaki', points: temakiPointsForPlayer(player, all) });
  }
  if (uramakiPts !== 0) {
    scores.push({ kind: 'uramaki', points: uramakiPts });
  }

  // ----- Specials -----
  if (byKind.has('soySauce')) {
    const myColors = distinctColors(live);
    let maxColors = 0;
    for (const q of all) maxColors = Math.max(maxColors, distinctColors(liveCards(q)));
    const pts = myColors === maxColors ? byKind.get('soySauce')!.length * 4 : 0;
    scores.push({ kind: 'soySauce', points: pts, detail: `${myColors} colors` });
  }
  if (byKind.has('tea')) {
    const teaCount = byKind.get('tea')!.length;
    const biggest = biggestColorSet(live);
    scores.push({ kind: 'tea', points: teaCount * biggest, detail: `${teaCount} tea × ${biggest}` });
  }
  const flipped = table.length - live.length;
  if (flipped > 0) {
    scores.push({ kind: 'takeoutBox', points: flipped * 2, detail: `${flipped} flipped` });
  }
  // chopsticks/spoon/menu score nothing themselves; only their use matters.

  return scores.filter((s) => s.points !== 0 || s.detail);
}

/** Score nigiri respecting wasabi triple (wasabi must be played before the nigiri).
 *  Each wasabi holds AT MOST ONE following nigiri. A flipped nigiri still sits
 *  on its wasabi; a flipped wasabi is no wasabi at all. */
function scoreNigiri(table: SushiGoCard[]): KindScore[] {
  // Walk the table in order. When we see a wasabi, mark it pending; when we see
  // a nigiri after a pending wasabi, triple its base value.
  let pendingWasabi = 0;
  let total = 0;
  let nigiriCount = 0;
  let tripled = 0;
  for (const c of table) {
    if (c.kind === 'wasabi') {
      if (!c.flipped) pendingWasabi += 1;
      continue;
    }
    if (c.kind !== 'nigiri') continue;
    const onWasabi = pendingWasabi > 0;
    if (onWasabi) pendingWasabi -= 1;
    if (c.flipped) continue;
    const base = nigiriPoints(c.variant);
    total += onWasabi ? base * 3 : base;
    if (onWasabi) tripled += 1;
    nigiriCount += 1;
  }
  if (nigiriCount === 0) return [];
  return [{
    kind: 'nigiri',
    points: total,
    detail: `${nigiriCount} nigiri${tripled ? `, ${tripled} tripled` : ''}`,
  }];
}

/** Onigiri split into sets of distinct shapes, largest first (e.g. [3, 1]). */
function onigiriSets(cards: SushiGoCard[]): number[] {
  const counts = new Map<string, number>();
  for (const c of cards) counts.set(c.variant ?? '', (counts.get(c.variant ?? '') ?? 0) + 1);
  const left = [...counts.values()];
  const sets: number[] = [];
  while (left.some((n) => n > 0)) {
    sets.push(left.filter((n) => n > 0).length);
    for (let i = 0; i < left.length; i++) left[i] = Math.max(0, left[i] - 1);
  }
  return sets;
}

function makiIcons(p: SushiGoPlayer): number {
  return liveCards(p)
    .filter((c) => c.kind === 'maki')
    .reduce((s, c) => s + Number(c.variant ?? '1'), 0);
}

function makiPointsForPlayer(player: SushiGoPlayer, all: SushiGoPlayer[]): number {
  const mine = makiIcons(player);
  if (mine === 0) return 0;
  // Places go by distinct icon totals: tied players all take the full points
  // and the next total still takes the next place.
  const awards = all.length >= 6 ? [6, 4, 2] : [6, 3];
  const totals = [...new Set(all.map(makiIcons).filter((n) => n > 0))].sort((a, b) => b - a);
  return awards[totals.indexOf(mine)] ?? 0;
}

function temakiPointsForPlayer(player: SushiGoPlayer, all: SushiGoPlayer[]): number {
  const counts = all.map((p) => ({
    id: p.id,
    count: liveCards(p).filter((c) => c.kind === 'temaki').length,
  }));
  if (counts.every((c) => c.count === 0)) return 0;
  const myCount = counts.find((c) => c.id === player.id)?.count ?? 0;
  const max = Math.max(...counts.map((c) => c.count));
  const min = Math.min(...counts.map((c) => c.count));
  let pts = 0;
  if (myCount === max) pts += 4;
  // No penalty for fewest in a 2-player game.
  if (all.length >= 3 && myCount === min && max !== min) pts -= 4;
  return pts;
}

export function uramakiIcons(p: SushiGoPlayer): number {
  return liveCards(p)
    .filter((c) => c.kind === 'uramaki')
    .reduce((s, c) => s + Number(c.variant ?? '0'), 0);
}

/** Players on 10+ uramaki icons claim the next places, most icons first.
 *  Players still tied all score that place and the place after it is skipped. */
export function claimUramaki(
  all: SushiGoPlayer[],
  nextPlace: number,
): { awards: Record<PlayerId, number>; nextPlace: number } {
  const byIcons = new Map<number, PlayerId[]>();
  for (const p of all) {
    const n = uramakiIcons(p);
    if (n >= 10) byIcons.set(n, [...(byIcons.get(n) ?? []), p.id]);
  }
  const awards: Record<PlayerId, number> = {};
  for (const n of [...byIcons.keys()].sort((a, b) => b - a)) {
    if (nextPlace >= URAMAKI_PLACES.length) break;
    const ids = byIcons.get(n)!;
    for (const id of ids) awards[id] = URAMAKI_PLACES[nextPlace];
    nextPlace += ids.length;
  }
  return { awards, nextPlace };
}

/** Uramaki points for the round: places already scored (`uramakiPoints`),
 *  places 10+ icons on the table would claim now, then the round-end place:
 *  the most icons left scores the next unclaimed place (ties all score it). */
function uramakiRoundPoints(all: SushiGoPlayer[], nextPlace: number): Record<PlayerId, number> {
  const out: Record<PlayerId, number> = {};
  for (const p of all) out[p.id] = p.uramakiPoints;
  const claim = claimUramaki(all, nextPlace);
  for (const [id, pts] of Object.entries(claim.awards)) out[id] += pts;
  if (claim.nextPlace < URAMAKI_PLACES.length) {
    const left = all.filter((p) => !(p.id in claim.awards));
    const most = Math.max(0, ...left.map(uramakiIcons));
    if (most > 0) {
      for (const p of left) if (uramakiIcons(p) === most) out[p.id] += URAMAKI_PLACES[claim.nextPlace];
    }
  }
  return out;
}

/** What a played card counts as: a special order becomes the card it copies. */
export function effectiveCard(c: SushiGoCard): SushiGoCard {
  if (c.kind !== 'specialOrder' || !c.copyOf) return c;
  const flipped = c.flipped || c.copyOf.flipped;
  return { id: c.id, kind: c.copyOf.kind, variant: c.copyOf.variant, ...(flipped ? { flipped } : {}) };
}

/** A player's table with special orders replaced by what they copy. */
export function effectiveTable(player: SushiGoPlayer): SushiGoCard[] {
  return player.table.map(effectiveCard);
}

/** Face-up cards on a table, as what they count as. */
function liveCards(player: SushiGoPlayer): SushiGoCard[] {
  return effectiveTable(player).filter((c) => !c.flipped);
}

function distinctColors(cards: SushiGoCard[]): number {
  return new Set(cards.map((c) => colorGroup(c.kind))).size;
}

function biggestColorSet(cards: SushiGoCard[]): number {
  const counts = new Map<SushiGoCardKind, number>();
  for (const c of cards) counts.set(colorGroup(c.kind), (counts.get(colorGroup(c.kind)) ?? 0) + 1);
  return Math.max(0, ...counts.values());
}

/** Sum the per-round scores into a player's total. */
export function totalRoundScore(scores: KindScore[]): number {
  return scores.reduce((s, k) => s + k.points, 0);
}

// ============================================================================
// End-of-match dessert scoring
// ============================================================================

export function scoreDesserts(players: SushiGoPlayer[]): Record<PlayerId, number> {
  const out: Record<PlayerId, number> = {};
  for (const p of players) out[p.id] = 0;
  // A special order that copied a dessert scores as that dessert.
  const pile = (p: SushiGoPlayer) => p.dessertPile.map(effectiveCard);

  // Pudding: +6 for most, −6 for fewest (skipped at 2 players). Tied players
  // all take the full amount.
  const puddings = players.map((p) => ({
    id: p.id,
    count: pile(p).filter((c) => c.kind === 'pudding').length,
  }));
  const max = Math.max(...puddings.map((c) => c.count));
  const min = Math.min(...puddings.map((c) => c.count));
  if (max > 0 && max !== min) {
    for (const c of puddings) if (c.count === max) out[c.id] += 6;
    if (players.length >= 3) {
      for (const c of puddings) if (c.count === min) out[c.id] -= 6;
    }
  }

  // ice cream: each set of 4 scores 12
  for (const p of players) {
    const n = pile(p).filter((c) => c.kind === 'greenTeaIceCream').length;
    out[p.id] += Math.floor(n / 4) * 12;
  }

  // fruit: per-type tiered scoring (0→-2, 1→0, 2→1, 3→3, 4→6, 5+→10)
  const fruitPoints = (n: number): number => [-2, 0, 1, 3, 6, 10][Math.min(n, 5)];
  if (players.some((q) => pile(q).some((c) => c.kind === 'fruit'))) {
    for (const p of players) {
      const counts: Record<string, number> = { W: 0, P: 0, O: 0 };
      for (const f of pile(p).filter((c) => c.kind === 'fruit')) {
        for (const ch of f.variant ?? '') {
          if (ch in counts) counts[ch] += 1;
        }
      }
      out[p.id] += fruitPoints(counts.W) + fruitPoints(counts.P) + fruitPoints(counts.O);
    }
  }
  return out;
}
