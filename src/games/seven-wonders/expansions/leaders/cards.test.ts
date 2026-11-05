// Leaders — the leader deck, printed costs and the Leaders guilds.

import { describe, expect, it } from 'vitest';
import { ALL_LEADER_NAMES, buildLeaderDeck, LEADER_COUNT, leadersGuilds } from './cards';

const cost = (name: string) => buildLeaderDeck(true).find((c) => c.name === name)!.cost.coins;

describe('Leaders cards', () => {
  it('has the 36 leaders, and the 6 of the Cities box only with Cities', () => {
    expect(LEADER_COUNT).toBe(36);
    expect(buildLeaderDeck(false)).toHaveLength(36);
    expect(buildLeaderDeck(true)).toHaveLength(42);
    expect(new Set(ALL_LEADER_NAMES).size).toBe(42);
    const ids = buildLeaderDeck(true).map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Fixed ids: the same deck on every device, however often it is built.
    expect(buildLeaderDeck(true).map((c) => c.id)).toEqual(ids);
  });

  it('uses the printed costs', () => {
    expect([cost('Euclid'), cost('Ptolemy'), cost('Pythagoras'), cost('Ramses'), cost('Caesar')]).toEqual([5, 5, 5, 5, 5]);
    expect([cost('Hammurabi'), cost('Leonidas'), cost('Hannibal'), cost('Hatshepsut'), cost('Xenophon'), cost('Zenobia')]).toEqual([2, 2, 2, 2, 2, 2]);
    expect([cost('Croesus'), cost('Maecenas'), cost('Nero'), cost('Sappho'), cost('Vitruvius')]).toEqual([1, 1, 1, 1, 1]);
    expect(cost('Pericles')).toBe(6);
    expect([cost('Berenice'), cost('Diocletian'), cost('Semiramis'), cost('Aspasia'), cost('Caligula'), cost('Darius')]).toEqual([2, 2, 2, 3, 3, 4]);
  });

  it('brings four guilds', () => {
    expect(leadersGuilds().map((g) => g.name)).toEqual(['Gamers Guild', 'Courtesans Guild', 'Diplomats Guild', 'Architects Guild']);
    expect(leadersGuilds().every((g) => g.color === 'purple' && g.age === 3)).toBe(true);
  });
});
