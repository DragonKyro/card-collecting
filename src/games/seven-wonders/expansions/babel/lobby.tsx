// Babel — lobby blurbs (no art: they load with the module).

export function TowerLobbySection() {
  return (
    <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
      Draft 3 law tiles before Age I. Instead of building or selling, discard a card (or a leader) to put
      one of your tiles on the tower: its rule changes the game for everyone until another tile covers it.
      1 / 2 / 3 tiles built score 2 / 5 / 10 VP.
    </p>
  );
}

export function ProjectsLobbySection() {
  return (
    <p style={{ fontSize: 12, color: 'var(--fg-muted)', margin: '4px 0 0' }}>
      One Great Project per Age. Build a card of its colour and pay its cost to take a participation
      token. All tokens taken by the end of the Age: each participant gets the reward. Otherwise everyone
      without a token suffers the penalty.
    </p>
  );
}
