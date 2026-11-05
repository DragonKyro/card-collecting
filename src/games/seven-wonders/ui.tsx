// 7 Wonders UI — LobbyConfig + GameView.

import { Suspense, useEffect, useMemo, useState, type ReactNode } from 'react';
import { sharedDeviceHumans } from '@/core/seats';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import type {
  SwState, SwAction, SwConfig, SwExpansionId, SwPayment,
  SwCard, SwPlayer, SwPendingPick, SwResource, SwScience, SwWonderStage,
} from './types';
import { wonderById, wondersByName } from './wonders';
import { canChainBuild, planPayment, shieldsFor, type PaymentPlan } from './resources';
import { discardBuildOptions, freeBuildsFor, pickCostFor, picksPerAge } from './reducer';
import { rankRows, scienceHoldings } from './scoring';
import { getActiveExpansions, getAllExpansions } from './expansions/registry';
import { babelTileById, greatProjectById } from './expansions/babel/cards';
import { canParticipate } from './expansions/babel/projects';
import {
  AGE_HEX, AgeIcon, ArrowIcon, ChainIcon, CoinIcon, ColorChip, DebtIcon, DiplomacyIcon, MaskIcon, MilitaryToken,
  ParticipationIcon, PenaltyIcon, ResourceIcon, ScienceIcon, ShieldIcon, TileIcon, VpIcon, WonderPowerIcon, WonderStageIcon,
} from './art';
import {
  CardFace, CostIcons, EffectIcons, TableauColumns, WonderBoard, WonderMini, type CardStatus,
} from './Card';
import { RulesBook, RulesHero, RulesGrid, RulesTile } from '@/ui/RulesBook';
import './seven-wonders.css';

const EXPANSION_INFO: Array<{ id: SwExpansionId; label: string; desc: string }> = [
  { id: 'leaders', label: 'Leaders', desc: 'Draft 4 leaders before Age I and recruit one at the start of each Age. 36 leaders, the Rome board, 4 new guilds; everyone starts with 6 coins.' },
  { id: 'cities', label: 'Cities', desc: '27 black cards (one per player each Age, so hands of 8), 3 guilds, Petra and Byzantium. Debt, diplomacy, espionage. Up to 8 players.' },
  { id: 'babelTower', label: 'Babel — Tower of Babel', desc: '24 law tiles: discard a card to build one, and its rule applies to everyone while it shows on the tower.' },
  { id: 'babelProjects', label: 'Babel — Great Projects', desc: 'A Great Project each Age: join it by building a card of its colour and paying its cost. Rewards if it gets built, penalties if not.' },
];

// ===================================================================
// LobbyConfig
// ===================================================================

function LobbyConfig({ config, seats, onChange }: { config: SwConfig; seats: Seat[]; onChange: (c: SwConfig) => void }) {
  const wonderGroups = useMemo(() => wondersByName(config.expansions), [config.expansions]);

  const toggleExpansion = (id: SwExpansionId) => {
    const has = config.expansions.includes(id);
    const next = has ? config.expansions.filter((x) => x !== id) : [...config.expansions, id];
    // Keep the canonical order (it is the order of the pre-game drafts).
    const ordered = EXPANSION_INFO.map((e) => e.id).filter((x) => next.includes(x));
    onChange({ ...config, expansions: ordered });
  };

  const setSide = (side: 'random' | 'A' | 'B') => onChange({ ...config, wonderSide: side });
  const setAssignment = (a: 'random' | 'preset') => onChange({ ...config, wonderAssignment: a });

  const setPresetFor = (seatIdx: number, wonderId: string) => {
    const next = (config.presetWonders ?? []).slice();
    // Seats without a pick stay random ('').
    while (next.length < seats.length) next.push('');
    next[seatIdx] = wonderId;
    onChange({ ...config, presetWonders: next });
  };

  const presetName = (i: number) => {
    const id = config.presetWonders?.[i];
    return id ? wonderGroups.find((g) => g.a.id === id || g.b.id === id)?.name ?? null : null;
  };

  return (
    <div className="game-config sw-lobby">
      <h4 style={{ margin: '0 0 4px' }}>Wonders</h4>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="radio" checked={config.wonderAssignment === 'random'} onChange={() => setAssignment('random')} />
          Random assignment
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="radio" checked={config.wonderAssignment === 'preset'} onChange={() => setAssignment('preset')} />
          Manual per-seat
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, color: 'var(--fg-muted)', alignSelf: 'center' }}>Side:</span>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="radio" checked={config.wonderSide === 'A'} onChange={() => setSide('A')} />A
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="radio" checked={config.wonderSide === 'B'} onChange={() => setSide('B')} />B
        </label>
        <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <input type="radio" checked={config.wonderSide === 'random'} onChange={() => setSide('random')} />random
        </label>
      </div>

      {config.wonderAssignment === 'preset' && (
        <div>
          <p style={{ fontSize: 12, color: 'var(--fg-muted)' }}>
            Pick a wonder for each seat. Seats left on random get a wonder nobody picked, on the side chosen above.
          </p>
          {seats.map((s, i) => {
            const current = config.presetWonders?.[i] ?? '';
            const valid = !current || wonderGroups.some((g) => g.a.id === current || g.b.id === current);
            const takenElsewhere = new Set(seats.map((_, k) => (k === i ? null : presetName(k))).filter(Boolean));
            return (
              <div key={s.id} className="sw-expansion-row">
                <span className="sw-preset-name">{s.name}</span>
                <select
                  value={valid ? current : ''}
                  onChange={(e) => setPresetFor(i, e.target.value)}
                  className="sw-preset-select"
                >
                  <option value="">— random —</option>
                  {wonderGroups.flatMap((g) => [
                    <option key={g.a.id} value={g.a.id} disabled={takenElsewhere.has(g.name)}>{g.name} (A)</option>,
                    <option key={g.b.id} value={g.b.id} disabled={takenElsewhere.has(g.name)}>{g.name} (B)</option>,
                  ])}
                </select>
                {current && valid && <WonderMini wonder={wonderById(current)} built={0} />}
              </div>
            );
          })}
        </div>
      )}

      <h4 style={{ margin: '14px 0 4px' }}>Expansions</h4>
      {EXPANSION_INFO.map((e) => {
        const ext = getAllExpansions().find((x) => x.id === e.id);
        const Section = config.expansions.includes(e.id) ? ext?.LobbySection : undefined;
        return (
          <div key={e.id} className="sw-expansion-row sw-expansion-block">
            <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={config.expansions.includes(e.id)} onChange={() => toggleExpansion(e.id)} />
              <strong>{e.label}</strong>
            </label>
            <span className="sw-expansion-desc" style={{ fontSize: 12, color: 'var(--fg-muted)' }}>{e.desc}</span>
            {Section && <Section config={config} onChange={onChange} />}
          </div>
        );
      })}
      {seats.length > 7 && !config.expansions.includes('cities') && (
        <p className="sw-plan-bad" style={{ fontSize: 12 }}>8 players need the Cities expansion.</p>
      )}
    </div>
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
                title="7 Wonders"
                subtitle="Draft your way through 3 Ages. Build a civilization."
                accent="linear-gradient(135deg, #8b6f3a 0%, #d4a85a 100%)"
              />
              <h3>Each turn</h3>
              <p>Everyone picks a card at the same time, then all picks are revealed and resolved together. With your card you either:</p>
              <RulesGrid cols={3}>
                <RulesTile icon="🏛️" label="Build" hint="Pay its cost from your production, buying the rest from your neighbours. A city can't hold two cards of the same name. Free if you own the card it chains from." accent="#9ed27c" />
                <RulesTile icon="⛏️" label="Wonder stage" hint="Tuck the card face down under your next wonder stage (they go in order), pay the stage's cost and gain its effect. Any card will do." accent="#6aa0ff" />
                <RulesTile icon="🪙" label="Sell" hint="Discard it face down for 3 coins. Always legal." accent="#f4d268" />
              </RulesGrid>
              <h3>Hand rotation</h3>
              <p>
                After every pick the hands pass on. Ages I &amp; III pass to the
                <strong> left</strong> (your west neighbour), Age II to the
                <strong> right</strong> (east). Each Age is 6 picks (7 with Cities); the
                last card of each hand is discarded — unless your wonder lets you play it.
              </p>
              <p>
                Income a card gives when built (Tavern, Vineyard, Arena…) counts
                every card built that same turn, your neighbours' included.
              </p>
            </>
          ),
        },
        {
          title: 'Military & trade',
          body: (
            <>
              <h3>End-of-age military</h3>
              <p>
                Shields are compared with BOTH neighbours, one battle each. The
                stronger city takes a victory token for that battle, the weaker a
                −1 defeat token; a tie gives nothing.
              </p>
              <table className="tight">
                <thead><tr><th>Age</th><th className="num">Win</th><th className="num">Loss</th></tr></thead>
                <tbody>
                  <tr><td>Age I</td><td className="num">+1</td><td className="num">−1</td></tr>
                  <tr><td>Age II</td><td className="num">+3</td><td className="num">−1</td></tr>
                  <tr><td>Age III</td><td className="num">+5</td><td className="num">−1</td></tr>
                </tbody>
              </table>
              <h3>Resource trading</h3>
              <p>
                You may buy what your neighbours produce with their wonder's
                starting resource and their brown and gray cards — not their
                yellow cards', black cards' or wonder stages' production. Buying
                never uses the resource up, and the seller can't refuse. The
                coins reach them at the end of the turn.
              </p>
              <RulesGrid cols={2}>
                <RulesTile icon="🪙" label="2 coins / unit" hint="The normal price, paid to that neighbour." accent="#f4d268" />
                <RulesTile icon="🛒" label="1 coin / unit" hint="Raw materials with East / West Trading Post (or Olympia B) on that side; manufactured goods with the Marketplace." accent="#9ed27c" />
              </RulesGrid>
            </>
          ),
        },
        {
          title: 'Wonder powers',
          body: (
            <>
              <RulesGrid cols={2}>
                <RulesTile icon="🏺" label="Halicarnassus" hint="The turn a stage with this power is built, at the end of the turn: build one card from the discard pile for free (the Age's last cards included on the last turn)." accent="#c9a47c" />
                <RulesTile icon="🌿" label="Babylon" hint="A: a science symbol of your choice. B: play the last card of each Age instead of discarding it, and (last stage) a science symbol of your choice." accent="#9ed27c" />
                <RulesTile icon="⚡" label="Olympia" hint="A: once per Age, build a card for free. B: raw materials from both neighbours cost 1; at the end, copy one guild built by a neighbour." accent="#6aa0ff" />
                <RulesTile icon="🔥" label="The others" hint="Gizah, Rhodes, Alexandria and Ephesos give VP, shields, coins or production printed on each stage." accent="#f4d268" />
                <RulesTile icon="🏟️" label="Rome (Leaders)" hint="A: recruit leaders for free. B: leaders cost you 2 less and your neighbours 1 less; stage 1 draws 4 leaders, stages 2–3 let you recruit one at once." accent="#b984c9" />
                <RulesTile icon="🏜️" label="Petra · Byzantium (Cities)" hint="Petra: stages paid in coins (7, 14) and a coin loss for the others. Byzantium: diplomacy tokens." accent="#2a2a36" />
              </RulesGrid>
            </>
          ),
        },
        {
          title: 'Scoring',
          body: (
            <>
              <h3>Final scoring (after Age III)</h3>
              <RulesGrid cols={2}>
                <RulesTile icon="⚔️" label="Military" hint="Sum of victory + defeat tokens." accent="#ff7070" />
                <RulesTile icon="🪙" label="Coins" hint="1 VP per 3 coins." accent="#f4d268" />
                <RulesTile icon="🏛️" label="Wonder stages" hint="Face value of every built stage." accent="#c9a47c" />
                <RulesTile icon="📘" label="Civilian (blue)" hint="Face value VP." accent="#6aa0ff" />
                <RulesTile icon="🛍️" label="Commercial (yellow)" hint="Age III yellows' VP per card / stage." accent="#e8a04a" />
                <RulesTile icon="🎭" label="Guilds (purple)" hint="VP per card, stage or token they count." accent="#b984c9" />
                <RulesTile icon="🔬" label="Science (green)" hint="t² + c² + g² + 7 · min(t,c,g). Wild symbols and masks become whichever scores most." accent="#9ed27c" />
              </RulesGrid>
              <p>Expansions add columns: leaders, black cards, debt, the tower, Great Projects. The most points wins; a tie goes to the most coins, and a tie on both is shared.</p>
            </>
          ),
        },
        {
          title: 'Leaders',
          body: (
            <>
              <h3>Setup &amp; the draft</h3>
              <p>Everyone starts with 6 coins. Before Age I each player is dealt 4 leaders: keep one, pass the rest to the right, and so on until each has drafted 4.</p>
              <h3>Recruitment phase (start of every Age)</h3>
              <p>Everyone secretly picks one of their leaders, then all are revealed. With it you either:</p>
              <RulesGrid cols={2}>
                <RulesTile icon="👑" label="Recruit" hint="Pay its coin cost; it joins your city and its power works from now on." accent="#b984c9" />
                <RulesTile icon="⛏️" label="Wonder stage" hint="Build your next stage with it, paying the stage's cost." accent="#6aa0ff" />
                <RulesTile icon="🪙" label="Discard" hint="Take 3 coins." accent="#f4d268" />
                <RulesTile icon="🗼" label="Babel tile" hint="With the Tower of Babel: build one of your tiles with it." accent="#e8a04a" />
              </RulesGrid>
              <p>
                A leader's “from now on” power (Xenophon, Vitruvius, Nero, Hatshepsut…) counts only
                what happens after it is recruited. Leaders that make a colour cost “one resource less”
                let you choose which resource. Tomyris: your defeat tokens go to the neighbour who beat
                you. Solomon: build a card from the discard pile for free.
              </p>
              <h3>Guilds</h3>
              <p>Gamers' (1 VP per 3 coins), Courtesans' (copy a neighbour's leader), Diplomats' (1 VP per neighbouring leader), Architects' (3 VP per neighbouring guild) join the guild pool.</p>
            </>
          ),
        },
        {
          title: 'Cities',
          body: (
            <>
              <p>Each Age's deck gets one random black card per player, so hands are 8 cards and an Age is 7 picks (at 8 players: 7 black cards, hands of 7).</p>
              <RulesGrid cols={2}>
                <RulesTile icon="💸" label="Coin losses" hint="Some cards make every other city lose coins. At the end of the turn each pays what it wants of it; every coin not paid is a debt token (−1 VP)." accent="#2a2a36" />
                <RulesTile icon="🕊️" label="Diplomacy" hint="A token makes you sit out the next conflict (it is spent). Your neighbours fight each other instead." accent="#6a9a3c" />
                <RulesTile icon="🎭" label="Masks" hint="At the end, each mask copies the science symbol of a green card in a neighbouring city." accent="#8f949e" />
                <RulesTile icon="⚓" label="Docks, Warehouse, Market" hint="Clandestine Docks: 1 coin off the first resource bought from that side each turn. Secret Warehouse / Black Market: one resource you produce / don't, each turn." accent="#3f7fa8" />
              </RulesGrid>
              <p>Architect Cabinet: wonder stages cost no resources. Three guilds (Counterfeiters', Shadows', Mourners') join the pool; with Leaders, six more leaders join the leader deck.</p>
            </>
          ),
        },
        {
          title: 'Babel',
          body: (
            <>
              <h3>Tower of Babel</h3>
              <p>
                Before Age I each player drafts 3 tiles (keep one, pass right). Instead of building or
                selling, a player may discard their card to build one of their tiles: once the turn is
                resolved it goes on the tower, and its rule applies to everyone until another tile covers
                it (3 spaces at 2–4 players, 4 at 5–8). 1 / 2 / 3 tiles built: 2 / 5 / 10 VP.
              </p>
              <h3>Great Projects</h3>
              <p>
                Each Age reveals a project with one token fewer than there are players. Build a card of
                its colour and also pay its participation cost to take a token (once per turn; free
                builds may join too). Before the Age's conflicts: all tokens taken → every participant
                earns the reward per token; otherwise everyone without a token suffers the penalty, or
                takes a penalty token (−1/−2/−3 VP) if they can't.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}

// ===================================================================
// GameView
// ===================================================================

const ROMAN = ['', 'I', 'II', 'III'] as const;

type Mode = 'build' | 'olympia' | 'color' | 'token' | 'wonder' | 'stageToken' | 'discard' | 'babel';

/** What a city did on the last resolved turn (public information only: a sold
 *  or tucked card stays face down). */
type LastMove =
  | { kind: 'build'; cardName: string }
  | { kind: 'wonder'; stage: number }
  | { kind: 'discard' }
  | { kind: 'babel' };

interface LastTurn {
  moves: Map<PlayerId, LastMove[]>;
  /** Cards built on that turn, to pop in. */
  freshCards: Set<number>;
  /** Cities that built a wonder stage on it. */
  freshStage: Set<PlayerId>;
}

/** The most recently resolved turn, read back off the log (reveals plus any
 *  Halicarnassus build that followed). Empty at the start of an Age. */
function lastTurn(state: SwState): LastTurn {
  const out: LastTurn = { moves: new Map(), freshCards: new Set(), freshStage: new Set() };
  const add = (id: PlayerId, m: LastMove) => out.moves.set(id, [m, ...(out.moves.get(id) ?? [])]);
  let collecting = false;
  for (let i = state.log.length - 1; i >= 0; i--) {
    const e = state.log[i];
    if (e.kind === 'pickSubmitted' && !collecting) continue;
    if (e.kind === 'debtSettled' || e.kind === 'babelPlaced' || e.kind === 'courtesan') continue;
    if (e.kind === 'discardBuilt') {
      collecting = true;
      if (e.cardId !== null && e.cardName) {
        add(e.playerId, { kind: 'build', cardName: e.cardName });
        out.freshCards.add(e.cardId);
      }
      continue;
    }
    if (e.kind !== 'pickRevealed') break;
    collecting = true;
    if (e.pick.kind === 'build') {
      add(e.playerId, { kind: 'build', cardName: e.cardName });
      out.freshCards.add(e.pick.cardId);
    } else if (e.pick.kind === 'wonder') {
      add(e.playerId, { kind: 'wonder', stage: e.pick.stageIndex + 1 });
      out.freshStage.add(e.playerId);
    } else if (e.pick.kind === 'babelTile') {
      add(e.playerId, { kind: 'babel' });
    } else {
      add(e.playerId, { kind: 'discard' });
    }
  }
  return out;
}

function seatName(state: SwState, id: PlayerId | null | undefined): string {
  return state.seats.find((s) => s.id === id)?.name ?? id ?? '?';
}

/** The expansions' table panels (the tower, the current project). */
function TablePanels({ state, localPlayerId }: { state: SwState; localPlayerId: PlayerId | null }) {
  const panels = getActiveExpansions(state.config).filter((e) => e.TablePanel);
  if (panels.length === 0) return null;
  return (
    <div className="sw-table-panels">
      <Suspense fallback={null}>
        {panels.map((e) => {
          const Panel = e.TablePanel!;
          return <Panel key={e.id} state={state} localPlayerId={localPlayerId} />;
        })}
      </Suspense>
    </div>
  );
}

function GameView({
  state,
  localPlayerId,
  dispatch,
}: {
  state: SwState;
  localPlayerId: PlayerId | null;
  dispatch: (a: SwAction) => void;
}) {
  const [selectedCardId, setSelectedCardId] = useState<number | null>(null);
  const [mode, setMode] = useState<Mode | null>(null);

  useEffect(() => {
    setSelectedCardId(null);
    setMode(null);
  }, [state.age, state.ageRound, state.subPhase, localPlayerId]);

  const me = state.players.find((p) => p.id === localPlayerId) ?? null;
  const seatLabel = state.seats.find((s) => s.id === localPlayerId)?.name ?? 'You';
  // "Your hand", or "Ann's hand" when a named seat holds the device.
  const mySeatName = seatLabel === 'You' ? 'Your' : `${seatLabel}'s`;
  const last = useMemo(() => lastTurn(state), [state]);

  if (state.phase === 'gameOver') {
    return <GameOver state={state} />;
  }

  if (state.subPhase === 'militaryEnd') {
    return (
      <div className="sw">
        <div className="sw-board">
          <MilitaryBanner state={state} />
          <div style={{ textAlign: 'center' }}>
            <button onClick={() => dispatch({ type: 'continue' })}>
              {state.age < 3 ? `Continue to Age ${ROMAN[state.age + 1]} →` : 'Final scoring →'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  const header = (
    <>
      <StatusBar state={state} me={me} />
      <TablePanels state={state} localPlayerId={localPlayerId} />
      <Opponents state={state} localPlayerId={localPlayerId} last={last} />
      {me && (
        <div className="sw-self">
          <WonderBoard wonder={wonderById(me.wonderId)} built={me.wonderStagesBuilt} highlightNext fresh={last.freshStage.has(me.id)} />
          <SelfCity player={me} state={state} fresh={last.freshCards} />
        </div>
      )}
    </>
  );

  // Expansion-owned subphase: defer the bottom panel to its overlay.
  for (const ext of getActiveExpansions(state.config)) {
    if (ext.ownsSubPhase?.(state.subPhase) && ext.GameOverlay) {
      const Overlay = ext.GameOverlay;
      return (
        <div className="sw">
          <div className="sw-board">
            {header}
            {/* Overlays may be lazy (their art ships with this chunk, not the module). */}
            <Suspense fallback={null}>
              <Overlay state={state} localPlayerId={localPlayerId} dispatch={dispatch} />
            </Suspense>
          </div>
        </div>
      );
    }
  }

  if (state.subPhase === 'discardBuild') {
    return (
      <div className="sw">
        <div className="sw-board">
          {header}
          <DiscardBuildPanel state={state} me={me} dispatch={dispatch} />
        </div>
      </div>
    );
  }

  return (
    <div className="sw">
      <div className="sw-board">
        {header}
        {me ? (
          <HandPanel
            state={state}
            me={me}
            mySeatName={mySeatName}
            selectedCardId={selectedCardId}
            setSelectedCardId={setSelectedCardId}
            mode={mode}
            setMode={setMode}
            submitted={me.pendingPick != null}
            dispatch={dispatch}
          />
        ) : (
          <p className="sw-empty">Spectator view — no hand shown.</p>
        )}
      </div>
    </div>
  );
}

function StatusBar({ state, me }: { state: SwState; me: SwPlayer | null }) {
  const picking = state.subPhase === 'picking';
  const waiting = state.players.filter((p) => p.hand.length > 0 || p.pendingPick !== null);
  const submittedCount = waiting.filter((p) => p.pendingPick !== null).length;
  const n = state.players.length;
  const idx = me ? state.players.findIndex((p) => p.id === me.id) : -1;
  const toWest = state.passDirection === 'cw';
  const target = idx >= 0 ? state.players[toWest ? (idx - 1 + n) % n : (idx + 1) % n] : null;
  const per = picksPerAge(state);
  return (
    <div className="sw-status">
      <span className="sw-pill sw-pill-age" style={{ ['--sw-age' as string]: AGE_HEX[state.age] }}>
        <AgeIcon age={state.age} size={22} />
        Age {ROMAN[state.age]}
        {picking && (state.ageRound <= per ? <> · pick {state.ageRound} of {per}</> : <> · the last card</>)}
      </span>
      {picking && state.ageRound <= per && (
        <span className="sw-pill" title="Hands pass this way after every pick">
          {toWest && <ArrowIcon dir="west" size={12} light />}
          {target
            ? <>Pass {toWest ? 'left' : 'right'} to <strong>{seatName(state, target.id)}</strong></>
            : <>Pass {toWest ? 'left (west)' : 'right (east)'}</>}
          {!toWest && <ArrowIcon dir="east" size={12} light />}
        </span>
      )}
      {picking && <span className="sw-pill">Picked {submittedCount} / {waiting.length}</span>}
      <span className="sw-pill" title="Discarded cards (face down)">Discard pile · {state.discard.length}</span>
    </div>
  );
}

/** Opponents in table order, from the west neighbour round to the east one. */
function Opponents({ state, localPlayerId, last }: { state: SwState; localPlayerId: PlayerId | null; last: LastTurn }) {
  const n = state.players.length;
  const idx = state.players.findIndex((p) => p.id === localPlayerId);
  const order: Array<{ player: SwPlayer; side: 'west' | 'east' | null }> = idx < 0
    ? state.players.map((player) => ({ player, side: null }))
    : Array.from({ length: n - 1 }, (_, k) => ({
      player: state.players[(idx - (k + 1) + n) % n],
      side: k === 0 ? 'west' as const : k === n - 2 ? 'east' as const : null,
    }));
  return (
    <div className="sw-opponents">
      {order.map(({ player, side }) => <OpponentStrip key={player.id} player={player} side={side} state={state} last={last} />)}
    </div>
  );
}

function moveText(m: LastMove): string {
  if (m.kind === 'build') return `built ${m.cardName}`;
  if (m.kind === 'wonder') return `built wonder stage ${m.stage}`;
  if (m.kind === 'babel') return 'built a Babel tile';
  return 'sold a card for 3 coins';
}

function OpponentStrip({ player, side, state, last }: { player: SwPlayer; side: 'west' | 'east' | null; state: SwState; last: LastTurn }) {
  const seat = state.seats.find((s) => s.id === player.id);
  const submitted = player.pendingPick != null;
  const owes = player.hand.length > 0 && !submitted;
  const cards = [...player.tableau, ...(player.leaderTableau ?? [])];
  const moves = last.moves.get(player.id) ?? [];
  return (
    <div className={`sw-opp ${side ? `sw-opp-${side}` : ''} ${submitted ? 'done' : ''}`}>
      <header>
        <span className="sw-dot" style={{ background: seat?.color ?? '#888' }} />
        <strong>{seat?.name ?? player.id}</strong>
        {seat?.isAI && <span className="sw-tag">AI</span>}
        {side === 'west' && <span className="sw-tag sw-tag-side"><ArrowIcon dir="west" size={10} light /> West neighbour</span>}
        {side === 'east' && <span className="sw-tag sw-tag-side">East neighbour <ArrowIcon dir="east" size={10} light /></span>}
        {state.subPhase === 'picking' && (submitted || owes) && (
          <span className={`sw-opp-state ${submitted ? 'on' : ''}`}>{submitted ? '✓ picked' : 'choosing…'}</span>
        )}
      </header>
      {moves.length > 0 && (
        <p className="sw-opp-last" key={moves.map(moveText).join('|')}>Last turn: {moves.map(moveText).join(', then ')}</p>
      )}
      <div className="sw-opp-row">
        <WonderMini wonder={wonderById(player.wonderId)} built={player.wonderStagesBuilt} fresh={last.freshStage.has(player.id)} />
        <CityStats player={player} state={state} />
      </div>
      {cards.length > 0 ? <TableauColumns cards={cards} size="sm" fresh={last.freshCards} /> : <p className="sw-empty">No buildings yet.</p>}
    </div>
  );
}

function scienceCounts(player: SwPlayer): Record<SwScience, number> {
  const out: Record<SwScience, number> = { compass: 0, gear: 0, tablet: 0 };
  for (const c of [...player.tableau, ...(player.leaderTableau ?? [])]) {
    for (const e of c.effects) if (e.kind === 'science') out[e.symbol]++;
  }
  return out;
}

function CityStats({ player, state }: { player: SwPlayer; state: SwState }) {
  const sci = scienceCounts(player);
  const wonder = wonderById(player.wonderId);
  const wild = [...player.tableau, ...wonder.stages.slice(0, player.wonderStagesBuilt)]
    .reduce((n, x) => n + x.effects.filter((e) => e.kind === 'scienceWild').length, 0);
  const masks = scienceHoldings(state, player).masks;
  const t = player.projectTokens;
  return (
    <div className="sw-stats">
      <span className="sw-stat" title="Coins"><CoinIcon size={18} />{player.coins}</span>
      <span className="sw-stat" title="Shields"><ShieldIcon size={18} />{shieldsFor(player)}</span>
      {(Object.keys(sci) as SwScience[]).filter((s) => sci[s] > 0).map((s) => (
        <span key={s} className="sw-stat"><ScienceIcon s={s} size={18} />{sci[s]}</span>
      ))}
      {wild > 0 && <span className="sw-stat" title="Science symbols of their choice"><ScienceIcon s="any" size={18} />{wild}</span>}
      {masks > 0 && <span className="sw-stat" title="Masks: each copies a neighbour's science symbol at the end"><MaskIcon size={18} />{masks}</span>}
      {player.debtTokens ? <span className="sw-stat" title="Debt tokens (−1 VP each)"><DebtIcon size={18} />{player.debtTokens}</span> : null}
      {player.diplomacyTokens ? <span className="sw-stat" title="Diplomacy tokens"><DiplomacyIcon size={18} />{player.diplomacyTokens}</span> : null}
      {player.babelBuilt ? <span className="sw-stat" title="Babel tiles built"><TileIcon size={18} />{player.babelBuilt}</span> : null}
      {player.participations ? <span className="sw-stat" title="Great Project participation tokens"><ParticipationIcon size={18} />{player.participations}</span> : null}
      {t && t.freeBuild > 0 && <span className="sw-stat" title="Free-build tokens">free build ×{t.freeBuild}</span>}
      {t && t.freeStage > 0 && <span className="sw-stat" title="Free wonder-stage tokens"><WonderStageIcon size={18} />free ×{t.freeStage}</span>}
      {t && t.anyColor > 0 && <span className="sw-stat" title="Join a Great Project with any colour">any colour ×{t.anyColor}</span>}
      {t && t.penalties.length > 0 && (
        <span className="sw-stat" title="Penalty tokens">{t.penalties.map((v, i) => <PenaltyIcon key={i} n={-v} size={17} />)}</span>
      )}
      {t?.resourceBlocked && <span className="sw-stat sw-bad" title="Its board's starting resource is lost">board resource lost</span>}
      {player.militaryTokens.length > 0 && (
        <span className="sw-stat sw-tokens" title="Military tokens">
          {player.militaryTokens.map((tk, i) => <MilitaryToken key={i} value={tk} size={17} />)}
        </span>
      )}
    </div>
  );
}

function SelfCity({ player, state, fresh }: { player: SwPlayer; state: SwState; fresh: ReadonlySet<number> }) {
  const cards = [...player.tableau, ...(player.leaderTableau ?? [])];
  return (
    <div className="sw-panel sw-self-city">
      <h3>
        <span>Your city · {cards.length} card{cards.length === 1 ? '' : 's'}</span>
        <CityStats player={player} state={state} />
      </h3>
      {cards.length === 0
        ? <p className="sw-empty">You haven't built anything yet. Built cards tuck in here by colour.</p>
        : <TableauColumns cards={cards} size="md" fresh={fresh} />}
    </div>
  );
}

function cardStatus(state: SwState, me: SwPlayer, card: SwCard): CardStatus {
  if (me.tableau.some((t) => t.name === card.name)) return { kind: 'owned' };
  const plan = computeBuildPlan(state, me, card, false);
  if (plan.chainFree && plan.totalCoins === 0) return { kind: 'chain' };
  if (!plan.canBuild) return { kind: 'blocked', reason: plan.reason ?? "Can't build" };
  return plan.totalCoins > 0 ? { kind: 'pay', coins: plan.totalCoins } : { kind: 'free' };
}

const FREE_LABEL: Record<'olympia' | 'color' | 'token', string> = {
  olympia: 'Build free (Statue of Zeus, once this Age)',
  color: 'Build free (once this Age)',
  token: 'Build free (free-build token)',
};

function HandPanel({
  state, me, mySeatName,
  selectedCardId, setSelectedCardId,
  mode, setMode,
  submitted, dispatch,
}: {
  state: SwState; me: SwPlayer; mySeatName: string;
  selectedCardId: number | null;
  setSelectedCardId: (n: number | null) => void;
  mode: Mode | null;
  setMode: (m: Mode | null) => void;
  submitted: boolean;
  dispatch: (a: SwAction) => void;
}) {
  const [participate, setParticipate] = useState(false);
  const [tileId, setTileId] = useState<number | null>(null);
  const card = selectedCardId ? me.hand.find((c) => c.id === selectedCardId) ?? null : null;
  const wonder = wonderById(me.wonderId);
  const stageIdx = me.wonderStagesBuilt;
  const canBuildAnotherStage = stageIdx < wonder.stages.length;
  const pending = me.pendingPick;
  const frees = card ? freeBuildsFor(state, me, card) : [];
  const joinable = !!card && (mode === 'build' || mode === 'olympia' || mode === 'color' || mode === 'token') && canParticipate(state, me, card.color);
  const joining = joinable && participate;
  const tiles = me.babelHand ?? [];
  const hasTower = getActiveExpansions(state.config).some((e) => e.pickKinds?.includes('babelTile'));

  useEffect(() => { setParticipate(false); setTileId(null); }, [selectedCardId]);

  const pick: SwPendingPick | null = useMemo(() => {
    if (!card || !mode) return null;
    const none = { fromWest: [], fromEast: [], coins: 0 };
    switch (mode) {
      case 'discard': return { kind: 'discard', cardId: card.id };
      case 'babel': return tileId === null ? null : { kind: 'babelTile', cardId: card.id, tileId };
      case 'wonder': return { kind: 'wonder', cardId: card.id, stageIndex: stageIdx, payment: none };
      case 'stageToken': return { kind: 'wonder', cardId: card.id, stageIndex: stageIdx, payment: none, free: 'token' };
      case 'build': return { kind: 'build', cardId: card.id, payment: none, ...(joining ? { participate: true } : {}) };
      default: return { kind: 'build', cardId: card.id, payment: none, free: mode, ...(joining ? { participate: true } : {}) };
    }
  }, [card, mode, tileId, joining, stageIdx]);

  const plan = useMemo(() => (card && pick ? planFor(state, me, pick, card) : null), [state, me, card, pick]);

  const statuses = useMemo(() => new Map(me.hand.map((c) => [c.id, cardStatus(state, me, c)])), [state, me]);

  // Players sharing a device: once your pick is locked in, your hand stays
  // hidden — whoever looks at the screen next may not be you. (Online, each
  // device is one player's.)
  const hideHand = submitted && sharedDeviceHumans(state.seats) >= 2;

  if (me.hand.length === 0 && !pending) {
    const babylon = state.players.filter((p) => p.hand.length > 0).map((p) => seatName(state, p.id));
    return (
      <div className="sw-panel sw-hand-area">
        <h3><span>{mySeatName} hand · empty</span></h3>
        <p className="sw-hint">
          {babylon.length > 0
            ? `${babylon.join(' and ')} play${babylon.length === 1 ? 's' : ''} the Age's last card (Hanging Gardens of Babylon).`
            : 'Waiting for the others…'}
        </p>
      </div>
    );
  }

  function submit() {
    if (!pick || !plan?.canBuild || submitted) return;
    const final: SwPendingPick = pick.kind === 'build' || pick.kind === 'wonder' ? { ...pick, payment: plan.payment } as SwPendingPick : pick;
    dispatch({ type: 'submitPick', playerId: me.id, pick: final });
  }

  const dup = card ? me.tableau.some((t) => t.name === card.name) : false;
  const pendingLabel = pending
    ? pending.kind === 'build' ? (pending.free ? 'build for free' : 'build') : pending.kind === 'wonder' ? `build wonder stage ${pending.stageIndex + 1}`
      : pending.kind === 'babelTile' ? `build Babel tile ${pending.tileId}` : 'sell for 3 coins'
    : '';
  const lastCard = state.ageRound > picksPerAge(state);
  const stageTokens = me.projectTokens?.freeStage ?? 0;
  const project = state.project && state.project.outcome === null ? greatProjectById(state.project.projectId) : null;

  return (
    <div className="sw-panel sw-hand-area">
      <h3>
        <span>{mySeatName} hand · {me.hand.length} card{me.hand.length === 1 ? '' : 's'}</span>
        <span className="sw-hint">
          {submitted
            ? `Locked in: ${pendingLabel}. Waiting for the others…`
            : lastCard
              ? 'The Hanging Gardens let you play the last card: build it, use it for a stage or sell it.'
              : 'Pick a card, then build it, use it for a wonder stage or sell it.'}
        </span>
      </h3>

      {hideHand
        ? <p className="sw-empty">Your hand is hidden until the turn is revealed.</p>
        : (
          <div className="sw-hand">
            {me.hand.map((c) => (
              <CardFace
                key={c.id}
                card={c}
                selected={c.id === selectedCardId || pending?.cardId === c.id}
                disabled={submitted && pending?.cardId !== c.id}
                status={statuses.get(c.id)}
                onClick={submitted ? undefined : () => {
                  setSelectedCardId(c.id);
                  const st = statuses.get(c.id);
                  const free = freeBuildsFor(state, me, c);
                  setMode(st?.kind === 'owned' ? 'discard' : st?.kind === 'blocked' ? (free[0] ?? 'discard') : 'build');
                }}
              />
            ))}
          </div>
        )}

      {!submitted && card && (
        <div className="sw-pay-dialog">
          <div className="sw-choices">
            <button
              className={`sw-choice ${mode === 'build' ? 'on' : ''}`}
              onClick={() => setMode('build')}
              disabled={dup}
              title={dup ? 'You already have one in your city.' : ''}
            >
              <span className="sw-choice-icon"><EffectIcons effects={card.effects} size={16} /></span>
              Build {card.name}
            </button>
            {frees.map((f) => (
              <button
                key={f}
                className={`sw-choice ${mode === f ? 'on' : ''}`}
                onClick={() => setMode(f)}
                disabled={dup}
                title={FREE_LABEL[f]}
              >
                <span className="sw-choice-icon"><WonderPowerIcon power="freeBuildPerAge" size={18} /></span>
                {FREE_LABEL[f]}
              </button>
            ))}
            <button
              className={`sw-choice ${mode === 'wonder' ? 'on' : ''}`}
              onClick={() => setMode('wonder')}
              disabled={!canBuildAnotherStage}
              title={canBuildAnotherStage ? '' : 'Your wonder is complete.'}
            >
              <span className="sw-choice-icon"><WonderStageIcon size={18} /></span>
              {canBuildAnotherStage ? `Wonder stage ${stageIdx + 1}` : 'Wonder complete'}
            </button>
            {canBuildAnotherStage && stageTokens > 0 && (
              <button className={`sw-choice ${mode === 'stageToken' ? 'on' : ''}`} onClick={() => setMode('stageToken')}>
                <span className="sw-choice-icon"><WonderStageIcon size={18} /></span>
                Stage {stageIdx + 1} free (token)
              </button>
            )}
            <button className={`sw-choice ${mode === 'discard' ? 'on' : ''}`} onClick={() => setMode('discard')}>
              <span className="sw-choice-icon"><CoinIcon n={3} size={18} /></span>
              Sell for 3 coins
            </button>
            {hasTower && tiles.length > 0 && (
              <button className={`sw-choice ${mode === 'babel' ? 'on' : ''}`} onClick={() => setMode('babel')}>
                <span className="sw-choice-icon"><TileIcon size={18} /></span>
                Build a Babel tile
              </button>
            )}
          </div>

          <div className="sw-plan">
            {(mode === 'build' || mode === 'olympia' || mode === 'color' || mode === 'token') && (
              <>
                <BuildSummary card={card} plan={plan} free={mode !== 'build'} />
                {joinable && project && (
                  <label className="sw-plan-row sw-join">
                    <input type="checkbox" checked={participate} onChange={(e) => setParticipate(e.target.checked)} />
                    <ParticipationIcon size={16} /> Also join the Great Project ({project.name}): <CostIcons cost={project.cost} size={15} />
                  </label>
                )}
              </>
            )}
            {(mode === 'wonder' || mode === 'stageToken') && canBuildAnotherStage && (
              <WonderSummary stage={wonder.stages[stageIdx]} plan={plan} free={mode === 'stageToken'} />
            )}
            {mode === 'discard' && <p className="sw-plan-row">Discard <strong>{card.name}</strong> face down and take <CoinIcon n={3} size={16} /> from the bank.</p>}
            {mode === 'babel' && (
              <div>
                <p className="sw-plan-row">Discard <strong>{card.name}</strong> and put one of your tiles on the tower (once the turn is resolved):</p>
                <div className="sw-tile-choices">
                  {tiles.map((id) => (
                    <button key={id} className={`sw-tile-choice ${tileId === id ? 'on' : ''}`} onClick={() => setTileId(id)} title={babelTileById(id).text}>
                      <TileIcon n={id} size={26} />
                      <span>{babelTileById(id).text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="sw-actions">
            <button onClick={submit} disabled={!pick || !plan?.canBuild || ((mode === 'build' || mode === 'olympia' || mode === 'color' || mode === 'token') && dup)}>
              Confirm
            </button>
            <button className="secondary" onClick={() => { setSelectedCardId(null); setMode(null); }}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** Halicarnassus: the discard pile, face up for its builder only. */
function DiscardBuildPanel({ state, me, dispatch }: { state: SwState; me: SwPlayer | null; dispatch: (a: SwAction) => void }) {
  const [selected, setSelected] = useState<number | null>(null);
  const [participate, setParticipate] = useState(false);
  const pickerId = state.discardBuildQueue?.[0] ?? null;
  const picker = state.players.find((p) => p.id === pickerId);
  const wonderName = picker ? wonderById(picker.wonderId).name : '';
  if (!me || me.id !== pickerId) {
    return (
      <div className="sw-panel sw-hand-area">
        <h3><span className="sw-h-icon"><WonderPowerIcon power="buildFromDiscard" size={20} /> {wonderName}</span></h3>
        <p className="sw-hint">{seatName(state, pickerId)} is searching the discard pile for a card to build for free…</p>
      </div>
    );
  }
  return (
    <DiscardPicker
      state={state} me={me} title={wonderName}
      selected={selected} setSelected={setSelected}
      participate={participate} setParticipate={setParticipate}
      onBuild={(cardId, join, payment) => dispatch({ type: 'buildFromDiscard', playerId: me.id, cardId, ...(join ? { participate: true, payment } : {}) })}
      onPass={() => dispatch({ type: 'buildFromDiscard', playerId: me.id, cardId: null })}
    />
  );
}

/** The discard pile as a free build (Halicarnassus, Solomon), with the
 *  Great Project's participation if the card's colour allows. */
export function DiscardPicker({
  state, me, title, selected, setSelected, participate, setParticipate, onBuild, onPass,
}: {
  state: SwState; me: SwPlayer; title: string;
  selected: number | null; setSelected: (id: number | null) => void;
  participate: boolean; setParticipate: (b: boolean) => void;
  onBuild: (cardId: number, participate: boolean, payment?: SwPayment) => void;
  onPass: () => void;
}) {
  const buildable = new Set(discardBuildOptions(state, me).map((c) => c.id));
  const cards = [...state.discard].sort((a, b) => a.age - b.age || a.name.localeCompare(b.name));
  const card = cards.find((c) => c.id === selected) ?? null;
  const project = state.project && state.project.outcome === null ? greatProjectById(state.project.projectId) : null;
  const joinable = !!card && !!project && canParticipate(state, me, card.color);
  const joinPlan = joinable && participate && project ? fromPaymentPlan(planPayment(state, me, project.cost)) : null;
  return (
    <div className="sw-panel sw-hand-area sw-discard-build">
      <h3>
        <span className="sw-h-icon"><WonderPowerIcon power="buildFromDiscard" size={20} /> {title} · the discard pile ({cards.length})</span>
        <span className="sw-hint">Build one of these cards for free. You can't take one you already have.</span>
      </h3>
      <div className="sw-hand">
        {cards.map((c) => (
          <CardFace
            key={c.id}
            card={c}
            size="md"
            selected={c.id === selected}
            disabled={!buildable.has(c.id)}
            status={buildable.has(c.id) ? { kind: 'free' } : { kind: 'owned' }}
            onClick={buildable.has(c.id) ? () => { setSelected(c.id); setParticipate(false); } : undefined}
          />
        ))}
      </div>
      {joinable && project && (
        <label className="sw-plan-row sw-join">
          <input type="checkbox" checked={participate} onChange={(e) => setParticipate(e.target.checked)} />
          <ParticipationIcon size={16} /> Also join the Great Project ({project.name}): <CostIcons cost={project.cost} size={15} />
          {joinPlan && !joinPlan.canBuild && <span className="sw-plan-bad"> — {joinPlan.reason}</span>}
        </label>
      )}
      <div className="sw-actions">
        <button
          disabled={!card || (joinPlan !== null && !joinPlan.canBuild)}
          onClick={() => card && onBuild(card.id, !!joinPlan, joinPlan?.payment)}
        >
          {card ? `Build ${card.name}` : 'Pick a card'}
        </button>
        <button className="secondary" onClick={onPass}>
          Build nothing
        </button>
      </div>
    </div>
  );
}

function Purchases({ plan }: { plan: PlanResult }) {
  return (
    <>
      {plan.fromWest.length > 0 && (
        <div className="sw-plan-row">
          <ArrowIcon dir="west" size={14} light /> Buy from west:
          {plan.fromWest.map((r, i) => <ResourceIcon key={i} r={r} size={16} />)}
          <CoinIcon n={plan.coinsToWest} size={16} />
        </div>
      )}
      {plan.fromEast.length > 0 && (
        <div className="sw-plan-row">
          Buy from east:
          {plan.fromEast.map((r, i) => <ResourceIcon key={i} r={r} size={16} />)}
          <CoinIcon n={plan.coinsToEast} size={16} /> <ArrowIcon dir="east" size={14} light />
        </div>
      )}
      {plan.payment.bank && (
        <div className="sw-plan-row">
          Bilkis: buy <ResourceIcon r={plan.payment.bank} size={16} /> from the bank for <CoinIcon n={1} size={16} />
        </div>
      )}
      {plan.payment.waived && plan.payment.waived.length > 0 && (
        <div className="sw-plan-row">
          Left unpaid (a leader's discount): {plan.payment.waived.map((r, i) => <ResourceIcon key={i} r={r} size={16} />)}
        </div>
      )}
    </>
  );
}

function BuildSummary({ card, plan, free }: { card: SwCard; plan: PlanResult | null; free: boolean }) {
  if (!plan) return <p>—</p>;
  if (!plan.canBuild) {
    return <p className="sw-plan-bad">Can't build: {plan.reason}</p>;
  }
  return (
    <div>
      {free
        ? <p className="sw-plan-row"><WonderPowerIcon power="freeBuildPerAge" size={16} /> Build <strong>{card.name}</strong> without paying its cost.</p>
        : plan.chainFree
          ? <p className="sw-plan-row"><ChainIcon size={16} /> Free build — you (or a neighbour you may chain from) own {card.chainFrom?.join(' or ') ?? 'its chain card'}.</p>
          : <div className="sw-plan-row">Cost: <CostIcons cost={card.cost} size={16} free /></div>}
      <Purchases plan={plan} />
      {plan.totalCoins > 0 && <div className="sw-plan-row">Total to pay: <CoinIcon n={plan.totalCoins} size={18} /></div>}
    </div>
  );
}

function WonderSummary({ stage, plan, free }: { stage: SwWonderStage; plan: PlanResult | null; free: boolean }) {
  if (!plan) return <p>—</p>;
  return (
    <div>
      <div className="sw-plan-row">
        Stage: {free ? <span className="sw-fx-text">free (token)</span> : <CostIcons cost={stage.cost} size={16} />} <span className="sw-fx-arrow">→</span>
        {stage.effects.length > 0 ? <EffectIcons effects={stage.effects} size={18} /> : null}
        <span className="sw-plan-note">{stage.text}</span>
      </div>
      {plan.canBuild
        ? (
          <>
            <Purchases plan={plan} />
            {plan.totalCoins > 0 && <div className="sw-plan-row">Total to pay: <CoinIcon n={plan.totalCoins} size={18} /></div>}
          </>
        )
        : <p className="sw-plan-bad">Can't build: {plan.reason}</p>}
    </div>
  );
}

function ResultCell({ result, age }: { result: 'win' | 'loss' | 'draw'; age: 1 | 2 | 3 }) {
  if (result === 'win') return <MilitaryToken value={age === 1 ? 1 : age === 2 ? 3 : 5} size={22} />;
  if (result === 'loss') return <MilitaryToken value={-1} size={22} />;
  return <span className="sw-muted">draw</span>;
}

function MilitaryBanner({ state }: { state: SwState }) {
  const summary = state.lastMilitaryResolution;
  if (!summary) return <p>Resolving military…</p>;
  return (
    <div className="sw-panel sw-military-banner">
      <h3><span className="sw-h-icon"><ShieldIcon size={22} /> Age {ROMAN[summary.age]} — military conflicts</span></h3>
      <p className="sw-hint">Every city compares shields with both neighbours: the stronger side takes a victory token, the weaker one a defeat token.</p>
      <div className="sw-table-scroll">
        <table className="sw-table">
          <thead>
            <tr><th>City</th><th><ShieldIcon size={16} /></th><th>vs west</th><th>vs east</th><th>This age</th></tr>
          </thead>
          <tbody>
            {summary.perPlayer.map((row) => {
              const p = state.players.find((x) => x.id === row.playerId);
              const seat = state.seats.find((s) => s.id === row.playerId);
              return (
                <tr key={row.playerId}>
                  <td><span className="sw-dot" style={{ background: seat?.color ?? '#888' }} /> {seat?.name ?? row.playerId}</td>
                  <td>{row.shields ?? (p ? shieldsFor(p) : '—')}</td>
                  {row.diplomacy
                    ? <td colSpan={2}><DiplomacyIcon size={16} /> sat out (diplomacy)</td>
                    : (
                      <>
                        <td><ResultCell result={row.vsWest} age={summary.age} /></td>
                        <td><ResultCell result={row.vsEast} age={summary.age} /></td>
                      </>
                    )}
                  <td className={row.tokenGained > 0 ? 'sw-good' : row.tokenGained < 0 ? 'sw-bad' : ''}>
                    {row.tokenGained > 0 ? `+${row.tokenGained}` : row.tokenGained}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const EXTRA_ICON: Record<string, () => ReactNode> = {
  leaders: () => <ColorChip color="leader" size={18} />,
  cities: () => <ColorChip color="black" size={18} />,
  debt: () => <DebtIcon size={18} />,
  tower: () => <TileIcon size={18} />,
  projects: () => <ParticipationIcon size={18} />,
};

const EXTRA_TITLE: Record<string, string> = {
  leaders: 'Leaders', cities: 'Black cards (Cities)', debt: 'Debt tokens', tower: 'Tower of Babel tiles', projects: 'Great Projects',
};

function GameOver({ state }: { state: SwState }) {
  const breakdown = state.finalScoringBreakdown ?? [];
  const { sorted, winnerIds } = rankRows(state, breakdown);
  const winners = winnerIds.map((id) => state.players.find((p) => p.id === id)).filter((p): p is SwPlayer => !!p);
  const top = sorted[0];
  // Did the coins decide it?
  const onCoins = winnerIds.length === 1 && sorted.length > 1 && sorted[1].total === top?.total;
  const copies = breakdown.filter((r) => r.copiedGuild);
  // Collect extras columns from active expansions.
  const extraCategories = Array.from(new Set(
    getActiveExpansions(state.config).flatMap((e) => e.scoreCategories ?? []),
  ));
  return (
    <div className="sw">
      <div className="sw-board">
        <div className="sw-panel sw-gameover">
          <div className="sw-gameover-title">
            <VpIcon size={46} />
            <div>
              <h2>
                {winners.length === 1
                  ? `${seatName(state, winners[0].id)} wins!`
                  : winners.length > 1 ? `${winners.map((w) => seatName(state, w.id)).join(' & ')} share the victory` : 'Match complete'}
              </h2>
              {top && (
                <p className="sw-hint">
                  {top.total} victory points
                  {winners.length === 1 && <> · {wonderById(winners[0].wonderId).name}</>}
                  {onCoins && <> · ahead on coins</>}
                </p>
              )}
            </div>
          </div>
          <div className="sw-table-scroll">
            <table className="sw-table sw-final-table">
              <thead>
                <tr>
                  <th>City</th>
                  <th title="Military"><ShieldIcon size={18} /></th>
                  <th title="Treasury (1 VP per 3 coins)"><CoinIcon size={18} /></th>
                  <th title="Wonder"><WonderStageIcon size={18} /></th>
                  <th title="Civilian"><ColorChip color="blue" size={18} /></th>
                  <th title="Commercial"><ColorChip color="yellow" size={18} /></th>
                  <th title="Guilds"><ColorChip color="purple" size={18} /></th>
                  <th title="Science"><ScienceIcon s="gear" size={18} /></th>
                  {extraCategories.map((c) => (
                    <th key={c} title={EXTRA_TITLE[c] ?? c}>{EXTRA_ICON[c] ? EXTRA_ICON[c]() : <span style={{ textTransform: 'capitalize' }}>{c}</span>}</th>
                  ))}
                  <th title="Total"><VpIcon size={20} /></th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => {
                  const seat = state.seats.find((s) => s.id === row.playerId);
                  return (
                    <tr key={row.playerId} className={winnerIds.includes(row.playerId) ? 'sw-winner' : ''}>
                      <td><span className="sw-dot" style={{ background: seat?.color ?? '#888' }} /> {seat?.name ?? row.playerId}</td>
                      <td>{row.military}</td>
                      <td>{row.treasury}</td>
                      <td>{row.wonder}</td>
                      <td>{row.civilian}</td>
                      <td>{row.commercial}</td>
                      <td title={row.copiedGuild ? `Includes the copied ${row.copiedGuild}` : undefined}>{row.guild}</td>
                      <td>{row.science}</td>
                      {extraCategories.map((c) => (
                        <td key={c}>{row.extras?.[c] ?? 0}</td>
                      ))}
                      <td><strong>{row.total}</strong></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {copies.map((r) => (
            <p key={r.playerId} className="sw-hint sw-final-note">
              <WonderPowerIcon power="copyGuild" size={16} /> {seatName(state, r.playerId)}'s Statue of Zeus copies the {r.copiedGuild}.
            </p>
          ))}
        </div>
        <div className="sw-opponents">
          {sorted.map((row) => {
            const p = state.players.find((x) => x.id === row.playerId);
            const seat = state.seats.find((s) => s.id === row.playerId);
            if (!p) return null;
            return (
              <div key={row.playerId} className="sw-opp">
                <header><span className="sw-dot" style={{ background: seat?.color ?? '#888' }} /><strong>{seat?.name ?? p.id}</strong></header>
                <div className="sw-opp-row">
                  <WonderMini wonder={wonderById(p.wonderId)} built={p.wonderStagesBuilt} />
                  <CityStats player={p} state={state} />
                </div>
                <TableauColumns cards={[...p.tableau, ...(p.leaderTableau ?? [])]} size="sm" />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ---------- helpers ----------

export interface PlanResult {
  canBuild: boolean;
  chainFree: boolean;
  reason?: string;
  payment: SwPayment;
  fromWest: SwResource[];
  fromEast: SwResource[];
  coinsToWest: number;
  coinsToEast: number;
  totalCoins: number;
}

const NO_PAY: SwPayment = { fromWest: [], fromEast: [], coins: 0 };

export function fromPaymentPlan(plan: PaymentPlan, chainFree = false): PlanResult {
  if (plan.ok) {
    return {
      canBuild: true, chainFree,
      payment: plan.payment,
      fromWest: plan.payment.fromWest, fromEast: plan.payment.fromEast,
      coinsToWest: plan.toWest, coinsToEast: plan.toEast,
      totalCoins: plan.totalCoins,
    };
  }
  return {
    canBuild: false, chainFree,
    reason: plan.reason === 'coins'
      ? `Not enough coins (it costs ${plan.totalCoins}).`
      : 'Neither you nor your neighbours produce what it needs.',
    payment: NO_PAY,
    fromWest: [], fromEast: [], coinsToWest: 0, coinsToEast: 0, totalCoins: plan.totalCoins,
  };
}

/** The cheapest payment for a pick (its card / stage, taxes, a Great Project). */
export function planFor(state: SwState, me: SwPlayer, pick: SwPendingPick, card: SwCard): PlanResult {
  const chainFree = pick.kind === 'build' && !pick.free && canChainBuild(state, me, card);
  if (pick.kind === 'wonder' && pick.stageIndex >= wonderById(me.wonderId).stages.length) {
    return { ...fromPaymentPlan({ ok: false, reason: 'resources', totalCoins: 0 }), reason: 'No more stages.' };
  }
  const cost = pickCostFor(state, me, pick, card);
  if (!cost || ((cost.coins ?? 0) === 0 && (cost.resources?.length ?? 0) === 0)) {
    return { canBuild: true, chainFree, payment: NO_PAY, fromWest: [], fromEast: [], coinsToWest: 0, coinsToEast: 0, totalCoins: 0 };
  }
  return fromPaymentPlan(planPayment(state, me, cost), chainFree);
}

function computeBuildPlan(state: SwState, me: SwPlayer, card: SwCard, participate: boolean): PlanResult {
  return planFor(state, me, { kind: 'build', cardId: card.id, payment: NO_PAY, ...(participate ? { participate: true } : {}) }, card);
}


export const bundle: GameUiBundle<SwState, SwAction, SwConfig> = {
  LobbyConfig,
  GameView,
  Rules,
};

