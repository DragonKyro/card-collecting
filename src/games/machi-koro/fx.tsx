// Animation layer, driven by the match log.
//
// Elements register as named anchors (`useFx().anchor(key)`):
//   bank · coins:<pid> · market:<cardId> · city:<pid>:<cardId> · lm:<pid>:<lmId>
// After every commit the provider snapshots every anchor's page rect. When new
// log entries arrive it animates them against two layouts: the previous
// snapshot (where things were — e.g. the market slot a bought card left) and
// the live DOM (where they are now):
//   - coins: coin sprites arc from the payer (or the bank) to the payee, the
//     card that paid out pulses, and +N / −N labels float up;
//   - build / exchange / gift: a ghost of the card flies from its old spot to
//     its new one (a brand-new town stack stays hidden until it lands);
//   - extra turns, wins, the end of the opening rounds: a toast.
// Coin animations wait for the dice to finish tumbling when the same batch
// holds a roll. Web Animations API throughout (so it never fights React over
// classes or styles); everything is skipped under prefers-reduced-motion,
// in environments without Element.animate, and for big jumps in the log (a
// snapshot on join).

import {
  createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { PlayerId } from '@/core/types';
import type { MkLogEntry, MkState } from './types';
import { CardFace, CoinIcon } from './Card';

export const DICE_MS = 650;
const COIN_MS = 620;
const CARD_MS = 720;

interface Rect { x: number; y: number; w: number; h: number }

type Flight =
  | { id: number; kind: 'coin'; from: Rect; to: Rect; delay: number }
  | { id: number; kind: 'card'; cardId: string; from: Rect; to: Rect; delay: number; reveal?: HTMLElement }
  | { id: number; kind: 'float'; at: Rect; text: string; tone: 'gain' | 'loss' | 'info'; delay: number }
  | { id: number; kind: 'toast'; text: string; delay: number };

type NewFlight = Flight extends infer F ? (F extends Flight ? Omit<F, 'id'> : never) : never;

interface FxApi {
  anchor(key: string): (el: HTMLElement | null) => void;
}

const FxContext = createContext<FxApi>({ anchor: () => () => {} });

export function useFx(): FxApi {
  return useContext(FxContext);
}

function pageRect(el: HTMLElement): Rect {
  const r = el.getBoundingClientRect();
  return { x: r.left + window.scrollX, y: r.top + window.scrollY, w: r.width, h: r.height };
}

function canAnimate(): boolean {
  if (typeof window === 'undefined' || typeof Element === 'undefined') return false;
  if (typeof Element.prototype.animate !== 'function') return false;
  return !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function FxProvider({ state, nameOf, children }: {
  state: MkState;
  nameOf: (id: PlayerId | null) => string;
  children: ReactNode;
}) {
  const anchors = useRef(new Map<string, HTMLElement>());
  const callbacks = useRef(new Map<string, (el: HTMLElement | null) => void>());
  const snapshot = useRef(new Map<string, Rect>());
  const seen = useRef(state.logSeq);
  const nextId = useRef(1);
  const [flights, setFlights] = useState<Flight[]>([]);

  const api = useMemo<FxApi>(() => ({
    anchor(key) {
      let cb = callbacks.current.get(key);
      if (!cb) {
        cb = (el) => {
          if (el) anchors.current.set(key, el);
          else anchors.current.delete(key);
        };
        callbacks.current.set(key, cb);
      }
      return cb;
    },
  }), []);

  const done = useCallback((id: number) => setFlights((fs) => fs.filter((f) => f.id !== id)), []);

  useLayoutEffect(() => {
    const fresh = state.log.filter((e) => e.seq > seen.current);
    seen.current = state.logSeq;
    if (fresh.length > 0 && fresh.length < 80 && canAnimate()) {
      const add = plan(fresh, {
        before: (k) => snapshot.current.get(k) ?? null,
        now: (k) => {
          const el = anchors.current.get(k);
          return el ? pageRect(el) : null;
        },
        el: (k) => anchors.current.get(k) ?? null,
        existedBefore: (k) => snapshot.current.has(k),
        nameOf,
      });
      if (add.length) {
        setFlights((fs) => [...fs, ...add.map((f) => ({ ...f, id: nextId.current++ }) as Flight)]);
      }
    }
    const next = new Map<string, Rect>();
    for (const [k, el] of anchors.current) next.set(k, pageRect(el));
    snapshot.current = next;
  });

  // Keep the snapshot honest when the page reflows without a commit.
  useEffect(() => {
    const refresh = () => {
      const next = new Map<string, Rect>();
      for (const [k, el] of anchors.current) next.set(k, pageRect(el));
      snapshot.current = next;
    };
    window.addEventListener('resize', refresh);
    return () => window.removeEventListener('resize', refresh);
  }, []);

  return (
    <FxContext.Provider value={api}>
      {children}
      {typeof document !== 'undefined' && createPortal(
        <div className="mk-fx-layer" aria-hidden="true">
          {flights.map((f) => <FlightView key={f.id} f={f} edition={state.config.edition} onDone={done} />)}
        </div>,
        document.body,
      )}
    </FxContext.Provider>
  );
}

interface Layouts {
  before(key: string): Rect | null;
  now(key: string): Rect | null;
  el(key: string): HTMLElement | null;
  existedBefore(key: string): boolean;
  nameOf(id: PlayerId | null): string;
}

function sourceKey(e: Extract<MkLogEntry, { kind: 'coins' }>): string | null {
  if (e.source.type === 'est') return `city:${e.source.ownerId}:${e.source.id}`;
  if (e.source.type === 'lm') return `lm:${e.source.ownerId}:${e.source.id}`;
  return null;
}

/** Turn a batch of log entries into flights (and fire pulses directly). */
function plan(entries: MkLogEntry[], L: Layouts): NewFlight[] {
  const out: NewFlight[] = [];
  let t = entries.some((e) => e.kind === 'roll') ? DICE_MS : 0;
  const pulsed = new Set<string>();
  const pulse = (key: string | null, delay: number) => {
    if (!key || pulsed.has(key)) return;
    pulsed.add(key);
    const el = L.el(key);
    el?.animate(
      [
        { transform: 'translateY(0) scale(1)', filter: 'brightness(1)' },
        { transform: 'translateY(-6px) scale(1.1)', filter: 'brightness(1.2) drop-shadow(0 0 10px #ffd54a)', offset: 0.4 },
        { transform: 'translateY(0) scale(1)', filter: 'brightness(1)' },
      ],
      { duration: 700, delay, easing: 'ease-out' },
    );
  };
  const cardFlight = (cardId: string, fromKey: string, toKey: string, delay: number) => {
    const from = L.before(fromKey);
    const to = L.now(toKey);
    if (!from || !to) { pulse(toKey, delay); return; }
    const reveal = !L.existedBefore(toKey) ? L.el(toKey) ?? undefined : undefined;
    if (reveal) reveal.style.visibility = 'hidden';
    out.push({ kind: 'card', cardId, from, to, delay, reveal });
  };

  for (const e of entries) {
    switch (e.kind) {
      case 'coins': {
        const toKey = `coins:${e.to}`;
        const fromKey = e.from ? `coins:${e.from}` : 'bank';
        pulse(sourceKey(e), t);
        const from = L.now(fromKey);
        const to = L.now(toKey);
        if (from && to && e.amount > 0) {
          const n = Math.min(5, e.amount);
          for (let i = 0; i < n; i++) out.push({ kind: 'coin', from, to, delay: t + i * 70 });
        }
        if (to && e.amount > 0) out.push({ kind: 'float', at: to, text: `+${e.amount}`, tone: 'gain', delay: t + COIN_MS - 120 });
        if (e.from && from) {
          const text = e.amount < e.owed ? `−${e.amount} (owed ${e.owed})` : `−${e.amount}`;
          out.push({ kind: 'float', at: from, text, tone: 'loss', delay: t });
        }
        t += 180;
        break;
      }
      case 'build': {
        const toKey = e.landmark ? `lm:${e.playerId}:${e.cardId}` : `city:${e.playerId}:${e.cardId}`;
        const fromKey = L.before(`market:${e.cardId}`) ? `market:${e.cardId}` : toKey;
        cardFlight(e.cardId, fromKey, toKey, t);
        const payer = L.now(`coins:${e.playerId}`);
        const bank = L.now('bank');
        if (payer && bank && e.cost > 0) {
          for (let i = 0; i < Math.min(4, e.cost); i++) out.push({ kind: 'coin', from: payer, to: bank, delay: t + i * 60 });
          out.push({ kind: 'float', at: payer, text: `−${e.cost}`, tone: 'loss', delay: t });
        }
        if (e.landmark) {
          out.push({ kind: 'toast', text: `${L.nameOf(e.playerId)} built a landmark!`, delay: t + 200 });
          pulse(toKey, t + CARD_MS);
        }
        t += 300;
        break;
      }
      case 'exchange':
        cardFlight(e.gave, `city:${e.playerId}:${e.gave}`, `city:${e.withId}:${e.gave}`, t);
        cardFlight(e.took, `city:${e.withId}:${e.took}`, `city:${e.playerId}:${e.took}`, t + 120);
        t += 400;
        break;
      case 'gift':
        cardFlight(e.cardId, `city:${e.playerId}:${e.cardId}`, `city:${e.toId}:${e.cardId}`, t);
        out.push({ kind: 'toast', text: `Moving Company: ${L.nameOf(e.playerId)} gives a card to ${L.nameOf(e.toId)}`, delay: t });
        t += 400;
        break;
      case 'redistribute':
        out.push({ kind: 'toast', text: `Park: everyone now has ${e.each} coins`, delay: t });
        t += 300;
        break;
      case 'extraTurn':
        out.push({ kind: 'toast', text: `${L.nameOf(e.playerId)} takes another turn!`, delay: t + 300 });
        break;
      case 'setupDone':
        out.push({ kind: 'toast', text: 'Opening rounds over — time to roll!', delay: t });
        break;
      case 'win':
        out.push({ kind: 'toast', text: e.reason === 'launchPad' ? `🚀 ${L.nameOf(e.playerId)} launches and wins!` : `🏆 ${L.nameOf(e.playerId)} wins!`, delay: t + 400 });
        break;
      default:
        break;
    }
  }
  return out;
}

function FlightView({ f, edition, onDone }: { f: Flight; edition: MkState['config']['edition']; onDone: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    let anim: Animation;
    if (f.kind === 'coin') {
      const dx = f.to.x + f.to.w / 2 - (f.from.x + f.from.w / 2);
      const dy = f.to.y + f.to.h / 2 - (f.from.y + f.from.h / 2);
      const lift = Math.min(90, 30 + Math.hypot(dx, dy) * 0.18);
      anim = el.animate(
        [
          { transform: 'translate(0, 0) scale(0.6)', opacity: 0 },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - lift}px) scale(1.15)`, opacity: 1, offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) scale(0.75)`, opacity: 0.4 },
        ],
        { duration: COIN_MS, delay: f.delay, easing: 'cubic-bezier(.3,.6,.4,1)', fill: 'both' },
      );
    } else if (f.kind === 'card') {
      const dx = f.to.x - f.from.x;
      const dy = f.to.y - f.from.y;
      const s = f.from.w > 0 ? f.to.w / f.from.w : 1;
      anim = el.animate(
        [
          { transform: 'translate(0, 0) scale(1) rotate(0deg)', boxShadow: '0 4px 10px rgba(0,0,0,.3)' },
          { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 40}px) scale(${(1 + s) / 2 + 0.08}) rotate(-4deg)`, boxShadow: '0 18px 30px rgba(0,0,0,.45)', offset: 0.5 },
          { transform: `translate(${dx}px, ${dy}px) scale(${s}) rotate(0deg)`, boxShadow: '0 2px 4px rgba(0,0,0,.2)' },
        ],
        { duration: CARD_MS, delay: f.delay, easing: 'cubic-bezier(.25,.8,.3,1)', fill: 'both' },
      );
    } else if (f.kind === 'float') {
      anim = el.animate(
        [
          { transform: 'translate(-50%, 0)', opacity: 0 },
          { transform: 'translate(-50%, -10px)', opacity: 1, offset: 0.2 },
          { transform: 'translate(-50%, -38px)', opacity: 0 },
        ],
        { duration: 1100, delay: f.delay, easing: 'ease-out', fill: 'both' },
      );
    } else {
      anim = el.animate(
        [
          { transform: 'translate(-50%, -12px)', opacity: 0 },
          { transform: 'translate(-50%, 0)', opacity: 1, offset: 0.12 },
          { transform: 'translate(-50%, 0)', opacity: 1, offset: 0.85 },
          { transform: 'translate(-50%, -8px)', opacity: 0 },
        ],
        { duration: 1900, delay: f.delay, easing: 'ease-out', fill: 'both' },
      );
    }
    const finish = () => {
      if (f.kind === 'card' && f.reveal) f.reveal.style.visibility = '';
      onDone(f.id);
    };
    anim.onfinish = finish;
    return () => {
      anim.onfinish = null;
      anim.cancel();
      if (f.kind === 'card' && f.reveal) f.reveal.style.visibility = '';
    };
    // Each flight animates exactly once, on mount.
  }, []);

  switch (f.kind) {
    case 'coin':
      return (
        <div ref={ref} className="mk-fx-coin" style={{ left: f.from.x + f.from.w / 2 - 11, top: f.from.y + f.from.h / 2 - 11 }}>
          <CoinIcon size={22} />
        </div>
      );
    case 'card':
      return (
        <div ref={ref} className="mk-fx-card" style={{ left: f.from.x, top: f.from.y, width: f.from.w, height: f.from.h }}>
          <CardFace edition={edition} cardId={f.cardId} size={f.from.w > 90 ? 'lg' : 'sm'} />
        </div>
      );
    case 'float':
      return (
        <div ref={ref} className={`mk-fx-float ${f.tone}`} style={{ left: f.at.x + f.at.w / 2, top: f.at.y - 6 }}>
          {f.text}
        </div>
      );
    case 'toast':
      return <div ref={ref} className="mk-fx-toast">{f.text}</div>;
  }
}

/** A number that eases towards its value (coin counters), after `delay` ms. */
export function TweenedNumber({ value, delay = 450 }: { value: number; delay?: number }) {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  useEffect(() => {
    if (shownRef.current === value) return;
    if (!canAnimate()) { shownRef.current = value; setShown(value); return; }
    const from = shownRef.current;
    let raf = 0;
    const start = performance.now() + delay;
    const step = (now: number) => {
      const k = Math.max(0, Math.min(1, (now - start) / 500));
      const v = Math.round(from + (value - from) * k);
      if (v !== shownRef.current) { shownRef.current = v; setShown(v); }
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      shownRef.current = value;
    };
  }, [value, delay]);
  return <>{shown}</>;
}
