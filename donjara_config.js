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
 * @property {Array<YakuGroup>} groups ソート済みの3枚組一覧。通常は3要素で、各要素のcardsも牌ソート順に並ぶ。
 * @property {number} jokersUsed あがり形で使用したジョーカーの枚数。
 */

/**
 * あがり形を構成する1つの3枚組。
 *
 * @typedef {object} YakuGroup
 * @property {string} motif 3枚組として扱う柄ID。ジョーカーを含む場合も、割り当てられた柄IDを持つ。
 * @property {Array<YakuCard>} cards 3枚組を構成する牌。牌ソート順に並んだ3枚の一覧。
 */

/**
 * YakuGroup.cards に入る牌オブジェクト。
 *
 * 通常牌は motif と variant で柄とバリエーションを識別する。
 * ジョーカーは wild がtrueで、variantなどを持たない。
 *
 * @typedef {object} YakuCard
 * @property {number} id 牌の一意なID。
 * @property {string} motif 牌の柄ID。ジョーカーの場合はwild。
 * @property {number} [variant] 通常牌のバリエーション番号。
 * @property {number} [sortOrder] 柄のソート順。
 * @property {string} [variantLabel] バリエーション表示ラベル。
 * @property {string} emoji 牌の絵文字。
 * @property {string} label 画面表示用のラベル。
 * @property {boolean} wild ジョーカーならtrue、通常牌ならfalse。
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
   * @param {string} description 役の成立条件の説明。
   */
  constructor(id, name, points, type, description) {
    this.id = id;
    this.name = name;
    this.points = points;
    this.type = type;
    this.description = description;
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
    return typeof context.isTenpai === 'function' && context.isTenpai(cards);
  }

  result() {
    return {
      id: this.id,
      name: this.name,
      pts: this.points,
      type: this.type,
      description: this.description
    };
  }
}

class BasicYaku extends Yaku {
  constructor() {
    super('basic', '基本', 10, 'agari', '3枚組を3組そろえる');
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
}

class AllSameMotifYaku extends Yaku {
  constructor() {
    super('all_same_motif', '全組同柄', 20, 'agari', '3組がすべて同じ柄');
  }

  /**
  * @param {Array<object>} cards ソート済みの判定対象牌一覧。柄の判定はcontext.groupsを使用する。
  * @param {YakuSatisfiedContext} context あがり形の判定結果。groupsに各組の柄を含む。
   * @returns {boolean} 3組がすべて同じ柄ならtrue。
   */
  isSatisfied(cards, context = {}) {
    return new Set((context.groups || []).map((group) => group.motif)).size === 1;
  }
}

class AllDifferentMotifYaku extends Yaku {
  constructor() {
    super('all_different_motif', '全組異柄', 10, 'agari', '3組の柄がすべて異なる');
  }

  /**
  * @param {Array<object>} cards ソート済みの判定対象牌一覧。柄の判定はcontext.groupsを使用する。
  * @param {YakuSatisfiedContext} context あがり形の判定結果。groupsに各組の柄を含む。
   * @returns {boolean} 3組の柄がすべて異なればtrue。
   */
  isSatisfied(cards, context = {}) {
    return new Set((context.groups || []).map((group) => group.motif)).size === 3;
  }
}

class NoWildYaku extends Yaku {
  constructor() {
    super('no_wild', 'ジョーカー不使用', 5, 'addition', 'ジョーカーを使わずにあがる');
  }

  /**
  * @param {Array<object>} cards ソート済みの判定対象牌一覧。
  * @param {YakuSatisfiedContext} context この役では使用しない判定補助情報。
   * @returns {boolean} ジョーカーを1枚も含まなければtrue。
   */
  isSatisfied(cards, context = {}) {
    return cards.every((card) => !card.wild);
  }
}

class IppatsuYaku extends Yaku {
  constructor() {
    super('ippatsu', 'リーチ一発', 10, 'addition', 'リーチ直後の相手の捨て牌または次の自分のツモであがる');
  }

  /**
   * @param {Array<object>} cards ソート済みの判定対象牌一覧。
   * @param {YakuSatisfiedContext} context ippatsuがtrueなら成立。
   * @returns {boolean} リーチ一発の条件を満たしていればtrue。
   */
  isSatisfied(cards, context = {}) {
    return context.ippatsu === true;
  }
}

class AllStarsYaku extends Yaku {
  constructor() {
    super('allstars', 'オールスター', 60, 'agari', '猫・兎・犬の3組をそろえる');
  }

  /**
   * @param {Array<object>} cards ソート済みの判定対象牌一覧。
   * @param {YakuSatisfiedContext} context ippatsuがtrueなら成立。
   * @returns {boolean} リーチ一発の条件を満たしていればtrue。
   */
  isSatisfied(cards, context = {}) {
    var hasNeko = hasUsagi = hasInu = false;
    var groups = new Set();
    (context.groups || []).forEach(group => groups.add(group.motif));
    return groups.has("neko") && groups.has("usagi") && groups.has("inu")
  }
}

class SuperAllStarsYaku extends Yaku {
  constructor() {
    super('superallstars', 'スーパーオールスター', 60, 'agari', 'オールスターの条件に加えて各柄の特別牌をそろえる');
    this.allstarsYaku = new AllStarsYaku();
  }

  /**
   * @param {Array<object>} cards ソート済みの判定対象牌一覧。
   * @param {YakuSatisfiedContext} context ippatsuがtrueなら成立。
   * @returns {boolean} リーチ一発の条件を満たしていればtrue。
   */
  isSatisfied(cards, context = {}) {
    if(!this.allstarsYaku.isSatisfied(cards, context)) {
      return false;
    }
    var groups = {neko:false, inu:false, usagi:false};
    (context.groups || []).forEach(group => group.cards.filter(card => card.variant == 2 || card.wild).forEach(card => {
      groups[card.motif] = true;
    }));
    return Object.values(groups).map(v => v).length == 3;
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
  IppatsuYaku,
  AllStarsYaku,
  SuperAllStarsYaku,
};
window.Yaku = Yaku;
window.YakuManager = YakuManager;
