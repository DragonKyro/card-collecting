import { useEffect, useMemo, useState } from 'react';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import type {
  SushiGoState, SushiGoAction, SushiGoConfig, SushiGoCardKind,
  SushiGoPlayer, SushiGoCategory, SushiGoStep,
} from './types';
import { CardView, FaceDownCard, variantLabel } from './Card';
import {
  ALL_KINDS, KIND_INFO, CATEGORY_REQUIRED, validateMenu, DEFAULT_MENU, randomMenu,
  kindAllowedAt, playerRangeLabel, variantsOf,
} from './cards';
import { bonusCard, copyTargets, flipTargets } from './reducer';
import { URAMAKI_PLACES } from './scoring';
import { Sidebar } from './Sidebar';
import { RulesBook, RulesHero, RulesGrid, RulesTile } from '@/ui/RulesBook';
import { AI_LEVELS, aiLevelOf, prepareAiLevel } from './aiLevels';
import './sushi-go.css';

const CATEGORIES_ORDERED: SushiGoCategory[] = ['nigiri', 'roll', 'appetizer', 'special', 'dessert'];

function LobbyConfig({ config, seats, onChange }: { config: SushiGoConfig; seats: Seat[]; onChange: (c: SushiGoConfig) => void }) {
  const playerCount = seats.length;
  const byCat: Record<SushiGoCategory, SushiGoCardKind[]> = useMemo(() => {
    const m: Record<SushiGoCategory, SushiGoCardKind[]> = { nigiri: [], roll: [], appetizer: [], special: [], dessert: [] };
    for (const k of ALL_KINDS) m[KIND_INFO[k].category].push(k);
    return m;
  }, []);
  const errors = validateMenu(config.menu, playerCount);
  const hasAI = seats.some((s) => s.isAI);
  const level = aiLevelOf(config);
  // Start fetching the chosen level's policy while the lobby is still open
  // (the Start button awaits it either way).
  useEffect(() => {
    if (hasAI) prepareAiLevel(level).catch(() => {});
  }, [hasAI, level]);
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
      {hasAI && (
        <>
          <h4 style={{ margin: '0 0 6px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-muted)' }}>
            AI difficulty
          </h4>
          <div role="radiogroup" aria-label="AI difficulty" style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {AI_LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                role="radio"
                aria-checked={level === l.id}
                className={level === l.id ? undefined : 'secondary'}
                onClick={() => onChange({ ...config, aiLevel: l.id })}
              >
                {l.label}
              </button>
            ))}
          </div>
        </>
      )}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <button
          className="secondary"
          onClick={() => onChange({ ...config, menu: DEFAULT_MENU.slice() })}
          type="button"
        >
          Reset to default menu
        </button>
        <button
          className="secondary"
          onClick={() => onChange({ ...config, menu: randomMenu(playerCount, Math.random) })}
          type="button"
        >
          🎲 Random menu
        </button>
      </div>
      {CATEGORIES_ORDERED.map((cat) => (
        <div key={cat} className="sgp-menu-cat">
          <h4>
            {categoryHeader(cat)} <span className="req">(pick {CATEGORY_REQUIRED[cat]})</span>
          </h4>
          <div className="sgp-menu-grid">
            {byCat[cat].map((k) => {
              const sel = isSelected(k);
              const range = playerRangeLabel(k);
              return (
                <button
                  key={k}
                  type="button"
                  className={`sgp-menu-pick ${sel ? 'selected' : ''}`}
                  onClick={() => togglePick(k)}
                  disabled={!sel && !kindAllowedAt(k, playerCount)}
                  title={KIND_INFO[k].rule}
                >
                  <strong>{KIND_INFO[k].label}</strong>
                  {range && <span className="range">{range}</span>}
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
                <RulesTile icon="🥢" label="Or pick 2" hint="With chopsticks from an earlier turn; they go back into the hand." accent="#9ed27c" />
                <RulesTile icon="🔁" label="Reveal &amp; pass" hint="Reveal together, then pass your hand to the left." accent="#f4d268" />
                <RulesTile icon="🏁" label="Round ends" hint="When the hand runs out. Score, then deal again." accent="#ff7070" />
              </RulesGrid>
              <h3>Setup</h3>
              <p>
                Build a menu of exactly <strong>8 kinds</strong>:
                1 nigiri set + 1 roll + 3 appetizers + 2 specials + 1 dessert.
                The default menu mirrors the original Sushi Go! base game.
              </p>
              <p>
                Menu and Special Order can't be used with 7–8 players; Spoon and Edamame
                can't be used with 2. Hands are 10 cards at 2–3 players, 9 at 4–5, 8 at
                6–7 and 7 at 8.
              </p>
            </>
          ),
        },
        {
          title: 'Abilities',
          body: (
            <>
              <RulesGrid cols={2}>
                <RulesTile icon="🌶️" label="Wasabi" hint="The next nigiri you play goes on it and scores triple." accent="#9ed27c" />
                <RulesTile icon="🥢" label="Chopsticks" hint="On a later turn, pick 2 cards; the chopsticks go back into the hand." accent="#6aa0ff" />
                <RulesTile icon="🥄" label="Spoon" hint="On a later turn, name a card: the first player to your left holding it gives it to you." accent="#98abc0" />
                <RulesTile icon="✨" label="Special Order" hint="When played, choose one of your other cards to copy." accent="#e8739c" />
                <RulesTile icon="📜" label="Menu" hint="When played, draw 4 cards from the deck and play 1." accent="#a24a63" />
                <RulesTile icon="🥡" label="Takeout Box" hint="When played, flip earlier cards face-down: 2 pts each." accent="#c97b55" />
              </RulesGrid>
              <h3>Order</h3>
              <p>
                After a reveal, special orders resolve first. Then spoons, menus and
                takeout boxes go in the order of the number in their corner — chopsticks
                1–3, spoon 4–6, menu 7–9, takeout box 10–12. A card played off a spoon or
                menu counts as played that turn.
              </p>
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
              <p className="muted">Nigiri is a single kind with 3 variants: egg ×4, salmon ×5, squid ×3.</p>
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
                Each fruit card shows two fruits: 2 cards each of double watermelon /
                pineapple / orange, 3 each of the mixed pairs. Desserts join the deck
                5 / 3 / 2 per round at 2–5 players, 7 / 5 / 3 at 6–8; desserts not
                played stay in the deck for the next round.
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
  const [useSpoon, setUseSpoon] = useState(false);
  const [flipSel, setFlipSel] = useState<number[]>([]);
  useEffect(() => {
    setSelected([]);
    setUseSpoon(false);
  }, [state.round, state.subPhase]);
  useEffect(() => {
    setFlipSel([]);
  }, [state.logSeq]);

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

  // Selecting / resolving.
  const step: SushiGoStep | null = state.subPhase === 'resolving' ? state.resolution?.steps[0] ?? null : null;
  const myStep = step && me && step.playerId === me.id ? step : null;
  const selecting = state.subPhase === 'selecting';
  const hasChopsticks = me ? bonusCard(me, 'chopsticks') !== undefined : false;
  const hasSpoon = me ? bonusCard(me, 'spoon') !== undefined : false;
  const maxPick = hasChopsticks ? 2 : 1;
  const submitted = me?.pendingPick != null;
  const submittedCount = state.players.filter((p) => p.pendingPick !== null).length;

  // Which of my cards a decision can click.
  const copyIds = new Set(myStep?.type === 'copy' && me ? copyTargets(me, myStep.cardId).map((c) => c.id) : []);
  const flipIds = new Set(myStep?.type === 'takeout' && me ? flipTargets(state, me).map((c) => c.id) : []);
  const giveIds = new Set(myStep?.type === 'spoonGive' ? myStep.options : []);

  const toggle = (id: number) => {
    if (submitted) return;
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= maxPick) return [...prev.slice(1), id];
      return [...prev, id];
    });
  };

  const canSubmit = me && selecting && !submitted && selected.length >= 1 && selected.length <= maxPick;

  function submit() {
    if (!me || !canSubmit) return;
    // Order: wasabi first if pairing with nigiri.
    let ids = selected;
    if (ids.length === 2) {
      const a = me.hand.find((c) => c.id === ids[0])!;
      const b = me.hand.find((c) => c.id === ids[1])!;
      if (a.kind === 'nigiri' && b.kind === 'wasabi') ids = [ids[1], ids[0]];
    }
    dispatch({ type: 'submitPick', playerId: me.id, cardIds: ids, ...(hasSpoon && useSpoon ? { useSpoon: true } : {}) });
    setSelected([]);
  }

  function clickTableCard(id: number) {
    if (!me) return;
    if (copyIds.has(id)) dispatch({ type: 'copyCard', playerId: me.id, targetId: id });
    if (flipIds.has(id)) setFlipSel((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  const handHint = !selecting
    ? 'Resolving special cards…'
    : submitted
      ? `Submitted ${me?.pendingPick?.length} card${me?.pendingPick?.length === 1 ? '' : 's'}. Waiting for others…`
      : `Pick ${maxPick === 2 ? 'up to 2 (chopsticks)' : '1'} card${maxPick === 1 ? '' : 's'}.`;

  return (
    <div className="ssp-layout">
      <div className="sgp">
        <div className="board">
          <div className="target-info">
            <span>Round {state.round} / {state.config.rounds}</span>
            <span>Pass: to the left →</span>
            <span>Deck: {state.deck.length}</span>
            {state.config.menu.includes('uramaki') && (
              <span>
                Uramaki next: {URAMAKI_PLACES[state.uramakiNextPlace] ?? 'none left'}
              </span>
            )}
            <span>Submitted: {selecting ? submittedCount : state.players.length} / {state.players.length}</span>
          </div>

          {step && (
            <ResolutionPanel
              state={state}
              step={step}
              mine={myStep !== null}
              flipCount={flipSel.length}
              dispatch={dispatch}
              onFlip={() => me && dispatch({ type: 'flipCards', playerId: me.id, cardIds: flipSel })}
            />
          )}

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
                  {me.uramakiPoints > 0 && ` · uramaki +${me.uramakiPoints} this round`}
                </span>
              </h3>
              {me.table.length > 0 ? (
                <div className="table-strip">
                  {me.table.map((c) => {
                    const clickable = copyIds.has(c.id) || flipIds.has(c.id);
                    return (
                      <CardView
                        key={c.id}
                        card={c}
                        size="small"
                        selectable={clickable}
                        selected={flipSel.includes(c.id)}
                        dim={myStep !== null && (myStep.type === 'copy' || myStep.type === 'takeout') && !clickable}
                        onClick={clickable ? () => clickTableCard(c.id) : undefined}
                      />
                    );
                  })}
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
                <span style={{ fontSize: 12, opacity: 0.7 }}>{handHint}</span>
              </h3>
              <div className="cards">
                {me.hand.map((c) => {
                  if (giveIds.size > 0) {
                    const give = giveIds.has(c.id);
                    return (
                      <CardView
                        key={c.id}
                        card={c}
                        selectable={give}
                        dim={!give}
                        onClick={give ? () => dispatch({ type: 'giveSpoon', playerId: me.id, cardId: c.id }) : undefined}
                      />
                    );
                  }
                  const pickable = selecting && !submitted;
                  return (
                    <CardView
                      key={c.id}
                      card={c}
                      selectable={pickable}
                      selected={selected.includes(c.id)}
                      dim={!pickable}
                      onClick={pickable ? () => toggle(c.id) : undefined}
                    />
                  );
                })}
                {me.hand.length === 0 && <p className="help">Empty hand.</p>}
              </div>
              {submitted && me.pendingPick && (
                <div className="pending-pick">
                  <span style={{ fontSize: 12, opacity: 0.85 }}>
                    Your pick (face-down to opponents){me.pendingSpoon ? ' + spoon' : ''}:
                  </span>
                  <div className="table-strip">
                    {me.pendingPick.map((c) => (
                      <CardView key={c.id} card={c} size="small" />
                    ))}
                  </div>
                </div>
              )}

              {selecting && (
                <div className="actions">
                  <button disabled={!canSubmit} onClick={submit}>
                    Submit pick {selected.length > 0 ? `(${selected.length})` : ''}
                  </button>
                  {hasSpoon && !submitted && (
                    <button
                      className={useSpoon ? '' : 'pass'}
                      onClick={() => setUseSpoon((v) => !v)}
                      title="Name a card after the reveal: the first player to your left holding it gives it to you."
                    >
                      🥄 {useSpoon ? 'Using spoon this turn' : 'Use spoon this turn'}
                    </button>
                  )}
                  <button
                    className="pass"
                    disabled={selected.length === 0}
                    onClick={() => setSelected([])}
                  >
                    Clear
                  </button>
                </div>
              )}
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

/** The special-card decision being waited on: controls for its chooser, a
 *  waiting note for everyone else. Table / hand clicks are wired in GameView. */
function ResolutionPanel({
  state, step, mine, flipCount, dispatch, onFlip,
}: {
  state: SushiGoState;
  step: SushiGoStep;
  mine: boolean;
  flipCount: number;
  dispatch: (a: SushiGoAction) => void;
  onFlip: () => void;
}) {
  const who = nameOf(state, step.playerId);
  if (!mine) {
    const what = {
      copy: 'choose what their special order copies',
      spoon: 'name a card for their spoon',
      spoonGive: `choose which card to give ${nameOf(state, step.type === 'spoonGive' ? step.toId : null)}`,
      menu: 'play a card off their menu',
      takeout: 'flip cards with their takeout box',
    }[step.type];
    return <div className="sgp-resolve">Waiting for <strong>{who}</strong> to {what}…</div>;
  }
  switch (step.type) {
    case 'copy':
      return (
        <div className="sgp-resolve mine">
          <strong>Special Order:</strong> click one of your played cards below to copy it.
        </div>
      );
    case 'takeout':
      return (
        <div className="sgp-resolve mine">
          <strong>Takeout Box:</strong> click cards from earlier turns to flip face-down (2 pts each).
          <div className="actions">
            <button onClick={onFlip}>{flipCount === 0 ? 'Flip nothing' : `Flip ${flipCount} card${flipCount === 1 ? '' : 's'}`}</button>
          </div>
        </div>
      );
    case 'spoonGive':
      return (
        <div className="sgp-resolve mine">
          <strong>{nameOf(state, step.toId)}</strong> used a spoon on you — click which of the highlighted cards to give.
        </div>
      );
    case 'spoon':
      return (
        <div className="sgp-resolve mine">
          <strong>Spoon:</strong> name a card. The first player to your left holding it gives it to you.
          <div className="sgp-spoon-asks">
            {state.config.menu.map((kind) => {
              const variants = variantsOf(kind);
              const ask = (variant?: string) =>
                dispatch({ type: 'askSpoon', playerId: step.playerId, kind, ...(variant ? { variant } : {}) });
              return (
                <div key={kind} className="sgp-spoon-row">
                  <button className="secondary" onClick={() => ask()}>
                    {variants.length > 0 ? `Any ${KIND_INFO[kind].label}` : KIND_INFO[kind].label}
                  </button>
                  {variants.map((v) => (
                    <button key={v} className="secondary" onClick={() => ask(v)}>
                      {variantLabel({ id: -1, kind, variant: v })}
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      );
    case 'menu':
      return (
        <div className="sgp-resolve mine">
          <strong>Menu:</strong> play one of the cards you drew (not another menu); the rest go back into the deck.
          <div className="cards" style={{ marginTop: 8 }}>
            {(step.drawn ?? []).map((c) => {
              const playable = c.kind !== 'menu';
              return (
                <CardView
                  key={c.id}
                  card={c}
                  selectable={playable}
                  dim={!playable}
                  onClick={playable ? () => dispatch({ type: 'pickMenu', playerId: step.playerId, cardId: c.id }) : undefined}
                />
              );
            })}
          </div>
        </div>
      );
  }
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
          {player.uramakiPoints > 0 && <><span>•</span><span>uramaki +{player.uramakiPoints}</span></>}
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
                          <strong>{k.kind === 'takeoutBox' ? 'Flipped' : KIND_INFO[k.kind].label}</strong>{' '}
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
  // The reducer settles ties (most dessert cards) and logs the winner.
  const end = state.log.find((e) => e.kind === 'matchEnd');
  const winner = (end?.kind === 'matchEnd' ? end.winnerId : null) ?? sorted[0].id;
  return (
    <div className="sgp">
      <div className="gameover-banner">{nameOf(state, winner)} wins!</div>
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
        <p style={{ fontSize: 12, opacity: 0.8 }}>Ties go to the player with the most dessert cards.</p>
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
