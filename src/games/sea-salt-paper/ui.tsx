import { useEffect, useRef, useState } from 'react';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import type {
  SspState, SspAction, SspConfig, SspCard, SspCardFamily, SspPlayer, SspColor,
} from './types';
import { CardView, FaceDownCard, TrackedFaceDownCard } from './Card';
import { isValidDuoPair, isValidStarfishTrio, tentativeScore, totalScore } from './scoring';
import { FAMILY, FAMILY_COLORS, FAMILY_ORDER } from './cards';
import { EVENT_BY_ID, ALL_EVENT_IDS } from './events';
import { Sidebar } from './Sidebar';
import { RulesBook, RulesHero, RulesGrid, RulesTile } from '@/ui/RulesBook';
import { SspFlipProvider, useFlipAnchor } from './cardFlip';
import { OpponentMoveAnim } from './OpponentMoveAnim';
import { PlotlyChart } from './PlotlyChart';
import type { Data as PlotData } from 'plotly.js';
import './ssp.css';

function LobbyConfig({ config, seats, onChange }: { config: SspConfig; seats: Seat[]; onChange: (c: SspConfig) => void }) {
  void seats;
  const exp = config.expansions ?? {};
  const setExp = (patch: Partial<NonNullable<SspConfig['expansions']>>) =>
    onChange({ ...config, expansions: { ...exp, ...patch } });
  return (
    <div className="game-config">
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <span>Target score:</span>
        <input
          type="number"
          min={20}
          max={100}
          value={config.targetScore}
          onChange={(e) => onChange({ ...config, targetScore: Number(e.target.value) })}
          style={{ width: 80 }}
        />
      </label>

      <h4 style={{ margin: '14px 0 6px', fontSize: 13, textTransform: 'uppercase', letterSpacing: 0.5, color: 'var(--fg-muted)' }}>
        Expansions
      </h4>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
        <input
          type="checkbox"
          checked={!!exp.extraSalt}
          onChange={(e) => setExp({ extraSalt: e.target.checked })}
        />
        <strong>Extra Salt</strong>
      </label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0' }}>
        <input
          type="checkbox"
          checked={!!exp.extraPepper}
          onChange={(e) => setExp({ extraPepper: e.target.checked })}
        />
        <strong>Extra Pepper</strong>
      </label>
    </div>
  );
}

// Render the full Card × Color distribution matrix from the actual deck
// definition (FAMILY_COLORS), so anyone can verify the deck matches the
// chart printed in the rulebook.
function ColorMatrix() {
  const COLORS: { key: SspColor; label: string; swatch: string }[] = [
    { key: 'darkblue', label: 'Dark Blue', swatch: 'var(--darkblue)' },
    { key: 'teal',     label: 'Teal',      swatch: 'var(--teal)' },
    { key: 'black',    label: 'Black',     swatch: 'var(--black)' },
    { key: 'yellow',   label: 'Yellow',    swatch: 'var(--yellow)' },
    { key: 'green',    label: 'Green',     swatch: 'var(--green)' },
    { key: 'purple',   label: 'Purple',    swatch: 'var(--purple)' },
    { key: 'gray',     label: 'Grey',      swatch: 'var(--gray)' },
    { key: 'white',    label: 'White',     swatch: 'var(--white)' },
    { key: 'orange',   label: 'Orange',    swatch: 'var(--orange)' },
    { key: 'pink',     label: 'Pink',      swatch: 'var(--pink)' },
    { key: 'tan',      label: 'Tan',       swatch: 'var(--tan)' },
  ];
  const familyTotals: number[] = [];
  const matrix: number[][] = FAMILY_ORDER.map((fam) => {
    const palette = FAMILY_COLORS[fam] ?? [];
    const row = COLORS.map(({ key }) => palette.filter((c) => c === key).length);
    familyTotals.push(palette.length);
    return row;
  });
  const colTotals = COLORS.map((_, ci) => matrix.reduce((sum, row) => sum + row[ci], 0));
  const grandTotal = colTotals.reduce((a, b) => a + b, 0);

  return (
    <>
      <p>Card × Color distribution generated from the active deck definition.</p>
      <div style={{ overflowX: 'auto' }}>
        <table className="tight ssp-color-matrix">
          <thead>
            <tr>
              <th style={{ position: 'sticky', left: 0, background: 'var(--bg-hover)' }}>Card</th>
              {COLORS.map((c) => (
                <th key={c.key} className="num" title={c.label}>
                  <span className="rules-color-swatch" style={{ background: c.swatch }} />
                  <div style={{ fontSize: 9, marginTop: 2 }}>{c.label}</div>
                </th>
              ))}
              <th className="num">Total</th>
            </tr>
          </thead>
          <tbody>
            {FAMILY_ORDER.map((fam, ri) => (
              <tr key={fam}>
                <td style={{ position: 'sticky', left: 0, background: 'var(--bg-elevated)', fontWeight: 600 }}>
                  {FAMILY[fam].label}
                </td>
                {matrix[ri].map((n, ci) => (
                  <td key={ci} className="num" style={{ color: n === 0 ? 'var(--fg-muted)' : 'var(--fg)' }}>
                    {n === 0 ? '·' : n}
                  </td>
                ))}
                <td className="num"><strong>{familyTotals[ri]}</strong></td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid var(--border)' }}>
              <th style={{ position: 'sticky', left: 0, background: 'var(--bg-hover)' }}>Total</th>
              {colTotals.map((t, ci) => (
                <th key={ci} className="num">{t}</th>
              ))}
              <th className="num"><strong>{grandTotal}</strong></th>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

function Rules() {
  return (
    <RulesBook
      pages={[
        {
          title: 'Overview',
          body: (
            <>
              <RulesHero
                title="Sea Salt & Paper"
                subtitle="Press your luck across multiple rounds. First to the target score wins."
                accent="linear-gradient(135deg, #1c5f9e 0%, #4fb0a8 100%)"
              />
              <RulesGrid cols={3}>
                <RulesTile icon="2P" label="40 pts" hint="Target score, 2 players" accent="#1c5f9e" />
                <RulesTile icon="3P" label="35 pts" hint="Target score, 3 players" accent="#4fb0a8" />
                <RulesTile icon="4P" label="30 pts" hint="Target score, 4 players" accent="#9ed27c" />
              </RulesGrid>
              <h3>Each turn</h3>
              <RulesGrid cols={2}>
                <RulesTile icon="🃏" label="Draw 2 from deck" hint="Keep 1, discard the other to a pile. Empty pile must be filled first." accent="#f4d268" />
                <RulesTile icon="📥" label="Or take from a pile" hint="Take the top of either face-up discard pile." accent="#e8a04a" />
                <RulesTile icon="🐟" label="Optionally play a pair" hint="1 pt for the pair, plus the pair's ability." accent="#b984c9" />
                <RulesTile icon="🛑" label="Stop / Last Chance / Pass" hint="STOP at ≥7 pts. LAST CHANCE bets that you'll still lead after one more go-around." accent="#ff7070" />
              </RulesGrid>
            </>
          ),
        },
        {
          title: 'Duos',
          body: (
            <>
              <p>Each duo pair scores <strong>1 point</strong> AND triggers an ability.</p>
              <RulesGrid cols={2}>
                <RulesTile icon="🦀" label="Crab + Crab" hint="Take any card from either discard pile." accent="#9ed27c" />
                <RulesTile icon="⛵" label="Boat + Boat" hint="Take another turn immediately." accent="#1c5f9e" />
                <RulesTile icon="🐟" label="Fish + Fish" hint="Draw the top card of the deck for free." accent="#4fb0a8" />
                <RulesTile icon="🦈" label="Shark + Swimmer" hint="Steal a random card from an opponent's hand." accent="#2a2a36" />
              </RulesGrid>
              <h3>Card frequencies (base deck)</h3>
              <table className="tight">
                <thead><tr><th>Family</th><th className="num">Count</th></tr></thead>
                <tbody>
                  <tr><td>Crab</td><td className="num">9</td></tr>
                  <tr><td>Boat</td><td className="num">8</td></tr>
                  <tr><td>Fish</td><td className="num">7</td></tr>
                  <tr><td>Shark</td><td className="num">5</td></tr>
                  <tr><td>Swimmer</td><td className="num">5</td></tr>
                </tbody>
              </table>
            </>
          ),
        },
        {
          title: 'Collectors',
          body: (
            <>
              <p>Collectors only pay out for <strong>full sets</strong>. A single card scores 0.</p>
              <RulesGrid cols={2}>
                <RulesTile icon="🐚" label="Shell ×6" hint="0 / 2 / 4 / 6 / 8 / 10 pts" accent="#aed5e6" />
                <RulesTile icon="🐙" label="Octopus ×5" hint="0 / 3 / 6 / 9 / 12 pts" accent="#b984c9" />
                <RulesTile icon="🐧" label="Penguin ×3" hint="1 / 3 / 5 pts (×2 by Penguin Colony)" accent="#f0a4b3" />
                <RulesTile icon="⚓" label="Sailor ×2" hint="0 / 5 pts (×3 by Captain)" accent="#c9a47c" />
              </RulesGrid>
              <h3>Set payouts</h3>
              <table className="tight">
                <thead><tr><th>Family</th><th className="num">1</th><th className="num">2</th><th className="num">3</th><th className="num">4</th><th className="num">5</th><th className="num">6</th></tr></thead>
                <tbody>
                  <tr><td>Shell</td><td className="num">0</td><td className="num">2</td><td className="num">4</td><td className="num">6</td><td className="num">8</td><td className="num">10</td></tr>
                  <tr><td>Octopus</td><td className="num">0</td><td className="num">3</td><td className="num">6</td><td className="num">9</td><td className="num">12</td><td className="num">—</td></tr>
                  <tr><td>Penguin</td><td className="num">1</td><td className="num">3</td><td className="num">5</td><td className="num">—</td><td className="num">—</td><td className="num">—</td></tr>
                  <tr><td>Sailor</td><td className="num">0</td><td className="num">5</td><td className="num">—</td><td className="num">—</td><td className="num">—</td><td className="num">—</td></tr>
                </tbody>
              </table>
            </>
          ),
        },
        {
          title: 'Multipliers',
          body: (
            <>
              <p>Each appears <strong>once</strong> in the base deck. They don't count as their referenced family.</p>
              <RulesGrid cols={2}>
                <RulesTile icon="🗼" label="Lighthouse" hint="+1 pt per Boat held" accent="#f4d268" />
                <RulesTile icon="🐠" label="Shoal of Fish" hint="+1 pt per Fish held" accent="#c2c8cc" />
                <RulesTile icon="🐧" label="Penguin Colony" hint="+2 pts per Penguin (on top of the set)" accent="#9ed27c" />
                <RulesTile icon="🧢" label="Captain" hint="+3 pts per Sailor (on top of the set)" accent="#e8a04a" />
              </RulesGrid>
              <h3>Mermaids &amp; color bonus</h3>
              <p>
                Mermaids score no points themselves. For each mermaid held, claim
                your largest <em>unused</em> color group as a bonus.
              </p>
              <RulesTile icon="🧜" label="4 mermaids = instant win" hint="Mermaids are always white." accent="#f9f6ed" />
            </>
          ),
        },
        {
          title: 'Color distribution',
          body: (
            <>
              <p>The deck's 66 cards span 11 colors (white reserved for mermaids).</p>
              <table className="tight">
                <thead>
                  <tr>
                    <th>Color</th><th className="num">Count</th><th>Notes</th>
                  </tr>
                </thead>
                <tbody>
                  <tr><td><span className="rules-color-swatch" style={{ background: '#1c5f9e' }} /> Dark Blue</td><td className="num">10</td><td>Most common</td></tr>
                  <tr><td><span className="rules-color-swatch" style={{ background: '#4fb0a8' }} /> Teal</td><td className="num">10</td><td>Most common</td></tr>
                  <tr><td><span className="rules-color-swatch" style={{ background: '#2a2a36' }} /> Black</td><td className="num">9</td><td></td></tr>
                  <tr><td><span className="rules-color-swatch" style={{ background: '#f4d268' }} /> Yellow</td><td className="num">9</td><td></td></tr>
                  <tr><td><span className="rules-color-swatch" style={{ background: '#9ed27c' }} /> Green</td><td className="num">7</td><td></td></tr>
                  <tr><td><span className="rules-color-swatch" style={{ background: '#b984c9' }} /> Purple</td><td className="num">5</td><td></td></tr>
                  <tr><td><span className="rules-color-swatch" style={{ background: '#c2c8cc' }} /> Grey</td><td className="num">5</td><td></td></tr>
                  <tr><td><span className="rules-color-swatch" style={{ background: '#f9f6ed' }} /> White</td><td className="num">4</td><td>Mermaids only</td></tr>
                  <tr><td><span className="rules-color-swatch" style={{ background: '#e8a04a' }} /> Orange</td><td className="num">3</td><td></td></tr>
                  <tr><td><span className="rules-color-swatch" style={{ background: '#f0a4b3' }} /> Pink</td><td className="num">3</td><td></td></tr>
                  <tr><td><span className="rules-color-swatch" style={{ background: '#c9a47c' }} /> Tan</td><td className="num">1</td><td>Rarest (one sailor)</td></tr>
                </tbody>
              </table>
            </>
          ),
        },
        {
          title: 'Card × Color matrix',
          body: <ColorMatrix />,
        },
        {
          title: 'Expansions',
          body: (
            <>
              <h3>Extra Salt (+8 cards)</h3>
              <RulesGrid cols={2}>
                <RulesTile icon="🪼" label="Jellyfish ×2" hint="Pair with swimmer: lock next opponent's turn." accent="#b984c9" />
                <RulesTile icon="🦞" label="Lobster ×1" hint="Pair with crab: peek top 5, keep 1." accent="#2a2a36" />
                <RulesTile icon="⭐" label="Starfish ×3" hint="Form a trio with any duo for 3 pts (skips ability)." accent="#f4d268" />
                <RulesTile icon="🐴" label="Seahorse ×1" hint="Wildcard collector (joins your largest set)." accent="#c2c8cc" />
                <RulesTile icon="🦀" label="Cast of Crabs ×1" hint="+1 pt per Crab." accent="#9ed27c" />
              </RulesGrid>
              <h3>Extra Pepper (event deck)</h3>
              <p>
                One event card is revealed per round and applied to that round.
                <strong> Plus</strong> events go to the round leader after the
                round (and persist until they're no longer leading),
                <strong> minus</strong> events to the laggard (same persistence
                rule), and <strong> global</strong> events apply to everyone for
                the round only.
              </p>
              <table className="tight">
                <thead>
                  <tr><th>Event</th><th>Sign</th><th>Effect</th></tr>
                </thead>
                <tbody>
                  {ALL_EVENT_IDS.map((id) => {
                    const e = EVENT_BY_ID[id];
                    const signLabel = e.sign === '+' ? '+ leader' : e.sign === '-' ? '− laggard' : 'global';
                    const signColor = e.sign === '+' ? '#9ed27c' : e.sign === '-' ? '#ff7070' : '#6aa0ff';
                    return (
                      <tr key={id}>
                        <td>{e.name}</td>
                        <td style={{ color: signColor, fontWeight: 600 }}>{signLabel}</td>
                        <td className="muted">{e.rule}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <p className="muted" style={{ fontSize: 11, marginTop: 4 }}>
                v1 models 6 of the published expansion's 12 event cards
                (covering each sign/effect shape). Remaining 6 will be added
                when authoritative rule text is in hand.
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
  state: SspState;
  localPlayerId: PlayerId | null;
  dispatch: (a: SspAction) => void;
}) {
  // selected hand-card ids for forming a duo pair
  const [selected, setSelected] = useState<number[]>([]);
  // streamlined keep-from-draw: which of the two pending-draw cards to keep
  const [keepIndex, setKeepIndex] = useState<0 | 1 | null>(null);
  // Step-1 of the crab ability: which pile the player committed to dig into.
  const [crabPickPile, setCrabPickPile] = useState<0 | 1 | null>(null);
  // Local-only display order for the player's hand. The canonical hand in
  // `state.players[me].hand` is untouched — shark-steal randomness still
  // operates over the underlying array — but the UI renders cards in the
  // user's preferred sort. Resync on every render: keep already-known ids in
  // their current display order, append newly-drawn ids at the end, and drop
  // ids no longer in hand.
  const [handOrder, setHandOrder] = useState<number[]>([]);
  // Currently-dragged hand card id (null when no drag in flight).
  const [dragId, setDragId] = useState<number | null>(null);

  useEffect(() => {
    setSelected([]);
    setKeepIndex(null);
    setCrabPickPile(null);
  }, [state.activePlayerId, state.subPhase, state.round]);

  const isLocalActive = localPlayerId !== null && state.activePlayerId === localPlayerId;
  const me = state.players.find((p) => p.id === localPlayerId) ?? null;

  // Prune stale ids from handOrder whenever the underlying hand changes.
  // We don't seed it with the current hand here — `sortedHand` treats an
  // empty order as "keep the hand's own order", so we only need to commit
  // an order once the user actually drags something. Pruning keeps the
  // array bounded over a long match.
  useEffect(() => {
    if (handOrder.length === 0) return;
    const ids = new Set((me?.hand ?? []).map((c) => c.id));
    const filtered = handOrder.filter((id) => ids.has(id));
    if (filtered.length !== handOrder.length) setHandOrder(filtered);
  }, [me?.hand]);
  // All-AI match: no human seat at this device. Treat EVERY player as an
  // opponent strip (no special "your hand" pane), so the user can watch all
  // AIs play side-by-side instead of one being hidden in the bottom hand area.
  const isAllAI = state.seats.every((s) => s.isAI);
  const opponents = isAllAI
    ? state.players
    : state.players.filter((p) => p.id !== localPlayerId);
  const mySeatName = getSeat(state, localPlayerId ?? '')?.name ?? 'You';

  // ----- Auto-end-turn: if active human has no plays AND can't stop, just pass.
  // We let the AI driver in GameHost handle AI seats; for humans we only auto
  // when the local player is the active seat AND it's their turn AND no plays
  // are available AND they cannot call STOP/LAST CHANCE.
  useEffect(() => {
    if (!isLocalActive) return;
    if (state.subPhase !== 'awaitingPlayOrEnd') return;
    if (!me) return;
    const pairs = findHandPairs(me.hand);
    const ev = state.event?.current;
    const meHasEvent = (id: 'danceOfShells' | 'kraken' | 'tornado' | 'treasureChest' | 'diodonFish') =>
      (me.heldEvents ?? []).includes(id) || ev === id;
    const opts = {
      trioCancelledIds: new Set<number>((me.trios ?? []).flat()),
      trios: me.trios?.length ?? 0,
      shellPerCard: meHasEvent('danceOfShells'),
      octopusPerCard: meHasEvent('kraken'),
      mermaidsScoreZero: meHasEvent('tornado'),
    };
    const score = tentativeScore(me.hand, me.table, opts);
    const noPair = pairs.length === 0;
    const stopThreshold = meHasEvent('treasureChest') ? 10 : 7;
    const cannotEnd = score < stopThreshold;
    if (noPair && cannotEnd) {
      const t = setTimeout(() => dispatch({ type: 'pass' }), 400);
      return () => clearTimeout(t);
    }
  }, [isLocalActive, state.subPhase, me?.hand.length, me?.table.length, state.event?.current]);

  if (state.phase === 'gameOver') {
    return (
      <SspFlipProvider>
      <div className="ssp-layout">
        <div className="ssp"><GameOver state={state} /></div>
        <Sidebar state={state} mySeatName={mySeatName} localPlayerId={localPlayerId} />
      </div>
      </SspFlipProvider>
    );
  }

  if (state.subPhase === 'roundEnd') {
    return (
      <SspFlipProvider>
      <div className="ssp-layout">
        <div className="ssp">
          <RoundSummary state={state} dispatch={dispatch} />
        </div>
        <Sidebar state={state} mySeatName={mySeatName} localPlayerId={localPlayerId} />
      </div>
      </SspFlipProvider>
    );
  }

  const canPlaySelectedPair =
    selected.length === 2 && me &&
    (() => {
      const a = me.hand.find((c) => c.id === selected[0]);
      const b = me.hand.find((c) => c.id === selected[1]);
      return a && b && isValidDuoPair(a, b);
    })();

  const canPlaySelectedTrio =
    selected.length === 3 && me &&
    (() => {
      const cards = selected.map((id) => me.hand.find((c) => c.id === id));
      if (cards.some((c) => !c)) return false;
      return isValidStarfishTrio(cards[0]!, cards[1]!, cards[2]!);
    })();

  const ev = state.event?.current;
  const myHasEvent = (id: 'danceOfShells' | 'kraken' | 'tornado' | 'treasureChest' | 'diodonFish') =>
    !!(me && ((me.heldEvents ?? []).includes(id) || ev === id));
  const myScoringOpts = me ? {
    trioCancelledIds: new Set<number>((me.trios ?? []).flat()),
    trios: me.trios?.length ?? 0,
    shellPerCard: myHasEvent('danceOfShells'),
    octopusPerCard: myHasEvent('kraken'),
    mermaidsScoreZero: myHasEvent('tornado'),
  } : {};
  const myTentative = me ? tentativeScore(me.hand, me.table, myScoringOpts) : 0;
  const myStopThreshold = myHasEvent('treasureChest') ? 10 : 7;
  const isLocked = state.nextTurnLockedPlayerId != null && state.activePlayerId === state.nextTurnLockedPlayerId;
  // Diodon Fish: may not call STOP — only LAST CHANCE ends the round.
  const canStop = isLocalActive && state.subPhase === 'awaitingPlayOrEnd' && myTentative >= myStopThreshold && state.lastChanceFrom === null && !isLocked && !myHasEvent('diodonFish');
  const canLastChanceFromScore = isLocalActive && state.subPhase === 'awaitingPlayOrEnd' && myTentative >= myStopThreshold && state.lastChanceFrom === null && !isLocked;
  const canLastChance = canLastChanceFromScore && state.players.length > 1;
  const canPass = isLocalActive && state.subPhase === 'awaitingPlayOrEnd';

  const toggleSelect = (cardId: number) => {
    setSelected((prev) => {
      if (prev.includes(cardId)) return prev.filter((x) => x !== cardId);
      // Allow up to 3 to support starfish trios (2 duo + 1 starfish).
      if (prev.length >= 3) return [prev[1], prev[2], cardId];
      return [...prev, cardId];
    });
  };

  // Keep-from-draw helper: when the user clicks a pile we commit the draw with
  // the previously-selected keepIndex.
  const onPileClick = (pileIdx: 0 | 1) => {
    if (!isLocalActive) return;
    if (state.subPhase === 'awaitingAction') {
      // direct draw from this discard pile
      if (state.discards[pileIdx].length === 0) return;
      dispatch({ type: 'drawFromDiscard', pile: pileIdx });
      return;
    }
    if (state.subPhase === 'awaitingKeep' && keepIndex !== null) {
      dispatch({ type: 'keepFromDraw', keepIndex, discardToPile: pileIdx });
      setKeepIndex(null);
      return;
    }
    if (state.subPhase === 'awaitingCrabPick') {
      // Crab phase, step 1: click a pile in the center strip to commit to it.
      // Step 2 (picking a card from that pile) happens inside CrabPicker, which
      // shows the pile contents only once we've committed.
      if (state.discards[pileIdx].length === 0) return;
      setCrabPickPile(pileIdx);
      return;
    }
  };

  const onDeckClick = () => {
    if (!isLocalActive) return;
    if (state.subPhase === 'awaitingAction' && state.deck.length >= 2) {
      dispatch({ type: 'drawPair' });
    }
  };

  return (
    <SspFlipProvider>
    <>
    <div className="ssp-layout">
      <div className="ssp">
        <div className="board">
          <LastChanceBanner state={state} />
          <div className="target-info">
            <span>Round {state.round}</span>
            <span>{state.deck.length} cards left in deck</span>
            <span className="match-progress">
              {state.players.map((p) => {
                const seat = getSeat(state, p.id);
                return (
                  <span key={p.id} className="match-progress-pill">
                    <span className="dot" style={{ background: seat?.color ?? '#888' }} />
                    {seat?.name ?? p.id}
                    {' '}
                    <strong>{p.matchScore}</strong>
                    <span className="muted">/{state.config.targetScore}</span>
                  </span>
                );
              })}
            </span>
          </div>

          {state.event?.current && (
            <div className="ssp-event-banner" title={EVENT_BY_ID[state.event.current].rule}>
              <span className="ssp-event-tag">Event</span>
              <strong>{EVENT_BY_ID[state.event.current].name}</strong>
              <span className="ssp-event-rule">{EVENT_BY_ID[state.event.current].rule}</span>
            </div>
          )}

          <div className="opponents">
            {opponents.map((p) => (
              <PlayerStrip key={p.id} player={p} seat={getSeat(state, p.id)} isActive={state.activePlayerId === p.id} reveal={false} />
            ))}
          </div>

          <CenterStrip
            state={state}
            isLocalActive={isLocalActive}
            keepIndex={keepIndex}
            crabPickPile={crabPickPile}
            onDeckClick={onDeckClick}
            onPileClick={onPileClick}
          />

          {state.subPhase === 'awaitingKeep' && state.pendingDraw.length === 2 && isLocalActive && (
            <PendingDrawPanel
              pending={state.pendingDraw as [SspCard, SspCard]}
              keepIndex={keepIndex}
              setKeepIndex={setKeepIndex}
              forcedDiscardPile={
                state.discards[0].length === 0 && state.discards[1].length > 0 ? 0 :
                state.discards[1].length === 0 && state.discards[0].length > 0 ? 1 :
                state.discards[0].length === 0 && state.discards[1].length === 0 ? 0 :
                null
              }
              onAutoCommit={(ki, pile) => {
                dispatch({ type: 'keepFromDraw', keepIndex: ki, discardToPile: pile });
                setKeepIndex(null);
              }}
            />
          )}

          {state.subPhase === 'awaitingCrabPick' && isLocalActive && crabPickPile !== null && (
            <CrabPickerOverlay
              state={state}
              dispatch={dispatch}
              pickedPile={crabPickPile}
            />
          )}

          {isAllAI ? null : me ? (
            <div className="hand-area" data-anchor="hand-me">
              <h3>
                <span>{getSeat(state, me.id)?.name ?? 'You'} — {myTentative} pt{myTentative === 1 ? '' : 's'}</span>
                <ColorCountStrip cards={[...me.hand, ...me.table]} />
              </h3>

              <div className="cards">
                {sortedHand(me.hand, handOrder).map((c) => {
                  const allowSelect =
                    isLocalActive && state.subPhase === 'awaitingPlayOrEnd';
                  return (
                    <DraggableHandCard
                      key={c.id}
                      card={c}
                      selectable={allowSelect}
                      selected={selected.includes(c.id)}
                      onClick={allowSelect ? () => toggleSelect(c.id) : undefined}
                      isDragging={dragId === c.id}
                      onDragStart={() => setDragId(c.id)}
                      onDragEnd={() => setDragId(null)}
                      onDropOn={() => {
                        if (dragId == null || dragId === c.id) return;
                        setHandOrder((prev) => reorder(prev.length ? prev : me.hand.map((x) => x.id), dragId, c.id));
                        setDragId(null);
                      }}
                    />
                  );
                })}
              </div>

              {/* "On the table" strip is always rendered (with a reserved min
               *  height) so it doesn't push the action row down the moment
               *  the first table card lands. */}
              <h3 style={{ marginTop: 14, opacity: me.table.length === 0 ? 0.4 : 1 }}>
                <span>On the table</span>
              </h3>
              <div className="table-strip">
                {me.table.map((c) => (
                  <CardView key={c.id} card={c} size="small" zone="table-me" />
                ))}
              </div>

              <div className="actions">
                {state.subPhase === 'awaitingPlayOrEnd' && (
                  <>
                    {isLocked && (
                      <div className="locked-banner">
                        Locked by Jellyfish — you can only draw two cards and pass this turn.
                      </div>
                    )}
                    <button
                      disabled={!canPlaySelectedPair || isLocked}
                      onClick={() => {
                        if (!canPlaySelectedPair) return;
                        dispatch({ type: 'playPair', cardIds: [selected[0], selected[1]] });
                        setSelected([]);
                      }}
                    >
                      Play pair {selected.length === 2 ? `(${describeSelection(me, selected)})` : ''}
                    </button>
                    {selected.length === 3 && (
                      <button
                        disabled={!canPlaySelectedTrio || isLocked}
                        onClick={() => {
                          if (!canPlaySelectedTrio) return;
                          dispatch({ type: 'playTrio', cardIds: [selected[0], selected[1], selected[2]] });
                          setSelected([]);
                        }}
                      >
                        Play trio (starfish + duo)
                      </button>
                    )}
                    <button className="stop" disabled={!canStop} onClick={() => dispatch({ type: 'stop' })}>
                      STOP {canStop ? `(${myTentative})` : ''}
                    </button>
                    <button className="lastchance" disabled={!canLastChance} onClick={() => dispatch({ type: 'lastChance' })}>
                      LAST CHANCE
                    </button>
                    <button className="pass" disabled={!canPass} onClick={() => dispatch({ type: 'pass' })}>
                      End turn
                    </button>
                  </>
                )}
                {state.subPhase === 'awaitingSharkSteal' && isLocalActive && (
                  <StealPicker state={state} dispatch={dispatch} />
                )}
                {state.subPhase === 'awaitingCrabPick' && isLocalActive && crabPickPile === null && (
                  <p className="help" style={{ alignSelf: 'center', margin: 0 }}>
                    (Crab) Click a discard pile to dig into.
                  </p>
                )}
                {state.subPhase === 'awaitingLobsterPick' && isLocalActive && (
                  <LobsterPicker state={state} dispatch={dispatch} />
                )}
              </div>
            </div>
          ) : (
            <p className="help">Spectator view.</p>
          )}
        </div>

        {/* Always reserve a row for the "waiting" hint so the board doesn't
         *  jump as turn rotates between local + opponent seats. Hidden in
         *  all-AI mode since there's no human to wait for. */}
        {!isAllAI && (
          <p
            className="help center"
            style={{ marginTop: 12, visibility: isLocalActive ? 'hidden' : 'visible' }}
          >
            Waiting for {getSeat(state, state.activePlayerId ?? '')?.name ?? 'opponent'}…
          </p>
        )}
      </div>

      <Sidebar state={state} mySeatName={mySeatName} localPlayerId={localPlayerId} />
    </div>
    <OpponentMoveAnim state={state} localPlayerId={localPlayerId} />
    </>
    </SspFlipProvider>
  );
}

function CenterStrip({
  state, isLocalActive, keepIndex, crabPickPile, onDeckClick, onPileClick,
}: {
  state: SspState;
  isLocalActive: boolean;
  keepIndex: 0 | 1 | null;
  /** Step-1 of the crab ability: which pile the local player has committed to.
   *  null means "not yet picked" — both piles are face-down and clickable. */
  crabPickPile: 0 | 1 | null;
  onDeckClick: () => void;
  onPileClick: (pile: 0 | 1) => void;
}) {
  const canDraw = isLocalActive && state.subPhase === 'awaitingAction';
  const canCommitKeep = isLocalActive && state.subPhase === 'awaitingKeep' && keepIndex !== null;
  const isCrabPickPhase = isLocalActive && state.subPhase === 'awaitingCrabPick';
  const deckAnchorRef = useFlipAnchor('deck');

  // Render the action-hint slots with a stable height (and an &nbsp;
  // placeholder when there's no hint) so the deck/pile widgets don't reflow
  // every time the subPhase changes. Without this, the board jumps each tick.
  const deckHint = canDraw && state.deck.length >= 2 ? 'Click to draw 2' : ' ';

  return (
    <div className="center">
      <div
        ref={deckAnchorRef}
        data-anchor="deck"
        className={`deck-stack ${canDraw && state.deck.length >= 2 ? 'clickable' : ''}`}
        onClick={canDraw && state.deck.length >= 2 ? onDeckClick : undefined}
        title={canDraw ? 'Click to draw two from the deck' : ''}
      >
        <FaceDownCard />
        <div className="label">Deck · {state.deck.length}</div>
        <div className="label hint">{deckHint}</div>
      </div>
      {[0, 1].map((i) => {
        const pile = state.discards[i];
        const top = pile[pile.length - 1];
        const canTakeFromPile = canDraw && !!top;
        const canDropHere = canCommitKeep;
        // Crab phase: clicking a non-empty pile commits to digging into it.
        // The top card of each pile stays visible (matches the live game —
        // pile tops are always face-up). Cards BENEATH the top remain hidden
        // until the player commits to a pile; that's enforced inside
        // CrabPicker, which only reveals the full pile once it's been chosen.
        const isThisCrabTarget = isCrabPickPhase && pile.length > 0 && crabPickPile === null;
        const clickable = canTakeFromPile || canDropHere || isThisCrabTarget;
        const titleText = canTakeFromPile
          ? `Click to take ${FAMILY[top.family].label} from pile ${i + 1}`
          : canDropHere
            ? `Discard the other card to pile ${i + 1}`
            : isThisCrabTarget
              ? `(Crab) click to dig into pile ${i + 1}`
              : '';
        const hint = canTakeFromPile
          ? 'Click to take'
          : canDropHere
            ? 'Drop here'
            : isThisCrabTarget
              ? 'Dig here'
              : ' ';
        return (
          <PileSlot
            key={i}
            i={i as 0 | 1}
            pile={pile}
            top={top}
            clickable={clickable}
            highlight={!!(canDropHere || isThisCrabTarget)}
            onPileClick={onPileClick}
            titleText={titleText}
            hint={hint}
          />
        );
      })}
    </div>
  );
}

function PileSlot({
  i, pile, top, clickable, highlight, onPileClick, titleText, hint,
}: {
  i: 0 | 1;
  pile: SspCard[];
  top: SspCard | undefined;
  clickable: boolean;
  highlight: boolean;
  onPileClick: (pile: 0 | 1) => void;
  titleText: string;
  hint: string;
}) {
  // Register the pile slot as a FLIP anchor so the card that becomes the
  // new top after another card is taken off has a sensible "no movement"
  // source (its own zone) instead of flying in from the deck.
  const anchorRef = useFlipAnchor(`pile-${i}`);
  return (
    <div
      ref={anchorRef}
      data-anchor={`pile-${i}`}
      className={`pile ${pile.length === 0 ? 'empty' : ''} ${clickable ? 'clickable' : ''} ${highlight ? 'target-discard' : ''}`}
      onClick={clickable ? () => onPileClick(i) : undefined}
      title={titleText}
    >
      {top ? <CardView card={top} zone={`pile-${i}`} /> : <div className="empty-slot">empty</div>}
      <div className="label">Pile {i + 1} · {pile.length} card{pile.length === 1 ? '' : 's'}</div>
      <div className="label hint">{hint}</div>
    </div>
  );
}

/** Shows a per-color tally of the local player's cards (hand + table).
 *  Useful for planning mermaid bonuses and color diversity at a glance. */
/** Big celebratory overlay that fires when somebody calls LAST CHANCE. Listens
 *  for transitions of `state.lastChanceFrom` from null to a player id, then
 *  fades a full-board banner in for ~2.5s with the caller's name. */
function LastChanceBanner({ state }: { state: SspState }) {
  const callerId = state.lastChanceFrom;
  const [show, setShow] = useState<PlayerId | null>(null);
  const lastSeen = useRef<PlayerId | null>(null);
  useEffect(() => {
    if (callerId && lastSeen.current !== callerId) {
      lastSeen.current = callerId;
      setShow(callerId);
      const t = setTimeout(() => setShow(null), 2500);
      return () => clearTimeout(t);
    }
    if (!callerId) lastSeen.current = null;
  }, [callerId]);

  if (!show) return null;
  const seat = state.seats.find((s) => s.id === show);
  return (
    <div className="ssp-lastchance-banner" role="alert">
      <div className="ssp-lastchance-card">
        <div className="ssp-lastchance-eyebrow">⚡ LAST CHANCE ⚡</div>
        <div className="ssp-lastchance-name" style={{ color: seat?.color ?? '#fff' }}>
          {seat?.name ?? show}
        </div>
        <div className="ssp-lastchance-sub">called the round — one more turn for everyone!</div>
      </div>
    </div>
  );
}

function ColorCountStrip({ cards }: { cards: SspCard[] }) {
  const order: { color: SspColor; label: string; swatch: string }[] = [
    { color: 'darkblue', label: 'DBlue', swatch: 'var(--darkblue)' },
    { color: 'teal',     label: 'Teal',  swatch: 'var(--teal)' },
    { color: 'black',    label: 'Black', swatch: 'var(--black)' },
    { color: 'yellow',   label: 'Yel',   swatch: 'var(--yellow)' },
    { color: 'green',    label: 'Grn',   swatch: 'var(--green)' },
    { color: 'purple',   label: 'Pur',   swatch: 'var(--purple)' },
    { color: 'gray',     label: 'Grey',  swatch: 'var(--gray)' },
    { color: 'white',    label: 'Wht',   swatch: 'var(--white)' },
    { color: 'orange',   label: 'Org',   swatch: 'var(--orange)' },
    { color: 'pink',     label: 'Pink',  swatch: 'var(--pink)' },
    { color: 'tan',      label: 'Tan',   swatch: 'var(--tan)' },
  ];
  const counts: Record<string, number> = {};
  for (const c of cards) counts[c.color] = (counts[c.color] ?? 0) + 1;
  return (
    <span className="ssp-color-strip" title="Color counts in your hand + table">
      {order.map((o) => {
        const n = counts[o.color] ?? 0;
        if (n === 0) return null;
        return (
          <span key={o.color} className="ssp-color-pill" title={`${o.label}: ${n}`}>
            <span className="ssp-color-swatch" style={{ background: o.swatch }} />
            {n}
          </span>
        );
      })}
    </span>
  );
}

function PendingDrawPanel({
  pending, keepIndex, setKeepIndex, forcedDiscardPile, onAutoCommit,
}: {
  pending: [SspCard, SspCard];
  keepIndex: 0 | 1 | null;
  setKeepIndex: (i: 0 | 1) => void;
  /** When an empty discard pile exists, the discard MUST go there per the
   *  rulebook — no player choice. The non-null pile index here is the forced
   *  destination, so picking a card auto-commits the keep-from-draw. */
  forcedDiscardPile: 0 | 1 | null;
  onAutoCommit: (keepIndex: 0 | 1, pile: 0 | 1) => void;
}) {
  // When the discard pile is forced (an empty pile exists), commit immediately
  // after the player picks which card to keep — they shouldn't be asked to
  // click a pile they had no choice about.
  useEffect(() => {
    if (keepIndex !== null && forcedDiscardPile !== null) {
      onAutoCommit(keepIndex, forcedDiscardPile);
    }
  }, [keepIndex, forcedDiscardPile]);

  const hint = forcedDiscardPile !== null
    ? `Pick which card to keep — the other will go to the empty discard pile.`
    : (keepIndex === null
        ? 'Step 1: click the card you want to keep.'
        : 'Step 2: click a discard pile (left) to drop the other card there.');

  return (
    <div className="pending-draw">
      <div style={{ width: '100%' }}>
        <div className="keep-hint">{hint}</div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          {pending.map((c, i) => (
            <CardView
              key={c.id}
              card={c}
              zone="pending-draw"
              selectable
              selected={keepIndex === i}
              onClick={() => setKeepIndex(i as 0 | 1)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function StealPicker({ state, dispatch }: { state: SspState; dispatch: (a: SspAction) => void }) {
  // Exclude the LAST CHANCE caller — their hand is protected by the bet.
  const targets = state.players.filter((p) =>
    p.id !== state.activePlayerId
    && p.hand.length > 0
    && state.lastChanceFrom !== p.id
  );
  // Auto-fire the steal when there's only one valid target — no point making
  // the player click through a one-option modal.
  useEffect(() => {
    if (targets.length === 1) {
      const t = setTimeout(() => dispatch({ type: 'sharkSteal', targetPlayerId: targets[0].id }), 250);
      return () => clearTimeout(t);
    }
  }, [targets.length, targets[0]?.id]);

  if (targets.length === 0) return <p className="help">No valid steal target — pass to skip.</p>;
  if (targets.length === 1) {
    return (
      <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, alignSelf: 'center' }}>
        Stealing from {getSeat(state, targets[0].id)?.name ?? targets[0].id}…
      </span>
    );
  }
  return (
    <>
      <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, alignSelf: 'center' }}>
        Steal from:
      </span>
      {targets.map((p) => (
        <button key={p.id} onClick={() => dispatch({ type: 'sharkSteal', targetPlayerId: p.id })}>
          {getSeat(state, p.id)?.name ?? p.id} ({p.hand.length})
        </button>
      ))}
    </>
  );
}

function CrabPickerOverlay({ state, dispatch, pickedPile }: {
  state: SspState;
  dispatch: (a: SspAction) => void;
  pickedPile: 0 | 1;
}) {
  const pile = state.discards[pickedPile];
  return (
    <div className="crab-overlay">
      <div className="keep-hint" style={{ marginBottom: 8 }}>
        Pile {pickedPile + 1} — pick any card to take:
      </div>
      <div className="cards" style={{ justifyContent: 'center' }}>
        {pile.length === 0 && <p className="help">empty</p>}
        {pile.map((c) => (
          <CardView
            key={c.id}
            card={c}
            zone={`pile-${pickedPile}`}
            size="small"
            selectable
            onClick={() => dispatch({ type: 'crabPick', pile: pickedPile, cardId: c.id })}
          />
        ))}
      </div>
    </div>
  );
}

function LobsterPicker({ state, dispatch }: { state: SspState; dispatch: (a: SspAction) => void }) {
  const pool = state.pendingLobsterPick ?? [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%' }}>
      <p className="help" style={{ marginBottom: 4 }}>
        Lobster reveal — keep one card from the top of the deck. The rest will be shuffled back in.
      </p>
      <div className="cards" style={{ marginTop: 4 }}>
        {pool.map((c) => (
          <CardView
            key={c.id}
            card={c}
            zone="lobster-reveal"
            size="small"
            selectable
            onClick={() => dispatch({ type: 'lobsterPick', cardId: c.id })}
          />
        ))}
      </div>
    </div>
  );
}

function PlayerStrip({ player, seat, isActive, reveal }: {
  player: SspPlayer; seat: Seat | undefined; isActive: boolean; reveal: boolean;
}) {
  const total = totalScore([...player.hand, ...player.table], {
    trioCancelledIds: new Set<number>((player.trios ?? []).flat()),
    trios: player.trios?.length ?? 0,
  });
  return (
    <div className={`player-strip ${isActive ? 'active' : ''}`} data-anchor={`hand-${player.id}`}>
      <header>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 10, height: 10, background: seat?.color ?? '#888', borderRadius: 2 }} />
          {seat?.name ?? player.id}
          {seat?.isAI ? <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>(AI)</span> : null}
        </span>
      </header>
      <div className="table-strip" data-anchor={`strip-${player.id}`}>
        {/* Opponent hand cards: face-down placeholders KEYED BY CARD ID so
         *  the FLIP harness animates cross-zone movement (deck/pile → here,
         *  here → table on play, here → here on shark steal) automatically.
         *  We never reveal the family/color; only the card id is used for
         *  identity tracking, which is fine since hidden info is already a
         *  UI concern per the project's full-state-replication model. */}
        {reveal ? null : player.hand.map((c) => (
          <TrackedFaceDownCard key={c.id} card={c} zone={`hand-${player.id}`} size="small" />
        ))}
        {player.table.map((c) => (
          <CardView key={c.id} card={c} size="small" zone={`table-${player.id}`} />
        ))}
      </div>
      {reveal && (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)' }}>
          {total.total} pts • {total.cardPoints} cards + {total.colorBonus} bonus
        </div>
      )}
    </div>
  );
}

function RoundSummary({ state, dispatch }: { state: SspState; dispatch: (a: SspAction) => void }) {
  const s = state.lastRoundSummary;
  if (!s) return null;
  const tied = state.tieBreakerPlayers ?? [];
  const isTieBreak = tied.length >= 2;
  return (
    <div className="round-summary">
      <div className="round-summary-header">
        <h2>Round {s.round} complete</h2>
        <button onClick={() => dispatch({ type: 'nextRound' })}>
          {isTieBreak ? 'Tie-breaker round →' : 'Next round →'}
        </button>
      </div>
      <p style={{ margin: '6px 0', fontStyle: 'italic' }}>
        {s.endedBy === 'stop' && `${nameOf(state, s.endedByPlayerId)} called STOP.`}
        {s.endedBy === 'lastChance' && `${nameOf(state, s.endedByPlayerId)} called LAST CHANCE — ${s.lastChanceWon ? 'bet won!' : 'bet lost.'}`}
        {s.endedBy === 'deckEmpty' && `The deck ran out — round ends with no penalty.`}
        {s.endedBy === 'mermaid' && `${nameOf(state, s.endedByPlayerId)} collected 4 mermaids!`}
      </p>
      {isTieBreak && (
        <p style={{ margin: '6px 0', fontWeight: 600, color: 'var(--danger, #c0392b)' }}>
          Tied at the target: {tied.map((id) => nameOf(state, id)).join(' & ')}. Play another round to break it.
        </p>
      )}
      <table>
        <thead>
          <tr><th>Player</th><th className="num">Cards</th><th className="num">Bonus</th><th className="num">Round</th><th className="num">Match</th></tr>
        </thead>
        <tbody>
          {s.perPlayer.map((row) => {
            const p = state.players.find((x) => x.id === row.playerId)!;
            return (
              <tr key={row.playerId} className={row.forfeitCards ? 'forfeit' : ''}>
                <td>{nameOf(state, row.playerId)}</td>
                <td className={`num ${row.forfeitCards ? 'forfeit-cell' : ''}`}>{row.cardPoints}</td>
                <td className={`num ${row.forfeitBonus ? 'forfeit-cell' : ''}`}>{row.colorBonus}</td>
                <td className="num"><strong>{row.total}</strong></td>
                <td className="num">{p.matchScore}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* All cards revealed face-up so each player can see how they scored. */}
      <div className="round-summary-reveal">
        {state.players.map((p) => {
          const seat = getSeat(state, p.id);
          const all = [...p.hand, ...p.table];
          return (
            <div key={p.id} className="round-summary-player">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '8px 0 4px' }}>
                <span style={{ width: 10, height: 10, background: seat?.color ?? '#888', borderRadius: 2 }} />
                {seat?.name ?? p.id}
              </h3>
              <div className="table-strip">
                {all.map((c) => (
                  <CardView key={c.id} card={c} size="small" zone={`reveal-${p.id}`} />
                ))}
                {all.length === 0 && <span style={{ color: 'var(--fg-muted)', fontSize: 12 }}>no cards</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function GameOver({ state }: { state: SspState }) {
  const sorted = [...state.players].sort((a, b) => b.matchScore - a.matchScore);
  // Pull the canonical winner from the matchEnd log entry — this respects the
  // mermaid-count tiebreaker applied in the reducer. Falls back to the highest
  // matchScore for any legacy state without a matchEnd log.
  const matchEnd = (state.log ?? []).filter((e) => e.kind === 'matchEnd').slice(-1)[0];
  const winnerId = (matchEnd && matchEnd.kind === 'matchEnd') ? matchEnd.winnerId : sorted[0]?.id ?? null;
  const winnerSeat = winnerId ? state.seats.find((s) => s.id === winnerId) : null;
  const winnerScore = winnerId ? state.players.find((p) => p.id === winnerId)?.matchScore : null;
  const tieWasBroken = !state.mermaidWinnerId
    && sorted.length >= 2
    && sorted[0].matchScore === sorted[1].matchScore
    && winnerId != null;
  const reason = state.mermaidWinnerId
    ? `collected 4 mermaids — instant win!`
    : tieWasBroken
      ? `wins ${winnerScore}–${sorted[1].matchScore} on the mermaid tiebreaker`
      : `reached ${state.config.targetScore} points`;
  return (
    <div className="ssp">
      <div className="ssp-winner-banner" style={{
        background: winnerSeat
          ? `linear-gradient(135deg, ${winnerSeat.color}cc 0%, ${winnerSeat.color}66 100%)`
          : undefined,
      }}>
        <div className="ssp-winner-trophy" aria-hidden="true">🏆</div>
        <div className="ssp-winner-eyebrow">Match winner</div>
        <div className="ssp-winner-name" style={{ color: winnerSeat?.color ?? undefined }}>
          {nameOf(state, winnerId)}
        </div>
        <div className="ssp-winner-sub">{reason}</div>
      </div>
      <div className="round-summary">
        <h2>Final scores</h2>
        <table>
          <thead><tr><th>Player</th><th className="num">Score</th></tr></thead>
          <tbody>
            {sorted.map((p, idx) => {
              const isWinner = p.id === winnerId;
              const seat = state.seats.find((s) => s.id === p.id);
              return (
                <tr key={p.id} className={isWinner ? 'ssp-winner-row' : ''}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        width: 10, height: 10, background: seat?.color ?? '#888', borderRadius: 2,
                      }} />
                      {nameOf(state, p.id)}
                      {isWinner && <span className="ssp-winner-pip">🏆 winner</span>}
                      {!isWinner && idx === 1 && <span style={{ fontSize: 11, opacity: 0.6 }}>runner-up</span>}
                    </span>
                  </td>
                  <td className="num"><strong>{p.matchScore}</strong></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <MatchStats state={state} />
    </div>
  );
}

function MatchStats({ state }: { state: SspState }) {
  const rounds = state.roundHistory ?? [];
  if (rounds.length === 0) return null;

  const playerIds = state.players.map((p) => p.id);
  const colorOf = (pid: PlayerId) => state.seats.find((s) => s.id === pid)?.color ?? '#888';
  const nameById = (pid: PlayerId) => state.seats.find((s) => s.id === pid)?.name ?? pid;
  const extraSalt = !!state.config.expansions?.extraSalt;

  // Cumulative score across rounds — used for the cumulative-score line chart.
  const cumulativeScore: Record<PlayerId, number[]> = {};
  for (const pid of playerIds) cumulativeScore[pid] = [0];
  for (const r of rounds) {
    for (const pid of playerIds) {
      const row = r.perPlayer.find((x) => x.playerId === pid);
      const prev = cumulativeScore[pid][cumulativeScore[pid].length - 1];
      cumulativeScore[pid].push(prev + (row?.total ?? 0));
    }
  }

  // Cumulative card counts across rounds — sum of per-round card counts (rounds
  // RESET the tableau, so this is "total cards seen over the match", not a
  // running tableau size). Falls back to current hand+table sizes for legacy
  // matches that pre-date the breakdown field.
  const cumulativeCards: Record<PlayerId, number[]> = {};
  for (const pid of playerIds) cumulativeCards[pid] = [0];
  for (const r of rounds) {
    for (const pid of playerIds) {
      const row = r.perPlayer.find((x) => x.playerId === pid);
      const prev = cumulativeCards[pid][cumulativeCards[pid].length - 1];
      cumulativeCards[pid].push(prev + (row?.cardCount ?? 0));
    }
  }

  // Avg points / card per round, for the avg-pt-per-card line chart.
  const avgPtPerCard: Record<PlayerId, number[]> = {};
  for (const pid of playerIds) {
    avgPtPerCard[pid] = rounds.map((r) => {
      const row = r.perPlayer.find((x) => x.playerId === pid);
      if (!row || !row.cardCount) return 0;
      return row.total / row.cardCount;
    });
  }

  // Final-tableau family frequencies (%) — per player vs the deck's natural
  // distribution. We normalize so the bars are comparable across player hand
  // sizes (one player ending with 20 cards vs another with 12).
  const deckTotal = (function () {
    let n = 0;
    for (const fam of FAMILY_ORDER) {
      if (FAMILY[fam].expansion === 'extraSalt' && !extraSalt) continue;
      n += FAMILY[fam].count;
    }
    return n;
  })();
  const deckFamilyPct: Record<SspCardFamily, number> = {} as Record<SspCardFamily, number>;
  for (const fam of FAMILY_ORDER) {
    if (FAMILY[fam].expansion === 'extraSalt' && !extraSalt) {
      deckFamilyPct[fam] = 0;
    } else {
      deckFamilyPct[fam] = (FAMILY[fam].count / deckTotal) * 100;
    }
  }
  const playerFamilyPct: Record<PlayerId, Record<SspCardFamily, number>> = {} as Record<PlayerId, Record<SspCardFamily, number>>;
  for (const p of state.players) {
    const all = [...p.hand, ...p.table];
    const counts: Record<SspCardFamily, number> = {} as Record<SspCardFamily, number>;
    for (const fam of FAMILY_ORDER) counts[fam] = 0;
    for (const c of all) counts[c.family] += 1;
    const n = Math.max(1, all.length);
    const pct: Record<SspCardFamily, number> = {} as Record<SspCardFamily, number>;
    for (const fam of FAMILY_ORDER) pct[fam] = (counts[fam] / n) * 100;
    playerFamilyPct[p.id] = pct;
  }

  // Color distribution at match end vs deck (as percentages).
  const deckColorCount: Record<SspColor, number> = {
    white: 0, yellow: 0, green: 0, pink: 0, purple: 0,
    teal: 0, darkblue: 0, black: 0, gray: 0, orange: 0, tan: 0,
  };
  for (const fam of FAMILY_ORDER) {
    if (FAMILY[fam].expansion === 'extraSalt' && !extraSalt) continue;
    const palette = FAMILY_COLORS[fam];
    const count = FAMILY[fam].count;
    for (let i = 0; i < count; i++) {
      const color = palette[i % palette.length] ?? 'darkblue';
      deckColorCount[color] += 1;
    }
  }
  const deckColorPct: Record<SspColor, number> = {} as Record<SspColor, number>;
  for (const c of Object.keys(deckColorCount) as SspColor[]) {
    deckColorPct[c] = deckTotal > 0 ? (deckColorCount[c] / deckTotal) * 100 : 0;
  }
  const playerColorPct: Record<PlayerId, Record<SspColor, number>> = {} as Record<PlayerId, Record<SspColor, number>>;
  for (const p of state.players) {
    const all = [...p.hand, ...p.table];
    const tally: Record<SspColor, number> = {
      white: 0, yellow: 0, green: 0, pink: 0, purple: 0,
      teal: 0, darkblue: 0, black: 0, gray: 0, orange: 0, tan: 0,
    };
    for (const c of all) tally[c.color] += 1;
    const n = Math.max(1, all.length);
    const pct: Record<SspColor, number> = {} as Record<SspColor, number>;
    for (const c of Object.keys(tally) as SspColor[]) pct[c] = (tally[c] / n) * 100;
    playerColorPct[p.id] = pct;
  }

  // Per-player per-round category lines (duos / sets / multipliers / trios /
  // mermaidClaim / colorBonus). Each player has a series per category over
  // rounds. Falls back to coarse splits for legacy matches with no breakdown.
  const playerCategoryByRound: Record<PlayerId, Array<{
    duos: number; sets: number; multipliers: number; trios: number; mermaidClaim: number; colorBonus: number;
  }>> = {} as Record<PlayerId, Array<{ duos: number; sets: number; multipliers: number; trios: number; mermaidClaim: number; colorBonus: number }>>;
  for (const pid of playerIds) {
    playerCategoryByRound[pid] = rounds.map((r) => {
      const row = r.perPlayer.find((x) => x.playerId === pid);
      if (row?.breakdown) {
        const b = row.breakdown;
        // forfeit handling: if cards were forfeit (lost LAST CHANCE bet), zero
        // out the card categories; if bonus was forfeit (STOP / deck-empty /
        // mermaid-win), zero the colorBonus.
        const f = row.forfeitCards;
        return {
          duos: f ? 0 : b.duos,
          sets: f ? 0 : b.sets,
          multipliers: f ? 0 : b.multipliers,
          trios: f ? 0 : b.trios,
          mermaidClaim: f ? 0 : b.mermaidClaim,
          colorBonus: row.forfeitBonus ? 0 : b.colorBonus,
        };
      }
      // Legacy fallback — just split the row's two columns coarsely.
      return {
        duos: 0, sets: 0, multipliers: 0, trios: 0,
        mermaidClaim: row?.forfeitCards ? 0 : row?.cardPoints ?? 0,
        colorBonus: row?.forfeitBonus ? 0 : row?.colorBonus ?? 0,
      };
    });
  }

  // Round-endings summary — both a pie chart and the existing table.
  const endingTypes = rounds.map((r) => ({
    round: r.round,
    kind: r.endedBy,
    by: r.endedByPlayerId,
    won: r.lastChanceWon,
  }));

  // Aggregate ending categories for the pie chart. We split lastChance into
  // success vs fail, AND split by the calling player so the user can see who
  // pulled the trigger.
  const endingSlices: Array<{ label: string; color: string; n: number }> = [];
  const sliceMap = new Map<string, { label: string; color: string; n: number }>();
  const incSlice = (key: string, label: string, color: string) => {
    const existing = sliceMap.get(key);
    if (existing) existing.n += 1;
    else { const s = { label, color, n: 1 }; sliceMap.set(key, s); endingSlices.push(s); }
  };
  for (const e of endingTypes) {
    if (e.kind === 'stop') {
      const name = e.by ? nameById(e.by) : '—';
      const c = e.by ? colorOf(e.by) : '#888';
      incSlice(`stop:${e.by ?? 'none'}`, `STOP — ${name}`, c);
    } else if (e.kind === 'lastChance') {
      const name = e.by ? nameById(e.by) : '—';
      const c = e.by ? colorOf(e.by) : '#888';
      const result = e.won ? 'WON' : 'LOST';
      incSlice(`lc:${e.by ?? 'none'}:${result}`, `LAST CHANCE ${result} — ${name}`, c);
    } else if (e.kind === 'deckEmpty') {
      incSlice('deck', 'Deck empty', '#888');
    } else {
      incSlice('mermaid', '4 Mermaids', '#f4d268');
    }
  }

  // X axis labels for cumulative charts (include "Start" before round 1).
  const cumulativeRoundLabels = ['Start', ...rounds.map((r) => `R${r.round}`)];
  const roundLabels = rounds.map((r) => `R${r.round}`);

  // Pre-build Plotly trace data so each chart's JSX is just a render call.
  const cumulativeScoreTraces: PlotData[] = playerIds.map((pid) => ({
    type: 'scatter', mode: 'lines+markers',
    name: nameById(pid),
    x: cumulativeRoundLabels,
    y: cumulativeScore[pid],
    line: { color: colorOf(pid), width: 2.5 },
    marker: { color: colorOf(pid), size: 7 },
    hovertemplate: '%{y} pts<extra>%{fullData.name}</extra>',
  }));
  const cumulativeCardsTraces: PlotData[] = playerIds.map((pid) => ({
    type: 'scatter', mode: 'lines+markers',
    name: nameById(pid),
    x: cumulativeRoundLabels,
    y: cumulativeCards[pid],
    line: { color: colorOf(pid), width: 2.5 },
    marker: { color: colorOf(pid), size: 7 },
    hovertemplate: '%{y} cards<extra>%{fullData.name}</extra>',
  }));
  // Avg pts/card as a grouped bar chart — one bar per (round × player).
  const avgPtPerCardTraces: PlotData[] = playerIds.map((pid) => ({
    type: 'bar',
    name: nameById(pid),
    x: roundLabels,
    y: avgPtPerCard[pid].map((v) => Number(v.toFixed(3))),
    marker: { color: colorOf(pid) },
    hovertemplate: '%{y:.2f} pts/card<extra>%{fullData.name}</extra>',
  }));

  // Cards collected PER ROUND (not cumulative) — grouped bars.
  const cardsPerRoundTraces: PlotData[] = playerIds.map((pid) => ({
    type: 'bar',
    name: nameById(pid),
    x: roundLabels,
    y: rounds.map((r) => r.perPlayer.find((x) => x.playerId === pid)?.cardCount ?? 0),
    marker: { color: colorOf(pid) },
    hovertemplate: '%{y} cards<extra>%{fullData.name}</extra>',
  }));

  // Family / color frequency — grouped horizontal bars. To get separation
  // between cards/colors we explicitly set bargroupgap.
  const familyKeys = FAMILY_ORDER.filter((f) => extraSalt || FAMILY[f].expansion !== 'extraSalt');
  const familyLabels = familyKeys.map((k) => FAMILY[k].label);
  const familyTraces: PlotData[] = [
    {
      type: 'bar', orientation: 'h',
      name: 'Deck',
      x: familyKeys.map((k) => deckFamilyPct[k]),
      y: familyLabels,
      marker: { color: '#888', pattern: { shape: '/', size: 4, solidity: 0.4 } as never },
      hovertemplate: '%{x:.1f}%<extra>Deck</extra>',
    },
    ...playerIds.map((pid): PlotData => ({
      type: 'bar', orientation: 'h',
      name: nameById(pid),
      x: familyKeys.map((k) => playerFamilyPct[pid][k]),
      y: familyLabels,
      marker: { color: colorOf(pid) },
      hovertemplate: '%{x:.1f}%<extra>%{fullData.name}</extra>',
    })),
  ];

  const colorKeys = (Object.keys(deckColorPct) as SspColor[]).filter((c) => deckColorPct[c] > 0);
  const colorLabels = colorKeys.map((c) => c);
  const colorTraces: PlotData[] = [
    {
      type: 'bar', orientation: 'h',
      name: 'Deck',
      x: colorKeys.map((k) => deckColorPct[k]),
      y: colorLabels,
      marker: { color: '#888', pattern: { shape: '/', size: 4, solidity: 0.4 } as never },
      hovertemplate: '%{x:.1f}%<extra>Deck</extra>',
    },
    ...playerIds.map((pid): PlotData => ({
      type: 'bar', orientation: 'h',
      name: nameById(pid),
      x: colorKeys.map((k) => playerColorPct[pid][k]),
      y: colorLabels,
      marker: { color: colorOf(pid) },
      hovertemplate: '%{x:.1f}%<extra>%{fullData.name}</extra>',
    })),
  ];

  // Pie data for round endings.
  const endingPieTrace: PlotData = {
    type: 'pie',
    labels: endingSlices.map((s) => s.label),
    values: endingSlices.map((s) => s.n),
    marker: { colors: endingSlices.map((s) => s.color) },
    textinfo: 'percent',
    hovertemplate: '%{label}: %{value} (%{percent})<extra></extra>',
    sort: false,
  };

  return (
    <div className="ssp-stats">
      <h2 style={{ margin: '22px 0 8px' }}>📊 Match stats</h2>

      <h3>Cumulative score</h3>
      <PlotlyChart
        data={cumulativeScoreTraces}
        layout={{
          xaxis: { title: { text: 'Round' } },
          yaxis: { title: { text: 'Points' }, rangemode: 'tozero' },
        }}
      />

      <h3>Cumulative cards collected</h3>
      <PlotlyChart
        data={cumulativeCardsTraces}
        layout={{
          xaxis: { title: { text: 'Round' } },
          yaxis: { title: { text: 'Cards' }, rangemode: 'tozero' },
        }}
      />

      <h3>Cards collected per round</h3>
      <PlotlyChart
        data={cardsPerRoundTraces}
        layout={{
          barmode: 'group',
          bargap: 0.2,
          bargroupgap: 0.08,
          xaxis: { title: { text: 'Round' } },
          yaxis: { title: { text: 'Cards' }, rangemode: 'tozero' },
        }}
      />

      <h3>Avg points per card (per round)</h3>
      <PlotlyChart
        data={avgPtPerCardTraces}
        layout={{
          barmode: 'group',
          bargap: 0.2,
          bargroupgap: 0.08,
          xaxis: { title: { text: 'Round' } },
          yaxis: { title: { text: 'pts / card' }, rangemode: 'tozero' },
        }}
      />

      <h3>Category breakdown by round</h3>
      <CategoryBreakdownChart
        data={playerCategoryByRound}
        playerIds={playerIds}
        nameById={nameById}
        colorOf={colorOf}
        roundLabels={roundLabels}
      />

      <h3>Family frequency vs deck (%)</h3>
      <PlotlyChart
        data={familyTraces}
        layout={{
          barmode: 'group',
          bargap: 0.55,
          bargroupgap: 0.12,
          xaxis: { title: { text: '% of tableau' }, ticksuffix: '%' },
          yaxis: { autorange: 'reversed', automargin: true },
          hovermode: 'y unified',
        }}
        style={{ height: Math.max(480, familyKeys.length * 52) }}
      />

      <h3>Color frequency vs deck (%)</h3>
      <PlotlyChart
        data={colorTraces}
        layout={{
          barmode: 'group',
          bargap: 0.55,
          bargroupgap: 0.12,
          xaxis: { title: { text: '% of tableau' }, ticksuffix: '%' },
          yaxis: { autorange: 'reversed', automargin: true },
          hovermode: 'y unified',
        }}
        style={{ height: Math.max(480, colorKeys.length * 52) }}
      />

      <h3>Round endings</h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(260px, 360px) 1fr', gap: 16, alignItems: 'start' }}>
        <PlotlyChart
          data={[endingPieTrace]}
          layout={{
            margin: { t: 8, r: 8, b: 8, l: 8 },
            showlegend: true,
            legend: { orientation: 'v', x: 1.02, xanchor: 'left', y: 0.5, yanchor: 'middle' },
            hovermode: 'closest',
          }}
          style={{ height: 320 }}
        />
        <table style={{ margin: 0 }}>
          <thead>
            <tr><th>Round</th><th>How it ended</th><th>By</th><th>Result</th></tr>
          </thead>
          <tbody>
            {endingTypes.map((e) => (
              <tr key={e.round}>
                <td>R{e.round}</td>
                <td>
                  {e.kind === 'stop' && <span style={{ color: '#2ecc71', fontWeight: 700 }}>STOP</span>}
                  {e.kind === 'lastChance' && <span style={{ color: '#e0584f', fontWeight: 700 }}>LAST CHANCE</span>}
                  {e.kind === 'deckEmpty' && <span style={{ color: '#888' }}>Deck empty</span>}
                  {e.kind === 'mermaid' && <span style={{ color: '#f4d268', fontWeight: 700 }}>4 mermaids</span>}
                </td>
                <td>{e.by ? <span style={{ color: colorOf(e.by), fontWeight: 600 }}>{nameById(e.by)}</span> : '—'}</td>
                <td>
                  {e.kind === 'lastChance'
                    ? (e.won ? 'Bet won' : 'Bet lost')
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Per-round category breakdown for a SINGLE player (selected via dropdown).
 *  Renders each category as its own line with shared y-axis. */
function CategoryBreakdownChart({ data, playerIds, nameById, colorOf, roundLabels }: {
  data: Record<PlayerId, Array<{ duos: number; sets: number; multipliers: number; trios: number; mermaidClaim: number; colorBonus: number }>>;
  playerIds: PlayerId[];
  nameById: (pid: PlayerId) => string;
  colorOf: (pid: PlayerId) => string;
  roundLabels: string[];
}) {
  const [selected, setSelected] = useState<PlayerId>(playerIds[0]);
  const CATEGORIES: Array<{ key: 'duos' | 'sets' | 'multipliers' | 'trios' | 'mermaidClaim' | 'colorBonus'; label: string; color: string }> = [
    { key: 'duos',         label: 'Duo pairs',     color: '#2980b9' },
    { key: 'sets',         label: 'Collector sets', color: '#27ae60' },
    { key: 'multipliers',  label: 'Multipliers',   color: '#e67e22' },
    { key: 'trios',        label: 'Starfish trios', color: '#f39c12' },
    { key: 'mermaidClaim', label: 'Mermaid claim', color: '#9b59b6' },
    { key: 'colorBonus',   label: 'Color bonus',   color: '#16a085' },
  ];
  const series = data[selected] ?? [];
  // Stacked bars: each category is its own trace; barmode 'stack' in the
  // layout stacks them into one bar per round, so the total round score is
  // visible as the column height and each color slice is its source.
  const traces: PlotData[] = CATEGORIES.map((c) => ({
    type: 'bar',
    name: c.label,
    x: roundLabels,
    y: series.map((row) => row[c.key]),
    marker: { color: c.color },
    hovertemplate: '%{y} pts<extra>%{fullData.name}</extra>',
  }));
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <label htmlFor="ssp-cat-player" style={{ fontSize: 12, color: 'var(--paper-ink)' }}>
          Player:
        </label>
        <select
          id="ssp-cat-player"
          value={selected}
          onChange={(e) => setSelected(e.target.value as PlayerId)}
          style={{
            fontSize: 12,
            padding: '4px 8px',
            borderRadius: 4,
            border: '1px solid var(--paper-deep)',
            background: 'var(--paper-cream)',
            color: 'var(--paper-ink)',
          }}
        >
          {playerIds.map((pid) => (
            <option key={pid} value={pid}>{nameById(pid)}</option>
          ))}
        </select>
        <span style={{
          display: 'inline-block', width: 10, height: 10, borderRadius: 2,
          background: colorOf(selected), marginLeft: 4,
        }} />
      </div>
      <PlotlyChart
        data={traces}
        layout={{
          barmode: 'stack',
          bargap: 0.25,
          xaxis: { title: { text: 'Round' } },
          yaxis: { title: { text: 'Points' }, rangemode: 'tozero' },
        }}
      />
    </div>
  );
}


function findHandPairs(hand: SspCard[]): Array<[SspCard, SspCard]> {
  const out: Array<[SspCard, SspCard]> = [];
  for (let i = 0; i < hand.length; i++) {
    for (let j = i + 1; j < hand.length; j++) {
      if (isValidDuoPair(hand[i], hand[j])) out.push([hand[i], hand[j]]);
    }
  }
  return out;
}

/** Return the hand sorted by the user's preferred display order.
 *  - Already-known card ids retain their position in `order`.
 *  - Cards in `hand` not in `order` (newly drawn) go at the END.
 *  - Cards in `order` no longer in `hand` (played / stolen) are dropped.
 *  Underlying `hand` array is NOT mutated — randomness operates on it intact. */
function sortedHand(hand: SspCard[], order: number[]): SspCard[] {
  if (order.length === 0) return hand;
  const byId = new Map<number, SspCard>();
  for (const c of hand) byId.set(c.id, c);
  const out: SspCard[] = [];
  const placed = new Set<number>();
  for (const id of order) {
    const c = byId.get(id);
    if (c) { out.push(c); placed.add(id); }
  }
  for (const c of hand) {
    if (!placed.has(c.id)) out.push(c);
  }
  return out;
}

/** Move `srcId` to where `dstId` currently sits in the order array. */
function reorder(order: number[], srcId: number, dstId: number): number[] {
  const src = order.indexOf(srcId);
  const dst = order.indexOf(dstId);
  if (src === -1 || dst === -1 || src === dst) return order;
  const next = order.slice();
  const [card] = next.splice(src, 1);
  next.splice(dst, 0, card);
  return next;
}

function DraggableHandCard({
  card, selectable, selected, onClick, isDragging, onDragStart, onDragEnd, onDropOn,
}: {
  card: SspCard;
  selectable?: boolean;
  selected?: boolean;
  onClick?: () => void;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDropOn: () => void;
}) {
  // Wrap the existing CardView in a draggable shell so the card itself keeps
  // its FLIP-anchored zone behavior. Drag operates on local display order
  // only — it never mutates `state.players[me].hand`.
  return (
    <div
      draggable
      onDragStart={(e) => {
        // Some browsers need data set to start a drag at all.
        e.dataTransfer.setData('text/plain', String(card.id));
        e.dataTransfer.effectAllowed = 'move';
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
      }}
      onDrop={(e) => { e.preventDefault(); onDropOn(); }}
      style={{
        opacity: isDragging ? 0.4 : 1,
        cursor: 'grab',
      }}
    >
      <CardView
        card={card}
        zone="hand-me"
        selectable={selectable}
        selected={selected}
        onClick={onClick}
      />
    </div>
  );
}

function getSeat(state: SspState, id: PlayerId): Seat | undefined {
  return state.seats.find((s) => s.id === id);
}
function nameOf(state: SspState, id: PlayerId | null): string {
  if (!id) return '—';
  return getSeat(state, id)?.name ?? id;
}
function describeSelection(me: SspPlayer, ids: number[]): string {
  const cards = ids.map((id) => me.hand.find((c) => c.id === id)).filter(Boolean) as SspCard[];
  if (cards.length !== 2) return '';
  return cards.map((c) => FAMILY[c.family as SspCardFamily].label).join(' + ');
}

export const bundle: GameUiBundle<SspState, SspAction, SspConfig> = {
  LobbyConfig,
  GameView,
  Rules,
};
