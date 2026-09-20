// 牌の柄・バリエーション・枚数の定義
// sortOrder が小さい柄ほど先に並ぶ。variants は number の昇順で定義する。
// バリエーションを追加する場合は variants に { number, count, label } を追加する。
window.DONJARA_MOTIFS = [
  { id: 'neko',    sortOrder: 1, emoji: '🐱', label: '猫', variants: [{ number: 1, count: 7, label: '' }, { number: 2, count: 3, label: '🌟' }] },
  { id: 'usagi',   sortOrder: 2, emoji: '🐰', label: '兎', variants: [{ number: 1, count: 7, label: '' }, { number: 2, count: 3, label: '🌟' }] },
  { id: 'inu',     sortOrder: 3, emoji: '🐶', label: '犬', variants: [{ number: 1, count: 7, label: '' }, { number: 2, count: 3, label: '🌟' }] },
  { id: 'kaeru',   sortOrder: 4, emoji: '🐸', label: '蛙', variants: [{ number: 1, count: 3, label: '🧺' }, { number: 2, count: 3, label: '🍜' }, { number: 3, count: 3, label: '🚕' }] },
  { id: 'sakana',  sortOrder: 5, emoji: '🐟', label: '魚', variants: [{ number: 1, count: 8, label: '' }, { number: 2, count: 1, label: '🌟' }] },
  { id: 'kitsune', sortOrder: 6, emoji: '🦊', label: '狐', variants: [{ number: 1, count: 9, label: '' }] },
  { id: 'panda',   sortOrder: 7, emoji: '🐼', label: 'パンダ', variants: [{ number: 1, count: 9, label: '' }] },
  { id: 'buta',    sortOrder: 8, emoji: '🐷', label: '豚', variants: [{ number: 1, count: 9, label: '' }] },
  { id: 'tori',    sortOrder: 9, emoji: '🐔', label: '鳥', variants: [{ number: 1, count: 9, label: '' }] },
];

/**
 * isSatisfied() に渡す判定コンテキスト。
 *
 * @typedef {object} YakuSatisfiedContext
 * @property {Array<object>} groups ソート済みの3枚組一覧。各組のcardsも牌ソート順に並ぶ。
 * @property {number} jokersUsed あがり形で使用したジョーカーの枚数。
 */

/**
 * isRiichi() に渡す判定コンテキスト。
 *
 * @typedef {object} YakuRiichiContext
 * @property {Array<object>} melds すでに成立しているメルドの一覧。
 * @property {(cards: Array<object>) => boolean} isTenpai 共通のテンパイ判定関数。
 */

class Yaku {
  /**
   * @param {string} id 役ID。
   * @param {string} name 役名。
   * @param {number} points 役の点数。
   * @param {'agari'|'addition'} type 役の種類。
   */
  constructor(id, name, points, type) {
    this.id = id;
    this.name = name;
    this.points = points;
    this.type = type;
  }

  /**
   * 渡された牌で、この役が成立しているか判定する。
   *
  * @param {Array<object>} cards ソート済みの判定対象牌一覧。通常はあがり形の9枚。
  * @param {YakuSatisfiedContext} context 判定補助情報。groupsとjokersUsedを含む。
   * @returns {boolean} 役が成立していればtrue。
   */
  isSatisfied(cards, context = {}) {
    return false;
  }

  /**
   * 渡された牌が、この役を成立させられるリーチ状態か判定する。
   *
   * @param {Array<object>} cards 捨て牌後に残る牌一覧。通常は手牌8枚とメルドの牌。
  * @param {YakuRiichiContext} context リーチ判定の補助情報。共通のisTenpai関数とmeldsを含む。
   * @returns {boolean} この役でリーチ可能ならtrue。
   */
  isRiichi(cards, context = {}) {
    throw new Error(`${this.name} は isRiichi() を実装してください`);
  }

  result() {
    return { id: this.id, name: this.name, pts: this.points, type: this.type };
  }
}

class BasicYaku extends Yaku {
  constructor() {
    super('basic', '基本', 10, 'agari');
  }

  /**
  * @param {Array<object>} cards ソート済みの判定対象牌一覧。
   * @param {object} context あがり形の判定結果。groupsに3つの組を含む。
   * @returns {boolean} 3組のあがり形が成立していればtrue。
   */
  isSatisfied(cards, context = {}) {
    return Array.isArray(cards) && cards.length === 9 &&
      Array.isArray(context.groups) && context.groups.length === 3;
  }

  isRiichi(cards, context = {}) {
    return typeof context.isTenpai === 'function' && context.isTenpai(cards);
  }
}

class AllSameMotifYaku extends Yaku {
  constructor() {
    super('all_same_motif', '全組同柄', 20, 'agari');
  }

  /**
  * @param {Array<object>} cards ソート済みの判定対象牌一覧。柄の判定はcontext.groupsを使用する。
  * @param {YakuSatisfiedContext} context あがり形の判定結果。groupsに各組の柄を含む。
   * @returns {boolean} 3組がすべて同じ柄ならtrue。
   */
  isSatisfied(cards, context = {}) {
    return new Set((context.groups || []).map((group) => group.motif)).size === 1;
  }

  isRiichi(cards, context = {}) {
    return typeof context.isTenpai === 'function' && context.isTenpai(cards);
  }
}

class AllDifferentMotifYaku extends Yaku {
  constructor() {
    super('all_different_motif', '全組異柄', 10, 'agari');
  }

  /**
  * @param {Array<object>} cards ソート済みの判定対象牌一覧。柄の判定はcontext.groupsを使用する。
  * @param {YakuSatisfiedContext} context あがり形の判定結果。groupsに各組の柄を含む。
   * @returns {boolean} 3組の柄がすべて異なればtrue。
   */
  isSatisfied(cards, context = {}) {
    return new Set((context.groups || []).map((group) => group.motif)).size === 3;
  }

  isRiichi(cards, context = {}) {
    return typeof context.isTenpai === 'function' && context.isTenpai(cards);
  }
}

class NoWildYaku extends Yaku {
  constructor() {
    super('no_wild', 'ジョーカー不使用', 5, 'addition');
  }

  /**
  * @param {Array<object>} cards ソート済みの判定対象牌一覧。
  * @param {YakuSatisfiedContext} context この役では使用しない判定補助情報。
   * @returns {boolean} ジョーカーを1枚も含まなければtrue。
   */
  isSatisfied(cards, context = {}) {
    return cards.every((card) => !card.wild);
  }

  isRiichi(cards, context = {}) {
    return typeof context.isTenpai === 'function' && context.isTenpai(cards);
  }
}

class IppatsuYaku extends Yaku {
  constructor() {
    super('ippatsu', 'リーチ一発', 10, 'addition');
  }

  /**
   * @param {Array<object>} cards ソート済みの判定対象牌一覧。
   * @param {YakuSatisfiedContext} context ippatsuがtrueなら成立。
   * @returns {boolean} リーチ一発の条件を満たしていればtrue。
   */
  isSatisfied(cards, context = {}) {
    return context.ippatsu === true;
  }

  isRiichi(cards, context = {}) {
    return false;
  }
}

class YakuManager {
  constructor(yakus = []) {
    this.yakus = yakus;
  }

  /**
   * 全役を評価し、採用する役と合計点を返す。
   *
   * @param {Array<object>} cards 判定対象の牌一覧。
   * @param {YakuSatisfiedContext} context 各役へ渡す判定コンテキスト。
   * @returns {{yaku: Array<object>, total: number, canWin: boolean}} 役評価結果。
   */
  evaluate(cards, context = {}) {
    const satisfied = this.yakus.filter((yaku) => yaku.isSatisfied(cards, context));
    const agariYakus = satisfied
      .filter((yaku) => yaku.type === 'agari')
      .sort((a, b) => b.points - a.points);
    if (agariYakus.length === 0) return { yaku: [], total: 0, canWin: false };

    const selected = [agariYakus[0], ...satisfied.filter((yaku) => yaku.type === 'addition')];
    return {
      yaku: selected.map((yaku) => yaku.result()),
      total: selected.reduce((sum, yaku) => sum + yaku.points, 0),
      canWin: true
    };
  }
}

window.DONJARA_YAKUS = [BasicYaku, AllSameMotifYaku, AllDifferentMotifYaku, NoWildYaku, IppatsuYaku];
window.DONJARA_YAKU_CLASSES = {
  BasicYaku,
  AllSameMotifYaku,
  AllDifferentMotifYaku,
  NoWildYaku,
  IppatsuYaku
};
window.Yaku = Yaku;
window.YakuManager = YakuManager;
