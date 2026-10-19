import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { SspFlipProvider, useFlipAnchor, useFlipCard } from './cardFlip';

// jsdom has no layout and no Web Animations: each test node reports the
// position in its data-x / data-y attributes, and animate() is recorded.

interface Flight { id: string; transform: string; cancel: ReturnType<typeof vi.fn> }
let flights: Flight[];
const realRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  flights = [];
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const el = this as HTMLElement;
    return new DOMRect(Number(el.dataset.x ?? 0), Number(el.dataset.y ?? 0), 56, 86);
  };
  (Element.prototype as unknown as { animate: unknown }).animate = function (this: HTMLElement, frames: Keyframe[]) {
    const cancel = vi.fn();
    flights.push({ id: this.dataset.id ?? '?', transform: String(frames[0].transform), cancel });
    return { cancel } as unknown as Animation;
  };
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = realRect;
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
});

interface CardSpec { id: number; zone: string; x: number; y: number }

function Card({ id, zone, x, y }: CardSpec) {
  return <div ref={useFlipCard(id, zone)} data-id={id} data-x={x} data-y={y} />;
}

function Anchor({ name, x, y }: { name: string; x: number; y: number }) {
  return <div ref={useFlipAnchor(name)} data-x={x} data-y={y} />;
}

const ANCHORS = [{ name: 'deck', x: 10, y: 200 }, { name: 'pile-0', x: 100, y: 200 }];

function Board({ cards, origins = new Map(), scene = 'round1' }: {
  cards: CardSpec[]; origins?: Map<number, string>; scene?: string;
}) {
  return (
    <SspFlipProvider origins={origins} scene={scene}>
      {ANCHORS.map((a) => <Anchor key={a.name} {...a} />)}
      {/* A zone change remounts the card, as moving between components does in the game. */}
      {cards.map((c) => <Card key={`${c.zone}:${c.id}`} {...c} />)}
    </SspFlipProvider>
  );
}

describe('card flights', () => {
  it('a card changing zone flies from where it was on screen', () => {
    const { rerender } = render(<Board cards={[{ id: 1, zone: 'pile-0', x: 100, y: 200 }]} />);
    rerender(<Board cards={[{ id: 1, zone: 'hand-me', x: 300, y: 500 }]} />);
    expect(flights).toEqual([expect.objectContaining({ id: '1', transform: 'translate(-200px, -300px)' })]);
  });

  it('a card staying in its zone never flies, even when the layout moves it', () => {
    const { rerender } = render(<Board cards={[{ id: 1, zone: 'hand-me', x: 300, y: 500 }]} />);
    rerender(<Board cards={[{ id: 1, zone: 'hand-me', x: 364, y: 500 }]} />);
    expect(flights).toEqual([]);
  });

  it('a card shown for the first time flies from where the state kept it: the deck', () => {
    const origins = new Map([[7, 'deck']]);
    const { rerender } = render(<Board cards={[]} origins={origins} />);
    rerender(<Board cards={[{ id: 7, zone: 'pending-draw', x: 210, y: 400 }]} origins={new Map()} />);
    expect(flights).toEqual([expect.objectContaining({ id: '7', transform: 'translate(-200px, -200px)' })]);
  });

  it('a card dug out from under a pile top flies from that pile', () => {
    const origins = new Map([[5, 'pile-0']]);
    const { rerender } = render(<Board cards={[]} origins={origins} />);
    rerender(<Board cards={[{ id: 5, zone: 'hand-p1', x: 400, y: 20 }]} />);
    expect(flights).toEqual([expect.objectContaining({ id: '5', transform: 'translate(-300px, 180px)' })]);
  });

  it('a card uncovered where it already was (the next card of a pile) does not fly', () => {
    const origins = new Map([[5, 'pile-0']]);
    const { rerender } = render(<Board cards={[]} origins={origins} />);
    rerender(<Board cards={[{ id: 5, zone: 'pile-0', x: 100, y: 200 }]} origins={origins} />);
    expect(flights).toEqual([]);
  });

  it('a card with no history and no origin just appears', () => {
    const { rerender } = render(<Board cards={[]} />);
    rerender(<Board cards={[{ id: 9, zone: 'table-me', x: 50, y: 50 }]} />);
    expect(flights).toEqual([]);
  });

  it('nothing flies when the scene changes (new round, round summary)', () => {
    const { rerender } = render(<Board cards={[{ id: 1, zone: 'hand-me', x: 300, y: 500 }]} />);
    rerender(<Board cards={[{ id: 1, zone: 'reveal-me', x: 20, y: 20 }]} scene="round1:summary" />);
    expect(flights).toEqual([]);
  });

  it('several cards moving in one commit each fly from their own spot', () => {
    const { rerender } = render(<Board cards={[
      { id: 1, zone: 'hand-me', x: 300, y: 500 }, { id: 2, zone: 'hand-me', x: 364, y: 500 },
    ]} />);
    rerender(<Board cards={[
      { id: 1, zone: 'table-me', x: 300, y: 620 }, { id: 2, zone: 'table-me', x: 360, y: 620 },
    ]} />);
    expect(flights.map((f) => [f.id, f.transform])).toEqual([
      ['1', 'translate(0px, -120px)'], ['2', 'translate(4px, -120px)'],
    ]);
  });

  it('a card moved again mid-flight cancels its flight and restarts from where it is', () => {
    const { rerender } = render(<Board cards={[{ id: 1, zone: 'pending-draw', x: 200, y: 400 }]} />);
    rerender(<Board cards={[{ id: 1, zone: 'hand-me', x: 300, y: 500 }]} />);
    // Same zone, but the node reports a mid-flight position before the next commit.
    rerender(<Board cards={[{ id: 1, zone: 'hand-me', x: 250, y: 450 }]} />);
    rerender(<Board cards={[{ id: 1, zone: 'table-me', x: 300, y: 620 }]} />);
    expect(flights.map((f) => f.transform)).toEqual(['translate(-100px, -100px)', 'translate(-50px, -170px)']);
  });

  it('a card shown twice at once keeps its registration when one copy unmounts', () => {
    // A pile top is also shown in the crab look-through; closing the overlay
    // must not lose the pile's own copy, or its next move wouldn't animate.
    const pileTop = { id: 3, zone: 'pile-0', x: 100, y: 200 };
    const overlay = { id: 3, zone: 'pile-0', x: 150, y: 600 };
    function Twice({ show, top }: { show: boolean; top: CardSpec }) {
      return (
        <SspFlipProvider origins={new Map()} scene="s">
          <Card key="pile" {...top} />
          {show && <Card key="overlay" {...overlay} />}
        </SspFlipProvider>
      );
    }
    const { rerender } = render(<Twice show top={pileTop} />);
    rerender(<Twice show={false} top={pileTop} />);
    rerender(<Twice show={false} top={{ ...pileTop, zone: 'hand-me', x: 300, y: 500 }} />);
    expect(flights).toEqual([expect.objectContaining({ id: '3', transform: 'translate(-200px, -300px)' })]);
  });
});
