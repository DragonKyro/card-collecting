// Cities expansion — the 'debt' overlay: a coin loss to settle. Each loser
// chooses how many coins to pay; every coin not paid becomes a debt token.
// Lazily loaded (it draws with the game's art).

import { useEffect, useState } from 'react';
import type { SwOverlayProps } from '../types';
import { CoinIcon, DebtIcon } from '../../art';
import { owingDebt } from './index';

export function DebtOverlay({ state, localPlayerId, dispatch }: SwOverlayProps) {
  const owing = owingDebt(state);
  const me = state.players.find((p) => p.id === localPlayerId);
  const owed = me ? state.pendingLosses?.[me.id] ?? 0 : 0;
  const max = me ? Math.min(owed, me.coins) : 0;
  const [coins, setCoins] = useState(max);
  useEffect(() => setCoins(max), [max]);
  const names = owing.map((id) => state.seats.find((s) => s.id === id)?.name ?? id);

  if (!me || owed <= 0) {
    return (
      <div className="sw-panel sw-hand-area">
        <h3><span className="sw-h-icon"><DebtIcon size={20} /> Coin losses</span></h3>
        <p className="sw-hint">{names.join(', ')} {names.length === 1 ? 'is' : 'are'} settling a coin loss: coins to the bank, or debt tokens (−1 VP each).</p>
      </div>
    );
  }
  return (
    <div className="sw-panel sw-hand-area sw-debt">
      <h3>
        <span className="sw-h-icon"><DebtIcon size={20} /> You lose {owed} coin{owed === 1 ? '' : 's'}</span>
        <span className="sw-hint">You have <CoinIcon n={me.coins} size={16} /></span>
      </h3>
      <p className="sw-hint">Pay what you like to the bank; you take a debt token (−1 VP at the end) for every coin you don't pay.</p>
      <div className="sw-plan-row">
        <label>
          Pay{' '}
          <input
            type="number" min={0} max={max} value={coins}
            onChange={(e) => setCoins(Math.max(0, Math.min(max, Math.floor(Number(e.target.value) || 0))))}
            style={{ width: 56 }}
            aria-label="Coins to pay"
          />
          {' '}coin{coins === 1 ? '' : 's'}
        </label>
        <span>→ {owed - coins} debt token{owed - coins === 1 ? '' : 's'}</span>
      </div>
      <div className="sw-actions">
        <button onClick={() => dispatch({ type: 'settleDebt', playerId: me.id, coins })}>Confirm</button>
        {max > 0 && coins !== max && <button className="secondary" onClick={() => setCoins(max)}>Pay all I can</button>}
      </div>
    </div>
  );
}
