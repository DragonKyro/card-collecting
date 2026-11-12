import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import type { GameUiBundle } from '@/core/module';
import { sharedDeviceHumans } from '@/core/seats';
import type { PlayerId, Seat } from '@/core/types';
import type {
  SushiGoState, SushiGoAction, SushiGoConfig, SushiGoCardKind,
  SushiGoPlayer, SushiGoCategory, SushiGoStep,
} from './types';
import { CardView, FaceDownCard, variantLabel } from './Card';
import { CardArt } from './art';
import { ChipIcon, Confetti } from './decor';
import {
  ALL_KINDS, KIND_INFO, CATEGORY_REQUIRED, validateMenu, DEFAULT_MENU, randomMenu,
  kindAllowedAt, playerRangeLabel, variantsOf, cardColor,
} from './cards';
import { bonusCard, copyTargets, flipTargets } from './reducer';
import { URAMAKI_PLACES } from './scoring';
import { Sidebar } from './Sidebar';
import { MatchStats } from './StatsPanel';
import { RulesBook, RulesHero, RulesGrid, RulesTile } from '@/ui/RulesBook';
import { prepareAiLevel } from './aiLevels';
import { aiLevelsOf } from './levels';
import type { SushiGoAiLevel } from './types';
import './sushi-go.css';

const CATEGORIES_ORDERED: SushiGoCategory[] = ['nigiri', 'roll', 'appetizer', 'special', 'dessert'];

/** Which face the lobby's menu tiles draw for kinds that come in variants. */
const MENU_ART_VARIANT: Partial<Record<SushiGoCardKind, string>> = {
  nigiri: 'salmon', maki: '2', uramaki: '3', mizuOnigiri: 'triangle', fruit: 'WP',
};

function LobbyConfig({ config, seats, onChange, readOnly }: { config: SushiGoConfig; seats: Seat[]; onChange: (c: SushiGoConfig) => void; readOnly?: boolean }) {
  const playerCount = seats.length;
  const byCat: Record<SushiGoCategory, SushiGoCardKind[]> = useMemo(() => {
    const m: Record<SushiGoCategory, SushiGoCardKind[]> = { nigiri: [], roll: [], appetizer: [], special: [], dessert: [] };
    for (const k of ALL_KINDS) m[KIND_INFO[k].category].push(k);
    return m;
  }, []);
  const errors = validateMenu(config.menu, playerCount);
  // Start fetching the AI seats' policies while the lobby is still open (the
  // Start button awaits them either way). Each seat's level is picked on its
  // seat row.
  const levels = aiLevelsOf(seats).join(',');
  useEffect(() => {
    if (readOnly || !levels) return;
    for (const level of levels.split(',')) prepareAiLevel(level as SushiGoAiLevel).catch(() => {});
  }, [levels, readOnly]);
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
        <button
          className="secondary"
          onClick={() => onChange({ ...config, menu: randomMenu(playerCount, Math.random) })}
          type="button"
        >
          🎲 Random menu
        </button>
      </div>
      {CATEGORIES_ORDERED.map((cat) => {
        const done = config.menu.filter((m) => KIND_INFO[m].category === cat).length === CATEGORY_REQUIRED[cat];
        return (
          <div key={cat} className={`sgp-menu-cat ${done ? 'done' : ''}`}>
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
                    style={{ '--kind': cardColor(k) } as CSSProperties}
                    onClick={() => togglePick(k)}
                    disabled={!sel && !kindAllowedAt(k, playerCount)}
                    title={KIND_INFO[k].rule}
                  >
                    <svg className="sgp-menu-art" viewBox="0 0 100 100" aria-hidden>
                      <CardArt card={{ id: -1, kind: k, variant: MENU_ART_VARIANT[k] }} />
                    </svg>
                    <span className="sgp-menu-text">
                      <strong>{KIND_INFO[k].label}</strong>
                      {range && <span className="range">{range}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
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
                <RulesTile icon="🥄" label="Spoon" hint="On a later turn, after the reveal, you may name a card: the first player to your left holding it gives it to you." accent="#98abc0" />
                <RulesTile icon="✨" label="Special Order" hint="When played, choose one of your other cards to copy." accent="#e8739c" />
                <RulesTile icon="📜" label="Menu" hint="When played, draw 4 cards from the deck and play 1." accent="#a24a63" />
                <RulesTile icon="🥡" label="Takeout Box" hint="When played, flip earlier cards face-down: 2 pts each." accent="#c97b55" />
              </RulesGrid>
              <h3>Order</h3>
              <p>
                Chopsticks are used with the pick: choose both cards face-down. Everything
                else happens at the reveal. Special orders resolve first. Then spoons, menus
                and takeout boxes go in the order of the number in their corner — chopsticks
                1–3, spoon 4–6, menu 7–9, takeout box 10–12; whoever has a spoon from an
                earlier turn decides then whether to use it. A card played off a spoon or
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
  const [flipSel, setFlipSel] = useState<number[]>([]);
  useEffect(() => {
    setSelected([]);
  }, [state.round, state.subPhase]);
  useEffect(() => {
    setFlipSel([]);
  }, [state.logSeq]);

  const me = state.players.find((p) => p.id === localPlayerId) ?? null;
  const opponents = state.players.filter((p) => p.id !== localPlayerId);
  const mySeatName = getSeat(state, localPlayerId ?? '')?.name ?? 'You';

  if (state.phase === 'gameOver') {
    return (
      <div className="sgp-layout">
        <div className="sgp"><GameOver state={state} /></div>
        <Sidebar state={state} mySeatName={mySeatName} />
      </div>
    );
  }

  if (state.subPhase === 'roundEnd') {
    return (
      <div className="sgp-layout">
        <div className="sgp">
          <RoundSummary state={state} />
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 16 }}>
            <button className="sgp-next" onClick={() => dispatch({ type: 'nextRound' })}>
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
  const maxPick = hasChopsticks ? 2 : 1;
  const submitted = me?.pendingPick != null;
  const submittedCount = state.players.filter((p) => p.pendingPick !== null).length;
  // Players sharing a device: once your pick is locked in, your hand stays
  // hidden — whoever looks at the screen next may not be you.
  const hideHand = submitted && selecting && sharedDeviceHumans(state.seats) >= 2;

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
    dispatch({ type: 'submitPick', playerId: me.id, cardIds: ids });
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
  // Presentational: the chopsticks a pick can use now, and the card a decision is about.
  const armedId = selecting && me && !submitted ? bonusCard(me, 'chopsticks')?.id : undefined;
  const resolvingId = step && 'cardId' in step ? step.cardId : undefined;
  const tableClass = (id: number) => (id === resolvingId ? 'resolving' : id === armedId ? 'armed' : undefined);
  const yourPick = selecting && me !== null && !submitted;

  return (
    <div className="sgp-layout">
      <div className="sgp">
        <div className="board">
          <div className="target-info">
            <span className="sgp-info round"><ChipIcon kind="round" />Round {state.round} / {state.config.rounds}</span>
            <span className="sgp-info pass"><ChipIcon kind="pass" />Pass: to the left →</span>
            <span className="sgp-info deck"><ChipIcon kind="deck" />Deck: {state.deck.length}</span>
            {state.config.menu.includes('uramaki') && (
              <span className="sgp-info uramaki">
                <ChipIcon kind="uramaki" />
                Uramaki next: {URAMAKI_PLACES[state.uramakiNextPlace] ?? 'none left'}
              </span>
            )}
            <span className={`sgp-info picks ${selecting && submittedCount === state.players.length ? 'all' : ''}`}>
              <ChipIcon kind="picks" />
              Submitted: {selecting ? submittedCount : state.players.length} / {state.players.length}
              <span className="sgp-pips" aria-hidden>
                {state.players.map((p) => (
                  <i
                    key={p.id}
                    className={!selecting || p.pendingPick !== null ? 'on' : ''}
                    style={{ '--seat': getSeat(state, p.id)?.color ?? '#888' } as CSSProperties}
                  />
                ))}
              </span>
            </span>
          </div>

          {step && (
            <ResolutionPanel
              key={`${step.type}-${step.playerId}-${'cardId' in step ? step.cardId : ''}`}
              state={state}
              step={step}
              mine={myStep !== null}
              flipCount={flipSel.length}
              dispatch={dispatch}
              onFlip={() => me && dispatch({ type: 'flipCards', playerId: me.id, cardIds: flipSel })}
            />
          )}

          <div className={`opponents ${opponents.length === 1 ? 'solo' : ''}`}>
            {opponents.map((p) => (
              <PlayerStrip
                key={p.id}
                player={p}
                seat={getSeat(state, p.id)}
                submitted={p.pendingPick != null}
                thinking={selecting && p.pendingPick == null}
                deciding={step?.playerId === p.id}
                resolvingId={resolvingId}
              />
            ))}
          </div>

          {me ? (
            <div
              className={`hand-area ${yourPick ? 'your-pick' : ''} ${myStep ? 'deciding' : ''}`}
              style={{ '--seat': getSeat(state, me.id)?.color ?? '#888' } as CSSProperties}
            >
              <h3>
                <span className="sgp-seat-name">{mySeatName === 'You' ? 'Your table' : `${mySeatName}'s table`}</span>
                <span className="sgp-totals">
                  Round totals: {me.scoreByRound.map((s, i) => `R${i + 1}:${s}`).join(' · ') || '—'}
                  {me.uramakiPoints > 0 && <span key={me.uramakiPoints} className="sgp-bump">{` · uramaki +${me.uramakiPoints} this round`}</span>}
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
                        className={tableClass(c.id)}
                      />
                    );
                  })}
                </div>
              ) : (
                <div className="table-strip sgp-empty-board">
                  <p className="help" style={{ textAlign: 'left' }}>You haven't played any cards this round yet.</p>
                </div>
              )}

              {me.dessertPile.length > 0 && (
                <>
                  <h3 style={{ marginTop: 14 }}>
                    <span>Dessert pile · {me.dessertPile.length}</span>
                  </h3>
                  <div className="table-strip desserts">
                    {me.dessertPile.map((c) => (
                      <CardView key={c.id} card={c} size="small" />
                    ))}
                  </div>
                </>
              )}

              <h3 style={{ marginTop: 14 }}>
                <span>Your hand · {me.hand.length} card{me.hand.length === 1 ? '' : 's'}</span>
                <span className={`sgp-hint ${yourPick && maxPick === 2 ? 'chopsticks' : ''}`}>
                  {yourPick && maxPick === 2 && <ChipIcon kind="chopsticks" />}
                  {handHint}
                </span>
              </h3>
              <div className="cards">
                {hideHand && me.hand.map((c, i) => <FaceDownCard key={`h${c.id}`} style={{ '--i': i } as CSSProperties} />)}
                {hideHand && <p className="help">Your pick is locked in; your hand is hidden while the others pick.</p>}
                {!hideHand && me.hand.map((c, i) => {
                  const stagger = { '--i': i } as CSSProperties;
                  if (giveIds.size > 0) {
                    const give = giveIds.has(c.id);
                    return (
                      <CardView
                        key={c.id}
                        card={c}
                        selectable={give}
                        dim={!give}
                        onClick={give ? () => dispatch({ type: 'giveSpoon', playerId: me.id, cardId: c.id }) : undefined}
                        style={stagger}
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
                      style={stagger}
                    />
                  );
                })}
                {me.hand.length === 0 && <p className="help">Empty hand.</p>}
              </div>
              {/* Touch screens have no hover tooltips: the picked cards' rules show here instead. */}
              {selected.length > 0 && (
                <div className="pick-rules">
                  {selected.map((id) => {
                    const c = me.hand.find((h) => h.id === id);
                    if (!c) return null;
                    return (
                      <div key={id}>
                        <strong>{KIND_INFO[c.kind].label}{c.kind === 'fruit' ? ` · ${variantLabel(c)}` : ''}</strong>
                        {' — '}{KIND_INFO[c.kind].rule}
                      </div>
                    );
                  })}
                </div>
              )}
              {submitted && !hideHand && me.pendingPick && (
                <div className="pending-pick">
                  <span style={{ fontSize: 12, opacity: 0.85 }}>
                    Your pick (face-down to opponents):
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
                  <button className={`sgp-submit ${canSubmit ? 'ready' : ''}`} disabled={!canSubmit} onClick={submit}>
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
      spoon: 'decide whether to use their spoon',
      spoonGive: `choose which card to give ${nameOf(state, step.type === 'spoonGive' ? step.toId : null)}`,
      menu: 'play a card off their menu',
      takeout: 'flip cards with their takeout box',
    }[step.type];
    return <ResolveFrame step={step} waiting>Waiting for <strong>{who}</strong> to {what}…</ResolveFrame>;
  }
  switch (step.type) {
    case 'copy':
      return (
        <ResolveFrame step={step}>
          <strong>Special Order:</strong> click one of your played cards below to copy it.
        </ResolveFrame>
      );
    case 'takeout':
      return (
        <ResolveFrame step={step}>
          <strong>Takeout Box:</strong> click cards from earlier turns to flip face-down (2 pts each).
          <div className="actions">
            <button onClick={onFlip}>{flipCount === 0 ? 'Flip nothing' : `Flip ${flipCount} card${flipCount === 1 ? '' : 's'}`}</button>
          </div>
        </ResolveFrame>
      );
    case 'spoonGive':
      return (
        <ResolveFrame step={step}>
          <strong>{nameOf(state, step.toId)}</strong> used a spoon on you — click which of the highlighted cards to give.
        </ResolveFrame>
      );
    case 'spoon':
      return (
        <ResolveFrame step={step}>
          <strong>Spoon:</strong> name a card — the first player to your left holding it gives it to you
          and takes the spoon — or keep the spoon for a later turn.
          <div className="actions">
            <button className="pass" onClick={() => dispatch({ type: 'keepSpoon', playerId: step.playerId })}>
              Keep the spoon
            </button>
          </div>
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
        </ResolveFrame>
      );
    case 'menu':
      return (
        <ResolveFrame step={step}>
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
        </ResolveFrame>
      );
  }
}

/** The card kind a decision is about, drawn beside its prompt. */
const STEP_KIND: Record<SushiGoStep['type'], SushiGoCardKind> = {
  copy: 'specialOrder', spoon: 'spoon', spoonGive: 'spoon', menu: 'menu', takeout: 'takeoutBox',
};

function ResolveFrame({ step, waiting, children }: { step: SushiGoStep; waiting?: boolean; children: ReactNode }) {
  const kind = STEP_KIND[step.type];
  return (
    <div className={`sgp-resolve ${waiting ? 'waiting' : 'mine'}`} style={{ '--kind': cardColor(kind) } as CSSProperties}>
      <span className="sgp-resolve-art" aria-hidden>
        <svg viewBox="0 0 100 100"><CardArt card={{ id: -1, kind }} /></svg>
      </span>
      <div className="sgp-resolve-body">{children}</div>
    </div>
  );
}

function PlayerStrip({
  player, seat, submitted, thinking, deciding, resolvingId,
}: {
  player: SushiGoPlayer; seat: Seat | undefined; submitted: boolean;
  /** Still choosing this turn's pick (presentational). */
  thinking: boolean;
  /** Owes the special-card decision being waited on (presentational). */
  deciding: boolean;
  resolvingId: number | undefined;
}) {
  const roundSum = player.scoreByRound.reduce((s, x) => s + x, 0);
  const n = player.hand.length;
  const cls = ['player-strip', submitted ? 'active' : '', thinking ? 'thinking' : '', deciding ? 'deciding' : ''].filter(Boolean).join(' ');
  return (
    <div className={cls} style={{ '--seat': seat?.color ?? '#888' } as CSSProperties}>
      <header>
        <span className="sgp-plate">
          <span className="sgp-seat-dot" />
          <span className="sgp-seat-name">{seat?.name ?? player.id}</span>
          {seat?.isAI ? <span className="sgp-ai-tag">(AI)</span> : null}
          {submitted && <span className="sgp-picked">✓ picked</span>}
          {thinking && <span className="sgp-dots" aria-hidden><i /><i /><i /></span>}
        </span>
        <span className="scores">
          <span>{roundSum} pts</span>
          {player.uramakiPoints > 0 && <><span>•</span><span key={player.uramakiPoints} className="sgp-bump">uramaki +{player.uramakiPoints}</span></>}
          <span>•</span>
          <span>{player.hand.length} in hand</span>
        </span>
      </header>
      <div className="sgp-seat-body">
        {(n > 0 || player.pendingPick) && (
          <div className="sgp-hand-fan">
            <span className="backs" style={{ '--n': n } as CSSProperties}>
              {[...Array(n)].map((_, i) => (
                <FaceDownCard key={`fd-${i}`} size="small" style={{ '--i': i } as CSSProperties} />
              ))}
            </span>
            {/* Their pick lands here face down; an empty slot while they choose. */}
            <span className="sgp-pick-stack">
              {player.pendingPick?.map((c, i) => (
                <FaceDownCard key={c.id} size="small" style={{ '--i': i } as CSSProperties} />
              ))}
            </span>
          </div>
        )}
        <div className="table-strip">
          {player.table.map((c) => (
            <CardView key={c.id} card={c} size="small" className={c.id === resolvingId ? 'resolving' : undefined} />
          ))}
        </div>
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
  const best = Math.max(...summary.perPlayer.map((r) => r.total));
  return (
    <div className="round-summary">
      <h2><ChipIcon kind="round" />Round {summary.round} complete</h2>
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
          {summary.perPlayer.map((row, idx) => {
            const p = state.players.find((x) => x.id === row.playerId)!;
            const cumulative = p.scoreByRound.reduce((s, x) => s + x, 0);
            const top = row.total > 0 && row.total === best;
            return (
              <tr key={row.playerId} className={top ? 'top' : undefined} style={{ '--i': idx } as CSSProperties}>
                <td><span className="sgp-row-dot" style={{ background: getSeat(state, row.playerId)?.color ?? '#888' }} />{nameOf(state, row.playerId)}</td>
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
                <td className="num"><strong className="sgp-score-pop">{row.total}</strong></td>
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
      <div className="gameover-banner">
        <Confetti />
        <span className="sgp-win-text">{nameOf(state, winner) === 'You' ? 'You win!' : `${nameOf(state, winner)} wins!`}</span>
      </div>
      <div className="round-summary final">
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
            {sorted.map((p, idx) => (
              <tr key={p.id} className={p.id === winner ? 'top' : undefined} style={{ '--i': idx } as CSSProperties}>
                <td><span className="sgp-row-dot" style={{ background: getSeat(state, p.id)?.color ?? '#888' }} />{nameOf(state, p.id)}</td>
                {Array.from({ length: state.config.rounds }, (_, i) => (
                  <td key={i} className="num">{p.scoreByRound[i] ?? 0}</td>
                ))}
                <td className="num">{p.dessertScore}</td>
                <td className="num"><strong className="sgp-score-pop">{state.finalScores?.[p.id] ?? 0}</strong></td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ fontSize: 12, opacity: 0.8 }}>Ties go to the player with the most dessert cards.</p>
      </div>
      <MatchStats state={state} />
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
