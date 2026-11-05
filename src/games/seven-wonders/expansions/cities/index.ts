// Cities expansion — module assembly and its rules:
//   - Setup: each Age's deck gets as many black cards as there are players
//     (drawn at random from the 9; 7 at 8 players), hands of 8 (7 at 8
//     players) — so an Age is 7 picks; 3 guilds join the guild pool; Petra
//     and Byzantium join the boards (wonders.ts).
//   - Coin losses (Hideout, Lair, Brotherhood, Sepulcher, Cenotaph, Builders'
//     Union, the Counterfeiters' Guild, Petra B) are settled at the end of the
//     turn ('debt'): each loser pays what they choose, and takes a debt token
//     (−1 VP) per coin not paid. A city with no coins just takes the debt.
//   - Diplomacy: a city holding a token sits out the next conflict and spends
//     one; its neighbours face each other across the gap (reducer).
//   - Scoring: black cards' VP in a 'cities' column, debt in 'debt'.

import { lazy } from 'react';
import { nextSimultaneousSeat } from '@/core/seats';
import type { PlayerId } from '@/core/types';
import type { SwExpansion, SwTurnEndStep } from '../types';
import type { SwAction, SwState } from '../../types';
import { continueTurnEnd, playerById, pushLog, setActiveAIIfAny } from '../../reducer';
import { cardVps } from '../../scoring';
import { citiesDeckCards, citiesGuilds } from './cards';
import { CitiesLobbySection } from './lobby';

// The overlay uses the game's art (lazily loaded chunk), so it loads lazily too.
const DebtOverlay = lazy(() => import('./ui').then((m) => ({ default: m.DebtOverlay })));

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

/** Cities still owing a decision on a coin loss. */
export function owingDebt(state: SwState): PlayerId[] {
  return Object.entries(state.pendingLosses ?? {}).filter(([, n]) => n > 0).map(([id]) => id);
}

function settle(state: SwState, playerId: PlayerId, coins: number): void {
  const p = playerById(state, playerId);
  const owed = state.pendingLosses?.[playerId] ?? 0;
  const paid = Math.max(0, Math.min(coins, owed, p.coins));
  p.coins -= paid;
  p.debtTokens = (p.debtTokens ?? 0) + (owed - paid);
  delete state.pendingLosses![playerId];
  pushLog(state, { kind: 'debtSettled', playerId, coins: paid, debt: owed - paid });
}

const DEBT_STEP: SwTurnEndStep = {
  order: 30,
  run(state) {
    for (const id of owingDebt(state)) {
      if (playerById(state, id).coins === 0) settle(state, id, 0);
    }
    if (owingDebt(state).length === 0) return false;
    state.subPhase = 'debt';
    state.activePlayerId = nextSimultaneousSeat(state.seats, owingDebt(state));
    return true;
  },
};

function applyCities(state: SwState, action: SwAction): SwState | undefined {
  if (action.type !== 'settleDebt') return undefined;
  if (state.subPhase !== 'debt') throw new Error('settleDebt: no coin loss to settle');
  const owed = state.pendingLosses?.[action.playerId] ?? 0;
  if (owed <= 0) throw new Error('settleDebt: you owe nothing');
  const s = clone(state);
  const p = playerById(s, action.playerId);
  if (!Number.isInteger(action.coins) || action.coins < 0 || action.coins > Math.min(owed, p.coins)) {
    throw new Error(`settleDebt: pay between 0 and ${Math.min(owed, p.coins)} coins`);
  }
  settle(s, action.playerId, action.coins);
  if (owingDebt(s).length > 0) setActiveAIIfAny(s);
  else continueTurnEnd(s);
  return s;
}

export const citiesExpansion: SwExpansion = {
  id: 'cities',
  label: 'Cities',

  ageDeckCards: citiesDeckCards,
  guilds: citiesGuilds,
  extraHandCards: (n) => (n <= 7 ? 1 : 0),

  setupMatch(state) {
    for (const p of state.players) {
      p.debtTokens = 0;
      p.diplomacyTokens = 0;
    }
  },

  applyAction: applyCities,
  ownsSubPhase: (sub) => sub === 'debt',
  nextAIPicker: (state) => nextSimultaneousSeat(state.seats, owingDebt(state)),
  chooseAIAction(state, playerId) {
    if (state.subPhase !== 'debt') return null;
    const owed = state.pendingLosses?.[playerId] ?? 0;
    if (owed <= 0) return null;
    // A coin is worth less than the VP a debt token costs: pay what we can.
    const p = state.players.find((x) => x.id === playerId)!;
    return { type: 'settleDebt', playerId, coins: Math.min(owed, p.coins) };
  },

  turnEndSteps: [DEBT_STEP],

  conflictSkips(state) {
    const out = new Set<PlayerId>();
    for (const p of state.players) {
      if ((p.diplomacyTokens ?? 0) > 0) {
        p.diplomacyTokens! -= 1;
        out.add(p.id);
      }
    }
    return out;
  },

  scoreExtras(state, player) {
    const cities = player.tableau.filter((c) => c.color === 'black').reduce((s, c) => s + cardVps(state, player, c), 0);
    const debt = -(player.debtTokens ?? 0);
    return { cities, debt };
  },
  scoreCategories: ['cities', 'debt'],

  LobbySection: CitiesLobbySection,
  GameOverlay: DebtOverlay,
};
