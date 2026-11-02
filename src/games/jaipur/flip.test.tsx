import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render } from '@testing-library/react';
import { JaipurFlipProvider, useFlip, useFlipAnchor } from './flip';

// jsdom has no layout and no Web Animations: each test node reports its
// position and size in data attributes, and animate() is recorded.

interface Flight { key: string; frames: Keyframe[]; delay: number }
let flights: Flight[];
const realRect = Element.prototype.getBoundingClientRect;

beforeEach(() => {
  flights = [];
  Element.prototype.getBoundingClientRect = function (this: Element) {
    const el = this as HTMLElement;
    return new DOMRect(Number(el.dataset.x ?? 0), Number(el.dataset.y ?? 0), Number(el.dataset.w ?? 84), Number(el.dataset.h ?? 118));
  };
  (Element.prototype as unknown as { animate: unknown }).animate = function (this: HTMLElement, frames: Keyframe[], opts: KeyframeAnimationOptions) {
    flights.push({ key: this.dataset.key ?? '?', frames, delay: Number(opts.delay ?? 0) });
    return { cancel: vi.fn() } as unknown as Animation;
  };
});

afterEach(() => {
  Element.prototype.getBoundingClientRect = realRect;
  delete (Element.prototype as unknown as { animate?: unknown }).animate;
});

interface ItemSpec { k: string; zone: string; x: number; y: number; w?: number; h?: number }

function Item({ k, zone, x, y, w, h }: ItemSpec) {
  return <div ref={useFlip(k, zone)} data-key={k} data-x={x} data-y={y} data-w={w} data-h={h} />;
}

function Anchor() {
  return <div ref={useFlipAnchor('deck')} data-x={10} data-y={300} />;
}

function Board({ items, origins = new Map(), scene = 's' }: { items: ItemSpec[]; origins?: Map<string, string>; scene?: string }) {
  return (
    <JaipurFlipProvider origins={origins} scene={scene}>
      <Anchor />
      {items.map((it) => <Item key={`${it.zone}:${it.k}`} {...it} />)}
    </JaipurFlipProvider>
  );
}

describe('jaipur flights', () => {
  it('an item changing zone flies from where it was, scaling from its old size', () => {
    const { rerender } = render(<Board items={[{ k: 'c1', zone: 'hand-p1', x: 100, y: 20, w: 42, h: 59 }]} />);
    rerender(<Board items={[{ k: 'c1', zone: 'market', x: 300, y: 200 }]} />);
    expect(flights).toHaveLength(1);
    expect(flights[0].frames[0].transform).toBe('translate(-200px, -180px) scale(0.5, 0.5)');
    expect(flights[0].frames.at(-1)!.transform).toBe('none');
  });

  it('nothing flies inside a zone, or on a scene change', () => {
    const { rerender } = render(<Board items={[{ k: 'c1', zone: 'market', x: 300, y: 200 }]} />);
    rerender(<Board items={[{ k: 'c1', zone: 'market', x: 400, y: 200 }]} />);
    rerender(<Board items={[{ k: 'c1', zone: 'hand-me', x: 400, y: 500 }]} scene="other" />);
    expect(flights).toEqual([]);
  });

  it('a card turned up from the deck flies in from the deck and turns over', () => {
    const { rerender } = render(<Board items={[]} origins={new Map([['c7', 'deck']])} />);
    rerender(<Board items={[{ k: 'c7', zone: 'market', x: 210, y: 300 }]} />);
    expect(flights).toHaveLength(1);
    expect(flights[0].frames).toHaveLength(3);
    expect(String(flights[0].frames[0].transform)).toContain('translate(-200px, 0px)');
    expect(String(flights[0].frames[0].transform)).toContain('scaleX(0.05)');
  });

  it('items landing in one zone together are staggered', () => {
    const before = [0, 1, 2].map((i) => ({ k: `t${i}`, zone: 'pile-cloth', x: 600 + i * 22, y: 40, w: 22, h: 22 }));
    const after = [0, 1, 2].map((i) => ({ k: `t${i}`, zone: 'tokens-me', x: 100 + i * 26, y: 600, w: 25, h: 25 }));
    const { rerender } = render(<Board items={before} />);
    rerender(<Board items={after} />);
    expect(flights.map((f) => f.delay)).toEqual([0, 70, 140]);
  });
});
