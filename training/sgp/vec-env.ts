// A batch of independent 2-player Sushi Go! Party matches for a learner to drive.
//
// Each env advances on its own (opponent moves, round-end click-throughs)
// until a LEARNER seat has a decision, then reports that seat's encoded
// observation and legal mask. The learner answers with one action slot per
// env. Picks are simultaneous: seats are asked one after another, each seeing
// only that the other has picked. A multi-part answer (pick + chopsticks +
// spoon, takeout flips) is several decisions; the parts before the last
// change no game state, so the env asks the same seat again with its draft.
// Finished matches auto-reset with a fresh random menu: `done[i]` marks that
// env i's episode ended during the last advance, and the obs returned is
// already the first decision of its next episode.
//
// Rewards are per seat (always length 2) and accrue between consecutive
// batches: credit `reward[i][s]` to seat s's most recent transition in env i.
//   - match end: +1 winner, −1 loser (0 for a draw or truncation)
//   - optional shaping at each round end: roundReward × (own round total −
//     opponent's round total)
//
// opponent 'self' makes both seats learners (self-play); any agent spec from
// agents.ts plays the non-learner seat otherwise. `configure` swaps that
// opponent for matches that start afterwards.

import type { SushiGoState } from '@/games/sushi-go/types';
import { applyAction } from '@/games/sushi-go/reducer';
import { observe, type SushiGoDraft } from '@/games/sushi-go/nn/observation';
import { NUM_SLOTS, decodeSlot, legalMask } from '@/games/sushi-go/nn/actions';
import { OBS_DIM, encodeObservation } from '@/games/sushi-go/nn/encode';
import { agentFactory, agentSeed, type AgentFactory, type SushiGoAgent } from './agents';
import { actingSeat, newMatch, winnerSeatOf, type SimOptions } from './sim';

export interface VecEnvOptions {
  numEnvs: number;
  seed: number;
  /** 'self' = both seats are learners; otherwise an agent spec for the other seat. */
  opponent: string;
  /** Which seat the learner takes vs a fixed opponent; 'alternate' swaps every episode. */
  learnerSeat: 'alternate' | 0 | 1;
  roundReward: number;
  maxSteps: number;
  menu: SimOptions['menu'];
}

export const DEFAULT_VEC_ENV_OPTIONS: VecEnvOptions = {
  numEnvs: 16,
  seed: 1,
  opponent: 'random',
  learnerSeat: 'alternate',
  roundReward: 0,
  maxSteps: 5_000,
  menu: 'random',
};

export interface Episode {
  env: number;
  seed: number;
  learnerSeats: number[];
  winnerSeat: number | null;
  scores: number[];
  steps: number;
  truncated: boolean;
}

/** Buffers are reused by the next reset / step — copy anything you keep. */
export interface VecBatch {
  /** Seat (0 / 1) whose decision row i is. */
  seat: Int8Array;
  /** numEnvs × OBS_DIM, row-major. */
  obs: Float32Array;
  /** numEnvs × NUM_SLOTS, 1 = legal. */
  mask: Uint8Array;
  /** numEnvs × 2, per-seat reward since the previous batch. */
  reward: Float32Array;
  done: Uint8Array;
  episodes: Episode[];
}

interface EnvSlot {
  state: SushiGoState;
  seed: number;
  episode: number;
  learner: [boolean, boolean];
  opponent: SushiGoAgent | null;
  steps: number;
  seat: number;
  /** Earlier parts of the seat's multi-part answer. */
  draft: SushiGoDraft | null;
}

export class SushiGoVecEnv {
  readonly opts: VecEnvOptions;
  private readonly envs: EnvSlot[] = [];
  private opponentFactory: AgentFactory | null;
  private batch: VecBatch;

  constructor(options: Partial<VecEnvOptions> = {}) {
    this.opts = { ...DEFAULT_VEC_ENV_OPTIONS, ...options };
    const n = this.opts.numEnvs;
    if (!(Number.isInteger(n) && n >= 1)) throw new Error('numEnvs must be a positive integer');
    this.opponentFactory = this.opts.opponent === 'self' ? null : agentFactory(this.opts.opponent);
    this.batch = {
      seat: new Int8Array(n),
      obs: new Float32Array(n * OBS_DIM),
      mask: new Uint8Array(n * NUM_SLOTS),
      reward: new Float32Array(n * 2),
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
      const decision = decodeSlot(observe(env.state, pid, { draft: env.draft }), slots[i]);
      if (decision.type === 'draft') {
        env.draft = decision.draft;
        continue;
      }
      env.draft = null;
      env.state = applyAction(env.state, decision);
      env.steps++;
      this.advance(i);
    }
    return this.finishBatch();
  }

  private startEpisode(i: number, episode: number): EnvSlot {
    const seed = (Math.imul(this.opts.seed, 1_000_003) + Math.imul(i, 7919) + episode * 104_729) >>> 0;
    let learner: [boolean, boolean] = [true, true];
    if (this.opponentFactory) {
      const seat = this.opts.learnerSeat === 'alternate' ? (i + episode) % 2 : this.opts.learnerSeat;
      learner = [seat === 0, seat === 1];
    }
    const opponentSeat = learner[0] ? 1 : 0;
    return {
      state: newMatch(seed, { menu: this.opts.menu }),
      seed,
      episode,
      learner,
      opponent: this.opponentFactory ? this.opponentFactory(agentSeed(seed, opponentSeat)) : null,
      steps: 0,
      seat: 0,
      draft: null,
    };
  }

  /** Run env i forward to the next learner decision, resetting finished matches. */
  private advance(i: number): void {
    const r = this.batch.reward;
    for (;;) {
      const env = this.envs[i];
      const s = env.state;
      if (s.phase !== 'playing' || env.steps >= this.opts.maxSteps) {
        const truncated = s.phase === 'playing';
        const winner = truncated ? null : winnerSeatOf(s);
        if (winner !== null) {
          r[i * 2 + winner] += 1;
          r[i * 2 + (1 - winner)] -= 1;
        }
        this.batch.done[i] = 1;
        this.batch.episodes.push({
          env: i,
          seed: env.seed,
          learnerSeats: [0, 1].filter((k) => env.learner[k]),
          winnerSeat: winner,
          scores: s.players.map((p) => s.finalScores?.[p.id] ?? 0),
          steps: env.steps,
          truncated,
        });
        this.envs[i] = this.startEpisode(i, env.episode + 1);
        continue;
      }
      if (s.subPhase === 'roundEnd') {
        if (this.opts.roundReward !== 0 && s.lastRoundSummary) {
          const totals = s.players.map((p) => s.lastRoundSummary!.perPlayer.find((row) => row.playerId === p.id)?.total ?? 0);
          r[i * 2] += this.opts.roundReward * (totals[0] - totals[1]);
          r[i * 2 + 1] += this.opts.roundReward * (totals[1] - totals[0]);
        }
        env.state = applyAction(s, { type: 'nextRound' });
        env.steps++;
        continue;
      }
      const seat = actingSeat(s);
      if (env.learner[seat]) {
        env.seat = seat;
        return;
      }
      const action = env.opponent!.act(s, s.players[seat].id);
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
      const obs = observe(env.state, env.state.players[env.seat].id, { draft: env.draft });
      b.seat[i] = env.seat;
      encodeObservation(obs, b.obs.subarray(i * OBS_DIM, (i + 1) * OBS_DIM));
      b.mask.set(legalMask(obs), i * NUM_SLOTS);
    });
    return b;
  }
}
