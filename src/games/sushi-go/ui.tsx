import { useEffect, useMemo, useState } from 'react';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import type {
  SushiGoState, SushiGoAction, SushiGoConfig, SushiGoCardKind,
  SushiGoPlayer, SushiGoCategory,
} from './types';
import { CardView, FaceDownCard } from './Card';
import { ALL_KINDS, KIND_INFO, CATEGORY_REQUIRED, validateMenu, DEFAULT_MENU } from './cards';
import { Sidebar } from './Sidebar';
import { RulesBook, RulesHero, RulesGrid, RulesTile } from '@/ui/RulesBook';
import './sushi-go.css';

const CATEGORIES_ORDERED: SushiGoCategory[] = ['nigiri', 'roll', 'appetizer', 'special', 'dessert'];

function LobbyConfig({ config, seats, onChange }: { config: SushiGoConfig; seats: Seat[]; onChange: (c: SushiGoConfig) => void }) {
  void seats;
  const byCat: Record<SushiGoCategory, SushiGoCardKind[]> = useMemo(() => {
    const m: Record<SushiGoCategory, SushiGoCardKind[]> = { nigiri: [], roll: [], appetizer: [], special: [], dessert: [] };
    for (const k of ALL_KINDS) m[KIND_INFO[k].category].push(k);
    return m;
  }, []);
  const errors = validateMenu(config.menu);
  const isSelected = (k: SushiGoCardKind) => config.menu.includes(k);
  const togglePick = (k: SushiGoCardKind) => {
    const cat = KIND_INFO[k].category;
    const limit = CATEGORY_REQUIRED[cat];
    const currentInCat = config.menu.filter((m) => KIND_INFO[m].category === cat);
    let nextMenu: SushiGoCardKind[];
    if (isSelected(k)) {
      // Deselect.
      nextMenu = config.menu.filter((m) => m !== k);
    } else if (currentInCat.length >= limit) {
      // Bump the oldest in the category, append new pick.
      const dropOne = currentInCat[0];
      nextMenu = [...config.menu.filter((m) => m !== dropOne), k];
    } else {
      nextMenu = [...config.menu, k];
    }
    onChange({ ...config, menu: nextMenu });
  };

  return (
    <div className="game-config sgp-lobby">
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <button
          className="secondary"
          onClick={() => onChange({ ...config, menu: DEFAULT_MENU.slice() })}
          type="button"
        >
          Reset to default menu
        </button>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
          Pick 1 nigiri + 1 roll + 3 appetizers + 2 specials + 1 dessert.
        </span>
      </div>
      {CATEGORIES_ORDERED.map((cat) => (
        <div key={cat} className="sgp-menu-cat">
          <h4>
            {categoryHeader(cat)} <span className="req">(pick {CATEGORY_REQUIRED[cat]})</span>
          </h4>
          <div className="sgp-menu-grid">
            {byCat[cat].map((k) => {
              const sel = isSelected(k);
              return (
                <button
                  key={k}
                  type="button"
                  className={`sgp-menu-pick ${sel ? 'selected' : ''}`}
                  onClick={() => togglePick(k)}
                  title={KIND_INFO[k].rule}
                >
                  <strong>{KIND_INFO[k].label}</strong>
                </button>
              );
            })}
          </div>
        </div>
      ))}
      {errors.length > 0 && (
        <div className="sgp-menu-errors">
          {errors.map((e, i) => <div key={i}>• {e}</div>)}
        </div>
      )}
    </div>
  );
}

function categoryHeader(cat: SushiGoCategory): string {
  switch (cat) {
    case 'nigiri': return 'Nigiri set';
    case 'roll': return 'Rolls';
    case 'appetizer': return 'Appetizers';
    case 'special': return 'Specials';
    case 'dessert': return 'Desserts';
  }
}

function Rules() {
  const byCat: Record<SushiGoCategory, SushiGoCardKind[]> = useMemo(() => {
    const m: Record<SushiGoCategory, SushiGoCardKind[]> = { nigiri: [], roll: [], appetizer: [], special: [], dessert: [] };
    for (const k of ALL_KINDS) m[KIND_INFO[k].category].push(k);
    return m;
  }, []);
  const cardRows = (cat: SushiGoCategory) => byCat[cat].map((k) => (
    <tr key={k}>
      <td>{KIND_INFO[k].label}</td>
      <td className="num">{KIND_INFO[k].count}</td>
      <td className="muted">{KIND_INFO[k].rule}</td>
    </tr>
  ));
  return (
    <RulesBook
      pages={[
        {
          title: 'Overview',
          body: (
            <>
              <RulesHero
                title="Sushi Go! Party"
                subtitle="Pick-and-pass drafting across 3 rounds. Build the tastiest meal."
                accent="linear-gradient(135deg, #d94e4e 0%, #f4d268 100%)"
              />
              <h3>Each tick</h3>
              <RulesGrid cols={2}>
                <RulesTile icon="①" label="Pick 1 card" hint="Simultaneously, from your current hand." accent="#6aa0ff" />
                <RulesTile icon="🥢" label="Or pick 2" hint="With chopsticks or spoon banked from earlier." accent="#9ed27c" />
                <RulesTile icon="🔁" label="Reveal &amp; pass" hint="Rounds 1+3 clockwise, round 2 counter-clockwise." accent="#f4d268" />
                <RulesTile icon="🏁" label="Round ends" hint="When the hand runs out. Score, then deal again." accent="#ff7070" />
              </RulesGrid>
              <h3>Setup</h3>
              <p>
                Build a menu of exactly <strong>8 kinds</strong>:
                1 nigiri set + 1 roll + 3 appetizers + 2 specials + 1 dessert.
                The default menu mirrors the original Sushi Go! base game.
              </p>
            </>
          ),
        },
        {
          title: 'Abilities',
          body: (
            <>
              <RulesGrid cols={2}>
                <RulesTile icon="🌶️" label="Wasabi" hint="Placed before a nigiri triples its value." accent="#9ed27c" />
                <RulesTile icon="🥢" label="Chopsticks / Spoon" hint="Bank to pick 2 cards on a future tick." accent="#6aa0ff" />
                <RulesTile icon="✨" label="Special Order" hint="Copies one of your other tableau cards." accent="#b984c9" />
                <RulesTile icon="📋" label="Menu / Takeout Box" hint="Mid-tick subphases for swapping or rerolling." accent="#f4d268" />
              </RulesGrid>
              <h3>Round-end scoring</h3>
              <p>
                When the hand runs out, score everything on each table per the
                card rules. This round's desserts move to the dessert pile (no
                immediate score). After round 3, the dessert pile is scored once.
              </p>
            </>
          ),
        },
        {
          title: 'Nigiri',
          body: (
            <>
              <table className="tight">
                <thead><tr><th>Kind</th><th className="num">Count</th><th>Rule</th></tr></thead>
                <tbody>{cardRows('nigiri')}</tbody>
              </table>
              <p className="muted">Nigiri is a single kind with 3 variants: egg ×4, salmon ×5, squid ×5.</p>
            </>
          ),
        },
        {
          title: 'Rolls',
          body: (
            <table className="tight">
              <thead><tr><th>Kind</th><th className="num">Count</th><th>Rule</th></tr></thead>
              <tbody>{cardRows('roll')}</tbody>
            </table>
          ),
        },
        {
          title: 'Appetizers',
          body: (
            <table className="tight">
              <thead><tr><th>Kind</th><th className="num">Count</th><th>Rule</th></tr></thead>
              <tbody>{cardRows('appetizer')}</tbody>
            </table>
          ),
        },
        {
          title: 'Specials',
          body: (
            <table className="tight">
              <thead><tr><th>Kind</th><th className="num">Count</th><th>Rule</th></tr></thead>
              <tbody>{cardRows('special')}</tbody>
            </table>
          ),
        },
        {
          title: 'Desserts',
          body: (
            <>
              <table className="tight">
                <thead><tr><th>Kind</th><th className="num">Count</th><th>Rule</th></tr></thead>
                <tbody>{cardRows('dessert')}</tbody>
              </table>
              <p className="muted">
                Fruit's 9 cards split across pineapple / watermelon / orange. Per-round
                dessert additions follow a 5/3/2 schedule across rounds 1/2/3.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}

function GameView({
  state,
  localPlayerId,
  dispatch,
}: {
  state: SushiGoState;
  localPlayerId: PlayerId | null;
  dispatch: (a: SushiGoAction) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  useEffect(() => {
    setSelected([]);
  }, [state.round, state.subPhase]);

  const me = state.players.find((p) => p.id === localPlayerId) ?? null;
  const opponents = state.players.filter((p) => p.id !== localPlayerId);
  const mySeatName = getSeat(state, localPlayerId ?? '')?.name ?? 'You';

  if (state.phase === 'gameOver') {
    return (
      <div className="ssp-layout">
        <div className="sgp"><GameOver state={state} /></div>
        <Sidebar state={state} mySeatName={mySeatName} />
      </div>
    );
  }

  if (state.subPhase === 'roundEnd') {
    return (
      <div className="ssp-layout">
        <div className="sgp">
          <RoundSummary state={state} />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <button onClick={() => dispatch({ type: 'nextRound' })}>
              {state.round >= state.config.rounds ? 'Final scoring →' : 'Next round →'}
            </button>
          </div>
        </div>
        <Sidebar state={state} mySeatName={mySeatName} />
      </div>
    );
  }

  // Selecting phase.
  const hasChopsticks = me?.table.some((c) => c.kind === 'chopsticks' && c.variant !== 'used') ?? false;
  const hasSpoon = me?.table.some((c) => c.kind === 'spoon' && c.variant !== 'used') ?? false;
  const maxPick = (hasChopsticks || hasSpoon) ? 2 : 1;
  const submitted = me?.pendingPick != null;
  const submittedCount = state.players.filter((p) => p.pendingPick !== null).length;

  const toggle = (id: number) => {
    if (submitted) return;
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= maxPick) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const canSubmit = me && !submitted && selected.length >= 1 && selected.length <= maxPick;

  function submit() {
    if (!me || !canSubmit) return;
    // Order: wasabi first if pairing with nigiri.
    let ids = selected;
    if (ids.length === 2) {
      const a = me.hand.find((c) => c.id === ids[0])!;
      const b = me.hand.find((c) => c.id === ids[1])!;
      if (a.kind === 'nigiri' && b.kind === 'wasabi') ids = [ids[1], ids[0]];
    }
    dispatch({ type: 'submitPick', playerId: me.id, cardIds: ids });
    setSelected([]);
  }

  return (
    <div className="ssp-layout">
      <div className="sgp">
        <div className="board">
          <div className="target-info">
            <span>Round {state.round} / {state.config.rounds}</span>
            <span>Pass: {state.passDirection === 'cw' ? 'clockwise →' : '← counter-clockwise'}</span>
            <span>Deck: {state.deck.length}</span>
            <span>Submitted: {submittedCount} / {state.players.length}</span>
          </div>

          <div className="opponents">
            {opponents.map((p) => (
              <PlayerStrip
                key={p.id}
                player={p}
                seat={getSeat(state, p.id)}
                submitted={p.pendingPick != null}
              />
            ))}
          </div>

          {me ? (
            <div className="hand-area">
              <h3>
                <span>{mySeatName}'s table</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  Round totals: {me.scoreByRound.map((s, i) => `R${i + 1}:${s}`).join(' · ') || '—'}
                </span>
              </h3>
              {me.table.length > 0 ? (
                <div className="table-strip">
                  {me.table.map((c) => (
                    <CardView key={c.id} card={c} size="small" />
                  ))}
                </div>
              ) : (
                <p className="help" style={{ textAlign: 'left' }}>You haven't played any cards this round yet.</p>
              )}

              {me.dessertPile.length > 0 && (
                <>
                  <h3 style={{ marginTop: 14 }}>
                    <span>Dessert pile · {me.dessertPile.length}</span>
                  </h3>
                  <div className="table-strip">
                    {me.dessertPile.map((c) => (
                      <CardView key={c.id} card={c} size="small" />
                    ))}
                  </div>
                </>
              )}

              <h3 style={{ marginTop: 14 }}>
                <span>Your hand · {me.hand.length} card{me.hand.length === 1 ? '' : 's'}</span>
                <span style={{ fontSize: 12, opacity: 0.7 }}>
                  {submitted
                    ? `Submitted ${me.pendingPick?.length} card${me.pendingPick?.length === 1 ? '' : 's'}. Waiting for others…`
                    : `Pick ${maxPick === 2 ? 'up to 2 (chopsticks/spoon active)' : '1'} card${maxPick === 1 ? '' : 's'}.`}
                </span>
              </h3>
              <div className="cards">
                {me.hand.map((c) => (
                  <CardView
                    key={c.id}
                    card={c}
                    selectable={!submitted}
                    selected={selected.includes(c.id)}
                    dim={submitted}
                    onClick={!submitted ? () => toggle(c.id) : undefined}
                  />
                ))}
                {me.hand.length === 0 && <p className="help">Empty hand.</p>}
              </div>
              {submitted && me.pendingPick && (
                <div className="pending-pick">
                  <span style={{ fontSize: 12, opacity: 0.85 }}>Your pick (face-down to opponents):</span>
                  <div className="table-strip">
                    {me.pendingPick.map((c) => (
                      <CardView key={c.id} card={c} size="small" />
                    ))}
                  </div>
                </div>
              )}

              <div className="actions">
                <button disabled={!canSubmit} onClick={submit}>
                  Submit pick {selected.length > 0 ? `(${selected.length})` : ''}
                </button>
                <button
                  className="pass"
                  disabled={selected.length === 0}
                  onClick={() => setSelected([])}
                >
                  Clear
                </button>
              </div>
            </div>
          ) : (
            <p className="help">Spectator view.</p>
          )}
        </div>
      </div>

      <Sidebar state={state} mySeatName={mySeatName} />
    </div>
  );
}

function PlayerStrip({
  player, seat, submitted,
}: {
  player: SushiGoPlayer; seat: Seat | undefined; submitted: boolean;
}) {
  const roundSum = player.scoreByRound.reduce((s, x) => s + x, 0);
  return (
    <div className={`player-strip ${submitted ? 'active' : ''}`}>
      <header>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: seat?.color ?? '#888', borderRadius: 2 }} />
          {seat?.name ?? player.id}
          {seat?.isAI ? <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>(AI)</span> : null}
          {submitted && <span style={{ fontSize: 10, color: '#f4d268', marginLeft: 6 }}>✓ picked</span>}
        </span>
        <span className="scores">
          <span>{roundSum} pts</span>
          <span>•</span>
          <span>{player.hand.length} in hand</span>
        </span>
      </header>
      <div className="table-strip">
        {[...Array(player.hand.length)].map((_, i) => (
          <FaceDownCard key={`fd-${i}`} size="small" />
        ))}
        {player.table.map((c) => (
          <CardView key={c.id} card={c} size="small" />
        ))}
      </div>
      {player.dessertPile.length > 0 && (
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 4 }}>
          Dessert pile: {player.dessertPile.length}
        </div>
      )}
    </div>
  );
}

function RoundSummary({ state }: { state: SushiGoState }) {
  const summary = state.lastRoundSummary;
  if (!summary) return null;
  return (
    <div className="round-summary">
      <h2>Round {summary.round} complete</h2>
      <table>
        <thead>
          <tr>
            <th>Player</th>
            <th>Breakdown</th>
            <th className="num">Round</th>
            <th className="num">Total</th>
          </tr>
        </thead>
        <tbody>
          {summary.perPlayer.map((row) => {
            const p = state.players.find((x) => x.id === row.playerId)!;
            const cumulative = p.scoreByRound.reduce((s, x) => s + x, 0);
            return (
              <tr key={row.playerId}>
                <td>{nameOf(state, row.playerId)}</td>
                <td style={{ fontSize: 11 }}>
                  {row.perKind.length === 0
                    ? <em style={{ opacity: 0.6 }}>no scoring</em>
                    : row.perKind.map((k, i) => (
                        <span key={i} style={{ marginRight: 8 }}>
                          <strong>{KIND_INFO[k.kind].label}</strong>{' '}
                          <span style={{ opacity: 0.8 }}>{k.points}{k.detail ? ` (${k.detail})` : ''}</span>
                        </span>
                      ))}
                </td>
                <td className="num"><strong>{row.total}</strong></td>
                <td className="num">{cumulative}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ fontSize: 12, opacity: 0.8, marginTop: 8 }}>
        Desserts have been moved to each player's dessert pile and will be scored at match end.
      </p>
    </div>
  );
}

function GameOver({ state }: { state: SushiGoState }) {
  const sorted = [...state.players].sort((a, b) => {
    const sa = (state.finalScores?.[a.id] ?? 0);
    const sb = (state.finalScores?.[b.id] ?? 0);
    return sb - sa;
  });
  const winner = sorted[0];
  return (
    <div className="sgp">
      <div className="gameover-banner">{nameOf(state, winner.id)} wins!</div>
      <div className="round-summary">
        <h2>Final scores</h2>
        <table>
          <thead>
            <tr>
              <th>Player</th>
              {Array.from({ length: state.config.rounds }, (_, i) => (
                <th key={i} className="num">R{i + 1}</th>
              ))}
              <th className="num">Dessert</th>
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((p) => (
              <tr key={p.id}>
                <td>{nameOf(state, p.id)}</td>
                {Array.from({ length: state.config.rounds }, (_, i) => (
                  <td key={i} className="num">{p.scoreByRound[i] ?? 0}</td>
                ))}
                <td className="num">{p.dessertScore}</td>
                <td className="num"><strong>{state.finalScores?.[p.id] ?? 0}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function getSeat(state: SushiGoState, id: PlayerId): Seat | undefined {
  return state.seats.find((s) => s.id === id);
}

function nameOf(state: SushiGoState, id: PlayerId | null): string {
  if (!id) return '—';
  return getSeat(state, id)?.name ?? id;
}

export const bundle: GameUiBundle<SushiGoState, SushiGoAction, SushiGoConfig> = {
  LobbyConfig,
  GameView,
  Rules,
};
