(function(){'use strict';
const rows=[
 ['Discard your hand. Copy your opponent’s original deck, add its opening-hand cards to your hand, then draw 6 cards from the new deck.','手札をすべて捨てる。相手の初期デッキを複製し、その初期手札に入るカードを手札に加えた後、新しいデッキからカードを6枚引く。','弃掉所有手牌。复制对手的初始牌组，将其中应加入起始手牌的牌加入手牌，然后从新的牌组中抽6张牌。'],
 ['Sofia','ソフィア','索菲娅'],
 ['Star of my World','私の世界の星','我世界中的明星'],
 ['Discard your hand. Copy your opponent’s original deck, then draw 5 cards from the new deck.','手札をすべて捨てる。相手の初期デッキを複製し、その新しいデッキからカードを5枚引く。','弃掉所有手牌。复制对手的初始牌组，然后从新的牌组中抽5张牌。'],
 ['"Daddy, come home safe! I want to play catch soon!"','「パパ、無事に帰ってきてね！早くキャッチボールしたいな！」','“爸爸，平安回家哦！我想快点和你玩接球！”'],
 ['Don Julio','ドン・フリオ','唐·胡里奥'],
 ['Oppression of the Ruling Class','支配階級の抑圧','统治阶级的压迫'],
 ['Whenever your opponent sets a Supporter in this card’s zone, roll a six-sided die. This card gains Fate equal to the result (1–6).','相手がこのカードと同じゾーンにサポーターをセットするたび、6面ダイスを1個振る。このカードは出目（1～6）に等しい運命値を得る。','每当对手在此牌所在区域放置一张支援者牌时，掷一枚六面骰。此牌获得等同于点数（1～6）的命运值。'],
 ['These foolish revolutionaries simply do not understand—Money is power.','この愚かな革命家どもは分かっていない――金こそが力なのだ。','这些愚蠢的革命者根本不明白——金钱就是力量。'],
 ['Sebastian','セバスティアン','塞巴斯蒂安'],
 ['Fishmonger','魚売り','鱼贩'],
 ['Whenever you consolidate a card, add a Fish counter to your hand. Fish counters count as 0.5 Reinforcement and can be set for free.','カードを統合するたび、魚カウンターを1枚手札に加える。魚カウンターは増援0.5として扱い、無料でセットできる。','每当你整合一张牌时，将一个鱼指示物加入手牌。鱼指示物算作0.5增援，可以免费放置。'],
 ['At the wharf, the fish we catch come and go. But rumors...they linger.','波止場では、獲れた魚は次々と売れていく。だが噂は……いつまでも残る。','码头上，捕来的鱼来来去去。但传闻……总是久久不散。']
];
window.FateJapaneseCatalog=Object.freeze(Object.assign({},window.FateJapaneseCatalog||{},Object.fromEntries(rows.map(r=>[r[0],r[1]]))));
window.FateChineseContent=[...(window.FateChineseContent||[]),...rows.map(r=>[r[0],r[2]])];
})();
