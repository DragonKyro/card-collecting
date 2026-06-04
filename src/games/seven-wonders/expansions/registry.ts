// Active-expansion registry for 7 Wonders.
//
// The base reducer asks `getActiveExpansions(state.config)` for the list of
// expansion modules currently enabled, then iterates and calls their hooks.

import type { SwConfig, SwExpansionId } from '../types';
import type { SwExpansion } from './types';
import { leadersExpansion } from './leaders';
import { citiesExpansion } from './cities';

/** All known expansions, in canonical order (also affects modifier stacking). */
const ALL_EXPANSIONS: readonly SwExpansion[] = [
  leadersExpansion,
  citiesExpansion,
  // babel, armada, edifice — added as each is implemented.
];

/** Look up an expansion by id. */
export function getExpansion(id: SwExpansionId): SwExpansion | undefined {
  return ALL_EXPANSIONS.find((e) => e.id === id);
}

/** Filter to the expansions enabled by the given config. */
export function getActiveExpansions(config: SwConfig): readonly SwExpansion[] {
  return ALL_EXPANSIONS.filter((e) => config.expansions.includes(e.id));
}

/** All expansion declarations, regardless of config — for the lobby UI. */
export function getAllExpansions(): readonly SwExpansion[] {
  return ALL_EXPANSIONS;
}
