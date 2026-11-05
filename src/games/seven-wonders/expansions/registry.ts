// Active-expansion registry for 7 Wonders.
//
// The base reducer asks `getActiveExpansions(state.config)` for the list of
// expansion modules currently enabled, then iterates and calls their hooks.
// Order matters: it is the order of the pre-game phases (Leaders' draft, then
// the Babel tile draft), of `modifyCost` stacking and of the score columns.

import type { SwConfig, SwExpansionId } from '../types';
import type { SwExpansion } from './types';
import { leadersExpansion } from './leaders';
import { citiesExpansion } from './cities';
import { towerExpansion, projectsExpansion } from './babel';

/** All known expansions, in canonical order. */
const ALL_EXPANSIONS: readonly SwExpansion[] = [
  leadersExpansion,
  citiesExpansion,
  towerExpansion,
  projectsExpansion,
];

/** Look up an expansion by id. */
export function getExpansion(id: SwExpansionId): SwExpansion | undefined {
  return ALL_EXPANSIONS.find((e) => e.id === id);
}

const cache = new Map<string, readonly SwExpansion[]>();

/** Filter to the expansions enabled by the given config. */
export function getActiveExpansions(config: SwConfig): readonly SwExpansion[] {
  const key = config.expansions.join(',');
  let hit = cache.get(key);
  if (!hit) {
    hit = ALL_EXPANSIONS.filter((e) => config.expansions.includes(e.id));
    cache.set(key, hit);
  }
  return hit;
}

/** All expansion declarations, regardless of config — for the lobby UI. */
export function getAllExpansions(): readonly SwExpansion[] {
  return ALL_EXPANSIONS;
}
