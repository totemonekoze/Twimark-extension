// 利用者の全データの形をそろえること（normalize）と、行き先（カテゴリとサブカテゴリの組）の比べ方、独立のメモの id（memoId）。
// API の応答を受け取る client.js、おすすめ・整理（suggest.js・sort.js）、一覧の画面・アプリ・拡張・scripts が使う。
// よく出る形（ブックマーク 1 件、行き先、利用者の全データなど）は、下の @typedef に 1 回だけ書き、ほかのファイルからはこれを指す
import { ADD_CREATES, CATEGORY_SORTS, CHIP_LAYOUTS, SUGGEST_COUNTS } from './config.js';
import { RULE_KINDS } from './rules.js';

/**
 * ブックマーク 1 件（独立のメモも）。normalize が確かめるのは id と url が文字列であることだけで、ほかは足りないことがある
 * @typedef {object} Bookmark
 * @property {string} id ブックマークの id（独立のメモは memo: で始まる。memoId）
 * @property {string} url
 * @property {string} [site] SITES（config.js）のキー
 * @property {{ name?: string, handle?: string }} [author]
 * @property {string} [title]
 * @property {string} [text]
 * @property {string} [summary] 要約見出し
 * @property {string} category
 * @property {string | null} [subcategory]
 * @property {string} [savedAt] 保存した日時（文字列のまま比べる）
 * @property {string} [sortDismissed] 整理の候補で外した行き先（suggest.js の keyOf の形）
 */

/**
 * ルール・おすすめ・類似に渡す「ブックマークのようなもの」。保存する前の投稿でもよく、足りないものは空として扱う
 * @typedef {object} Facts
 * @property {string} [id] あれば、その id の保存を比べない（similar.js）
 * @property {string} [site]
 * @property {string} [url]
 * @property {{ name?: string, handle?: string }} [author]
 * @property {string} [title]
 * @property {string} [text]
 * @property {string} [summary] 要約見出し（おすすめだけが見る）
 */

/**
 * 行き先。カテゴリと、その下のサブカテゴリ（null はカテゴリの直下）
 * @typedef {object} Place
 * @property {string} category
 * @property {string | null} subcategory
 */

/**
 * 自動整理のルール 1 つ
 * @typedef {object} Rule
 * @property {number} id
 * @property {string} kind RULE_KINDS（rules.js）のどれか
 * @property {string} value
 * @property {string} category
 * @property {string | null} subcategory
 */

/**
 * 利用者の全データ（normalize の返すもの）
 * @typedef {object} Data
 * @property {string[]} categories カテゴリの並び
 * @property {Record<string, string[]>} subcategories カテゴリごとのサブカテゴリの並び
 * @property {Record<string, string>} categoryColors カテゴリごとの色
 * @property {string | null} accent アクセントの色（#RRGGBB か null）
 * @property {string | null} accentOn アクセントの上の文字の色（#RRGGBB か null）
 * @property {string} theme 'system' | 'light' | 'dark' | 'cream'
 * @property {string[]} pinnedCategories 固定したカテゴリ
 * @property {string} categorySort CATEGORY_SORTS（config.js）のどれか
 * @property {string} chipLayout CHIP_LAYOUTS（config.js）のどれか
 * @property {boolean} autoSort 自動整理が ON か
 * @property {Rule[]} rules
 * @property {boolean} suggestFirst おすすめを最初から選ぶか
 * @property {string} addCreate ADD_CREATES（config.js）のどれか
 * @property {number} suggestCount SUGGEST_COUNTS（config.js）のどれか
 * @property {Array<[string, string, boolean]>} similarLabels 類似の見直しの答え（[a の id, b の id, 同じか]）
 * @property {string | null} updatesSeen 最後に知らせたアップデートの日
 * @property {Bookmark[]} bookmarks
 */

/**
 * 空のデータ（normalize(null) と同じ）
 * @returns {Data}
 */
export const emptyData = () => normalize(null);

/**
 * データの形をそろえる。形の合わないものは落とす（古い画面や壊れた応答でも描けるように）
 * @param {unknown} raw /api/data の応答など
 * @returns {Data} そろえたデータ
 */
export function normalize(raw) {
  const names = (list) => (Array.isArray(list) ? list.filter((c) => typeof c === 'string' && c) : []);
  const categories = names(raw?.categories);
  const subcategories = {};
  for (const c of categories) subcategories[c] = names(raw?.subcategories?.[c]);
  const bookmarks = Array.isArray(raw?.bookmarks)
    ? raw.bookmarks.filter((b) => b && typeof b.id === 'string' && typeof b.url === 'string')
    : [];

  const categoryColors = {};
  for (const c of categories) {
    if (typeof raw?.categoryColors?.[c] === 'string') categoryColors[c] = raw.categoryColors[c];
  }
  const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
  // テーマは shared/theme.js の THEMES のどれか（知らない値は端末に合わせる）
  const theme = ['light', 'dark', 'cream'].includes(raw?.theme) ? raw.theme : 'system';
  const pinnedCategories = names(raw?.pinnedCategories).filter((c) => categories.includes(c));
  const categorySort = CATEGORY_SORTS.includes(raw?.categorySort) ? raw.categorySort : 'manual';
  const chipLayout = CHIP_LAYOUTS.includes(raw?.chipLayout) ? raw.chipLayout : 'rows';

  const autoSort = raw?.autoSort === true;
  const rules = (Array.isArray(raw?.rules) ? raw.rules : [])
    .filter((r) => Number.isInteger(r?.id) && RULE_KINDS.includes(r.kind)
      && typeof r.value === 'string' && typeof r.category === 'string')
    .map((r) => ({
      id: r.id, kind: r.kind, value: r.value, category: r.category,
      subcategory: typeof r.subcategory === 'string' ? r.subcategory : null,
    }));
  const suggestFirst = raw?.suggestFirst === true;
  const addCreate = ADD_CREATES.includes(raw?.addCreate) ? raw.addCreate : 'both';
  const suggestCount = SUGGEST_COUNTS.includes(raw?.suggestCount) ? raw.suggestCount : 3;
  const similarLabels = (Array.isArray(raw?.similarLabels) ? raw.similarLabels : [])
    .filter((l) => Array.isArray(l)
      && typeof l[0] === 'string' && typeof l[1] === 'string' && typeof l[2] === 'boolean');
  const updatesSeen = typeof raw?.updatesSeen === 'string' ? raw.updatesSeen : null;

  return {
    categories, subcategories, categoryColors, accent: hex(raw?.accent), accentOn: hex(raw?.accentOn), theme,
    pinnedCategories, categorySort, chipLayout, autoSort, rules, suggestFirst, addCreate, suggestCount,
    similarLabels, updatesSeen, bookmarks,
  };
}

/**
 * ブックマークのサブカテゴリのうち、今もあるものだけ（なければ null）
 * @param {Data} data 利用者のデータ
 * @param {Bookmark} b ブックマーク
 * @returns {string | null} 今もあるサブカテゴリの名前、なければ null
 */
export const subOf = (data, b) => (
  b.subcategory && data.subcategories?.[b.category]?.includes(b.subcategory) ? b.subcategory : null
);

/**
 * 今もある行き先か（カテゴリと、あればそのサブカテゴリ）
 * @param {Data} data 利用者のデータ
 * @param {{ category: string, subcategory?: string | null } | null} p 行き先（null は false）
 * @returns {boolean}
 */
export const placeExists = (data, p) => Boolean(p)
  && data.categories.includes(p.category)
  && (!p.subcategory || (data.subcategories[p.category] ?? []).includes(p.subcategory));

/**
 * 2つの行き先が同じか（サブカテゴリの undefined は null と同じに見る）
 * @param {{ category: string, subcategory?: string | null }} p
 * @param {{ category: string, subcategory?: string | null }} q
 * @returns {boolean}
 */
export const samePlace = (p, q) => p.category === q.category && (p.subcategory ?? null) === (q.subcategory ?? null);

/**
 * 独立のメモの id（memo: と 16 桁の乱数）。利用者の中で重ならなければよいので Math.random（アプリの Hermes には crypto がないことがある）
 * @returns {string} 'memo:' と 16 桁の 16 進数
 */
export const memoId = () => {
  const digits = Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16));
  return `memo:${digits.join('')}`;
};
