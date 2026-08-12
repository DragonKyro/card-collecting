// Set — UI bundle (LobbyConfig + GameView + Rules).
//
// Layout: board on the left (three rows that grow right, or three columns on a
// narrow screen), stats + controls in the right rail. Selection lives in game
// state, so the view is a thin renderer: click a card, dispatch a toggle, and the
// reducer decides whether that completed a group.

import { useEffect, useMemo, useState } from 'react';
import type { GameUiBundle } from '@/core/module';
import type { PlayerId, Seat } from '@/core/types';
import { CardSpace, type CardId } from './cards';
import { boardCards } from './board';
import { SetArtDefs, COLOR_NAMES, SHADE_NAMES, SHAPE_NAMES, BORDER_NAMES } from './art';
import { SetCard } from './Card';
import { SetBoard, type BoardLayout } from './BoardView';
import { SetSidebar } from './Sidebar';
import {
  MODE_GROUP_LABELS, SET_MODES, engineFor, getModeSpec,
  type SetModeGroup, type SetModeId,
} from './modes';
import type { SetAction, SetConfig, SetResultFlash, SetState } from './types';
import { RulesBook, RulesGrid, RulesHero, RulesTile } from '@/ui/RulesBook';
import './set.css';

const GROUP_ORDER: SetModeGroup[] = ['classic', 'chain', 'ultra', 'fourset', 'puzzle', 'twist'];

// ===================================================================
// LobbyConfig
// ===================================================================

function LobbyConfig({ config, seats, onChange }: {
  config: SetConfig;
  seats: Seat[];
  onChange: (c: SetConfig) => void;
}) {
  const spec = getModeSpec(config.modeId);
  const engine = engineFor(config.modeId);
  const sample = useMemo(() => engine.freshDeck().slice(0, 3), [engine]);
  const humans = seats.filter((s) => !s.isAI).length;

  return (
    <div className="game-config set-lobby">
      <SetArtDefs />
      <label className="set-field">
        <span>Mode</span>
        <select
          value={config.modeId}
          onChange={(e) => onChange({ ...config, modeId: e.target.value as SetModeId })}
        >
          {GROUP_ORDER.map((group) => (
            <optgroup key={group} label={MODE_GROUP_LABELS[group]}>
              {SET_MODES.filter((m) => m.group === group).map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <p className="set-lobby-blurb">{spec.blurb}</p>

      <div className="set-lobby-facts">
        <Fact label="Deck" value={`${engine.deckSize} cards`} />
        <Fact label="Board" value={`${spec.minBoardSize} to start`} />
        <Fact label="Group" value={`${engine.setSize} cards`} />
        <Fact label="Features" value={`${spec.traitCount} × ${spec.variants}`} />
      </div>

      <div className="set-lobby-sample">
        {sample.map((cardId) => (
          <SetCard key={cardId} space={engine.space} cardId={cardId} />
        ))}
      </div>

      <label className="set-check">
        <input
          type="checkbox"
          checked={config.enableHints}
          onChange={(e) => onChange({ ...config, enableHints: e.target.checked })}
        />
        Practice mode (enables the hint button)
      </label>

      <p className="set-lobby-note">
        {humans > 1
          ? `Shared screen for ${humans} players: whoever spots the group picks their name first.`
          : 'Solo. Online play and bot opponents are not wired up for Set yet.'}
      </p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="set-fact">
      <span className="set-fact-label">{label}</span>
      <span className="set-fact-value">{value}</span>
    </div>
  );
}

// ===================================================================
// GameView
// ===================================================================

function GameView({ state, localPlayerId, dispatch }: {
  state: SetState;
  localPlayerId: PlayerId | null;
  dispatch: (a: SetAction) => void;
}) {
  const engine = engineFor(state.config.modeId);
  const spec = engine.spec;
  const [layout, setLayout] = useState<BoardLayout>(() => (
    typeof window !== 'undefined' && window.innerWidth < 760 ? 'columns' : 'rows'
  ));
  const [showShortcuts, setShowShortcuts] = useState(false);
  const board = boardCards(state.deck, state.boardSize);
  const wrongCards = useErrorFlash(state.lastResult);
  const playing = state.phase === 'playing';

  // Memory mode leaves a failed reveal on screen for a beat so it can be
  // memorised, then hides it again.
  const errorAt = state.lastResult?.kind === 'error' ? state.lastResult.atMs : null;
  useEffect(() => {
    if (!spec.faceDown || errorAt === null) return;
    const timer = setTimeout(() => dispatch({ type: 'clearSelection', atMs: Date.now() }), 1300);
    return () => clearTimeout(timer);
  }, [spec.faceDown, errorAt, dispatch]);

  // Shared-screen claimant shortcuts. Chain modes already use the digits for the
  // previous-group strip, so only bind them when there is no strip.
  const multiSeat = state.seats.length > 1;
  useEffect(() => {
    if (!multiSeat || !playing || state.lastSet.length > 0) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const idx = Number(e.key) - 1;
      if (Number.isInteger(idx) && idx >= 0 && idx < state.seats.length) {
        e.preventDefault();
        dispatch({ type: 'setClaimant', playerId: state.seats[idx].id });
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [multiSeat, playing, state.lastSet.length, state.seats, dispatch]);

  function claim(cardId: CardId) {
    dispatch({
      type: 'toggleCard',
      cardId,
      byPlayerId: pickClaimant(state, localPlayerId),
      atMs: Date.now(),
    });
  }

  return (
    <div className="set-root">
      <SetArtDefs />
      <div className="set-main">
        <div className={`set-banner${bannerClass(state)}`}>
          {playing
            ? state.lastResult?.message ?? `${state.selection.length}/${engine.setSize} selected`
            : `Deck exhausted — no ${engine.rule.noun} left. ${totalOf(state)} found.`}
        </div>
        <SetBoard
          space={engine.space}
          board={board}
          lastSet={state.lastSet}
          selection={state.selection}
          hintCards={state.hintCards}
          wrongCards={wrongCards}
          faceDown={spec.faceDown}
          layout={layout}
          showShortcuts={showShortcuts}
          interactive={playing}
          onCardClick={claim}
          onClear={() => dispatch({ type: 'clearSelection', atMs: Date.now() })}
        />
        <p className="set-help-line">
          {playing ? (
            <>
              Click cards (or press the shown keys) to pick {engine.setSize}.
              Space or Esc clears. {spec.chain > 0 && `Reuse exactly ${spec.chain} from the previous ${engine.rule.noun}.`}
            </>
          ) : (
            <>Nothing left to find — your splits are in the panel on the right. <strong>Play again</strong> deals a fresh deck.</>
          )}
        </p>
      </div>
      <SetSidebar
        state={state}
        spec={spec}
        layout={layout}
        showShortcuts={showShortcuts}
        onToggleLayout={() => setLayout((l) => (l === 'rows' ? 'columns' : 'rows'))}
        onToggleShortcuts={() => setShowShortcuts((v) => !v)}
        onClaimant={(playerId) => dispatch({ type: 'setClaimant', playerId })}
        onHint={() => dispatch({ type: 'addHint', atMs: Date.now() })}
        onQuit={() => dispatch({ type: 'quit', atMs: Date.now() })}
      />
    </div>
  );
}

function pickClaimant(state: SetState, localPlayerId: PlayerId | null): PlayerId {
  if (localPlayerId && localPlayerId in state.scores) {
    // Single-seat play: always the local seat. Shared screen: the chip/number
    // key wins, since the local uuid only ever matches seat 0.
    if (state.seats.length === 1) return localPlayerId;
  }
  return state.claimantId;
}

function bannerClass(state: SetState): string {
  if (state.phase !== 'playing') return ' is-done';
  if (state.lastResult?.kind === 'error') return ' is-error';
  if (state.lastResult?.kind === 'set') return ' is-good';
  return '';
}

function totalOf(state: SetState): string {
  const total = Object.values(state.scores).reduce((a, b) => a + b, 0);
  return `${total} ${total === 1 ? 'group' : 'groups'}`;
}

/** Keeps a rejected claim's cards flagged for long enough to see the flash. */
function useErrorFlash(result: SetResultFlash | null): CardId[] {
  const [visible, setVisible] = useState<CardId[]>([]);
  const atMs = result?.kind === 'error' ? result.atMs : null;
  const cards = result?.kind === 'error' ? result.cards : null;
  useEffect(() => {
    if (atMs === null || !cards) { setVisible([]); return; }
    setVisible(cards);
    const timer = setTimeout(() => setVisible([]), 800);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [atMs]);
  return visible;
}

// ===================================================================
// Rules
// ===================================================================

const NORMAL_SPACE = CardSpace.forMode(4, 3);
const JUNIOR_SPACE = CardSpace.forMode(3, 3);
const MEGA_SPACE = CardSpace.forMode(5, 3);
const FOUR_SPACE = CardSpace.forMode(4, 4);

function Row({ space, cards }: { space: CardSpace; cards: readonly string[] }) {
  return (
    <div className="set-rules-row">
      <SetArtDefs />
      {cards.map((c, i) => (
        <SetCard key={`${c}-${i}`} space={space} cardId={c} />
      ))}
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
                title="Set"
                subtitle="Three cards where every feature is all the same or all different."
                accent="linear-gradient(135deg, #8a4fd6 0%, #17a05e 100%)"
              />
              <p>
                Every card has four features — colour, shape, shading and count —
                each with three variants. A <strong>set</strong> is three cards
                where, taking each feature on its own, the three variants are
                either all identical or all different. There is no turn order:
                spot one, take it, and three replacements are dealt.
              </p>
              <h3>A valid set</h3>
              <Row space={NORMAL_SPACE} cards={['0000', '1111', '2222']} />
              <p>
                Colours all different, shapes all different, shadings all
                different, counts all different.
              </p>
              <h3>Also a valid set</h3>
              <Row space={NORMAL_SPACE} cards={['0000', '0010', '0020']} />
              <p>
                Same colour, same shape, same count — and the three shadings are
                all different. Each feature is judged on its own.
              </p>
              <h3>Not a set</h3>
              <Row space={NORMAL_SPACE} cards={['0000', '0001', '1002']} />
              <p>
                Two cards share a colour and the third does not — two the same
                and one different is always wrong.
              </p>
            </>
          ),
        },
        {
          title: 'Features',
          body: (
            <>
              <h3>The four features</h3>
              <RulesGrid cols={2}>
                <RulesTile icon="🎨" label="Colour" hint={COLOR_NAMES.slice(0, 3).join(', ')} accent="#8a4fd6" />
                <RulesTile icon="🔷" label="Shape" hint={SHAPE_NAMES.slice(0, 3).join(', ')} accent="#17a05e" />
                <RulesTile icon="▤" label="Shading" hint={SHADE_NAMES.slice(0, 3).join(', ')} accent="#d63b48" />
                <RulesTile icon="③" label="Count" hint="one, two, three" accent="#e07b1f" />
              </RulesGrid>
              <h3>Junior — three features only</h3>
              <Row space={JUNIOR_SPACE} cards={['200', '011', '122']} />
              <h3>Extra features in the bigger modes</h3>
              <p>
                MegaSet adds a fifth feature, <strong>border</strong> ({BORDER_NAMES.join(', ')}),
                for a 243-card deck. The 4Set family gives every feature a fourth
                variant instead — an orange ink, an hourglass shape and a
                checkered shading.
              </p>
              <Row space={MEGA_SPACE} cards={['02000', '12011', '22022']} />
              <Row space={FOUR_SPACE} cards={['2130', '3201', '0312', '1023']} />
            </>
          ),
        },
        {
          title: 'Chain modes',
          body: (
            <>
              <p>
                In <strong>Set-Chain</strong> every set after the first must reuse
                exactly one card from the previous set. The previous set stays
                above the board and its cards are still clickable (or press 1–4).
              </p>
              <Row space={NORMAL_SPACE} cards={['1210', '0101', '2022']} />
              <Row space={NORMAL_SPACE} cards={['2022', '0011', '1000']} />
              <p>
                The second set reuses the third card of the first.
                <strong> UltraSet-Chain</strong> and <strong>4Set Jr-Chain</strong>{' '}
                work the same way but reuse exactly two cards.
              </p>
            </>
          ),
        },
        {
          title: 'UltraSet & GhostSet',
          body: (
            <>
              <h3>UltraSet — four cards, two pairs</h3>
              <p>
                Pick four cards that split into two pairs completing to the{' '}
                <em>same</em> fifth card. That fifth card need not be on the
                board. Order of selection does not matter.
              </p>
              <Row space={NORMAL_SPACE} cards={['1202', '1122']} />
              <Row space={NORMAL_SPACE} cards={['0212', '2112']} />
              <p>Both pairs complete to:</p>
              <Row space={NORMAL_SPACE} cards={['1012']} />
              <p>
                <strong>Ultra9</strong> is the same rule on a 9-card board — about
                5 UltraSets on screen instead of 19.
              </p>
              <h3>GhostSet — six cards, three pairs</h3>
              <p>
                Three disjoint pairs whose three completing cards themselves form
                a set. Two disjoint ordinary sets always qualify, and so do three
                pairs that all share one completing card.
              </p>
              <Row space={NORMAL_SPACE} cards={['0211', '2211', '1100', '2222', '0210', '1012']} />
            </>
          ),
        },
        {
          title: '4Set',
          body: (
            <>
              <p>
                Every feature has <strong>four</strong> variants, and a 4Set is
                four cards where each feature is all the same, all different, or{' '}
                <strong>two pairs</strong>. So <code>AAAA</code>, <code>ABCD</code>{' '}
                and <code>AABB</code> are fine; <code>ABBB</code> and{' '}
                <code>ABCC</code> are not.
              </p>
              <Row space={FOUR_SPACE} cards={['1102', '1101', '1202', '1201']} />
              <p>
                256 cards and harder patterns —{' '}
                <strong>4Set Junior</strong> drops to three features (64 cards)
                and is the place to start.
              </p>
              <Row space={CardSpace.forMode(3, 4)} cards={['200', '311', '022', '133']} />
            </>
          ),
        },
        {
          title: 'Puzzle & twists',
          body: (
            <>
              <RulesGrid cols={2}>
                <RulesTile icon="🧩" label="Puzzle" hint="Find every group on the board before it advances." accent="#6aa0ff" />
                <RulesTile icon="🔀" label="Shuffle" hint="The whole board is reshuffled after each set." accent="#3ab0c9" />
                <RulesTile icon="🙈" label="Memory" hint="21 cards face down; reveal three at a time." accent="#d63b48" />
                <RulesTile icon="👶" label="Junior" hint="Solid shading only — three features, 27 cards." accent="#17a05e" />
              </RulesGrid>
              <p>
                Puzzle modes never race the deck: the board holds until it is
                cleared of every group, then flips wholesale. Memory keeps a
                failed reveal on screen for a moment — that is the whole game.
              </p>
              <h3>Board size</h3>
              <p>
                Each mode has a starting board size (12 for Normal, 9 for Junior
                and Ultra9, 21 for Memory, 15–16 for 4Set and MegaSet). If no
                legal group exists, three more cards are dealt until one does.
              </p>
            </>
          ),
        },
        {
          title: 'Controls',
          body: (
            <>
              <h3>Keyboard</h3>
              <p>
                Card keys are laid out to match the board. In the three-rows
                layout each screen column is a keyboard column —{' '}
                <code>q a z</code>, then <code>w s x</code>, and so on. In the
                three-columns layout each screen row is a keyboard row —{' '}
                <code>q w e</code>, then <code>a s d</code>.
              </p>
              <p>
                <strong>Space</strong> or <strong>Esc</strong> clears the
                selection. In chain modes, <strong>1–4</strong> pick from the
                previous group. On a shared screen with several players, the
                number keys choose who gets the credit.
              </p>
              <h3>Practice mode</h3>
              <p>
                Turn it on in the lobby to get a hint button, which reveals the
                cards of a real group one at a time.
              </p>
            </>
          ),
        },
        {
          title: 'The maths',
          body: (
            <>
              <p>
                Under the hood a card is a vector. Each three-variant feature is
                one coordinate mod 3, so "all the same or all different" is
                exactly <strong>a + b + c ≡ 0 (mod 3)</strong> — which is why the
                third card of a set is always forced once you have two.
              </p>
              <p>
                Four-variant features use two coordinates mod 2 instead (the
                Klein four-group), where four cards summing to zero is precisely
                the all-same / all-different / two-pairs rule. GhostSet is six
                cards summing to zero; UltraSet is four cards that split into two
                pairs with equal sums.
              </p>
              <p>
                Every mode is that same algebra with different numbers, which is
                what makes new features or a new group rule cheap to add.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}

export const bundle: GameUiBundle<SetState, SetAction, SetConfig> = {
  LobbyConfig,
  GameView,
  Rules,
};
