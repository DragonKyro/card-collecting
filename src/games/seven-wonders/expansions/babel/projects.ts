// Babel — the Great Projects module.
//
// At the start of each Age (after the Recruitment phase), one Great Project of
// that Age is revealed with (players − 1) participation tokens on it. A city
// building a card of the project's colour may also pay the participation cost
// to take a token (once per turn; a free build — chain, Olympia,
// Halicarnassus, Solomon — may participate too, paying the cost). Before the
// Age's conflicts it resolves: every token taken → success, each participant
// gets the reward once per token; otherwise everyone without a token suffers
// the penalty (a city that can't take a penalty token instead: −1/−2/−3 VP by
// Age). Participation tokens are then returned.
//
// Readings: two cities joining in the same turn as the last token both get
// one (as Edifice's rule says); "discard 2 victory tokens" takes the two
// smallest; a penalty that can't be paid in full is not paid at all — the city
// takes the penalty token instead.

import { nextSimultaneousSeat } from '@/core/seats';
import { shuffle } from '@/core/rng';
import type { SwAction, SwCost, SwPendingPick, SwPlayer, SwProjectTokens, SwState } from '../../types';
import type { SwExpansion } from '../types';
import {
  continueAgeEnd, emitEvent, gainFromBank, playerById, pushLog, setActiveAIIfAny,
} from '../../reducer';
import { neighborsOf } from '../../resources';
import { wonderById } from '../../wonders';
import { GREAT_PROJECTS, greatProjectById } from './cards';

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x));
}

export function emptyTokens(): SwProjectTokens {
  return {
    freeBuild: 0, freeStage: 0, anyColor: 0, shields: 0,
    scienceSets: 0, guilds: 0, stages: 0, penalties: [], resourceBlocked: false,
  };
}

function tokens(p: SwPlayer): SwProjectTokens {
  return (p.projectTokens ??= emptyTokens());
}

/** The current Age's project, while it can still be joined. */
export function openProject(state: SwState) {
  const pr = state.project;
  if (!pr || pr.outcome !== null) return null;
  return { state: pr, card: greatProjectById(pr.projectId) };
}

/** May this city join the project with this card this turn? (The cost is
 *  checked with the card's payment.) */
export function canParticipate(state: SwState, player: SwPlayer, color: string): boolean {
  const open = openProject(state);
  if (!open || open.state.tokensLeft <= 0) return false;
  if ((state.participatedThisTurn ?? []).includes(player.id)) return false;
  return open.card.color === color || tokens(player).anyColor > 0;
}

function onAgeStart(state: SwState, age: 1 | 2 | 3): void {
  const used = new Set(state.projectsUsed ?? []);
  const pool = GREAT_PROJECTS.filter((p) => p.age === age && !used.has(p.id));
  const pick = shuffle(state.rngState, pool)[0];
  for (const p of state.players) p.participations = 0;
  state.participatedThisTurn = [];
  state.projectPenaltyQueue = [];
  if (!pick) { state.project = null; return; }
  state.projectsUsed = [...used, pick.id];
  state.project = { projectId: pick.id, tokensLeft: state.players.length - 1, outcome: null };
  pushLog(state, { kind: 'projectRevealed', projectId: pick.id });
}

function validateParticipation(state: SwState, player: SwPlayer, pick: SwPendingPick, card: { color: string }): void {
  if (pick.kind !== 'build' || !pick.participate) return;
  if (!openProject(state)) throw new Error('There is no Great Project to join.');
  if (!canParticipate(state, player, card.color)) {
    throw new Error('You can’t join the Great Project with this card (its colour, no tokens left, or already this turn).');
  }
}

function participationCost(state: SwState, _player: SwPlayer, pick: SwPendingPick): SwCost | null {
  if (pick.kind !== 'build' || !pick.participate) return null;
  const open = openProject(state);
  return open ? open.card.cost : null;
}

function onParticipate(state: SwState, player: SwPlayer, pick: SwPendingPick, card: { color: string }): void {
  if (pick.kind !== 'build' || !pick.participate) return;
  const open = openProject(state);
  if (!open) return;
  if (open.card.color !== card.color) tokens(player).anyColor -= 1;
  open.state.tokensLeft = Math.max(0, open.state.tokensLeft - 1);
  player.participations = (player.participations ?? 0) + 1;
  (state.participatedThisTurn ??= []).push(player.id);
}

/** Cards a penalised city may discard for a "discard a card" penalty. */
export function penaltyChoices(state: SwState, player: SwPlayer): number[] {
  const pr = state.project;
  if (!pr) return [];
  const pen = greatProjectById(pr.projectId).penalty;
  if (pen.kind !== 'discardColor') return [];
  return player.tableau.filter((c) => c.color === pen.color).map((c) => c.id);
}

function penaltyToken(state: SwState, p: SwPlayer): void {
  tokens(p).penalties.push(-state.age);
}

/** Resolve the project once, then wait for the cities choosing a card. */
function ageEndStep(state: SwState): boolean {
  const pr = state.project;
  if (!pr) return false;
  if (pr.outcome === null) {
    const card = greatProjectById(pr.projectId);
    const success = pr.tokensLeft === 0;
    pr.outcome = success ? 'success' : 'failure';
    pushLog(state, { kind: 'projectResolved', projectId: pr.projectId, success });
    for (const p of state.players) {
      const n = p.participations ?? 0;
      if (success && n > 0) {
        const r = card.reward;
        const t = tokens(p);
        switch (r.kind) {
          case 'coins': gainFromBank(state, p, r.amount * n); break;
          case 'shield': t.shields += r.shields * n; break;
          case 'victoryToken':
            for (let i = 0; i < n; i++) {
              p.militaryTokens.push(r.vp);
              emitEvent(state, { kind: 'militaryTokenGained', playerId: p.id, vp: r.vp, age: state.age });
            }
            break;
          case 'freeBuild': t.freeBuild += n; break;
          case 'freeStage': t.freeStage += n; break;
          case 'anyColor': t.anyColor += n; break;
          case 'scienceSets': t.scienceSets += r.vp * n; break;
          case 'guilds': t.guilds += r.vp * n; break;
          case 'stages': t.stages += r.vp * n; break;
        }
      } else if (!success && n === 0) {
        const pen = card.penalty;
        switch (pen.kind) {
          case 'discardColor': {
            const choices = penaltyChoices(state, p);
            if (choices.length === 0) penaltyToken(state, p);
            else if (choices.length === 1) discardCard(state, p, choices[0]);
            else (state.projectPenaltyQueue ??= []).push(p.id);
            break;
          }
          case 'allCoins':
            if (p.coins > 0) p.coins = 0;
            else penaltyToken(state, p);
            break;
          case 'victoryTokens': {
            const wins = p.militaryTokens.map((t, i) => ({ t, i })).filter((x) => x.t > 0).sort((a, b) => a.t - b.t);
            if (wins.length < pen.count) penaltyToken(state, p);
            else {
              const drop = new Set(wins.slice(0, pen.count).map((x) => x.i));
              p.militaryTokens = p.militaryTokens.filter((_, i) => !drop.has(i));
            }
            break;
          }
          case 'blockResource': {
            const t = tokens(p);
            if (!t.resourceBlocked && wonderById(p.wonderId).initialProduction.length > 0) t.resourceBlocked = true;
            else penaltyToken(state, p);
            break;
          }
        }
      }
    }
  }
  if ((state.projectPenaltyQueue ?? []).length > 0) {
    state.subPhase = 'projectPenalty';
    return true;
  }
  for (const p of state.players) p.participations = 0;
  return false;
}

function discardCard(state: SwState, p: SwPlayer, cardId: number): void {
  const card = p.tableau.find((c) => c.id === cardId);
  if (!card) return;
  p.tableau = p.tableau.filter((c) => c.id !== cardId);
  state.discard.push(card);
}

function applyProjects(state: SwState, action: SwAction): SwState | undefined {
  if (action.type !== 'projectPenalty') return undefined;
  if (state.subPhase !== 'projectPenalty') throw new Error('projectPenalty: nothing to discard');
  if (!(state.projectPenaltyQueue ?? []).includes(action.playerId)) throw new Error('projectPenalty: not yours to choose');
  const s = clone(state);
  const p = playerById(s, action.playerId);
  if (!penaltyChoices(s, p).includes(action.cardId)) throw new Error('projectPenalty: discard a card of the penalty’s colour');
  discardCard(s, p, action.cardId);
  s.projectPenaltyQueue = s.projectPenaltyQueue!.filter((id) => id !== action.playerId);
  if (s.projectPenaltyQueue.length > 0) setActiveAIIfAny(s);
  else continueAgeEnd(s);
  return s;
}

export const projectsExpansion: SwExpansion = {
  id: 'babelProjects',
  label: 'Babel: Great Projects',

  setupMatch(state) {
    state.project = null;
    state.projectsUsed = [];
    state.participatedThisTurn = [];
    state.projectPenaltyQueue = [];
    for (const p of state.players) {
      p.projectTokens = emptyTokens();
      p.participations = 0;
    }
  },
  onAgeStart,

  applyAction: applyProjects,
  ownsSubPhase: (sub) => sub === 'projectPenalty',
  nextAIPicker: (state) => nextSimultaneousSeat(state.seats, state.projectPenaltyQueue ?? []),

  validatePick: validateParticipation,
  pickCost: participationCost,
  onPickPlaced: onParticipate,
  onEvent(state, event) {
    if (event.kind === 'tickStart') state.participatedThisTurn = [];
  },
  ageEndStep,

  scienceExtras: (_state, player) => ({ setBonus: player.projectTokens?.scienceSets ?? 0 }),
  scoreExtras(state, player): Record<string, number> {
    const t = player.projectTokens;
    if (!t) return {};
    const { west, east } = neighborsOf(state, player.id);
    const guilds = [player, west, east].reduce((n, x) => n + x.tableau.filter((c) => c.color === 'purple').length, 0);
    const projects = t.guilds * guilds + t.stages * player.wonderStagesBuilt + t.penalties.reduce((s, v) => s + v, 0);
    return { projects };
  },
  scoreCategories: ['projects'],
};

