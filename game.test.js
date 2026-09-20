const assert = require('node:assert/strict');
const test = require('node:test');

global.window = {};
require('./donjara_config.js');
const {
  BasicYaku,
  AllSameMotifYaku,
  AllDifferentMotifYaku,
  NoWildYaku,
  IppatsuYaku,
  YakuManager,
  scoreYaku,
  buildDeck
} = require('./game.js');

function definition(id, name, points, type) {
  return { id, name, points, type };
}

function cards(count = 9, wild = false) {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    motif: 'neko',
    wild
  }));
}

function groups(motifs = ['neko', 'neko', 'neko']) {
  return motifs.map((motif, index) => ({
    motif,
    cards: cards(3).map((card) => ({ ...card, id: card.id + index * 3, motif }))
  }));
}

test('BasicYaku成立: 9枚かつ3組', () => {
  const yaku = new BasicYaku();
  assert.equal(yaku.description, '3枚組を3組そろえる');
  assert.equal(yaku.isSatisfied(cards(), { groups: groups(), jokersUsed: 0 }), true);
  assert.equal(yaku.isSatisfied(cards(8), { groups: groups(), jokersUsed: 0 }), false);
  assert.equal(yaku.isSatisfied(cards(), { groups: groups().slice(0, 2), jokersUsed: 0 }), false);
});

test('AllSameMotifYaku成立・不成立', () => {
  const yaku = new AllSameMotifYaku();
  assert.equal(yaku.isSatisfied(cards(), { groups: groups(['neko', 'neko', 'neko']) }), true);
  assert.equal(yaku.isSatisfied(cards(), { groups: groups(['neko', 'inu', 'neko']) }), false);
});

test('AllDifferentMotifYaku成立・不成立', () => {
  const yaku = new AllDifferentMotifYaku();
  assert.equal(yaku.isSatisfied(cards(), { groups: groups(['neko', 'inu', 'usagi']) }), true);
  assert.equal(yaku.isSatisfied(cards(), { groups: groups(['neko', 'inu', 'neko']) }), false);
});

test('NoWildYaku成立・不成立', () => {
  const yaku = new NoWildYaku();
  assert.equal(yaku.isSatisfied(cards(), {}), true);
  assert.equal(yaku.isSatisfied([{ wild: false }, { wild: true }], {}), false);
});

test('IppatsuYaku成立・不成立', () => {
  const yaku = new IppatsuYaku();
  assert.equal(yaku.description, 'リーチ直後の相手の捨て牌または次の自分のツモであがる');
  assert.equal(yaku.isSatisfied(cards(), { ippatsu: true }), true);
  assert.equal(yaku.isSatisfied(cards(), { ippatsu: false }), false);
  assert.equal(yaku.isSatisfied(cards(), {}), false);
});

test('AllStarsYaku成立・不成立', () => {
  const yaku = new AllDifferentMotifYaku();
  assert.equal(yaku.isSatisfied(cards(), { groups: groups(['neko', 'inu', 'usagi']) }), true);
  assert.equal(yaku.isSatisfied(cards(), { groups: groups(['neko', 'inu', 'neko']) }), false);
});

test('YakuManagerは最高点のあがり役と全加算役を採用する', () => {
  const manager = new YakuManager([
    new BasicYaku(),
    new AllSameMotifYaku(),
    new NoWildYaku(),
    new IppatsuYaku()
  ]);
  const result = manager.evaluate(cards(), {
    groups: groups(['neko', 'neko', 'neko']),
    jokersUsed: 0,
    ippatsu: true
  });

  assert.equal(result.canWin, true);
  assert.deepEqual(result.yaku.map((yaku) => yaku.id), [
    'all_same_motif',
    'no_wild',
    'ippatsu'
  ]);
  assert.equal(result.total, 35);
  assert.equal(result.yaku.find((yaku) => yaku.id === 'ippatsu').description,
    'リーチ直後の相手の捨て牌または次の自分のツモであがる');
});

test('YakuManagerはあがり役がなければ加算役を採用しない', () => {
  const manager = new YakuManager([new NoWildYaku(), new IppatsuYaku()]);
  const result = manager.evaluate(cards(), { groups: [], jokersUsed: 0, ippatsu: true });
  assert.deepEqual(result, { yaku: [], total: 0, canWin: false });
});

test('scoreYakuは未ソートの組を正規化して評価する', () => {
  const deck = buildDeck();
  const unsortedGroups = [
    { motif: 'kitsune', cards: deck.filter((card) => card.motif === 'kitsune').slice(0, 3).reverse() },
    { motif: 'neko', cards: deck.filter((card) => card.motif === 'neko').slice(0, 3).reverse() },
    { motif: 'inu', cards: deck.filter((card) => card.motif === 'inu').slice(0, 3).reverse() }
  ];
  const result = scoreYaku(unsortedGroups, 0, { ippatsu: true });
  assert.equal(result.yaku.some((yaku) => yaku.id === 'basic'), true);
  assert.equal(result.yaku.some((yaku) => yaku.id === 'ippatsu'), true);
});
