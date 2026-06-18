// Paginated rules viewer used inside the Rules modal. Each game's Rules
// component composes a <RulesBook pages={[...]} /> with React content per page.
// The book renders one page at a time with prev/next + a clickable page-dot row,
// so each card-art / scoring table / overview section gets its own focused
// spread (Catan-inspired).

import { useState, type ReactNode } from 'react';

export interface RulesPage {
  /** Short title shown in the header + reader's dot-row tooltip. */
  title: string;
  /** Body content for the page. */
  body: ReactNode;
}

export function RulesBook({ pages }: { pages: RulesPage[] }) {
  const [idx, setIdx] = useState(0);
  const safeIdx = Math.max(0, Math.min(idx, pages.length - 1));
  const page = pages[safeIdx];
  return (
    <div className="rules-book">
      <div className="rules-book-header">
        <span className="rules-book-page-no">
          {safeIdx + 1} / {pages.length}
        </span>
        <h4 className="rules-book-title">{page.title}</h4>
      </div>
      <div className="rules-book-body">{page.body}</div>
      <div className="rules-book-nav">
        <button
          className="secondary"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={safeIdx === 0}
        >
          ← Prev
        </button>
        <div className="rules-book-dots">
          {pages.map((p, i) => (
            <button
              key={i}
              className={`rules-book-dot ${i === safeIdx ? 'active' : ''}`}
              title={p.title}
              onClick={() => setIdx(i)}
              aria-label={`Go to page ${i + 1}: ${p.title}`}
            />
          ))}
        </div>
        <button
          className="secondary"
          onClick={() => setIdx((i) => Math.min(pages.length - 1, i + 1))}
          disabled={safeIdx === pages.length - 1}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

/** Small visual building block — a colored hero strip at the top of a page. */
export function RulesHero({
  title, subtitle, accent = 'var(--accent)',
}: { title: string; subtitle?: string; accent?: string }) {
  return (
    <div className="rules-hero" style={{ background: accent }}>
      <strong>{title}</strong>
      {subtitle && <span>{subtitle}</span>}
    </div>
  );
}

/** A 2-column grid for visual side-by-side comparisons (icon + text). */
export function RulesGrid({ cols = 2, children }: { cols?: 2 | 3 | 4; children: ReactNode }) {
  return <div className={`rules-grid rules-grid-${cols}`}>{children}</div>;
}

/** A single card in a RulesGrid. `accent` paints a left edge or top swatch. */
export function RulesTile({
  icon, label, hint, accent,
}: {
  icon?: ReactNode;
  label: ReactNode;
  hint?: ReactNode;
  accent?: string;
}) {
  return (
    <div className="rules-tile" style={accent ? { borderLeftColor: accent } : undefined}>
      {icon && <div className="rules-tile-icon">{icon}</div>}
      <div className="rules-tile-text">
        <div className="rules-tile-label">{label}</div>
        {hint && <div className="rules-tile-hint">{hint}</div>}
      </div>
    </div>
  );
}
