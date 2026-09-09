// Printed-resource accounting is a diagnostic, not a deck strength score.
// Conditional engines are reported separately instead of counted as free supply.
export function auditDeck(cards) {
  let supporters = 0, characters = 0, reinforcementSupply = 0, reinforcementDemand = 0;
  const conditional = new Map();
  const routes = {
    '02':'Generated-row cost reduction requires Anicka to resolve and usable space',
    '07':'Maja can enter from deck for free; extra placements remain capped',
    '08':'Lina can deploy a Reality card from deck or discard for free',
    '24':'Ralph adds reinforcement only to eligible adjacent Supporters',
    '49':'Irvine permits eligible Characters in his zone to become tributes',
    '84':'Kvetka searches any card only when the original deck contains no Draw effects',
    '92':'Lumberjack trades Supporter effects for reinforcement in his zone',
    '99':'Family-dependent zero cost; requires Character tributes',
    '100':'Requires Character tributes'
  };
  for (const card of cards) {
    if (!card || !Number.isFinite(Number(card.cost))) throw new TypeError('Resolved card definitions required');
    if (card.type === 'Supporter') {
      supporters++;
      reinforcementSupply += ['62','76'].includes(String(card.id)) ? 0 : card.id === '09' ? 2 : 1;
    } else {
      characters++;
      reinforcementDemand += Number(card.cost);
    }
    if (routes[card.id]) conditional.set(card.id, {
      cardId:card.id, copies:(conditional.get(card.id)?.copies || 0) + 1, condition:routes[card.id]
    });
  }
  return {cards:cards.length, supporters, characters, reinforcementSupply, reinforcementDemand,
    balance:reinforcementSupply-reinforcementDemand, conditionalRoutes:[...conditional.values()]};
}
