/**
 * game.js - ドンジャラ2人対戦（Step 2）
 * - 純粋ロジック（山札生成・あがり判定・役採点）とAI、それを使うゲーム制御 DonjaraGame
 * - モード: 'ai'（人間vsコンピュータ） / 'pvpHost' / 'pvpGuest'
 * - 親機（pvpHost または ai=ローカル）が正本のゲーム状態を一元管理する
 */

// ---------------------------------------------------------------
// 定数・カード定義
// ---------------------------------------------------------------
const DONJARA_MOTIFS = window.DONJARA_MOTIFS;

const WILD = { id: 'wild', emoji: '⭐', label: 'ジョーカー' };

let CARD_SEQ = 0;

/** デッキ生成: 柄ごとのバリエーション枚数 + ジョーカー2枚 */
function buildDeck() {
  const deck = [];
  for (const m of DONJARA_MOTIFS) {
    for (const variant of m.variants) {
      for (let i = 0; i < variant.count; i++) {
        deck.push({
          id: ++CARD_SEQ,
          motif: m.id,
          variant: variant.number,
          sortOrder: m.sortOrder,
          variantLabel: variant.label || '',
          emoji: m.emoji,
          label: variant.label || '',
          wild: false
        });
      }
    }
  }
  for (let i = 0; i < 2; i++) {
    deck.push({ id: ++CARD_SEQ, motif: WILD.id, emoji: WILD.emoji, label: WILD.label, wild: true });
  }
  return deck;
}

function shuffle(arr, rand) {
  rand = rand || Math.random;
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  return arr;
}

function motifMeta(motifId) {
  if (motifId === WILD.id) return WILD;
  return DONJARA_MOTIFS.find((m) => m.id === motifId);
}

function cardSortKey(card) {
  if (card.wild) return [0, 0, 0, card.id || 0];
  const motif = DONJARA_MOTIFS.find((m) => m.id === card.motif);
  return [motif ? motif.sortOrder : 999, card.variant || 999, card.id || 0];
}

function compareCards(a, b) {
  const ak = cardSortKey(a);
  const bk = cardSortKey(b);
  for (let i = 0; i < ak.length; i++) {
    if (ak[i] !== bk[i]) return ak[i] - bk[i];
  }
  return 0;
}

function sortCards(cards) {
  return cards.slice().sort(compareCards);
}

function sortGroups(groups) {
  return groups.map((group) => ({ ...group, cards: sortCards(group.cards || []) }))
    .sort((a, b) => compareCards(a.cards[0] || { id: 0 }, b.cards[0] || { id: 0 }));
}

function countMotifs(cards) {
  const counts = {};
  for (const c of cards) {
    if (c.wild) continue;
    counts[c.motif] = (counts[c.motif] || 0) + 1;
  }
  return counts;
}

// ---------------------------------------------------------------
// あがり判定・役採点（純粋関数）
// ---------------------------------------------------------------

/**
 * 9枚が「3枚組×3組」に分割できるか判定。
 * ジョーカーは任意の柄に化けられる。戻り値: { groups:[{motif, cards}], jokersUsed } | null
 */
function analyzeWin9(cards) {
  if (cards.length !== 9) return null;
  const counts = countMotifs(cards);
  const wilds = cards.filter((c) => c.wild);
  const motifIds = DONJARA_MOTIFS.map((m) => m.id);

  const tryAssign = (assignIdx) => {
    if (assignIdx < wilds.length) {
      for (const mid of motifIds) {
        counts[mid] = (counts[mid] || 0) + 1;
        const r = tryAssign(assignIdx + 1);
        counts[mid] -= 1;
        if (r) return r;
      }
      return null;
    }
    // 全柄の枚数が3の倍数か
    for (const mid of motifIds) {
      if ((counts[mid] || 0) % 3 !== 0) return null;
    }
    // 組を構成
    const groups = [];
    const pool = cards.slice();
    for (const mid of motifIds) {
      const cnt = counts[mid] || 0;
      for (let g = 0; g < cnt / 3; g++) {
        const groupCards = [];
        let need = 3;
        for (const c of pool) {
          if (need === 0) break;
          if (c.wild) {
            groupCards.push(c);
            need--;
          } else if (c.motif === mid && need > 0) {
            groupCards.push(c);
            need--;
          }
        }
        groupCards.forEach((c) => {
          const idx = pool.indexOf(c);
          if (idx >= 0) pool.splice(idx, 1);
        });
        groups.push({ motif: mid, cards: groupCards });
      }
    }
    return { groups, jokersUsed: wilds.length };
  };

  return tryAssign(0);
}

/**
 * あがり判定。9枚（持ち札8 + ツモ/捨て牌1）で「3枚組×3組」に分解できるか。
 * 10枚が渡された場合は1枚除いて9枚のあがり形を探す（互換）。
 * 戻り値: { groups, jokersUsed, removed? } | null
 */
function analyzeWin(cards) {
  if (cards.length === 9) return analyzeWin9(cards);
  if (cards.length === 10) {
    for (let i = 0; i < cards.length; i++) {
      const rest = cards.slice(0, i).concat(cards.slice(i + 1));
      const r = analyzeWin9(rest);
      if (r) return { groups: r.groups, jokersUsed: r.jokersUsed, removed: cards[i] };
    }
  }
  return null;
}

function createConfiguredYakus(yakuClasses) {
  return yakuClasses.map((YakuClass) => new YakuClass());
}

const DEFAULT_YAKU_MANAGER = new window.YakuManager(createConfiguredYakus(window.DONJARA_YAKUS));

/** 既存呼び出し互換の役評価API */
function scoreYaku(groups, jokersUsed, extraContext = {}) {
  const sortedGroups = sortGroups(groups);
  const cards = sortCards(sortedGroups.reduce((all, group) => all.concat(group.cards || []), []));
  const result = DEFAULT_YAKU_MANAGER.evaluate(cards, { groups: sortedGroups, jokersUsed, ...extraContext });
  return { yaku: result.yaku, total: result.total };
}

/**
 * テンパイ判定: 持ち札8枚で「あと1枚（任意の柄）引ければあがり」の状態か。
 * 任意の柄1枚を足して9枚で analyzeWin9 が成立するとき true。
 */
function isTenpai(cards) {
  if (!cards || cards.length !== 8) return false;
  for (const m of DONJARA_MOTIFS) {
    const test = cards.concat([{ id: -1, motif: m.id, emoji: '', label: '', wild: false }]);
    if (analyzeWin9(test)) return true;
  }
  return false;
}

// ---------------------------------------------------------------
// 弱いAI（デバッグ用）
// ---------------------------------------------------------------
class DonjaraAI {
  constructor(rand) {
    this.rand = rand || Math.random;
  }

  thinkDiscard(cards) {
    const nonWild = cards.filter((c) => !c.wild);
    if (nonWild.length === 0) {
      return cards[Math.floor(this.rand() * cards.length)].id;
    }
    // 手札内で枚数が最も少ない柄を捨てる（河・確率は無視: 弱い）
    const counts = countMotifs(nonWild);
    const sorted = Object.keys(counts).sort((a, b) => counts[a] - counts[b]);
    const minMotif = sorted[0];
    const candidates = nonWild.filter((c) => c.motif === minMotif);
    const pick = candidates[Math.floor(this.rand() * candidates.length)];
    return pick.id;
  }

  decideWin(winInfo) {
    return !!winInfo;
  }

  decidePon() {
    return true;
  }
}

// ---------------------------------------------------------------
// ゲーム制御（authoritative: pvpHost / ai で使用）
// ---------------------------------------------------------------
class DonjaraGame {
  constructor(mode, opts = {}) {
    this.mode = mode; // 'ai' | 'pvpHost' | 'pvpGuest'
    this.selfIndex = (mode === 'pvpGuest') ? 1 : 0;
    this.conn = opts.conn || null;
    this.rand = opts.rand || Math.random;
    this.ai = new DonjaraAI(this.rand);
    this.aiDelay = (opts.aiDelay !== undefined) ? opts.aiDelay : 550;

    this.players = (mode === 'ai')
      ? [{ name: 'あなた', kind: 'human' }, { name: 'コンピュータ', kind: 'ai' }]
      : (mode === 'pvpHost'
        ? [{ name: 'あなた(親機)', kind: 'human' }, { name: '相手(子機)', kind: 'remote' }]
        : [{ name: '相手(親機)', kind: 'remote' }, { name: 'あなた(子機)', kind: 'human' }]);

    this.state = {
      round: 0,
      first: 0,
      turn: 0,
      phase: 'idle', // idle | play | roundEnd | gameOver
      waiting: null, // { player, kind }
      scores: [0, 0],
      wall: [],
      hands: [[], []],
      draw: [null, null],
      melds: [[], []],
      rivers: [[], []],
      lastDiscard: null,
      wonFlags: [false, false],
      riichi: [false, false],
      riichiAsked: [false, false],
      ippatsuPending: [false, false],
      msg: '',
      roundResult: null,
      gameOver: null
    };
    this.pendingAsk = null;
    this.processing = false;
    // 次局へ進む確認（bug006）: 局終了後はボタンが押されるまで次局を開始しない
    this.resolveNextRound = null;
    this.guestNextReady = false;
    this.guestNextSent = false;
    this.guestAskReason = null;
    this.guestRoundSeen = -1;
  }

  // ---------- 純粋ユーティリティ ----------
  sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  handLabel(cards) {
    return cards.map((c) => (c.wild ? '⭐ジョーカー' : `${c.emoji}${c.label}`)).join(' ');
  }

  riverLabel(cards) {
    return cards.map((c) => `${c.id}:${c.wild ? '⭐ジョーカー' : `${c.emoji}${c.label}`}${c.riichi ? '[リーチ]' : ''}`).join(' ');
  }

  /** 両プレイヤーの持ち札・ツモをコンソールへ出力（デバッグ用） */
  logState(tag) {
    if (typeof console === 'undefined') return;
    const s = this.state;
    const p0 = (this.players[0] && this.players[0].name) || 'P0';
    const p1 = (this.players[1] && this.players[1].name) || 'P1';
    console.log(`[ドンジャラ] ${tag} 第${s.round}局 ${p0}: ${this.handLabel(s.hands[0])}` +
      (s.draw[0] ? ` | ツモ:${this.handLabel([s.draw[0]])}` : '') +
      ` ／ ${p1}: ${this.handLabel(s.hands[1])}` +
      (s.draw[1] ? ` | ツモ:${this.handLabel([s.draw[1]])}` : '') +
      ` | 河${p0}:${this.riverLabel(s.rivers[0])}` +
      ` ／ 河${p1}:${this.riverLabel(s.rivers[1])}`);
  }

  cardInList(cardId, list) {
    return list.find((c) => c.id === cardId);
  }

  /** メッセージで使う表示名。PvPでは親機/子機（どちらの画面でも同じ意味になる） */
  playerName(i) {
    if (this.mode === 'ai') return this.players[i].name;
    return i === 0 ? '親機' : '子機';
  }

  turnLabel(i) {
    return i === this.selfIndex ? 'あなたのターン' : '相手のターン';
  }

  /** あがり判定・テンパイ判定に使う「手札+ポンで成立した3枚組（メルド）」の全牌 */
  allTiles(i) {
    const meldTiles = this.state.melds[i].reduce((acc, m) => acc.concat(m.cards), []);
    return this.state.hands[i].concat(meldTiles);
  }

  canWinByDraw(i) {
    if (this.state.wonFlags[i]) return null;
    if (!this.state.riichi[i]) return null; // リーチしていないとあがれない
    const cards = this.allTiles(i).concat(this.state.draw[i] ? [this.state.draw[i]] : []);
    return analyzeWin(cards);
  }

  canWinByDiscard(i) {
    if (this.state.wonFlags[i]) return null;
    if (!this.state.riichi[i]) return null; // リーチしていないとあがれない
    if (!this.state.lastDiscard) return null;
    const cards = this.allTiles(i).concat([this.state.lastDiscard.card]);
    return analyzeWin(cards);
  }

  canPon(i) {
    if (!this.state.lastDiscard) return false;
    const card = this.state.lastDiscard.card;
    if (card.wild) return false;
    const sameCount = this.state.hands[i].filter((c) => !c.wild && c.motif === card.motif).length;
    return sameCount >= 2;
  }

  // ---------- 手札の表示順（並び替え） ----------
  motifOrder(c) {
    return cardSortKey(c)[0];
  }

  /** 保持している手札配列を柄順（オールマイティ先頭）に並べ替える */
  sortHand(cards) {
    cards.sort(compareCards);
    return cards;
  }

  /** 表示用の手札も同じ順序で返す */
  applyDisplayOrder(cards) {
    return sortCards(cards);
  }

  selfHandRef() {
    if (this.mode === 'pvpGuest') {
      return ((this.remoteView && this.remoteView.guestHand) || this.state.hands[this.selfIndex]);
    }
    return this.state.hands[this.selfIndex];
  }

  // ---------- 要求を待つ（local:UI / remote:ネットワーク） ----------
  ask(playerIdx, kind, reason) {
    return new Promise((resolve) => {
      this.state.waiting = { player: playerIdx, kind, reason: kind === 'win' ? reason : null };
      this.render();
      if (this.mode === 'pvpHost' && playerIdx === 1) {
        // リモート子機へ要求
        this.conn.sendJSON({ t: 'ask', kind, winInfo: this.canWinForAsk(playerIdx), reason: kind === 'win' ? reason : null });
        this.pendingAsk = { player: playerIdx, kind, resolve };
      } else if (this.mode === 'ai' && playerIdx === 1) {
        // AI判断
        setTimeout(() => {
          let val;
          if (kind === 'discard') {
            const pool = this.state.hands[1].concat(this.state.draw[1] ? [this.state.draw[1]] : []);
            val = this.ai.thinkDiscard(pool);
          } else if (kind === 'win') {
            val = this.ai.decideWin(this.canWinForAsk(1));
          } else if (kind === 'pon') {
            val = this.ai.decidePon();
          }
          this.state.waiting = null;
          this.render();
          resolve(val);
        }, this.aiDelay);
      } else {
        // ローカル人間: ボタン/カードタップで resolveAsk() が呼ばれる
        this.resolveLocal = resolve;
      }
    });
  }

  canWinForAsk(playerIdx) {
    if (playerIdx === this.state.turn && this.state.draw[playerIdx]) return this.canWinByDraw(playerIdx);
    return this.canWinByDiscard(playerIdx);
  }

  /** ローカル人間の要求への回答（HTML の onclick から呼ぶ） */
  answer(value) {
    if (this.mode === 'pvpGuest') {
      if (this.conn && this.state.waitingLocal) {
        this.conn.sendJSON({ t: 'ans', kind: this.state.waitingLocal, value });
        this.state.waitingLocal = null;
        this.render();
      }
      return;
    }
    if (this.resolveLocal && this.state.waiting) {
      const kind = this.state.waiting.kind;
      this.state.waiting = null;
      this.render();
      const r = this.resolveLocal;
      this.resolveLocal = null;
      r(value);
    }
  }

  // ---------- 進行 ----------
  async startGame() {
    if (this.processing) return;
    this.processing = true;
    await this.startRound();
  }

  async startRound() {
    if (this.state.round >= 4) {
      this.endGame();
      return;
    }
    this.state.round += 1;
    // 初局は陣営0。以降の first は endRound で更新される
    this.state.hands = [[], []];
    this.state.draw = [null, null];
    this.state.melds = [[], []];
    this.state.rivers = [[], []];
    this.state.lastDiscard = null;
    this.state.wonFlags = [false, false];
    this.state.riichi = [false, false];
    this.state.riichiAsked = [false, false];
    this.state.ippatsuPending = [false, false];
    this.state.roundResult = null;
    this.state.phase = 'play';

    const deck = shuffle(buildDeck(), this.rand);
    // 1人8枚ずつ配牌（ツモで9枚目、あがりは9枚構成）
    this.state.wall = deck.slice(16);
    for (let i = 0; i < 8; i++) {
      this.state.hands[0].push(deck[i]);
      this.state.hands[1].push(deck[8 + i]);
    }
    this.sortHand(this.state.hands[0]);
    this.sortHand(this.state.hands[1]);
    this.state.msg = `🔔 第${this.state.round}局 開始（先手: ${this.playerName(this.state.first)}）`;
    this.logState('配牌');
    this.render();

    await this.sleep(600);
    await this.playTurn(this.state.first);
  }

  async playTurn(i) {
    if (this.state.phase !== 'play') return;

    // 山切れ → 流局
    if (this.state.wall.length === 0) {
      await this.endRound(null, '流局（山切れ）');
      return;
    }

    this.state.turn = i;

    // ツモ
    const card = this.state.wall.pop();
    this.state.draw[i] = card;

    // ツモあがり可能か
    const winInfo = this.canWinByDraw(i);
    const ippatsu = this.state.ippatsuPending[i];
    // bug010: ツモ牌は自分の selfDraw にのみ表示し、メッセージには載せない（PvPで相手に漏れないように）
    this.state.msg = this.turnLabel(i);
    this.logState('ツモ');
    this.render();

    // 宣言判断（人間のみ聞く。AIは自動）
    if (this.players[i].kind !== 'ai') {
      if (winInfo) {
        const want = await this.ask(i, 'win', 'ツモ');
        if (want) {
          await this.endRound(i, 'ツモあがり', winInfo, { ippatsu });
          return;
        }
      }
    } else {
      const want = this.ai.decideWin(winInfo);
      if (want && winInfo) {
        await this.endRound(i, 'ツモあがり', winInfo, { ippatsu });
        return;
      }
    }
    this.state.ippatsuPending[i] = false;

    // 打牌選択（リーチは捨てる牌が決まった時点で宣言する → bug008/009）
    const discardId = await this.ask(i, 'discard');
    const reach = await this.maybeRiichiOnDiscard(i, this.discardCardOf(i, discardId));
    this.doDiscard(i, discardId, { riichi: reach });

    const opp = 1 - i;

    // 相手の反応: ロンあがり → ポン → なし
    const oppWin = this.canWinByDiscard(opp);
    const oppIppatsu = this.state.ippatsuPending[opp];
    if (oppWin && this.players[opp].kind !== 'ai') {
      const want = await this.ask(opp, 'win', 'ロン');
      if (want) {
        await this.endRound(opp, 'ロン（相手の捨て牌であがり）', oppWin, { ippatsu: oppIppatsu });
        return;
      }
    } else if (oppWin && this.players[opp].kind === 'ai') {
      if (this.ai.decideWin(oppWin)) {
        await this.endRound(opp, 'ロン（相手の捨て牌であがり）', oppWin, { ippatsu: oppIppatsu });
        return;
      }
    }

    if (this.canPon(opp) && !oppWin) {
      const want = (this.players[opp].kind === 'ai')
        ? this.ai.decidePon()
        : await this.ask(opp, 'pon');
      if (want) {
        // ポン: 捨て牌と同柄2枚を3枚組（メルド）として確定。メルドからは捨てられない
        const got = this.state.lastDiscard.card;
        const discardedPlayer = this.state.lastDiscard.player;
        const two = this.state.hands[opp].filter((c) => !c.wild && c.motif === got.motif).slice(0, 2);
        this.state.hands[opp] = this.state.hands[opp].filter((c) => !two.includes(c));
        this.sortHand(this.state.hands[opp]);
        this.state.melds[opp].push({ motif: got.motif, cards: [two[0], two[1], got] });
        const discardedRiver = this.state.rivers[discardedPlayer];
        const discardedIndex = discardedRiver.findIndex((c) => c.id === got.id);
        if (discardedIndex >= 0) {
          this.state.rivers[discardedPlayer] = discardedRiver.filter((c) => c.id !== got.id);
          if (got.riichi && discardedIndex > 0) {
            this.state.rivers[discardedPlayer][discardedIndex - 1].riichi = true;
          }
        }
        this.state.lastDiscard = null;
        this.state.msg = `✋ ${this.playerName(opp)} がポン！(${cardLabel(got)})`;
        this.logState('ポン');
        this.render();
        const discardId2 = await this.ask(opp, 'discard');
        const reach2 = await this.maybeRiichiOnDiscard(opp, this.discardCardOf(opp, discardId2));
        this.doDiscard(opp, discardId2, { riichi: reach2 });
        this.state.ippatsuPending[i] = false;
        // 打牌後の反応はなし（簡略）→ 元のプレイヤーへ
        await this.sleep(400);
        await this.playTurn(i);
        return;
      }
    }

    this.state.ippatsuPending[opp] = false;

    // 反応なし → 相手がツモ
    await this.playTurn(opp);
  }

  /** 捨て牌として選択された牌を返す（ツモ牌 or 手札から） */
  discardCardOf(i, discardId) {
    if (this.state.draw[i] && this.state.draw[i].id === discardId) return this.state.draw[i];
    return this.state.hands[i].find((c) => c.id === discardId);
  }

  /** その牌を捨てて残る8枚（手札+メルド）がテンパイになるか */
  canRiichiAfterDiscard(i, card) {
    if (!card) return false;
    let tiles;
    if (this.state.draw[i] && this.state.draw[i].id === card.id) {
      tiles = this.state.hands[i].slice();
    } else {
      tiles = this.state.hands[i].filter((c) => c.id !== card.id);
      if (this.state.draw[i]) tiles.push(this.state.draw[i]);
    }
    const meldTiles = this.state.melds[i].reduce((acc, m) => acc.concat(m.cards), []);
    return isTenpai(tiles.concat(meldTiles));
  }

  /** 捨て牌確定時: テンパイになるならリーチを宣言できる（bug008: ポン直後も含む） */
  async maybeRiichiOnDiscard(i, card) {
    if (this.state.riichi[i] || this.state.riichiAsked[i]) return false;
    if (!this.canRiichiAfterDiscard(i, card)) return false;
    if (this.players[i].kind === 'ai') {
      this.state.riichi[i] = true;
      this.state.riichiAsked[i] = true;
      this.state.ippatsuPending[i] = true;
      this.state.msg = `🔔 ${this.playerName(i)} がリーチを宣言しました`;
      this.render();
      if (this.mode === 'pvpHost' && i === 1) await this.sendSync();
      await this.sleep(500);
      return true;
    }
    const want = await this.ask(i, 'riichi');
    this.state.riichi[i] = want;
    this.state.riichiAsked[i] = true;
    this.state.ippatsuPending[i] = want;
    if (want) {
      this.state.msg = `🔔 ${this.playerName(i)} がリーチを宣言しました`;
    } else {
      this.state.msg = `😴 ${this.playerName(i)} はリーチせず、この局のあがり権を放棄しました。`;
    }
    this.render();
    if (this.mode === 'pvpHost' && i === 1) await this.sendSync();
    return want;
  }

  doDiscard(i, cardId, opts = {}) {
    let card = null;
    if (this.state.draw[i] && this.state.draw[i].id === cardId) {
      // ツモった牌を捨てる → 手札はそのまま
      card = this.state.draw[i];
      this.state.draw[i] = null;
    } else {
      // 手札から捨てる → ツモった牌を手札へ加えて、常に8枚に戻す
      const idx = this.state.hands[i].findIndex((c) => c.id === cardId);
      if (idx >= 0) {
        card = this.state.hands[i][idx];
        this.state.hands[i].splice(idx, 1);
      }
      if (this.state.draw[i]) {
        this.state.hands[i].push(this.state.draw[i]);
        this.state.draw[i] = null;
        this.sortHand(this.state.hands[i]);
      }
    }
    if (!card) return;
    // リーチ宣言した捨て牌には印を付ける（bug009）
    if (opts.riichi) card.riichi = true;
    this.state.rivers[i].push(card);
    this.state.lastDiscard = { player: i, card };
    this.state.msg = `${this.playerName(i)} が ${cardLabel(card)} を捨てました`;
    this.logState('捨て牌');
    this.render();
  }

  async endRound(winner, reason, winInfo, extraContext = {}) {
    this.state.phase = 'roundEnd';
    this.state.msg = '';

    let points = 0;
    let yaku = [];
    if (winner !== null) {
      const sc = scoreYaku(winInfo.groups, winInfo.jokersUsed, extraContext);
      yaku = sc.yaku;
      points = sc.total;
      this.state.scores[winner] += points;
      this.state.roundResult = {
        winner,
        winnerName: this.playerName(winner),
        reason,
        points,
        yaku,
        groups: winInfo.groups
      };
      this.state.msg = `🎉 ${this.playerName(winner)} があがり！(+${points}pt)`;
    } else {
      this.state.roundResult = { winner: null, reason, points: 0, yaku: [] };
      this.state.msg = '🏳️ 流局（引き分け）';
    }

    this.state.draw = [null, null];
    this.state.lastDiscard = null;
    this.render();

    // 最終局なら終了
    if (this.state.round >= 4) {
      this.endGame();
      return;
    }

    // 局終了後は「次の対局へ進む」ボタンが押されるまで止まる（bug006）
    if (this.mode === 'pvpHost') {
      // 親機: 自分と子機（相手）の両方が押すまで待つ
      this.guestNextReady = false;
      this.resolveGuestNext = null;
      await this.waitForNextRound();
      if (!this.guestNextReady) await this.waitForGuestNext();
    } else {
      // AIモード: ローカル人間が押すまで待つ
      await this.waitForNextRound();
    }

    // 先手交代: PvPは交互、AI対戦は人間（陣営0）固定
    this.state.first = (this.mode === 'ai') ? 0 : 1 - this.state.first;
    await this.sleep(300);
    await this.startRound();
  }

  /** 局終了後、ローカル人間が「次の対局へ進む」ボタンを押すのを待つ */
  waitForNextRound() {
    return new Promise((resolve) => {
      this.resolveNextRound = resolve;
      this.render();
    });
  }

  /** PvPホスト: 子機が「次の対局へ進む」を押すのを待つ */
  waitForGuestNext() {
    return new Promise((resolve) => {
      this.resolveGuestNext = resolve;
      this.render();
    });
  }

  /** ローカル人間の「次の対局へ進む」ボタン押下（HTML の onclick） */
  answerNextRound() {
    if (!this.resolveNextRound) return;
    const r = this.resolveNextRound;
    this.resolveNextRound = null;
    this.render();
    r();
  }

  endGame() {
    this.state.phase = 'gameOver';
    const [s0, s1] = this.state.scores;
    const winnerIdx = s0 === s1 ? null : (s0 > s1 ? 0 : 1);
    this.state.gameOver = {
      scores: [s0, s1],
      winnerIdx,
      winnerName: winnerIdx === null ? '引き分け' : this.playerName(winnerIdx)
    };
    this.render();
  }

  // ---------- 2台PvP連携（ホスト側） ----------
  async sendSync() {
    if (this.mode !== 'pvpHost' || !this.conn) return;
    const s = this.state;
    const guestHand = this.players[1].kind === 'remote' ? s.hands[1] : [];
    const view = {
      t: 'sync',
      round: s.round,
      turn: s.turn,
      first: s.first,
      phase: s.phase,
      scores: s.scores,
      wallCount: s.wall.length,
      riichi: s.riichi.slice(),
      guestHand,
      guestDraw: s.draw[1],
      hostHand: s.hands[0],
      hostHandCount: s.hands[0].length,
      guestMelds: s.melds[1],
      hostMelds: s.melds[0],
      guestRiver: s.rivers[1],
      hostRiver: s.rivers[0],
      lastDiscard: s.lastDiscard ? s.lastDiscard.card : null,
      msg: s.msg,
      roundResult: s.roundResult,
      gameOver: s.gameOver,
      canPon: this.canPon(1),
      canRon: !!this.canWinByDiscard(1)
    };
    this.conn.sendJSON(view);
  }

  // ---------- PvP 受信（ホスト側） ----------
  handleHostMessage(packet) {
    if (packet.t === 'ans' && this.pendingAsk) {
      const ask = this.pendingAsk;
      this.pendingAsk = null;
      this.state.waiting = null;
      this.render();
      ask.resolve(packet.value);
    } else if (packet.t === 'next') {
      // 子機が「次の対局へ進む」を押した
      this.guestNextReady = true;
      if (this.resolveGuestNext) {
        const r = this.resolveGuestNext;
        this.resolveGuestNext = null;
        r();
      } else {
        this.render();
      }
    }
  }

  // ---------- 2台PvP連携（ゲスト側） ----------
  handleGuestMessage(packet) {
    if (packet.t === 'sync') {
      this.remoteView = packet;
      this.render();
    } else if (packet.t === 'ask') {
      this.state.waitingLocal = packet.kind;
      this.guestAskReason = packet.kind === 'win' ? (packet.reason || null) : null;
      if (this.state.waitingLocal === 'win' && !packet.winInfo) {
        // 誤宣言も可能にするため win draw 時は常に聞く。winInfoは参考表示
      }
      this.render();
    }
  }

  // local guest answer -> conn.sendJSON handled in answer()
  answerGuest(value) {
    this.answer(value);
  }

  /** 子機: 「次の対局へ進む」を押した → 親機へ通知（親機が両者確認後に次局開始） */
  guestNextConfirm() {
    if (this.guestNextSent) return;
    this.guestNextSent = true;
    if (this.conn) this.conn.sendJSON({ t: 'next' });
    this.render();
  }

  // ---------- レンダリング ----------
  render() {
    if (typeof document === 'undefined') return;

    if (this.mode === 'pvpGuest') {
      this.renderGuest();
      return;
    }

    const s = this.state;
    document.getElementById('roundLabel').innerText = `第${s.round}局 / 4局`;
    document.getElementById('score0').innerText = `${this.players[0].name}${s.riichi[0] ? '（🔔リーチ中）' : ''}: ${s.scores[0]}pt`;
    document.getElementById('score1').innerText = `${this.players[1].name}${s.riichi[1] ? '（🔔リーチ中）' : ''}: ${s.scores[1]}pt`;
    document.getElementById('wallCount').innerText = `山札: ${s.wall.length}`;
    document.getElementById('msg').innerText = s.msg;
    document.getElementById('oppInfo').innerText = this.players[1].name + (s.riichi[1] ? '（🔔リーチ中）' : '');

    // 相手（index1）: 手札・メルド・捨て牌
    this.renderRiver('oppRiver', s.rivers[1]);
    document.getElementById('oppHandBack').innerHTML = '';
    if (s.phase === 'roundEnd' || s.phase === 'gameOver') {
      s.hands[1].forEach((c) => document.getElementById('oppHandBack').appendChild(this.cardEl(c, false)));
    } else {
      for (let i = 0; i < s.hands[1].length; i++) {
        const el = document.createElement('div');
        el.className = 'd-card d-card-back';
        el.innerText = '🂠';
        document.getElementById('oppHandBack').appendChild(el);
      }
    }
    this.renderMelds('oppMeld', s.melds[1]);

    // 自分（index0）: 捨て牌・手札・ツモ
    this.renderRiver('selfRiver', s.rivers[0]);
    const selfHandEl = document.getElementById('selfHand');
    selfHandEl.innerHTML = '';
    const awaitingDiscard = s.waiting && s.waiting.player === 0 && s.waiting.kind === 'discard';
    this.applyDisplayOrder(s.hands[0]).forEach((c) => {
      const el = this.cardEl(c, awaitingDiscard);
      if (awaitingDiscard) el.onclick = () => this.answer(c.id);
      selfHandEl.appendChild(el);
    });

    const drawEl = document.getElementById('selfDraw');
    drawEl.innerHTML = '';
    if (s.draw[0]) {
      const el = this.cardEl(s.draw[0], awaitingDiscard, true);
      if (awaitingDiscard) el.onclick = () => this.answer(s.draw[0].id);
      drawEl.appendChild(el);
    }
    this.renderMelds('selfMeld', s.melds[0]);

    // アクションボタン領域
    this.renderActions(s);

    // 結果バナー
    this.renderResult(s);

    // PvPホスト: 同期送信
    this.sendSync();
  }

  renderActions(s) {
    const act = document.getElementById('actions');
    act.innerHTML = '';

    const waiting = s.waiting;
    const waitSelf = waiting && waiting.player === 0 && this.players[0].kind !== 'ai';
    if (waitSelf) {
      if (waiting.kind === 'riichi') {
        act.appendChild(div('hint', '🔔 その捨て牌ならテンパイです。リーチを宣言しますか？（捨てた牌に印が付きます）'));
        act.appendChild(btn('リーチを宣言', 'btn-accent', () => this.answer(true)));
        act.appendChild(btn('リーチしない', 'btn-secondary', () => this.answer(false)));
      } else if (waiting.kind === 'win') {
        const hintText = (waiting.reason === 'ロン')
          ? '🎉 ロン！相手の捨て牌であがりの形が完成！ドンジャラを宣言しますか？'
          : '🎉 ツモ！自分で引いた牌であがりの形が完成！ドンジャラを宣言しますか？';
        act.appendChild(div('hint', hintText));
        act.appendChild(btn('ドンジャラ!', 'btn-primary', () => this.answer(true)));
        act.appendChild(btn('あがらない', 'btn-secondary', () => this.answer(false)));
      } else if (waiting.kind === 'discard') {
        const hint = div('hint', '☝️ ツモった牌も含め、捨てる牌をタップしてください');
        act.appendChild(hint);
      } else if (waiting.kind === 'pon') {
        act.appendChild(btn('ポン!', 'btn-accent', () => this.answer(true)));
        act.appendChild(btn('ポンしない', 'btn-secondary', () => this.answer(false)));
      }
    }
    // 局終了後: 次局へ進むボタン（最終局はゲームオーバー画面が出るため対象外）
    if (s.phase === 'roundEnd' && s.round > 0 && s.round < 4) {
      if (this.resolveNextRound) {
        act.appendChild(div('hint', '⬇️ 準備ができたら次の対局へ進んでください'));
        act.appendChild(btn('▶️ 次の対局へ進む', 'btn-primary', () => this.answerNextRound()));
      } else if (this.mode === 'pvpHost' && !this.guestNextReady) {
        act.appendChild(div('hint', '⏳ 相手(子機)が「次の対局へ進む」を押すのを待っています…'));
      } else if (this.mode === 'pvpHost') {
        act.appendChild(div('hint', '✅ 相手(子機)の準備OK'));
      }
    }
  }

  renderResult(s) {
    const res = document.getElementById('roundResult');
    if (s.roundResult && s.roundResult.winner !== null) {
      const r = s.roundResult;
      const yakuText = r.yaku.map((y) => `${y.name}+${y.pts}`).join(' / ');
      res.innerText = `🎉 ${r.winnerName} あがり！（${r.reason}） ${yakuText} = ${r.points}pt`;
      res.className = 'result-banner winner';
    } else if (s.roundResult) {
      res.innerText = `🏳️ ${s.roundResult.reason}`;
      res.className = 'result-banner flow';
    } else {
      res.innerText = '';
      res.className = 'result-banner';
    }

    const over = document.getElementById('gameOverOverlay');
    if (s.gameOver) {
      const g = s.gameOver;
      const verdict = (g.winnerIdx === null) ? '🤝 引き分けです' : (g.winnerIdx === this.selfIndex ? '🏆 あなたの勝ち！' : '😢 あなたの負け');
      document.getElementById('finalResult').innerHTML =
        `<b>${verdict}</b><br>` +
        `${this.players[0].name}: ${g.scores[0]}pt ／ ${this.players[1].name}: ${g.scores[1]}pt`;
      over.classList.add('active');
    } else {
      over.classList.remove('active');
    }
  }

  // ---------- ゲスト画面のレンダリング ----------
  renderGuest() {
    if (!this.remoteView) return;
    const v = this.remoteView;
    // 局が切り替わったら「次へ」送信済みフラグをリセットし、残っていた操作待ちを解除
    if (this.guestRoundSeen !== v.round) {
      this.guestRoundSeen = v.round;
      this.guestNextSent = false;
      this.guestAskReason = null;
    }
    if (v.phase === 'roundEnd') this.state.waitingLocal = null;
    document.getElementById('roundLabel').innerText = `第${v.round}局 / 4局`;
    document.getElementById('score0').innerText = `相手(親機)${v.riichi && v.riichi[0] ? '（🔔リーチ中）' : ''}: ${v.scores[0]}pt`;
    document.getElementById('score1').innerText = `あなた(子機)${v.riichi && v.riichi[1] ? '（🔔リーチ中）' : ''}: ${v.scores[1]}pt`;
    document.getElementById('wallCount').innerText = `山札: ${v.wallCount}`;
    document.getElementById('msg').innerText = v.msg || '';
    document.getElementById('oppInfo').innerText = '相手(親機)' + (v.riichi && v.riichi[0] ? '（🔔リーチ中）' : '');

    // 相手（親機）: index0
    this.renderRiver('oppRiver', v.hostRiver);
    document.getElementById('oppHandBack').innerHTML = '';
    if (v.phase === 'roundEnd' || v.phase === 'gameOver') {
      (v.hostHand || []).forEach((c) => document.getElementById('oppHandBack').appendChild(this.cardEl(c, false)));
    } else {
      for (let i = 0; i < (v.hostHandCount || 0); i++) {
        const el = document.createElement('div');
        el.className = 'd-card d-card-back';
        el.innerText = '🂠';
        document.getElementById('oppHandBack').appendChild(el);
      }
    }
    this.renderMelds('oppMeld', v.hostMelds);

    // 自分（子機）: index1
    this.renderRiver('selfRiver', v.guestRiver);
    const selfHandEl = document.getElementById('selfHand');
    selfHandEl.innerHTML = '';
    const awaitingDiscard = this.state.waitingLocal === 'discard';
    this.applyDisplayOrder(v.guestHand || []).forEach((c) => {
      const el = this.cardEl(c, awaitingDiscard);
      if (awaitingDiscard) el.onclick = () => this.answer(c.id);
      selfHandEl.appendChild(el);
    });

    const drawEl = document.getElementById('selfDraw');
    drawEl.innerHTML = '';
    if (v.guestDraw) {
      const el = this.cardEl(v.guestDraw, awaitingDiscard, true);
      if (awaitingDiscard) el.onclick = () => this.answer(v.guestDraw.id);
      drawEl.appendChild(el);
    }
    this.renderMelds('selfMeld', v.guestMelds);

    const act = document.getElementById('actions');
    act.innerHTML = '';
    if (this.state.waitingLocal === 'riichi') {
      act.appendChild(div('hint', '🔔 その捨て牌ならテンパイです。リーチを宣言しますか？（捨てた牌に印が付きます）'));
      act.appendChild(btn('リーチを宣言', 'btn-accent', () => this.answer(true)));
      act.appendChild(btn('リーチしない', 'btn-secondary', () => this.answer(false)));
    } else if (this.state.waitingLocal === 'win') {
      const reason = this.guestAskReason || (v.guestDraw ? 'ツモ' : (v.lastDiscard ? 'ロン' : ''));
      const hintText = (reason === 'ロン')
        ? '🎉 ロン！相手の捨て牌であがりの形が完成！ドンジャラを宣言しますか？'
        : '🎉 ツモ！自分で引いた牌であがりの形が完成！ドンジャラを宣言しますか？';
      act.appendChild(div('hint', hintText));
      act.appendChild(btn('ドンジャラ!', 'btn-primary', () => this.answer(true)));
      act.appendChild(btn('あがらない', 'btn-secondary', () => this.answer(false)));
    } else if (this.state.waitingLocal === 'discard') {
      act.appendChild(div('hint', '☝️ ツモった牌も含め、捨てる牌をタップしてください'));
    } else if (this.state.waitingLocal === 'pon') {
      act.appendChild(btn('ポン!', 'btn-accent', () => this.answer(true)));
      act.appendChild(btn('ポンしない', 'btn-secondary', () => this.answer(false)));
    }
    // 局終了後: 次局へ進むボタン（最終局はゲームオーバー）
    if (v.phase === 'roundEnd') {
      act.innerHTML = '';
      if (v.roundResult && v.round < 4) {
        if (this.guestNextSent) {
          act.appendChild(div('hint', '✅ 準備OK。親機の次の対局開始を待っています…'));
        } else {
          act.appendChild(div('hint', '⬇️ 準備ができたら次の対局へ進んでください'));
          act.appendChild(btn('▶️ 次の対局へ進む', 'btn-primary', () => this.guestNextConfirm()));
        }
      }
    }

    // 結果・終了表示
    const res = document.getElementById('roundResult');
    if (v.roundResult && v.roundResult.winner !== null) {
      const r = v.roundResult;
      const yakuText = r.yaku.map((y) => `${y.name}+${y.pts}`).join(' / ');
      res.innerText = `🎉 ${r.winnerName} あがり！（${r.reason}） ${yakuText} = ${r.points}pt`;
      res.className = 'result-banner winner';
    } else if (v.roundResult) {
      res.innerText = `🏳️ ${v.roundResult.reason}`;
      res.className = 'result-banner flow';
    } else {
      res.innerText = '';
      res.className = 'result-banner';
    }

    const over = document.getElementById('gameOverOverlay');
    if (v.gameOver) {
      const g = v.gameOver;
      const verdict = (g.winnerIdx === null) ? '🤝 引き分けです' : (g.winnerIdx === this.selfIndex ? '🏆 あなたの勝ち！' : '😢 あなたの負け');
      document.getElementById('finalResult').innerHTML =
        `<b>${verdict}</b><br>` +
        `相手(親機): ${g.scores[0]}pt ／ あなた(子機): ${g.scores[1]}pt`;
      over.classList.add('active');
    } else {
      over.classList.remove('active');
    }
  }

  // ---------- DOM ヘルパー ----------
  cardEl(card, clickable, isDraw = false) {
    const el = document.createElement('div');
    el.className = 'd-card' + (isDraw ? ' d-draw' : '') + (clickable ? ' d-clickable' : '') + (card.wild ? ' d-wild' : '');
    el.innerHTML = `<div class="d-card-emoji">${card.emoji}</div><div class="d-card-label">${this.escapeHtml(card.label)}</div>`;
    return el;
  }

  renderRiver(elId, river) {
    const el = document.getElementById(elId);
    el.innerHTML = '';
    river.forEach((c) => {
      const cardEl = this.cardEl(c, false, false);
      if (c.riichi) {
        // リーチ宣言した捨て牌に印（bug009）
        cardEl.classList.add('d-riichi');
        cardEl.innerHTML += '<div class="d-riichi-tag">🔔リーチ</div>';
      }
      el.appendChild(cardEl);
    });
  }

  /** ポンで成立した3枚組（メルド）を表向きで表示（捨て牌・打牌対象にはならない） */
  renderMelds(elId, melds) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.innerHTML = '';
    if (!melds || melds.length === 0) {
      el.style.display = 'none';
      return;
    }
    el.style.display = '';
    melds.forEach((m) => {
      const group = div('d-meld-row', '');
      group.appendChild(span('d-meld-tag', 'ポン'));
      m.cards.forEach((c) => group.appendChild(this.cardEl(c, false, false)));
      el.appendChild(group);
    });
  }

  escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (m) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m]));
  }
}

function btn(text, cls, onClick) {
  const b = document.createElement('button');
  b.className = cls;
  b.innerText = text;
  if (onClick) b.onclick = onClick;
  return b;
}

function div(cls, text) {
  const d = document.createElement('div');
  if (cls) d.className = cls;
  d.innerText = text;
  return d;
}

function span(cls, text) {
  const s = document.createElement('span');
  if (cls) s.className = cls;
  s.innerText = text;
  return s;
}

function cardLabel(card) {
  if (!card) return '?';
  return `${card.emoji} ${card.label}`;
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    DONJARA_MOTIFS,
    WILD,
    buildDeck,
    shuffle,
    compareCards,
    sortCards,
    sortGroups,
    countMotifs,
    analyzeWin,
    analyzeWin9,
    isTenpai,
    scoreYaku,
    Yaku: window.Yaku,
    ...window.DONJARA_YAKU_CLASSES,
    YakuManager: window.YakuManager,
    DonjaraAI,
    DonjaraGame
  };
}