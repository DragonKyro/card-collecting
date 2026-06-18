// Sushi Go! Party scoring.
//
// Two layers:
//   - per-round scoring: nigiri (+ wasabi triple), tempura, sashimi, dumpling,
//     onigiri shapes, tofu, edamame neighbors, eel, eggNigiri, maki / uramaki /
//     temaki competitive scoring, soySauce, tea, specialOrder, takeoutBox.
//   - end-of-match scoring: pudding (most/fewest), ice cream (sets of 4), fruit
//     (per-kind tiered scoring).
//
// All scoring is pure — given player tables + (for competitive cards) all
// players' tables, returns scores. The reducer calls these to commit per-round
// totals.

import type { PlayerId } from '@/core/types';
import type { SushiGoCard, SushiGoCardKind, SushiGoPlayer } from './types';
import { nigiriPoints, cardColor } from './cards';

export interface KindScore {
  kind: SushiGoCardKind;
  points: number;
  detail?: string;
}

/** Compute the points a player's table is worth for one round. Some scoring
 *  depends on other players (maki/uramaki/temaki/soy-sauce); the global view is
 *  computed by `scoreRound` over all players' tables. */
export function scoreRound(players: SushiGoPlayer[]): Record<PlayerId, KindScore[]> {
  const out: Record<PlayerId, KindScore[]> = {};
  for (const p of players) out[p.id] = scoreRoundForPlayer(p, players);
  return out;
}

function scoreRoundForPlayer(player: SushiGoPlayer, all: SushiGoPlayer[]): KindScore[] {
  const scores: KindScore[] = [];
  const table = effectiveTable(player);

  // Pre-count what's on table for quick lookups.
  const byKind = new Map<SushiGoCardKind, SushiGoCard[]>();
  for (const c of table) {
    if (!byKind.has(c.kind)) byKind.set(c.kind, []);
    byKind.get(c.kind)!.push(c);
  }

  // ----- Nigiri (with adjacent wasabi → triple) -----
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
    // Count distinct shapes
    const shapes = new Set(byKind.get('mizuOnigiri')!.map((c) => c.variant ?? ''));
    const table = [0, 1, 4, 9, 16];
    const pts = table[Math.min(shapes.size, 4)];
    scores.push({ kind: 'mizuOnigiri', points: pts, detail: `${shapes.size} unique shape${shapes.size === 1 ? '' : 's'}` });
  }
  if (byKind.has('tofu')) {
    const n = byKind.get('tofu')!.length;
    const pts = n === 1 ? 2 : n === 2 ? 6 : 0;
    scores.push({ kind: 'tofu', points: pts, detail: `${n} cards${n >= 3 ? ' (busted)' : ''}` });
  }
  if (byKind.has('edamame')) {
    // Edamame scoring: each edamame scores 1 per neighbor who also has edamame.
    // In Party that's "min(other-players-with-edamame, 4)" per card. We treat
    // any opponent with ≥1 edamame as a neighbor.
    const myCount = byKind.get('edamame')!.length;
    const others = all.filter((q) => q.id !== player.id);
    const neighborsWithEdamame = others.filter((q) =>
      effectiveTable(q).some((c) => c.kind === 'edamame'),
    ).length;
    const perCard = Math.min(neighborsWithEdamame, 4);
    const pts = myCount * perCard;
    scores.push({ kind: 'edamame', points: pts, detail: `${myCount} × ${perCard}` });
  }
  if (byKind.has('eel')) {
    const n = byKind.get('eel')!.length;
    const pts = n === 1 ? -3 : 7;
    scores.push({ kind: 'eel', points: pts, detail: `${n} eel` });
  }
  if (byKind.has('eggNigiri')) {
    // Eggs without wasabi context — eggs only score base 1 here as appetizer; if
    // a player wants wasabi-tripled eggs they should use nigiri. We score these
    // as 1 pt each (matching egg nigiri in the rulebook).
    const n = byKind.get('eggNigiri')!.length;
    scores.push({ kind: 'eggNigiri', points: n, detail: `${n} egg${n === 1 ? '' : 's'}` });
  }

  // ----- Rolls -----
  if (byKind.has('maki') || all.some((p) => effectiveTable(p).some((c) => c.kind === 'maki'))) {
    scores.push({ kind: 'maki', points: makiPointsForPlayer(player, all) });
  }
  if (byKind.has('temaki') || all.some((p) => effectiveTable(p).some((c) => c.kind === 'temaki'))) {
    scores.push({ kind: 'temaki', points: temakiPointsForPlayer(player, all) });
  }
  if (byKind.has('uramaki') || all.some((p) => effectiveTable(p).some((c) => c.kind === 'uramaki'))) {
    scores.push({ kind: 'uramaki', points: uramakiPointsForPlayer(player, all) });
  }

  // ----- Specials -----
  if (byKind.has('soySauce')) {
    const myColors = distinctColors(table);
    let maxColors = 0;
    for (const q of all) maxColors = Math.max(maxColors, distinctColors(effectiveTable(q)));
    const pts = myColors === maxColors && maxColors > 0
      ? byKind.get('soySauce')!.length * 4
      : 0;
    scores.push({ kind: 'soySauce', points: pts, detail: `${myColors} distinct colors` });
  }
  if (byKind.has('tea')) {
    // tea pts = teaCount × (count of most-played kind, NOT counting tea itself).
    const teaCount = byKind.get('tea')!.length;
    let mostKindCount = 0;
    for (const [k, cards] of byKind.entries()) {
      if (k === 'tea') continue;
      if (cards.length > mostKindCount) mostKindCount = cards.length;
    }
    const pts = teaCount * mostKindCount;
    scores.push({ kind: 'tea', points: pts, detail: `${teaCount} tea × ${mostKindCount}` });
  }
  if (byKind.has('takeoutBox')) {
    // Played takeout boxes that have been "flipped" (used) are tracked via variant=='used'.
    const used = byKind.get('takeoutBox')!.filter((c) => c.variant === 'used').length;
    if (used > 0) scores.push({ kind: 'takeoutBox', points: used * 2, detail: `${used} flipped` });
  }
  // chopsticks/spoon/menu score nothing themselves; only their use matters.
  // specialOrder: counted as a copy via effectiveTable() expansion.

  return scores.filter((s) => s.points !== 0 || s.detail);
}

/** Score nigiri respecting wasabi triple (wasabi must be played before the nigiri).
 *  Each wasabi can attach to AT MOST ONE following nigiri.
 *  Also handles eggNigiri being a "nigiri" for wasabi purposes — most builds do
 *  NOT allow eggNigiri appetizer to be wasabi-tripled, only the main nigiri set,
 *  so we keep wasabi tied to `nigiri` cards only. */
function scoreNigiri(table: SushiGoCard[]): KindScore[] {
  // Walk the table in order. When we see a wasabi, mark it pending; when we see
  // a nigiri after a pending wasabi, triple its base value.
  let pendingWasabi = 0;
  let total = 0;
  let nigiriCount = 0;
  let tripled = 0;
  for (const c of table) {
    if (c.kind === 'wasabi') {
      pendingWasabi += 1;
      continue;
    }
    if (c.kind === 'nigiri') {
      const base = nigiriPoints(c.variant);
      if (pendingWasabi > 0) {
        total += base * 3;
        pendingWasabi -= 1;
        tripled += 1;
      } else {
        total += base;
      }
      nigiriCount += 1;
    }
  }
  if (nigiriCount === 0) return [];
  return [{
    kind: 'nigiri',
    points: total,
    detail: `${nigiriCount} nigiri${tripled ? `, ${tripled} tripled` : ''}`,
  }];
}

function makiPointsForPlayer(player: SushiGoPlayer, all: SushiGoPlayer[]): number {
  // Count maki icons per player.
  const counts = all.map((p) => ({
    id: p.id,
    count: effectiveTable(p)
      .filter((c) => c.kind === 'maki')
      .reduce((s, c) => s + Number(c.variant ?? '1'), 0),
  }));
  const sorted = [...counts].sort((a, b) => b.count - a.count);
  if (sorted.length === 0 || sorted[0].count === 0) return 0;
  const myCount = counts.find((c) => c.id === player.id)?.count ?? 0;
  if (myCount === 0) return 0;
  const top = sorted[0].count;
  const tiedTop = sorted.filter((c) => c.count === top);
  // 6 pts split among tied first
  if (myCount === top) {
    return Math.floor(6 / tiedTop.length);
  }
  // 2nd place — find next-highest, must have >0
  const secondTier = sorted.filter((c) => c.count !== top && c.count > 0);
  if (secondTier.length === 0) return 0;
  const second = secondTier[0].count;
  const tiedSecond = secondTier.filter((c) => c.count === second);
  if (myCount === second) {
    return Math.floor(3 / tiedSecond.length);
  }
  return 0;
}

function temakiPointsForPlayer(player: SushiGoPlayer, all: SushiGoPlayer[]): number {
  const counts = all.map((p) => ({
    id: p.id,
    count: effectiveTable(p).filter((c) => c.kind === 'temaki').length,
  }));
  if (counts.every((c) => c.count === 0)) return 0;
  const myCount = counts.find((c) => c.id === player.id)?.count ?? 0;
  const max = Math.max(...counts.map((c) => c.count));
  const min = Math.min(...counts.map((c) => c.count));
  let pts = 0;
  if (myCount === max) pts += 4;
  // Fewest only counts if there are 3+ players (per rulebook).
  if (all.length >= 3 && myCount === min && max !== min) pts -= 4;
  return pts;
}

function uramaki10ThresholdPoints(): number[] {
  return [8, 5, 2];
}

function uramakiPointsForPlayer(player: SushiGoPlayer, all: SushiGoPlayer[]): number {
  // Per the rulebook: as soon as a player's uramaki icons cross 10, they claim
  // the next-best podium (8/5/2). After picks are placed in order, we re-simulate
  // who hits 10 first. Without per-pick ordering captured we approximate:
  //   - Compute each player's final icon total.
  //   - Award by descending total to anyone ≥ 10.
  // This collapses to a pure end-of-round computation, slightly different from
  // the strict rule (which depends on play order). Acceptable approximation.
  const counts = all.map((p) => ({
    id: p.id,
    count: effectiveTable(p)
      .filter((c) => c.kind === 'uramaki')
      .reduce((s, c) => s + Number(c.variant ?? '0'), 0),
  }));
  const eligible = counts.filter((c) => c.count >= 10).sort((a, b) => b.count - a.count);
  const podium = uramaki10ThresholdPoints();
  const myEntry = eligible.findIndex((c) => c.id === player.id);
  if (myEntry === -1) return 0;
  return podium[Math.min(myEntry, podium.length - 1)];
}

/** Expand specialOrder cards into copies of another card on the same player's
 *  table. We use the most valuable available "copy target" each time. */
function effectiveTable(player: SushiGoPlayer): SushiGoCard[] {
  const table = player.table.slice();
  // Replace each specialOrder with a synthetic card of an already-played kind.
  // The player should have set `variant` to encode their pick (e.g. 'nigiri:salmon').
  for (let i = 0; i < table.length; i++) {
    const c = table[i];
    if (c.kind !== 'specialOrder') continue;
    const v = c.variant ?? '';
    if (!v) {
      // No target chosen yet — leave it as specialOrder (scores 0).
      continue;
    }
    // variant format: "kind" or "kind:variant"
    const [kindRaw, variantRaw] = v.split(':') as [SushiGoCardKind, string | undefined];
    table[i] = { id: c.id, kind: kindRaw, variant: variantRaw };
  }
  return table;
}

function distinctColors(cards: SushiGoCard[]): number {
  const set = new Set<string>();
  for (const c of cards) {
    if (c.kind === 'soySauce') continue;
    set.add(cardColor(c.kind));
  }
  return set.size;
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

  // Pudding:
  //   2-player: +6 split for most pudding; the −6 penalty for fewest is SKIPPED.
  //   3+ player: +6 split for most, −6 split for fewest.
  const puddings = players.map((p) => ({
    id: p.id,
    count: p.dessertPile.filter((c) => c.kind === 'pudding').length,
  }));
  if (puddings.some((c) => c.count > 0)) {
    const max = Math.max(...puddings.map((c) => c.count));
    const min = Math.min(...puddings.map((c) => c.count));
    const tiedMax = puddings.filter((c) => c.count === max);
    const tiedMin = puddings.filter((c) => c.count === min);
    if (max > 0 && max !== min) {
      // Award +6 share to the most-pudding player(s).
      const share = Math.floor(6 / tiedMax.length);
      for (const c of tiedMax) out[c.id] += share;
      // The −6 penalty applies only at 3+ players.
      if (players.length >= 3) {
        const penalty = Math.floor(6 / tiedMin.length);
        for (const c of tiedMin) out[c.id] -= penalty;
      }
    }
  }

  // ice cream: each set of 4 scores 12
  for (const p of players) {
    const n = p.dessertPile.filter((c) => c.kind === 'greenTeaIceCream').length;
    out[p.id] += Math.floor(n / 4) * 12;
  }

  // fruit: per-kind tiered scoring (0→-2, 1→0, 2→1, 3→3, 4→6, 5+→10)
  const fruitPoints = (n: number): number => {
    if (n === 0) return -2;
    if (n === 1) return 0;
    if (n === 2) return 1;
    if (n === 3) return 3;
    if (n === 4) return 6;
    return 10;
  };
  for (const p of players) {
    const fruits = p.dessertPile.filter((c) => c.kind === 'fruit');
    if (fruits.length === 0 && !players.some((q) => q.dessertPile.some((c) => c.kind === 'fruit'))) continue;
    const counts: Record<string, number> = { P: 0, W: 0, O: 0 };
    for (const f of fruits) {
      const v = f.variant ?? '';
      for (const ch of v) {
        if (ch in counts) counts[ch] += 1;
      }
    }
    out[p.id] += fruitPoints(counts.P) + fruitPoints(counts.W) + fruitPoints(counts.O);
  }
  return out;
}

export { effectiveTable };
