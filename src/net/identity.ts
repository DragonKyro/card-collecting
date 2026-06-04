// Stable per-device identity. Trystero's peerId is volatile across reloads,
// so we mint a UUID into localStorage and exchange it on the hello channel.
// `?fresh` in the URL switches to sessionStorage so two browser windows in the
// same profile can act as different identities for local multiplayer testing.

const KEY = 'card-collecting.uuid';

function storage(): Storage {
  if (typeof window === 'undefined') {
    return {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
      clear: () => {},
      key: () => null,
      length: 0,
    } as Storage;
  }
  if (window.location.search.includes('fresh')) return window.sessionStorage;
  return window.localStorage;
}

export function getOrCreateUuid(): string {
  const s = storage();
  let id = s.getItem(KEY);
  if (!id) {
    id = crypto.randomUUID();
    s.setItem(KEY, id);
  }
  return id;
}
