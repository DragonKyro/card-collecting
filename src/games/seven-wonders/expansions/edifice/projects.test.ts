// Edifice expansion — project-pool sanity tests.

import { describe, it, expect } from 'vitest';
import { EDIFICE_PROJECT_POOL, projectsForAge } from './projects';

describe('Edifice projects', () => {
  it('has at least 2 projects per age', () => {
    for (const age of [1, 2, 3] as const) {
      expect(projectsForAge(age).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('all project ids are unique', () => {
    const ids = new Set(EDIFICE_PROJECT_POOL.map((p) => p.id));
    expect(ids.size).toBe(EDIFICE_PROJECT_POOL.length);
  });

  it('every project has reward + penalty + threshold', () => {
    for (const p of EDIFICE_PROJECT_POOL) {
      expect(p.threshold).toBeGreaterThan(0);
      expect(p.reward).toBeDefined();
      expect(p.penalty).toBeDefined();
    }
  });
});
