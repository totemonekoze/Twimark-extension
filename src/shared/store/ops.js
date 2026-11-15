// 一覧を変える操作（ops）と、追加の記録（addTrace）。ops のどれかが返す { op, args } を client.js の update で Worker に送る。
// 一覧の画面・アプリ・拡張が使う。追加の記録は、追加の画面で出したおすすめ・初期の選択・類似を、選んだ組と並べて残す（定義 2026-11-02-002）。
// ops.similarBack も類似の記録（similarBrief）を使うので、操作と記録を同じファイルに置く
import { pickByRules } from './rules.js';
import { placeExists } from './data.js';
import { inferPlaces, initialPlace, suggestPlaces } from './suggest.js';
import { round3, similarNear } from './similar.js';

/**
 * Worker の POST /api/ops に送る操作
 * @typedef {object} Op
 * @property {string} op 操作の名前（ops のキーと同じ。similarBack だけは 'logEvent'）
 * @property {unknown[]} args 操作の引数
 */

// 追加の記録（定義 2026-11-02-002）。bookmark は保存するもの（ops.add に渡すもの。category・subcategory が選んだ組）、data は保存の前のもの。
// similar は確かめに出した similarBookmarks（出していなければ空）。client は 'web' | 'app' | 'ext-popup' | 'ext-inline'
const placeBrief = (p) => (p ? { category: p.category, subcategory: p.subcategory ?? null } : null);

/**
 * 確かめに出した類似の投稿を、記録に残す短い形にする
 * @param {Array<{ bookmark: { id: string }, reason: string, score: number }>} list similarBookmarks の返したもの
 * @returns {Array<{ id: string, reason: string, score: number }>} score は round3 で丸めたもの
 */
export const similarBrief = (list) => list.map((s) => ({
  id: s.bookmark.id, reason: s.reason, score: round3(s.score),
}));

/**
 * 追加の記録（上の注）。ops.add の 2 つ目の引数に渡す
 * @param {import('./data.js').Data} data 保存の前のデータ
 * @param {import('./data.js').Bookmark} bookmark 保存するもの（category・subcategory が選んだ組）
 * @param {{ client: string, similar?: Array<{ bookmark: { id: string }, reason: string, score: number }> }} options
 *   client: 'web' | 'app' | 'ext-popup' | 'ext-inline'、similar: 確かめに出した similarBookmarks（既定は空）
 * @returns {{
 *   client: string,
 *   infer: Array<{ category: string, subcategory: string | null, score: number, sure: boolean }>,
 *   shown: number,
 *   rule: import('./data.js').Place | null,
 *   initial: { category: string, subcategory: string | null, by: string } | null,
 *   chosen: import('./data.js').Place | null,
 *   similar: Array<{ id: string, reason: string, score: number }>,
 *   near: Array<{ id: string, words: number, mass: number }>,
 * }} 記録（infer は推し量った上位3つ、shown は出したおすすめの札の数）
 */
export function addTrace(data, bookmark, { client, similar = [] }) {
  const rule = pickByRules(data.rules, bookmark);
  const initial = initialPlace(data, bookmark);
  return {
    client,
    infer: inferPlaces(data, bookmark)
      .slice(0, 3)
      .map((p) => ({ ...placeBrief(p), score: round3(p.score), sure: p.sure })),
    shown: suggestPlaces(data, bookmark).length,
    rule: placeExists(data, rule) ? placeBrief(rule) : null,
    initial: initial ? { ...placeBrief(initial), by: initial.by } : null,
    chosen: placeBrief(bookmark),
    similar: similarBrief(similar),
    near: similarNear(data, bookmark),
  };
}

/**
 * 一覧を変える操作。Worker の POST /api/ops に { op, args } で送る（検査は Worker が行う）。
 * どれも引数を受け取って Op（{ op, args }）を返すだけで、送るのは client.js の update
 * @type {Record<string, (...args: any[]) => Op>}
 */
export const ops = {
  // trace は addTrace の記録（任意。定義 2026-11-02-002）
  add: (bookmark, trace) => ({ op: 'add', args: trace ? [bookmark, trace] : [bookmark] }),
  remove: (id) => ({ op: 'remove', args: [id] }),
  // 古いブックマークの整理（定義 2026-11-07-004）。removeMany は 50 件まで。
  // marks は ids と同じ並びの { kind, sure }、mark は { kind, sure }（staleCandidates の種類と段。あれば stale-remove・stale-keep を記録する。定義 2026-11-10-002）
  removeMany: (ids, marks) => ({ op: 'removeMany', args: marks ? [ids, marks] : [ids] }),
  setStaleKeep: (id, on, mark) => ({ op: 'setStaleKeep', args: mark ? [id, on, mark] : [id, on] }),
  // via は整理の候補から移したときの印（'sort:rule' | 'sort:infer' | 'sort:review' | 'sort:maybe'。手で移したときは付けない）
  setCategory: (id, category, subcategory = null, via) => ({
    op: 'setCategory',
    args: via ? [id, category, subcategory, via] : [id, category, subcategory],
  }),
  addCategory: (name) => ({ op: 'addCategory', args: [name] }),
  removeCategory: (name) => ({ op: 'removeCategory', args: [name] }),
  sortCategories: (names) => ({ op: 'sortCategories', args: [names] }),
  addSubcategory: (category, name) => ({ op: 'addSubcategory', args: [category, name] }),
  removeSubcategory: (category, name) => ({ op: 'removeSubcategory', args: [category, name] }),
  sortSubcategories: (category, names) => ({ op: 'sortSubcategories', args: [category, names] }),
  // 色。アクセントは #RRGGBB か null（既定）、カテゴリの色は決まった色の名前か #RRGGBB か null（並び順）
  setAccent: (color) => ({ op: 'setAccent', args: [color] }),
  setAccentText: (color) => ({ op: 'setAccentText', args: [color] }),
  setCategoryColor: (name, color) => ({ op: 'setCategoryColor', args: [name, color] }),
  // カテゴリの固定（on は真偽）と、カテゴリの画面の並び順（CATEGORY_SORTS のどれか）
  setCategoryPinned: (name, on) => ({ op: 'setCategoryPinned', args: [name, on] }),
  setCategorySort: (value) => ({ op: 'setCategorySort', args: [value] }),
  // 縦長の一覧のカテゴリの絞り込みの形（CHIP_LAYOUTS のどれか）
  setChipLayout: (value) => ({ op: 'setChipLayout', args: [value] }),
  // 自動整理（定義 2026-10-30-004）。on は真偽。kind は RULE_KINDS、subcategory は null でカテゴリの直下。ids は今のルールの id を全部
  setAutoSort: (on) => ({ op: 'setAutoSort', args: [on] }),
  addRule: (kind, value, category, subcategory = null) => ({
    op: 'addRule',
    args: [kind, value, category, subcategory],
  }),
  removeRule: (id) => ({ op: 'removeRule', args: [id] }),
  sortRules: (ids) => ({ op: 'sortRules', args: [ids] }),
  // まとめて移す。moves は [[id, カテゴリ, サブカテゴリ], ...]（1〜500件）
  moveBookmarks: (moves, via) => ({ op: 'moveBookmarks', args: via ? [moves, via] : [moves] }),
  // 答えの記録（定義 2026-11-02-002）。整理の候補を外す（to は行き先、by は候補の種類）・類似の見直しの答え・類似の確かめの「戻る」
  dismissCandidate: (id, to, by) => ({ op: 'dismissCandidate', args: [id, to.category, to.subcategory ?? null, by] }),
  labelSimilar: (a, b, same) => ({ op: 'labelSimilar', args: [a, b, same] }),
  similarBack: (id, similar) => ({ op: 'logEvent', args: ['similar-back', id, { similar: similarBrief(similar) }] }),
  // 追加の画面（定義 2026-10-31-001）。おすすめを最初から選ぶか（真偽）と、その場で作れるもの（ADD_CREATES のどれか）
  setSuggestFirst: (on) => ({ op: 'setSuggestFirst', args: [on] }),
  setAddCreate: (value) => ({ op: 'setAddCreate', args: [value] }),
  // おすすめの数（SUGGEST_COUNTS のどれか。定義 2026-10-31-004）
  setSuggestCount: (n) => ({ op: 'setSuggestCount', args: [n] }),
  // 最後に知らせたアップデートの日（YYYY-MM-DD。定義 2026-11-03-001）
  setUpdatesSeen: (date) => ({ op: 'setUpdatesSeen', args: [date] }),
  // テーマ（'system' | 'light' | 'dark' | 'cream'）
  setTheme: (value) => ({ op: 'setTheme', args: [value] }),
  // カテゴリを別のカテゴリの下へ入れる・サブカテゴリをカテゴリに戻す・サブカテゴリを別のカテゴリへ移す
  nestCategory: (name, parent) => ({ op: 'nestCategory', args: [name, parent] }),
  // index は、カテゴリにしたものを入れるカテゴリの並びの位置（なければ一番後ろ）
  promoteSubcategory: (category, name, index) => ({
    op: 'promoteSubcategory',
    args: index === undefined ? [category, name] : [category, name, index],
  }),
  // カテゴリ・サブカテゴリの名前を変える（ブックマークと色もそろう）
  renameCategory: (name, next) => ({ op: 'renameCategory', args: [name, next] }),
  renameSubcategory: (category, name, next) => ({ op: 'renameSubcategory', args: [category, name, next] }),
  moveSubcategory: (from, name, to) => ({ op: 'moveSubcategory', args: [from, name, to] }),
  // 独立のメモの題・本文・URL を直す（メモだけ）。ブックマークへの書き添えを書く（空で消す）
  editMemo: (id, fields) => ({ op: 'editMemo', args: [id, fields] }),
  setNote: (id, note) => ({ op: 'setNote', args: [id, note] }),
  // 翻訳と要約見出し（Workers AI）。1件の足りない分を作る・選んだ5件までを作る・要約見出しをカードに出すか。
  // add の bookmark に wantSummary・wantTranslation（真偽、ないときは ON）を付けると、OFF の方は作らない
  refreshAi: (id) => ({ op: 'refreshAi', args: [id] }),
  // kinds は { summary, translation }（作る方を真。なければ両方）
  fillAi: (ids, kinds) => ({ op: 'fillAi', args: kinds === undefined ? [ids] : [ids, kinds] }),
  setSummaryOn: (id, on) => ({ op: 'setSummaryOn', args: [id, on] }),
  // お気に入り（★）。on は真偽
  setFavorite: (id, on) => ({ op: 'setFavorite', args: [id, on] }),
  // 利用者が書く要約見出し（2行・40文字まで。null か空で消す）。add の bookmark にも summary を付けられる
  setSummary: (id, summary) => ({ op: 'setSummary', args: [id, summary] }),
  // 要約見出しを作るか・翻訳するか。wants は { wantSummary?, wantTranslation? }（渡した方だけ変える）
  setAiWants: (id, wants) => ({ op: 'setAiWants', args: [id, wants] }),
};
