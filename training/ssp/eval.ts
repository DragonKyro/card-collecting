// CLI: seat-swapped head-to-head eval across worker threads.
//
//   npm run ssp:eval -- --a heuristic --b random --games 2000 --salt
//
// Flags: --a, --b (agent specs, see agents.ts), --games (rounded up to even),
// --salt, --pepper, --target, --seed, --workers (default: cores − 1, max 16),
// --max-steps, --json <path> (write summary + per-match results).

import { availableParallelism } from 'node:os';
import { writeFileSync } from 'node:fs';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { formatReport, makeJobs, runJobs, summarize, type EvalJob, type JobResult, type MatchupSpec } from './evaluate';

interface WorkerInput {
  spec: MatchupSpec;
  jobs: EvalJob[];
}

function parseArgs(argv: string[]): { spec: MatchupSpec; games: number; seed: number; workers: number; json?: string } {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith('--')) throw new Error(`unexpected argument "${key}"`);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags.set(key.slice(2), next);
      i++;
    } else {
      flags.set(key.slice(2), true);
    }
  }
  const str = (k: string, d: string) => (typeof flags.get(k) === 'string' ? (flags.get(k) as string) : d);
  const num = (k: string, d: number) => {
    const v = Number(str(k, String(d)));
    if (!Number.isFinite(v)) throw new Error(`--${k} must be a number`);
    return v;
  };
  const known = new Set(['a', 'b', 'games', 'seed', 'workers', 'salt', 'pepper', 'target', 'max-steps', 'json']);
  for (const k of flags.keys()) if (!known.has(k)) throw new Error(`unknown flag --${k}`);
  return {
    spec: {
      a: str('a', 'heuristic'),
      b: str('b', 'random'),
      sim: {
        extraSalt: flags.has('salt'),
        extraPepper: flags.has('pepper'),
        targetScore: num('target', 40),
        maxSteps: num('max-steps', 10_000),
      },
    },
    games: num('games', 1000),
    seed: num('seed', 1),
    workers: num('workers', Math.max(1, Math.min(16, availableParallelism() - 1))),
    json: typeof flags.get('json') === 'string' ? (flags.get('json') as string) : undefined,
  };
}

function runInWorker(input: WorkerInput): Promise<JobResult[]> {
  return new Promise((resolve, reject) => {
    const w = new Worker(new URL(import.meta.url), { workerData: input });
    w.once('message', resolve);
    w.once('error', reject);
    w.once('exit', (code) => { if (code !== 0) reject(new Error(`worker exited with code ${code}`)); });
  });
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const jobs = makeJobs(args.games, args.seed);
  const workers = Math.max(1, Math.min(args.workers, jobs.length));
  const t0 = performance.now();

  let results: JobResult[];
  if (workers === 1) {
    results = runJobs(args.spec, jobs);
  } else {
    // Deal seed pairs round-robin so every worker gets a similar mix.
    const shards: EvalJob[][] = Array.from({ length: workers }, () => []);
    jobs.forEach((j, i) => shards[Math.floor(i / 2) % workers].push(j));
    results = (await Promise.all(shards.map((s) => runInWorker({ spec: args.spec, jobs: s })))).flat();
  }

  const seconds = (performance.now() - t0) / 1000;
  const summary = summarize(args.spec, results);
  console.log(formatReport(args.spec, summary, { seconds, workers }));
  if (args.json) {
    writeFileSync(args.json, JSON.stringify({ spec: args.spec, summary, results }, null, 2));
    console.log(`\n  wrote ${args.json}`);
  }
}

if (isMainThread) {
  main().catch((e) => {
    console.error((e as Error).message);
    process.exit(1);
  });
} else {
  const input = workerData as WorkerInput;
  parentPort!.postMessage(runJobs(input.spec, input.jobs));
}
