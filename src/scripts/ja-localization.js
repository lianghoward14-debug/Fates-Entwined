(function () {
  'use strict';

  var EXACT = new Map([
    ['Fates Entwined', 'フェイツ・エントワインド'],
    ['FATES ENTWINED', 'フェイツ・エントワインド'],
    ['A strategic card game created by Howard Liang.', 'ハワード・リャン制作の戦略カードゲーム。'],
    ['Use Ctrl-Scroll to optimize your game zoom.', 'Ctrl+スクロールで表示倍率を調整できます。'],
    ['Loading Menus', 'メニューを読み込み中'],
    ['Preparing first launch menu screens.', '初回メニュー画面を準備しています。'],
    ['Starting', '開始中'],
    ['View your profile', 'プロフィールを表示'],
    ['Player', 'プレイヤー'],
    ['Footman', '従者'],
    ['NOVICE', '初心者'],
    ['Free Play', 'フリープレイ'],
    ['Challenger', 'チャレンジャー'],
    ['Deck Builder', 'デッキ構築'],
    ['Mission Control', 'ミッション管理'],
    ['Public Decks', '公開デッキ'],
    ['Tutorial', 'チュートリアル'],
    ['Social', 'ソーシャル'],
    ['Exit Game', 'ゲーム終了'],
    ['Master', 'マスター'],
    ['Music', '音楽'],
    ['Effects', '効果音'],
    ['Voices', 'ボイス'],
    ['Music On', '音楽 オン'],
    ['Music Off', '音楽 オフ'],
    ['Animations On', '演出 オン'],
    ['Animations Off', '演出 オフ'],
    ['Welcome to Challenger', 'チャレンジャーへようこそ'],
    ["Choose a starter deck to begin your journey. You'll also receive 3 free profile boosters with no duplicate profile pictures. Build decks from cards you own and climb the Challenger ladder.", '旅を始めるスターターデッキを選んでください。重複なしのプロフィールブースターも3個受け取れます。所持カードでデッキを組み、チャレンジャーの階段を上りましょう。'],
    ['Back to Title', 'タイトルへ戻る'],
    ['Back', '戻る'],
    ['Choose Your Deck', 'デッキを選択'],
    ['Select a preset or use custom', 'プリセットを選ぶか、カスタムを使用'],
    ['Use My Custom Deck', 'カスタムデッキを使う'],
    ['Play', 'プレイ'],
    ['Store', 'ショップ'],
    ['Collection', 'コレクション'],
    ['Packs:', 'パック:'],
    ['Starlight:', '星光:'],
    ['ELO:', 'ELO:'],
    ['Building for:', '構築対象:'],
    ['Your Deck', 'あなたのデッキ'],
    ['Cards', 'カード'],
    ['Save', '保存'],
    ['Saved', '保存済み'],
    ['Load', '読み込み'],
    ['Delete', '削除'],
    ['Cancel', 'キャンセル'],
    ['Confirm', '確認'],
    ['Close', '閉じる'],
    ['Continue', '続ける'],
    ['Start', '開始'],
    ['Start Game', 'ゲーム開始'],
    ['New Game', '新規ゲーム'],
    ['Resume', '再開'],
    ['Settings', '設定'],
    ['Profile', 'プロフィール'],
    ['Level', 'レベル'],
    ['Rank', 'ランク'],
    ['XP', '経験値'],
    ['Wins', '勝利'],
    ['Losses', '敗北'],
    ['Win Rate', '勝率'],
    ['Victory', '勝利'],
    ['Defeat', '敗北'],
    ['Draw', '引き分け'],
    ['Turn', 'ターン'],
    ['End Turn', 'ターン終了'],
    ['Your Turn', 'あなたのターン'],
    ['Opponent Turn', '相手のターン'],
    ['Opponent', '相手'],
    ['You', 'あなた'],
    ['Hand', '手札'],
    ['Deck', 'デッキ'],
    ['Discard', '捨て札'],
    ['Zone', 'ゾーン'],
    ['Zones', 'ゾーン'],
    ['Fate', '運命'],
    ['Power', 'パワー'],
    ['Cost', 'コスト'],
    ['Ability', '能力'],
    ['Character', 'キャラクター'],
    ['Supporter', 'サポーター'],
    ['Event', 'イベント'],
    ['Common', 'コモン'],
    ['Rare', 'レア'],
    ['Epic', 'エピック'],
    ['Legendary', 'レジェンド'],
    ['Owned', '所持'],
    ['Unowned', '未所持'],
    ['Search', '検索'],
    ['Filter', 'フィルター'],
    ['Sort', '並び替え'],
    ['All', 'すべて'],
    ['None', 'なし'],
    ['Open Pack', 'パックを開封'],
    ['Open Packs', 'パックを開封'],
    ['Buy Pack', 'パック購入'],
    ['Buy', '購入'],
    ['Claim', '受け取る'],
    ['Rewards', '報酬'],
    ['Daily Challenges', 'デイリーチャレンジ'],
    ['Daily Missions', 'デイリーミッション'],
    ['Live Matches', '対戦中'],
    ['Completed', '完了'],
    ['Incomplete', '未完了'],
    ['Ready', '準備完了'],
    ['Locked', 'ロック中'],
    ['Unlocked', '解放済み'],
    ['Online', 'オンライン'],
    ['Offline', 'オフライン'],
    ['Room', 'ルーム'],
    ['Create Room', 'ルーム作成'],
    ['Join Room', 'ルーム参加'],
    ['Spectate', '観戦'],
    ['Forfeit', '降参'],
    ['Rematch', '再戦'],
    ['Next', '次へ'],
    ['Previous', '前へ'],
    ['Page', 'ページ'],
    ['Loading', '読み込み中'],
    ['Error', 'エラー'],
    ['Warning', '警告'],
    ['Success', '成功'],
    ['OK', 'OK'],
    ['Search names or card text...', '名前やカード文を検索...'],
    ['P1 Deck', 'P1デッキ'],
    ['Clear', 'クリア'],
    ['Overwrite', '上書き'],
    ['Preset', 'プリセット'],
    ['Save as Preset', 'プリセットとして保存'],
    ['My Presets', '自分のプリセット'],
    ['Delete Preset', 'プリセット削除'],
    ['Deck Builder', 'デッキ構築'],
    ['Choose Your Deck', 'デッキを選択'],
    ['Main Menu', 'メインメニュー'],
    ['MISSION CONTROL', 'ミッション管理'],
    ['SEARCHING FOR OPPONENT', '対戦相手を検索中'],
    ['Ranked Matchmaking', 'ランクマッチ'],
    ['Cancel', 'キャンセル'],
    ['Pending', '保留中'],
    ['Turn 1', 'ターン 1'],
    ['Draw Phase', 'ドローフェイズ'],
    ['Opponent\\'s Hand', '相手の手札'],
    ['Your Hand', 'あなたの手札'],
    ['Select a card to play', 'プレイするカードを選択'],
    ['View Selected', '選択を表示'],
    ['Audio', '音声'],
    ['End Game', 'ゲーム終了'],
    ['Pass to Player 2', 'プレイヤー2に引き継ぐ'],
    ['Hand the device to your opponent', '端末を相手に渡してください'],
    ["I'm Ready", '準備完了'],
    ['Return to Menu', 'メニューへ戻る'],
    ['Controls 2 of 3 Zones', '3ゾーン中2つを支配'],
    ['Flipping for first turn...', '先攻を決めています...'],
    ['Go First', '先攻'],
    ['Go Second', '後攻']
  ]);

  var PHRASES = [
    [/Daily Challenges/g, 'デイリーチャレンジ'],
    [/Daily Missions/g, 'デイリーミッション'],
    [/Live Matches/g, '対戦中'],
    [/Ranked Matchmaking/g, 'ランクマッチ'],
    [/SEARCHING FOR OPPONENT/g, '対戦相手を検索中'],
    [/Deck Builder/g, 'デッキ構築'],
    [/Mission Control/g, 'ミッション管理'],
    [/Public Decks/g, '公開デッキ'],
    [/Choose Your Deck/g, 'デッキを選択'],
    [/Use My Custom Deck/g, 'カスタムデッキを使う'],
    [/Back to Title/g, 'タイトルへ戻る'],
    [/View your profile/g, 'プロフィールを表示'],
    [/Start Game/g, 'ゲーム開始'],
    [/End Turn/g, 'ターン終了'],
    [/Opponent's Hand/g, '相手の手札'],
    [/Your Hand/g, 'あなたの手札'],
    [/Your Deck/g, 'あなたのデッキ'],
    [/Your Discard/g, 'あなたの捨て札'],
    [/Select a card to play/g, 'プレイするカードを選択'],
    [/Reward/g, '報酬'],
    [/Packs?/g, 'パック'],
    [/Starlight/g, '星光'],
    [/Supporters/g, 'サポーター'],
    [/Initiators/g, 'イニシエーター'],
    [/Coordinators/g, 'コーディネーター'],
    [/Dauntless/g, 'ドーントレス'],
    [/Improvisors/g, 'インプロバイザー'],
    [/Free Play/g, 'フリープレイ'],
    [/Challenger/g, 'チャレンジャー'],
    [/Collection/g, 'コレクション'],
    [/Social/g, 'ソーシャル'],
    [/Tutorial/g, 'チュートリアル'],
    [/Exit Game/g, 'ゲーム終了'],
    [/Music On/g, '音楽 オン'],
    [/Music Off/g, '音楽 オフ'],
    [/Animations On/g, '演出 オン'],
    [/Animations Off/g, '演出 オフ'],
    [/View Selected/g, '選択を表示'],
    [/Return to Menu/g, 'メニューへ戻る'],
    [/Pass to Player 2/g, 'プレイヤー2に引き継ぐ'],
    [/Flipping for first turn\.\.\./g, '先攻を決めています...'],
    [/Controls 2 of 3 Zones/g, '3ゾーン中2つを支配'],
    [/Go First/g, '先攻'],
    [/Go Second/g, '後攻']
  ];

  var ATTRS = ['title', 'aria-label', 'placeholder', 'alt', 'value'];
  var BLOCKED = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA']);
  var scheduled = false;

  function translateString(value) {
    if (!value || !/[A-Za-z]/.test(value)) return value;
    var trimmed = value.trim();
    if (EXACT.has(trimmed)) {
      return value.replace(trimmed, EXACT.get(trimmed));
    }
    var next = value;
    for (var i = 0; i < PHRASES.length; i += 1) {
      next = next.replace(PHRASES[i][0], PHRASES[i][1]);
    }
    return next;
  }

  function translateTextNode(node) {
    var oldValue = node.nodeValue;
    var next = translateString(oldValue);
    if (next !== oldValue) node.nodeValue = next;
  }

  function translateElement(el) {
    if (!el || BLOCKED.has(el.tagName)) return;
    for (var i = 0; i < ATTRS.length; i += 1) {
      var attr = ATTRS[i];
      if (!el.hasAttribute || !el.hasAttribute(attr)) continue;
      var oldValue = el.getAttribute(attr);
      var next = translateString(oldValue);
      if (next !== oldValue) el.setAttribute(attr, next);
    }
  }

  function translateTree(root) {
    if (!root) return;
    if (root.nodeType === Node.TEXT_NODE) {
      translateTextNode(root);
      return;
    }
    if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_NODE) return;
    translateElement(root);
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, {
      acceptNode: function (node) {
        if (node.nodeType === Node.ELEMENT_NODE && BLOCKED.has(node.tagName)) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var node = walker.currentNode;
    while (node) {
      if (node.nodeType === Node.TEXT_NODE) translateTextNode(node);
      else translateElement(node);
      node = walker.nextNode();
    }
  }

  function scheduleTranslate() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(function () {
      scheduled = false;
      translateTree(document.body);
    });
  }

  function patchDialogs() {
    var nativeAlert = window.alert;
    var nativeConfirm = window.confirm;
    var nativePrompt = window.prompt;
    window.alert = function (msg) { return nativeAlert.call(window, translateString(String(msg))); };
    window.confirm = function (msg) { return nativeConfirm.call(window, translateString(String(msg))); };
    window.prompt = function (msg, value) { return nativePrompt.call(window, translateString(String(msg)), value); };
  }

  function boot() {
    document.documentElement.lang = 'ja';
    document.title = 'フェイツ・エントワインド';
    patchDialogs();
    translateTree(document.body);
    new MutationObserver(function (mutations) {
      for (var i = 0; i < mutations.length; i += 1) {
        if (mutations[i].type === 'childList' || mutations[i].type === 'characterData' || mutations[i].type === 'attributes') {
          scheduleTranslate();
          break;
        }
      }
    }).observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ATTRS
    });
    setInterval(scheduleTranslate, 1500);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
}());
