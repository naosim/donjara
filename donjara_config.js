// 牌の柄・バリエーション・枚数の定義
// バリエーションを追加する場合は variants に { number, count, label } を追加する。
window.DONJARA_MOTIFS = [
  { id: 'inu', emoji: '🐶', label: '犬', variants: [{ number: 1, count: 7, label: '' }, { number: 2, count: 3, label: '🌟' }] },
  { id: 'neko', emoji: '🐱', label: '猫', variants: [{ number: 1, count: 7, label: '' }, { number: 2, count: 3, label: '🌟' }] },
  { id: 'kitsune', emoji: '🦊', label: '狐', variants: [{ number: 1, count: 9, label: '' }] },
  { id: 'panda', emoji: '🐼', label: 'パンダ', variants: [{ number: 1, count: 9, label: '' }] },
  { id: 'buta', emoji: '🐷', label: '豚', variants: [{ number: 1, count: 9, label: '' }] },
  { id: 'usagi', emoji: '🐰', label: '兎', variants: [{ number: 1, count: 7, label: '' }, { number: 2, count: 3, label: '🌟' }] },
  { id: 'kaeru', emoji: '🐸', label: '蛙', variants: [{ number: 1, count: 3, label: '🧺' }, { number: 2, count: 3, label: '🍜' }, { number: 3, count: 3, label: '🚕' }] },
  { id: 'tori', emoji: '🐔', label: '鳥', variants: [{ number: 1, count: 9, label: '' }] },
  { id: 'sakana', emoji: '🐟', label: '魚', variants: [{ number: 1, count: 8, label: '' }, { number: 2, count: 1, label: '🌟' }] }
];

// 役の定義。className は game.js にある役クラス名と対応させる。
window.DONJARA_YAKUS = [
  { id: 'basic', name: '基本', points: 10, type: 'agari', className: 'BasicYaku' },
  { id: 'all_same_motif', name: '全組同柄', points: 20, type: 'agari', className: 'AllSameMotifYaku' },
  { id: 'all_different_motif', name: '全組異柄', points: 10, type: 'agari', className: 'AllDifferentMotifYaku' },
  { id: 'no_wild', name: 'ジョーカー不使用', points: 5, type: 'addition', className: 'NoWildYaku' }
];
