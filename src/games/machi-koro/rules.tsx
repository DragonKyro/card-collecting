// In-game rulebook (the lobby's / game's "Rules" button).

import { RulesBook, RulesGrid, RulesHero, RulesTile } from '@/ui/RulesBook';
import type { MkEstablishmentDef, MkLandmarkDef } from './types';
import { EDITIONS, EXPANSIONS, activationLabel, rollChance } from './cards';
import { COLOR_HEX, TIMING_LABEL } from './Card';
import { CardArt, SymbolIcon } from './art';

/** `perPlayerPurples`: MK1 puts out one of each purple per player. */
function EstTable({ defs: all, perPlayerPurples = false }: { defs: MkEstablishmentDef[]; perPlayerPurples?: boolean }) {
  const defs = [...all].sort((a, b) => a.activation[0] - b.activation[0]);
  return (
    <table className="tight mk-rules-table">
      <thead>
        <tr><th>Roll</th><th>Establishment</th><th className="num">Cost</th><th className="num">Copies</th><th>Effect</th></tr>
      </thead>
      <tbody>{defs.map((d) => <EstRow key={d.id} d={d} perPlayer={perPlayerPurples && d.color === 'purple'} />)}</tbody>
    </table>
  );
}

function EstRow({ d, perPlayer }: { d: MkEstablishmentDef; perPlayer: boolean }) {
  return (
    <tr>
      <td className="num"><b>{activationLabel(d.activation)}</b></td>
      <td>
        <span className="mk-rules-card">
          <span className="mk-rules-thumb" style={{ borderColor: COLOR_HEX[d.color] }}><CardArt art={d.art} /></span>
          <span>
            <span style={{ color: COLOR_HEX[d.color], fontWeight: 600 }}>{d.name}</span>
            {d.symbol !== 'none' && <> <SymbolIcon symbol={d.symbol} size={13} /></>}
            <br /><span className="muted">{TIMING_LABEL[d.color]}</span>
          </span>
        </span>
      </td>
      <td className="num">{d.cost}</td>
      <td className="num">{perPlayer ? '1 each' : d.copies}</td>
      <td className="muted">{d.text.replace(/ \(.*\)$/, '')}</td>
    </tr>
  );
}

function LmTable({ defs: all }: { defs: MkLandmarkDef[] }) {
  const defs = [...all].sort((a, b) => Number(!!a.promo) - Number(!!b.promo) || a.name.localeCompare(b.name));
  return (
    <table className="tight mk-rules-table">
      <thead><tr><th>Landmark</th><th>Cost</th><th>Applies to</th><th>Effect</th></tr></thead>
      <tbody>{defs.map((d) => <LmRow key={d.id} d={d} />)}</tbody>
    </table>
  );
}

function LmRow({ d }: { d: MkLandmarkDef }) {
  const scope = d.timing === 'immediate' ? 'Builder, once' : d.scope === 'everyone' ? 'Everyone' : 'Builder';
  return (
    <tr>
      <td>
        <span className="mk-rules-card">
          <span className="mk-rules-thumb" style={{ borderColor: COLOR_HEX.landmark }}><CardArt art={d.art} /></span>
          <span style={{ fontWeight: 600 }}>{d.name}{d.promo && <span className="muted"> (promo)</span>}</span>
        </span>
      </td>
      <td className="num">{d.costs.join(' / ')}</td>
      <td>{scope}</td>
      <td className="muted">{d.text}</td>
    </tr>
  );
}

function OddsTable() {
  const pct = (p: number) => (p === 0 ? '—' : `${(p * 100).toFixed(1)}%`);
  return (
    <table className="tight mk-rules-table mk-odds">
      <thead>
        <tr><th>Total</th>{Array.from({ length: 12 }, (_, i) => <th key={i} className="num">{i + 1}</th>)}</tr>
      </thead>
      <tbody>
        <tr><td>1 die</td>{Array.from({ length: 12 }, (_, i) => <td key={i} className="num">{pct(rollChance(i + 1, 1))}</td>)}</tr>
        <tr><td>2 dice</td>{Array.from({ length: 12 }, (_, i) => <td key={i} className="num">{pct(rollChance(i + 1, 2))}</td>)}</tr>
      </tbody>
    </table>
  );
}

export function Rules() {
  return (
    <RulesBook
      pages={[
        {
          title: 'Overview',
          body: (
            <>
              <RulesHero
                title="Machi Koro 2"
                subtitle="Roll the dice, collect coins, grow your town. First to 3 landmarks wins."
                accent="linear-gradient(135deg, #2f7fd1 0%, #3b9b4a 45%, #e98a1c 100%)"
              />
              <p>
                You’re the new mayor of a small town. Build establishments that pay out when the dice
                show their number, take coins off your rivals, and build <b>3 landmarks</b> before
                anyone else — or build the <b>Launch Pad</b> and win on the spot.
              </p>
              <p>
                This game plays <b>Machi Koro 2</b> (2–5 players) by default. The lobby can switch to
                the original <b>Machi Koro</b> base game (2–4 players) — see the last page.
              </p>
              <h3>Setup</h3>
              <ul>
                <li>Everyone starts with <b>5 coins</b> and an empty town.</li>
                <li>
                  The market has three rows of five: establishments that activate on <b>1–6</b>,
                  establishments that activate on <b>7+</b>, and <b>landmarks</b>. Each row is dealt from
                  its own shuffled deck until it shows 5 <i>different</i> cards — a duplicate goes on top of
                  its twin as a stack.
                </li>
                <li>
                  <b>Opening rounds:</b> before anyone rolls, play 3 rounds where each player may build one
                  establishment (or skip). No dice, no income.
                </li>
              </ul>
            </>
          ),
        },
        {
          title: 'Your turn',
          body: (
            <>
              <RulesGrid cols={3}>
                <RulesTile icon="🎲" label="1. Roll" hint="Roll 1 or 2 dice — your choice, every turn. Only the total matters." accent="#6aa0ff" />
                <RulesTile icon="🪙" label="2. Earn income" hint="Every establishment (anyone's!) showing the total activates, in colour order." accent="#f2c230" />
                <RulesTile icon="🏗️" label="3. Build" hint="Build one establishment or one landmark from the market — or nothing." accent="#3b9b4a" />
              </RulesGrid>
              <h3>Income order</h3>
              <ol>
                <li><b style={{ color: COLOR_HEX.red }}>Red</b> — opponents’ restaurants take coins from you, the roller. They’re paid counter-clockwise (the player on your right first), each in full before the next.</li>
                <li><b style={{ color: COLOR_HEX.blue }}>Blue</b> (everyone’s) and <b style={{ color: COLOR_HEX.green }}>green</b> (yours) — paid by the bank.</li>
                <li><b style={{ color: COLOR_HEX.purple }}>Purple</b> — your major establishments.</li>
                <li><b style={{ color: COLOR_HEX.landmark }}>Landmarks</b> that react to the roll (Tech Startup, Temple, City Hall…).</li>
              </ol>
              <p>
                <b>Every copy activates.</b> Three Bakeries on a 2 pay three times. If you owe more than
                you have, pay what you can — the rest is lost; the bank never makes it up.
              </p>
              <h3>Building</h3>
              <ul>
                <li>An establishment costs the coin price in its corner. A landmark costs the price for your 1st, 2nd or 3rd landmark.</li>
                <li>If you have <b>no coins</b> when you reach the build step, take 1 from the bank first.</li>
                <li>When a stack in the market runs out, deal from that row’s deck until it shows five different cards again. Once a deck is empty its row just shrinks.</li>
              </ul>
            </>
          ),
        },
        {
          title: 'Card colours',
          body: (
            <>
              <RulesGrid cols={2}>
                <RulesTile icon="🔵" label="Blue — primary industry" hint="Activates on anyone’s turn. Coins from the bank." accent={COLOR_HEX.blue} />
                <RulesTile icon="🟢" label="Green — secondary industry" hint="Your turn only. Coins from the bank; combo cards pay per matching symbol you own." accent={COLOR_HEX.green} />
                <RulesTile icon="🔴" label="Red — restaurants" hint="Opponents’ turns only. Coins from the player who rolled." accent={COLOR_HEX.red} />
                <RulesTile icon="🟣" label="Purple — major establishments" hint="Your turn only. Coins from other players, or a swap." accent={COLOR_HEX.purple} />
              </RulesGrid>
              <h3>Symbols</h3>
              <p>
                The icon in a card’s corner is its symbol:{' '}
                <SymbolIcon symbol="wheat" size={14} /> wheat, <SymbolIcon symbol="fruit" size={14} /> fruit,{' '}
                <SymbolIcon symbol="flower" size={14} /> flower, <SymbolIcon symbol="gear" size={14} /> gear,{' '}
                <SymbolIcon symbol="shop" size={14} /> shop, <SymbolIcon symbol="cup" size={14} /> cup,{' '}
                <SymbolIcon symbol="major" size={14} /> major. Combo cards (Flower Shop, Furniture Factory,
                Winery, Food Warehouse) have <b>no symbol</b>, so they never count themselves —
                a Winery with two Vineyards and an Apple Orchard pays 3 × 3 = 9.
              </p>
            </>
          ),
        },
        {
          title: 'Landmarks',
          body: (
            <>
              <RulesGrid cols={2}>
                <RulesTile icon="📈" label="Price ladder" hint="Each landmark shows three prices — for your 1st, 2nd and 3rd landmark. Your next one costs more, whichever you pick." accent={COLOR_HEX.landmark} />
                <RulesTile icon="🏆" label="Win" hint="Build your 3rd landmark and you win at once. The Launch Pad (45 / 38 / 25) wins by itself." accent="#d2433b" />
                <RulesTile icon="🌐" label="Everyone" hint="Most landmarks change the rules for every player once anyone has built one — the Forge boosts everyone’s gear cards, not just yours." accent="#6aa0ff" />
                <RulesTile icon="👤" label="Builder only" hint="Some fire once for the builder (Museum, Park, Radio Tower…) or only help the builder (Loan Office)." accent="#9ed27c" />
              </RulesGrid>
              <p className="muted">
                There’s one copy of each landmark: once it’s built, nobody else can have it. The base
                game has 20; the promo pack (lobby option) adds Private Club, City Hall and Renovation Company.
              </p>
            </>
          ),
        },
        { title: 'Establishments', body: <EstTable defs={EDITIONS.mk2.establishments} /> },
        { title: 'Landmark list', body: <LmTable defs={EDITIONS.mk2.landmarkDefs} /> },
        {
          title: 'Rulings',
          body: (
            <ul className="mk-rulings">
              <li><b>Business Center</b> is optional and may trade itself; any establishment can be swapped, purples included. Each copy that activates is one swap.</li>
              <li><b>Moving Company</b> is mandatory: after your doubles roll has paid out, give one of your establishments to the player on your right (the one who played before you).</li>
              <li><b>Amusement Park</b> and <b>Radio Tower</b> on the same turn still give just one extra turn.</li>
              <li><b>City Hall / Charterhouse</b> count every coin you receive during your roll — Tech Startup and Temple included.</li>
              <li><b>Farmers Market, Forge, Shopping Mall, Soda Bottling Plant</b>: +1 for every copy that activates. The Soda Plant boosts red cup cards too (the roller pays 1 more).</li>
              <li><b>Shopping District / Exhibit Hall</b> take half (rounded down) from each opponent with more than 10 coins.</li>
              <li><b>Park</b>: pool every player’s coins and share them out evenly; when they don’t split evenly, the bank tops everyone up to the next whole coin.</li>
              <li><b>Loan Office</b>: only buildable while you’re the only player without a landmark. Your later landmarks — the Launch Pad included — cost 2 less; this stacks with the Observatory.</li>
              <li><b>Airport</b>: if you end your turn without building, take 5 coins. It doesn’t apply in the opening rounds.</li>
            </ul>
          ),
        },
        {
          title: 'Dice odds',
          body: (
            <>
              <OddsTable />
              <p>
                One die can’t reach the 7+ row at all, and two dice never roll a 1. Doubles (needed by
                Temple, Amusement Park, Moving Company) come up 1 time in 6 on two dice.
              </p>
            </>
          ),
        },
        {
          title: 'Original Machi Koro',
          body: (
            <>
              <RulesHero title="Machi Koro (base game)" subtitle="The 2014 original — pick it in the lobby." accent="linear-gradient(135deg, #8450bd 0%, #e98a1c 100%)" />
              <ul>
                <li>2–4 players. Everyone starts with <b>3 coins</b>, a <b>Wheat Field</b> and a <b>Bakery</b>. No opening rounds.</li>
                <li>Every establishment is on sale at once (6 of each, one of each purple per player). You may own only <b>one of each purple</b>.</li>
                <li>Everyone builds the same four landmarks, at fixed prices. Build all four to win.</li>
                <li>You roll one die until you own the <b>Train Station</b>. There’s no free coin when you’re broke.</li>
                <li>The Business Center can’t trade purple cards. Landmarks only ever help their owner.</li>
                <li>The <b>Harbor</b> and <b>Millionaire’s Row</b> expansions can be added in the lobby — see the next pages.</li>
              </ul>
              <LmTable defs={EDITIONS.mk1.landmarkDefs} />
              <h3>Establishments</h3>
              <EstTable defs={EDITIONS.mk1.establishments} perPlayerPurples />
            </>
          ),
        },
        {
          title: 'Harbor',
          body: (
            <>
              <RulesHero title="Harbor expansion" subtitle="Original Machi Koro only — boats, a bigger market and a 5th player." accent="linear-gradient(135deg, #2b8fc9 0%, #2f5f8a 100%)" />
              <ul>
                <li>2–5 players. Ten new establishments and three new landmarks for everyone.</li>
                <li><b>City Hall</b> starts built: just before you build, if you have no coins, take 1 from the bank.</li>
                <li><b>Harbor</b> (2): when you roll 10 or more you may add 2 — the only way to reach 13 and 14. Your Sushi Bars, Mackerel Boats and Tuna Boats pay only once you have it.</li>
                <li><b>Airport</b> (30): build nothing on your turn and take 10 from the bank.</li>
                <li>Win by building <b>all seven</b> landmarks (City Hall counts, so six to build).</li>
                <li><b>Tuna Boat</b>: the player whose turn it is rolls two dice once, and every Tuna Boat that activates pays that total.</li>
              </ul>
              <h3>Marketplace</h3>
              <p>
                Instead of putting every pile out, shuffle all the establishments into one deck and deal until <b>ten different</b>{' '}
                piles show (duplicates stack). When a pile sells out, deal until there are ten again. This is the default
                once an expansion is in; the lobby can switch back to every pile out. There is one of each purple per player.
              </p>
              <LmTable defs={EXPANSIONS.harbor.landmarkDefs} />
              <h3>Establishments</h3>
              <EstTable defs={EXPANSIONS.harbor.establishments} perPlayerPurples />
            </>
          ),
        },
        {
          title: 'Millionaire’s Row',
          body: (
            <>
              <RulesHero title="Millionaire’s Row expansion" subtitle="Original Machi Koro only — loans, renovations and demolitions." accent="linear-gradient(135deg, #8a6440 0%, #8450bd 100%)" />
              <ul>
                <li>Fourteen new establishments; works with or without Harbor.</li>
                <li>Cards that check <b>landmarks built</b> (General Store, Corn Field, French Restaurant, Members Only Club) never count a starting City Hall.</li>
                <li><b>Renovation</b>: a closed building (🚧) doesn’t activate — the next time it would, it reopens instead. The Winery closes itself after paying; the Renovation Company closes every copy of a type you pick, yours included, and each opponent pays you 1 per copy of theirs.</li>
                <li><b>Demolition Company</b>: you must demolish one of your built landmarks for 8 coins. Build it again later at full price.</li>
                <li><b>Loan Office</b> costs −5: the bank pays you 5 to build it, and you pay 2 each time it activates.</li>
                <li><b>Moving Company</b>: give a non-major establishment to any other player, then take 4.</li>
                <li><b>Tech Startup</b>: at the end of each of your turns you may put 1 coin on it (the checkbox next to Pass). On a 10, every opponent pays you that much.</li>
                <li><b>International Exhibit Hall</b>: on a 10 you may activate one of your blue or green establishments instead; the Hall then goes back to the market.</li>
              </ul>
              <EstTable defs={EXPANSIONS.millionairesRow.establishments} perPlayerPurples />
              <h3>Rulings</h3>
              <ul className="mk-rulings">
                <li>A traded or given card stays closed if it was. The player giving picks a closed copy when they have one; the player taking (Business Center) gets an open one when there is one.</li>
                <li>The Renovation Company is paid per copy of the chosen type each opponent owns.</li>
                <li>The Exhibit Hall can’t activate a red card (you’d be paying yourself) or a closed one.</li>
              </ul>
            </>
          ),
        },
      ]}
    />
  );
}
