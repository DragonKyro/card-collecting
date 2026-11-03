// Jaipur — the rule book shown from the lobby and in game ("📖 Rules").

import type { ReactNode } from 'react';
import { RulesBook, RulesGrid, RulesHero, RulesTile } from '@/ui/RulesBook';
import type { JaipurBonusSize } from './types';
import { BONUS_SIZES, BONUS_VALUES, CARD_COUNTS, CARD_INFO, CARD_TYPES, GOODS, TOKEN_VALUES } from './cards';
import { BonusTokenArt, CamelTokenArt, CardSvg, GoodsTokenArt, SealArt, TokenSvg, TypeIcon } from './art';

const ACCENT = '#c8506a';

function Tok({ children }: { children: ReactNode }) {
  return <TokenSvg className="jp-rules-token">{children}</TokenSvg>;
}

function MiniCard({ type }: { type: Parameters<typeof CardSvg>[0]['type'] }) {
  return <CardSvg type={type} className="jp-rules-card" />;
}

const BONUS_LABEL: Record<JaipurBonusSize, string> = { 3: '3 cards', 4: '4 cards', 5: '5 or more' };

export function Rules() {
  return (
    <RulesBook
      pages={[
        {
          title: 'Welcome to Jaipur',
          body: (
            <>
              <RulesHero
                title="Become the Maharaja's personal trader"
                subtitle="2 players · about 30 minutes · first to 2 Seals of Excellence wins"
                accent={ACCENT}
              />
              <p>
                You and your rival are the two most powerful traders in Jaipur. Each turn you either <strong>take
                cards</strong> from the market or <strong>sell</strong> goods from your hand for rupee tokens. Goods lose
                value as they are sold, so sell early for the best prices — or hold out for a big sale and its bonus.
              </p>
              <div className="jp-rules-row">
                {GOODS.map((g) => <MiniCard key={g} type={g} />)}
                <MiniCard type="camel" />
              </div>
              <p>
                The richest trader at the end of a round wins a <strong>Seal of Excellence</strong>. The first to win
                two seals (best of three rounds — changeable in the lobby) wins the match.
              </p>
              <RulesGrid cols={3}>
                <RulesTile icon={<Tok><SealArt earned /></Tok>} label="3 Seals" hint="Win 2 to win the match" accent="#e7b84a" />
                <RulesTile icon={<Tok><CamelTokenArt /></Tok>} label="Camel token" hint="5 rupees for the bigger herd" accent="#e2c58f" />
                <RulesTile icon={<Tok><BonusTokenArt size={5} /></Tok>} label="18 bonus tokens" hint="For selling 3, 4 or 5+ at once" accent="#7a2a4a" />
              </RulesGrid>
            </>
          ),
        },
        {
          title: 'Setting up a round',
          body: (
            <>
              <RulesHero title="The market" subtitle="Five face-up cards between the players" accent="#e9b52c" />
              <ol className="jp-rules-steps">
                <li>Put <strong>3 camels</strong> face up in the market.</li>
                <li>Shuffle the other 52 cards. Deal <strong>5 to each player</strong>.</li>
                <li>Turn <strong>2 more</strong> face up in the market, so it holds 5 cards. The rest is the face-down deck.</li>
                <li>Each player puts any camels from their hand face up in front of them — their <strong>herd</strong>.
                  Camels never sit in your hand.</li>
                <li>Line up each good's tokens most valuable first, so everyone can see the prices. Shuffle each size of
                  bonus token and stack it face down. Put the camel token next to them.</li>
              </ol>
              <p className="jp-rules-note">
                The app picks who starts round one at random. After that, the loser of each round starts the next.
              </p>
            </>
          ),
        },
        {
          title: 'Your turn: take or sell',
          body: (
            <>
              <RulesHero title="Do exactly one thing" subtitle="Take cards OR sell cards — never both" accent={ACCENT} />
              <RulesGrid cols={2}>
                <RulesTile icon={<TypeIcon type="diamond" size={30} />} label="Take one good" hint="One good from the market into your hand; the deck refills its spot." accent={CARD_INFO.diamond.color} />
                <RulesTile icon={<TypeIcon type="cloth" size={30} />} label="Take several goods (trade)" hint="Take 2 or more goods; put back as many cards from your hand and/or camels from your herd." accent={CARD_INFO.cloth.color} />
                <RulesTile icon={<TypeIcon type="camel" size={30} />} label="Take the camels" hint="Take ALL the camels in the market into your herd; the deck refills their spots." accent={CARD_INFO.camel.color} />
                <RulesTile icon={<Tok><GoodsTokenArt good="spice" value={5} /></Tok>} label="Sell" hint="Discard any number of ONE good from your hand and take that many of its tokens." accent={CARD_INFO.spice.color} />
              </RulesGrid>
              <p className="jp-rules-callout">
                <strong>Hand limit:</strong> you may never end your turn with more than <strong>7 cards</strong> in your
                hand. Camels in your herd don't count.
              </p>
            </>
          ),
        },
        {
          title: 'Taking cards',
          body: (
            <>
              <h4>Take several goods (a trade)</h4>
              <p>
                Take as many goods as you like (at least 2) from the market, then replace them with the <em>same
                number</em> of cards: goods from your hand, camels from your herd, or a mix.
              </p>
              <ul>
                <li>You can't trade a good for the same good — nothing you put back may be of a type you are taking.</li>
                <li>Camels can't be taken in a trade; they only come in with "take the camels".</li>
                <li>A trade never draws from the deck.</li>
              </ul>
              <p className="jp-rules-note">
                Example: the market shows 2 diamonds, a leather and 2 camels. You hand back 1 spice and 1 camel and
                take both diamonds.
              </p>
              <h4>Take one good</h4>
              <p>Take a single good (not a camel). The top card of the deck fills the gap. You need room in your hand.</p>
              <h4>Take the camels</h4>
              <p>
                Take <strong>every</strong> camel in the market into your herd; you can't take only some. The deck fills
                the gaps. Camels are trade currency and can win you the camel token, but taking them shows your rival
                new cards.
              </p>
            </>
          ),
        },
        {
          title: 'Selling cards',
          body: (
            <>
              <RulesHero title="Sell one type of good" subtitle="Discard the cards, take that many tokens off the top of its pile" accent={CARD_INFO.gold.color} />
              <ul>
                <li>Choose one good and sell as many cards of it as you like. The cards are discarded face up.</li>
                <li>Take one of that good's tokens per card, from the top. Prices only fall, so the first seller gets the most.</li>
                <li><strong>Diamonds, gold and silver</strong> must be sold <strong>at least 2 at a time</strong>.</li>
                <li>If a good's tokens run out, you can still sell it, but you get no tokens for it (you can still earn a bonus).</li>
              </ul>
              <h4>Bonus tokens</h4>
              <p>Selling 3 or more cards at once also earns a bonus token, drawn face down from the matching pile:</p>
              <div className="jp-rules-bonus">
                {BONUS_SIZES.map((size) => (
                  <div key={size} className="jp-rules-bonus-col">
                    <Tok><BonusTokenArt size={size} /></Tok>
                    <strong>{BONUS_LABEL[size]}</strong>
                    <span>{BONUS_VALUES[size].join(' · ')}</span>
                  </div>
                ))}
              </div>
              <p className="jp-rules-note">
                Keep your bonus tokens face down: your rival sees how many you have, not what they are worth. The app
                shows yours to you and hides your rival's until the round is scored.
              </p>
            </>
          ),
        },
        {
          title: 'End of a round',
          body: (
            <>
              <RulesHero title="The round ends immediately when…" accent="#8e1b2a" />
              <RulesGrid cols={2}>
                <RulesTile icon="🪙" label="3 goods piles are empty" hint="Any three of the six types of goods token are sold out." accent="#e7b84a" />
                <RulesTile icon="🂠" label="The deck runs out" hint="The market needs refilling and the deck can't fill it." accent="#8e1b2a" />
              </RulesGrid>
              <h4>Scoring</h4>
              <ol className="jp-rules-steps">
                <li>The player with <strong>more camels</strong> takes the camel token (5 rupees). On a tie, nobody does.</li>
                <li>Players reveal their tokens and add them up. The richer player wins a <strong>Seal of Excellence</strong>.</li>
                <li>Tied on rupees? The player with more <strong>bonus tokens</strong> wins. Still tied? More <strong>goods tokens</strong>.
                  (If even that is tied, nobody gets a seal and you play another round.)</li>
              </ol>
              <p>
                Shuffle everything for the next round; only seals carry over. The <strong>loser of the round starts</strong> the
                next one. The first player with 2 seals wins.
              </p>
            </>
          ),
        },
        {
          title: 'Reference: cards and tokens',
          body: (
            <>
              <table className="tight jp-rules-table">
                <thead>
                  <tr><th>Card</th><th className="num">Cards</th><th>Tokens (top first)</th><th className="num">Total</th></tr>
                </thead>
                <tbody>
                  {CARD_TYPES.map((t) => (
                    <tr key={t}>
                      <td><span className="jp-rules-type"><TypeIcon type={t} /> {CARD_INFO[t].label}</span></td>
                      <td className="num">{CARD_COUNTS[t]}</td>
                      <td>{t === 'camel' ? '— (camel token: 5 to the bigger herd)' : TOKEN_VALUES[t].join(' · ')}</td>
                      <td className="num">{t === 'camel' ? 5 : TOKEN_VALUES[t].reduce((a, b) => a + b, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <table className="tight jp-rules-table" style={{ marginTop: 12 }}>
                <thead><tr><th>Bonus</th><th className="num">Tokens</th><th>Values</th><th className="num">Average</th></tr></thead>
                <tbody>
                  {BONUS_SIZES.map((s) => (
                    <tr key={s}>
                      <td>×{s} ({BONUS_LABEL[s]})</td>
                      <td className="num">{BONUS_VALUES[s].length}</td>
                      <td>{BONUS_VALUES[s].join(' · ')}</td>
                      <td className="num">{(BONUS_VALUES[s].reduce((a, b) => a + b, 0) / BONUS_VALUES[s].length).toFixed(1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="jp-rules-note">55 cards in all. The market always holds 5 cards; hands hold at most 7.</p>
            </>
          ),
        },
        {
          title: 'Tips and playing here',
          body: (
            <>
              <h4>Strategy</h4>
              <ul>
                <li>Diamonds, gold and silver are worth the most but come in pairs at least. Sell them before your rival does.</li>
                <li>A big sale of cheap goods (cloth, spice, leather) can beat a small sale of precious ones once you add the bonus.</li>
                <li>Camels pay for trades. Taking many at once can win the camel token, but it refills the market for your rival.</li>
                <li>Watch what your rival takes. If they are collecting a good, sell yours first or leave it out of the market.</li>
                <li>Count the empty piles. When two are gone, whoever empties the third ends the round, so do it while you lead.</li>
              </ul>
              <h4>Controls</h4>
              <ul>
                <li><strong>Take one:</strong> click a good in the market, then <em>Take</em>.</li>
                <li><strong>Camels:</strong> click any camel in the market (they're selected together), then <em>Take camels</em>.</li>
                <li><strong>Trade:</strong> click the goods to take in the market, then the same number of cards in your hand
                  and/or camels in your herd, then <em>Trade</em>.</li>
                <li><strong>Sell:</strong> click cards of one good in your hand, then <em>Sell</em> — or use the quick-sell buttons.</li>
              </ul>
              <p className="jp-rules-note">
                Goods your rival takes from the market go into their hand face down. Remembering what they hold is part
                of the game; the AI remembers everything it has seen them take.
              </p>
            </>
          ),
        },
      ]}
    />
  );
}
