// A batch of independent matches (2–4 players) for a learner to drive.
//
// Each env advances on its own (opponent moves, round-end click-throughs)
// until a LEARNER seat has a decision, then reports that seat's encoded
// observation and legal mask. The learner answers with one action slot per
// env. A crab pick is two decisions (pile, then card once that pile is
// visible); the first changes no game state, so the env simply asks the same
// seat again with the pile revealed. Finished matches auto-reset: `done[i]`
// marks that env i's episode ended during the last advance, and the obs
// returned is already the first decision of its next episode.
//
// Rewards are per seat (`players` of them per env) and accrue between
// consecutive batches: credit `reward[i][s]` to seat s's most recent
// transition in env i. Both kinds are zero-sum over the table:
//   - match end: +1 winner, −1/(players − 1) each other seat (0 if truncated)
//     — at 2 players, ±1;
//   - optional shaping at each round end: roundReward × (own round total −
//     the other seats' mean round total).
//
// opponent 'self' makes every seat a learner (self-play); any agent spec from
// agents.ts plays the non-learner seats otherwise, with the learner in one
// seat. `configure` swaps that opponent for matches that start afterwards
// (the self / fixed split can't change mid-run).

import type { SspState } from '@/games/sea-salt-paper/types';
import { applyAction } from '@/games/sea-salt-paper/reducer';
import { observe } from '@/games/sea-salt-paper/nn/observation';
import { NUM_SLOTS, decodeSlot, legalMask } from '@/games/sea-salt-paper/nn/actions';
import { OBS_DIM, encodeObservation } from '@/games/sea-salt-paper/nn/encode';
import { fixedChoice } from '@/games/sea-salt-paper/nn/fixedChoices';
import { agentFactory, agentSeed, type AgentFactory, type SspAgent } from './agents';
import { newMatch, winnerSeatOf } from './sim';

export interface VecEnvOptions {
  numEnvs: number;
  seed: number;
  /** Seats per match, 2–4. */
  players: number;
  extraSalt: boolean;
  extraPepper?: boolean;
  targetScore: number;
  /** 'self' = every seat is a learner; otherwise an agent spec for the other seats. */
  opponent: string;
  /** Which seat the learner takes vs a fixed opponent; 'alternate' rotates every episode. */
  learnerSeat: 'alternate' | number;
  roundReward: number;
  maxSteps: number;
}

export const DEFAULT_VEC_ENV_OPTIONS: VecEnvOptions = {
  numEnvs: 16,
  seed: 1,
  players: 2,
  extraSalt: true,
  extraPepper: false,
  targetScore: 40,
  opponent: 'random',
  learnerSeat: 'alternate',
  roundReward: 0,
  maxSteps: 10_000,
};

export interface Episode {
  env: number;
  seed: number;
  learnerSeats: number[];
  winnerSeat: number | null;
  scores: number[];
  rounds: number;
  steps: number;
  truncated: boolean;
}

/** Buffers are reused by the next reset / step — copy anything you keep. */
export interface VecBatch {
  /** Seat whose decision row i is. */
  seat: Int8Array;
  /** numEnvs × OBS_DIM, row-major. */
  obs: Float32Array;
  /** numEnvs × NUM_SLOTS, 1 = legal. */
  mask: Uint8Array;
  /** numEnvs × players, per-seat reward since the previous batch. */
  reward: Float32Array;
  done: Uint8Array;
  episodes: Episode[];
}

interface EnvSlot {
  state: SspState;
  seed: number;
  episode: number;
  learner: boolean[];
  /** Plays every non-learner seat. */
  opponent: SspAgent | null;
  steps: number;
  seat: number;
  /** Pile chosen in the first half of a pending crab pick. */
  crabLook: 0 | 1 | null;
}

export class SspVecEnv {
  readonly opts: VecEnvOptions;
  private readonly envs: EnvSlot[] = [];
  private opponentFactory: AgentFactory | null;
  private batch: VecBatch;

  constructor(options: Partial<VecEnvOptions> = {}) {
    this.opts = { ...DEFAULT_VEC_ENV_OPTIONS, ...options };
    const { numEnvs: n, players } = this.opts;
    if (!(Number.isInteger(n) && n >= 1)) throw new Error('numEnvs must be a positive integer');
    if (!(Number.isInteger(players) && players >= 2 && players <= 4)) throw new Error('players must be 2, 3 or 4');
    this.opponentFactory = this.opts.opponent === 'self' ? null : agentFactory(this.opts.opponent);
    this.batch = {
      seat: new Int8Array(n),
      obs: new Float32Array(n * OBS_DIM),
      mask: new Uint8Array(n * NUM_SLOTS),
      reward: new Float32Array(n * players),
      done: new Uint8Array(n),
      episodes: [],
    };
  }

  /** Change the fixed opponent for matches that start from now on. */
  configure(update: { opponent?: string }): void {
    if (update.opponent !== undefined) {
      if ((update.opponent === 'self') !== (this.opponentFactory === null)) {
        throw new Error('configure: cannot switch between self-play and a fixed opponent mid-run');
      }
      if (update.opponent !== 'self') this.opponentFactory = agentFactory(update.opponent);
      this.opts.opponent = update.opponent;
    }
  }

  reset(): VecBatch {
    this.beginBatch();
    this.envs.length = 0;
    for (let i = 0; i < this.opts.numEnvs; i++) {
      this.envs.push(this.startEpisode(i, 0));
      this.advance(i);
    }
    return this.finishBatch();
  }

  /** One action slot per env, for the seat reported in the previous batch. */
  step(slots: ArrayLike<number>): VecBatch {
    if (this.envs.length === 0) throw new Error('step before reset');
    if (slots.length !== this.envs.length) throw new Error(`expected ${this.envs.length} actions, got ${slots.length}`);
    this.beginBatch();
    for (let i = 0; i < this.envs.length; i++) {
      const env = this.envs[i];
      const pid = env.state.players[env.seat].id;
      const decision = decodeSlot(observe(env.state, pid, { crabLookPile: env.crabLook }), slots[i]);
      if (decision.type === 'crabLook') {
        env.crabLook = decision.pile;
        continue;
      }
      env.crabLook = null;
      env.state = applyAction(env.state, decision);
      env.steps++;
      this.advance(i);
    }
    return this.finishBatch();
  }

  private startEpisode(i: number, episode: number): EnvSlot {
    const { players } = this.opts;
    const seed = (Math.imul(this.opts.seed, 1_000_003) + Math.imul(i, 7919) + episode * 104_729) >>> 0;
    let learner = Array.from({ length: players }, () => true);
    if (this.opponentFactory) {
      const seat = this.opts.learnerSeat === 'alternate' ? (i + episode) % players : this.opts.learnerSeat;
      learner = learner.map((_, k) => k === seat);
    }
    const opponentSeat = learner.indexOf(false);
    return {
      state: newMatch(seed, this.opts, players),
      seed,
      episode,
      learner,
      opponent: this.opponentFactory ? this.opponentFactory(agentSeed(seed, opponentSeat)) : null,
      steps: 0,
      seat: 0,
      crabLook: null,
    };
  }

  /** Run env i forward to the next learner decision, resetting finished matches. */
  private advance(i: number): void {
    const r = this.batch.reward;
    const P = this.opts.players;
    for (;;) {
      const env = this.envs[i];
      const s = env.state;
      if (s.phase !== 'playing' || env.steps >= this.opts.maxSteps) {
        const truncated = s.phase === 'playing';
        const winner = truncated ? null : winnerSeatOf(s);
        if (winner !== null) {
          for (let k = 0; k < P; k++) r[i * P + k] += k === winner ? 1 : -1 / (P - 1);
        }
        this.batch.done[i] = 1;
        this.batch.episodes.push({
          env: i,
          seed: env.seed,
          learnerSeats: env.learner.flatMap((on, k) => (on ? [k] : [])),
          winnerSeat: winner,
          scores: s.players.map((p) => p.matchScore),
          rounds: s.round,
          steps: env.steps,
          truncated,
        });
        this.envs[i] = this.startEpisode(i, env.episode + 1);
        continue;
      }
      if (s.subPhase === 'roundEnd') {
        if (this.opts.roundReward !== 0 && s.lastRoundSummary) {
          const totals = s.players.map((p) => s.lastRoundSummary!.perPlayer.find((row) => row.playerId === p.id)?.total ?? 0);
          const sum = totals.reduce((a, b) => a + b, 0);
          for (let k = 0; k < P; k++) {
            r[i * P + k] += this.opts.roundReward * (totals[k] - (sum - totals[k]) / (P - 1));
          }
        }
        env.state = applyAction(s, { type: 'nextRound' });
        env.steps++;
        continue;
      }
      // Extra Pepper decisions without action slots play themselves.
      const fixed = s.event ? fixedChoice(observe(s, s.activePlayerId!)) : null;
      if (fixed) {
        env.state = applyAction(s, fixed);
        env.steps++;
        continue;
      }
      const seat = s.players.findIndex((p) => p.id === s.activePlayerId);
      if (env.learner[seat]) {
        env.seat = seat;
        return;
      }
      const action = env.opponent!.act(s, s.activePlayerId!);
      if (!action) throw new Error(`opponent ${env.opponent!.name} had no move in ${s.subPhase}`);
      env.state = applyAction(s, action);
      env.steps++;
    }
  }

  private beginBatch(): void {
    this.batch.reward.fill(0);
    this.batch.done.fill(0);
    this.batch.episodes = [];
  }

  private finishBatch(): VecBatch {
    const b = this.batch;
    this.envs.forEach((env, i) => {
      const obs = observe(env.state, env.state.players[env.seat].id, { crabLookPile: env.crabLook });
      b.seat[i] = env.seat;
      encodeObservation(obs, b.obs.subarray(i * OBS_DIM, (i + 1) * OBS_DIM));
      b.mask.set(legalMask(obs), i * NUM_SLOTS);
    });
    return b;
  }
}
