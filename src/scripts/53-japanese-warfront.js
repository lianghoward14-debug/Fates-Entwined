/* Japanese translations for Warfront maps, medals, and profile medal UI. */
(function(){
  'use strict';
  const pairs = [
    ['WAR ENDS IN','終戦まで'],
    ['DEPLOYMENT ENDS IN','配置終了まで'],
    ['Displayed Medals','展示中のメダル'],
    ['Choose medals','メダルを選択'],
    ['No medals yet','メダル未獲得'],
    ['Empty display','未設定'],
    ['Choose displayed medals','表示するメダルを選択'],
    ['Select up to three Warfront medals. Your selection appears on your public profile.','ウォーフロントのメダルを3個まで選択できます。選択したメダルは公開プロフィールに表示されます。'],
    ['PROFILE DISPLAY','プロフィール表示'],
    ['No Warfront medals earned yet','ウォーフロントのメダルはまだありません'],
    ['Win a completed Warfront event to receive one.','ウォーフロントイベントを最後まで戦い、勝利すると獲得できます。'],
    ['Save display','表示を保存'],
    ['Character Lore','人物の物語'],
    ['Lore Wiki Page','物語事典'],
    ['Information dossiers for the people and legends of Fates Entwined.','Fates Entwinedの人物と伝説を紹介します。'],
    ['Story','物語'],
    ['Titles','称号'],
    ['Relationships','関係者'],
    ['Last Edited by Howard Liang','最終編集：Howard Liang'],
    ['YOUR PROFILE','あなたのプロフィール'],

    ['Libya','リビア'],['Tripoli Breakwater','トリポリ防波堤'],['Ghadames Caravanserai','ガダミス隊商宿'],['Sirte Salt Flats','シルテ塩原'],['Black Wadi','黒のワジ'],['Kufra Wells','クフラの井戸'],
    ['South Africa','南アフリカ'],['Jackal Kopje','ジャッカル丘陵'],['Kimberley Pit','キンバリー採掘坑'],['Karoo Windmill','カルーの風車'],['Cape Signal Station','ケープ信号所'],["Dragon's Teeth",'竜の歯'],
    ['Alaska','アラスカ'],['Whiteout Station','ホワイトアウト基地'],['Yukon Ferry','ユーコン渡し場'],['Denali Icefall','デナリ氷瀑'],['Abandoned Cannery','廃缶詰工場'],['Raven Inlet','レイヴン入江'],
    ['Polish Carpathians','ポーランド・カルパチア'],['Wolfpine Monastery','ウルフパイン修道院'],['Dunajec Gorge','ドゥナイェツ峡谷'],["Shepherd's Hollow",'羊飼いの谷'],['The Broken Viaduct','崩壊した高架橋'],['Bieszczady Watchtower','ビェシュチャディ監視塔'],
    ['Amazon','アマゾン'],['Jaguar Landing','ジャガー上陸地'],['Drowned Mission','水没した伝道所'],['Emerald Canopy','エメラルド樹冠'],["Rubber Baron's Estate",'ゴム男爵の農園'],['Serpent Lagoon','大蛇の潟湖'],
    ['French Fields','フランス平原'],["Widow's Orchard",'未亡人の果樹園'],['Saint-Martin Bell Tower','サン・マルタン鐘楼'],['The Red Mill','赤い風車'],['Poppy Cemetery','ポピー墓地'],['Château des Cendres','灰の城館'],
    ['Leningrad','レニングラード'],['Nevsky Barricade','ネフスキー・バリケード'],['Frozen Tram Depot','凍結した路面電車車庫'],['Ladoga Lifeline','ラドガ生命線'],['Admiralty Yard','海軍本部造船所'],['The Silent Conservatory','静寂の温室'],
    ['Ukraine','ウクライナ'],["Polissia Woodcutters' Camp",'ポリッシャ木こりキャンプ'],['Dnieper Ferry','ドニエプル渡し場'],['The Golden Granary','黄金の穀倉'],['Sunflower Railhead','ひまわり鉄道基地'],['Donbas Ironworks','ドンバス製鉄所'],
    ['Chihuahua Desert','チワワ砂漠'],['Vulture Mesa','ハゲワシ台地'],['The Dry Aqueduct','枯れた水道橋'],['Coyote Chapel','コヨーテ礼拝堂'],['Mapimí Ghost Town','マピミ廃墟町'],['Copper Canyon Switchback','コッパーキャニオン九十九折'],
    ['Norway Tundra','ノルウェー・ツンドラ'],['Aurora Watch','オーロラ監視所'],['Tana Reindeer Camp','タナ・トナカイ野営地'],['The Blue Crevasse','青いクレバス'],['Alta Radio Mast','アルタ無線塔'],['Varanger Whaling Pier','ヴァランゲル捕鯨桟橋']
  ];

  const medalNames = [
    ['The First Standard','最初の軍旗'],['Crimson Vanguard','深紅の先鋒'],['Azure Vanguard','蒼穹の先鋒'],['Crown of the Victor','勝者の冠'],['Iron Laurel','鉄の月桂冠'],
    ['Star of the Warfront','ウォーフロントの星'],['The Unbroken Line','不屈の戦線'],['Spearhead Citation','先鋒殊勲章'],['Gilded Campaigner','金彩の遠征兵'],['Medal of Entwined Fates','絡み合う運命の勲章'],
    ['Dawnwatch Honor','暁衛の栄誉'],['Twilight Standard','黄昏の軍旗'],['The Fivefold Star','五重星章'],['Heartland Cross','ハートランド十字章'],['North Gate Ribbon','北門略綬'],
    ['Silver Crossing Star','銀の渡河星章'],['Sunken Road Crest','沈み道の記章'],['Crown Reach Laureate','クラウン・リーチ月桂章'],['Order of the Resolute','不屈騎士団章'],['Order of the Red Comet','赤い彗星騎士団章'],
    ['Order of the Blue Moon','青い月騎士団章'],['The Fateforged Medal','運命鍛造勲章'],['Starlight Conqueror','スターライト征服者'],['The Golden Front','黄金戦線章'],['Ash and Glory Medal','灰と栄光の勲章'],
    ['Banner of Tenacity','不退転の旗章'],['The Final Advance','最後の進撃章'],['Shield of the Last Line','最終防衛線の盾'],['Laurel of Command','指揮の月桂冠'],["Field Marshal's Star",'元帥星章'],
    ['The Quiet Strategist','静かなる戦略家'],['Master of Five Fronts','五戦線の達人'],['Stormbreaker Medal','嵐砕き勲章'],['The Long Vigil','永き警戒章'],['Crest of the Warbound','戦縛の記章'],
    ['The Concord Star','協調の星章'],['Twin Banners Medal','双旗勲章'],['The Victorious Accord','勝利の盟約章'],['Medal of Decisive Force','決定力勲章'],['Lightning Laureate','電撃月桂章'],
    ['Master of Position Star','陣地の達人星章'],['The Gilded Hour','黄金の時章'],['The Ember Crown','残り火の冠'],['The Sapphire Crown','サファイアの冠'],['The Eternal Standard','永遠の軍旗'],
    ['Veteran of the War Table','作戦卓の古参兵'],["The Mapmaker's Honor",'地図製作者の栄誉'],['Champion of the Five Zones','五ゾーンの覇者'],['The Lasting Peace','永続する平和章'],['Legend of the Warfront','ウォーフロントの伝説'],
    ['The Tenth Muster','第十召集章'],["Campaigner’s Seal",'遠征兵の印章'],['The Half-Century Watch','半世紀の守望'],['Centurion of the Front','戦線の百人隊長'],['The Endless Vigil','果てなき警戒'],
    ['First Alliance Triumph','同盟初勝利章'],['The Triple Accord','三重盟約章'],['Order of Twenty Victories','二十勝騎士団章'],['The Seventy-Fifth Laurel','七十五勝月桂章'],['The Century Crown','百勝の冠'],
    ['The Opening Advance','初陣の進撃章'],['Twin Spear Citation','双槍殊勲章'],['The Threefold Assault','三重強襲章'],['The Fourth Standard','第四軍旗'],['The Fivefold Offensive','五重攻勢章'],
    ['Fatekindled Star','運命に灯る星'],['The Hundredfold Flame','百重の炎'],['The Rising Constellation','昇る星座'],['Order of the Fatewell','運命の泉騎士団章'],['The Boundless Sun','果てなき太陽'],
    ['The Keen Edge','鋭刃章'],['The Sundering Spear','断裂の槍章'],['The Broken Gate','破砕門章'],['The Crushing Advance','圧倒進撃章'],['Order of Overwhelming Force','圧倒戦力騎士団章'],
    ['The First Formation','第一陣形章'],['The Anchored Line','錨の戦線章'],['The Interlocking Front','連環戦線章'],['The Iron Formation','鉄の陣形章'],['Architect of Victory','勝利の設計者'],
    ['The Swift Dispatch','迅速決着章'],['The Thunderbolt Advance','雷撃進軍章'],['The Fleeting Hour','刹那の時章'],['The Forged Position','鍛えられた陣地章'],['The Decisive Formation','決定的陣形章'],
    ['Northern Sentinel','北方の番人'],['The Bridgekeeper','橋の守護者'],['Heartland Defender','ハートランドの守護者'],['The Roadward Star','街道守護星章'],['The High Reach Standard','高地の軍旗'],
    ['The Unrivaled Edge','無双の刃'],['The Unrivaled Hour','無双の時'],['The Unrivaled Position','無双の陣地'],['The Supreme Triad','至高の三冠'],['The Twin Distinction','双璧殊勲章'],
    ['The Stainless Campaign','無傷の遠征章'],['Pillar of the Alliance','同盟の柱'],['The Five-Front Dominion','五戦線制覇章'],['The Narrow Triumph','僅差の勝利章'],['The Sovereign Campaign','覇王の遠征章']
  ];
  pairs.push(...medalNames);

  const addSeries = (values, makeEnglish, makeJapanese) => values.forEach(value => pairs.push([makeEnglish(value), makeJapanese(value)]));
  addSeries([10,25,50,100,250], n=>`Complete ${n} Warfront campaigns.`, n=>`ウォーフロントの戦役を${n}回完遂する。`);
  addSeries([1,3,20,75,100], n=>`Win ${n} Warfront campaign${n===1?'':'s'}.`, n=>`ウォーフロントの戦役で${n}回勝利する。`);
  addSeries([1,2,3,4,5], n=>`Personally win ${n} completed, non-forfeit match${n===1?'':'es'} in one Warfront campaign.`, n=>`1回のウォーフロント戦役で、投了ではない完了済みの試合に自ら${n}回勝利する。`);
  addSeries([50,100,150,200,300], n=>`Win a non-forfeit Warfront match with at least ${n} total Fate.`, n=>`投了ではないウォーフロントの試合で、合計${n}以上の運命値を獲得して勝利する。`);
  addSeries([10,25,50,75,100], n=>`Win a non-forfeit Warfront match by at least ${n} Fate.`, n=>`投了ではないウォーフロントの試合で、運命値差${n}以上をつけて勝利する。`);
  addSeries([3,5,10,15,20], n=>`Win a non-forfeit Warfront match with at least ${n} consolidations.`, n=>`投了ではないウォーフロントの試合で、統合を${n}回以上行って勝利する。`);
  addSeries([5,3,1], n=>`Win a non-forfeit Warfront match using no more than ${n} minute${n===1?'':'s'} of your own recorded turn-clock time.`, n=>`投了ではないウォーフロントの試合で、自分の記録上の持ち時間を${n}分以内に抑えて勝利する。`);
  pairs.push(
    ['Win a non-forfeit Warfront match with at least 100 Fate and 5 consolidations.','投了ではないウォーフロントの試合で、運命値100以上かつ統合5回以上を達成して勝利する。'],
    ['Win a non-forfeit Warfront match by at least 50 Fate with at least 10 consolidations.','投了ではないウォーフロントの試合で、統合10回以上かつ運命値差50以上をつけて勝利する。']
  );
  const fronts=[['01','North Gate','北門'],['02','Silver Crossing','銀の渡河点'],['03','Heartland','ハートランド'],['04','Sunken Road','沈み道'],['05','Crown Reach','クラウン・リーチ']];
  fronts.forEach(([no,en,ja])=>pairs.push([`Win a non-forfeit Warfront match on front ${no} (${en} position, across any map).`,`いずれかのマップの戦線${no}（${ja}の位置）で、投了ではない試合に勝利する。`]));
  pairs.push(
    ['Finish a Warfront campaign as the sole Decisive Force commendation leader.','ウォーフロント戦役を「決定力」殊勲の単独首位で終える。'],
    ['Finish a Warfront campaign as the sole Lightning Victory commendation leader.','ウォーフロント戦役を「電撃勝利」殊勲の単独首位で終える。'],
    ['Finish a Warfront campaign as the sole Master of Position commendation leader.','ウォーフロント戦役を「陣地の達人」殊勲の単独首位で終える。'],
    ['Finish one Warfront campaign as the sole leader of all three commendations.','1回のウォーフロント戦役で、3部門すべての殊勲を単独首位で終える。'],
    ['Finish one Warfront campaign as the sole leader of at least two commendations.','1回のウォーフロント戦役で、2部門以上の殊勲を単独首位で終える。'],
    ['Finish one Warfront campaign with exactly five recorded personal matches, all non-forfeit victories.','1回のウォーフロント戦役で自分の試合をちょうど5回記録し、すべて投了ではない勝利で終える。'],
    ['Win a Warfront campaign and personally win at least three non-forfeit matches in it.','ウォーフロント戦役で勝利し、その中で投了ではない試合に自ら3回以上勝利する。'],
    ['Win a Warfront campaign in which your alliance controls all five fronts; personally win at least one non-forfeit match.','同盟が5戦線すべてを支配したウォーフロント戦役で勝利し、自らも投了ではない試合に1回以上勝利する。'],
    ['Win a Warfront campaign by exactly one final score point; personally win at least one non-forfeit match.','最終得点差がちょうど1点のウォーフロント戦役で勝利し、自らも投了ではない試合に1回以上勝利する。'],
    ['Win a Warfront campaign, personally win five non-forfeit matches, and finish as sole leader of at least one commendation.','ウォーフロント戦役で勝利し、投了ではない試合に自ら5回勝利し、さらに1部門以上の殊勲を単独首位で終える。']
  );
  window.FateJapaneseContent = window.FateJapaneseContent || [];
  window.FateJapaneseContent.push(...pairs);
})();
