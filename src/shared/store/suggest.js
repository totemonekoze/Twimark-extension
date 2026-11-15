// 追加のときのおすすめのカテゴリ（suggestPlaces）と、追加の画面の最初の選択（initialPlace）。
// 保存済みのブックマークの語を組（行き先）ごとに数え（statsOf）、追加するものの語と比べて点を付ける（inferPlaces）。
// 一覧の画面・アプリ・拡張の追加の画面が使い、数え上げは整理の候補とルールの案（sort.js）、推し量りは追加の記録（ops.js）も使う
import { compact, foldRule, inferTermsOf, wordsOf } from './text.js';
import { pickByRules } from './rules.js';
import { placeExists, samePlace } from './data.js';

// ---- おすすめのカテゴリ（定義 2026-10-31-001・2026-10-31-004。AI・辞書・Intl.Segmenter は使わない。アプリの Hermes と拡張でも同じに動かすため） ----

// 重み・下限（定義 2026-10-31-004）。scripts/suggest-eval.mjs で本番のデータ（2026-10-31、今ある組のブックマーク 65件・組 15）を読むだけで測って決めた。
// そのデータは 65件中 63件が X で、作者はほぼ重ならず、ハッシュタグもないので、効いているのは主に本文の語とカテゴリ名。保存が増えたら測り直す。
// 語の種類の重み（作者 > URL の段 > ハッシュタグ > 語 > サイト）。保存の割合は件数＋SMOOTH で割る（1件だけの組が割合 1 で勝ちすぎないように）
const WEIGHT = { a: 3, u: 2, t: 1, w: 0.25, s: 0.1 };
const SMOOTH = 0.5;
// カテゴリ名: 本文と題に名前そのものがあれば NAME_FULL、名前の語が b の語にあれば1つにつき NAME_WORD（サブカテゴリの組では、カテゴリの名前は半分）
const NAME_FULL = 1;
const NAME_WORD = 0.5;
// 点がこれより小さい組は出さない。一番の見込みを除いた点が SURE_MIN 以上で、点（見込みを含む）が2番の SURE_RATIO 倍以上（2番がなければ下限だけ）なら「確か」（最初から選ぶ・整理の候補に出す）。
// 件数の見込み（定義 2026-11-10-001）: 点が 0 より大きく保存のある組に PRIOR × log(1 + 組の件数) / log(1 + 数えた保存の件数) を足す。
// サイトの語だけの点に見込みが足されて「確か」になるのを止めるため、下限だけは見込みを除いた点で見る（追補 2026-11-10）。
// 保存の語には要約見出しの語も数える（inferTermsOf）。PRIOR・SURE_RATIO は本番のデータ（2026-11-10、今ある組のブックマーク 178件・組 22）を
// scripts/suggest-eval.mjs で読むだけで測って決めた（定義 2026-11-10-001 の完了報告）。PRIOR を 2 にすると下がる
const MIN_SCORE = 0.1;
const SURE_MIN = 1;
const SURE_RATIO = 3;
const PRIOR = 1;

// カテゴリ名の語。名前そのもの（絵文字・記号を除き2文字以上）と、termsOf と同じ語
function nameOf(raw) {
  const words = new Set();
  wordsOf(foldRule(raw).replace(/[^\p{L}\p{N}]+/gu, ' '), (t) => words.add(t));
  return { full: compact(raw), words };
}

// 名前の点。英数字だけの名前は、名前の語がすべて b の語にあるときだけ「名前そのもの」（「ai」が「said」に当たらないように）
function nameScore(n, body, terms, weight) {
  if (n.full.length < 2) return 0;
  let score = 0;
  const ascii = /^[a-z0-9]+$/.test(n.full);
  if (ascii ? n.words.size > 0 && [...n.words].every((t) => terms.has(t)) : body.includes(n.full)) score += NAME_FULL;
  for (const t of n.words) if (terms.has(t)) score += NAME_WORD;
  return score * weight;
}

/**
 * 組ごとの数え上げの 1 組分
 * @typedef {object} PlaceStats
 * @property {string} category
 * @property {string | null} subcategory
 * @property {number} n 数えた保存の件数
 * @property {Map<string, number>} counts 語ごとの、その語を持つ保存の件数
 * @property {string} at 一番新しい保存の savedAt（なければ空）
 * @property {Array<[{ full: string, words: Set<string> }, number]>} names 名前の語と重み
 */

/**
 * 数え上げ（statsOf の返すもの）
 * @typedef {object} Stats
 * @property {Map<string, PlaceStats>} places keyOf の形のキーごとの組
 * @property {Map<string, number>} df 語ごとの、その語を持つ保存の件数（全部の組で）
 * @property {Map<string, { key: string, terms: Set<string> }>} byId 数えた保存の id ごとの、組のキーと語
 * @property {number} n 数えた保存の件数
 */

// 組ごとの数え上げ（data ごとに1度だけ作る）。行き先は今ある組（カテゴリの直下と各サブカテゴリ）ぜんぶ。保存は今ある組にあるものだけを数える
const statsCache = new WeakMap();

/**
 * 組のキー（数え上げの places のキーと、ブックマークの sortDismissed の形）
 * @param {string} category カテゴリ
 * @param {string | null} [subcategory] サブカテゴリ（null・undefined はカテゴリの直下）
 * @returns {string} 「カテゴリ\nサブカテゴリ」
 */
export const keyOf = (category, subcategory) => `${category}\n${subcategory ?? ''}`;

/**
 * 組ごとの数え上げ（上の注）。同じ data なら作ったものを使い回す
 * @param {import('./data.js').Data} data 利用者のデータ
 * @returns {Stats} 数え上げ
 */
export function statsOf(data) {
  let st = statsCache.get(data);
  if (st) return st;

  const places = new Map();
  const put = (category, subcategory) => places.set(keyOf(category, subcategory), {
    category, subcategory, n: 0, counts: new Map(), at: '',
    names: subcategory ? [[nameOf(subcategory), 1], [nameOf(category), 0.5]] : [[nameOf(category), 1]],
  });
  for (const c of data.categories) {
    put(c, null);
    for (const sub of data.subcategories[c] ?? []) put(c, sub);
  }

  const df = new Map();
  const byId = new Map();
  for (const x of data.bookmarks) {
    // 未分類と、もうないサブカテゴリのものは数えない
    const key = keyOf(x.category, x.subcategory || null);
    const place = places.get(key);
    if (!place) continue;
    const terms = inferTermsOf(x);
    byId.set(x.id, { key, terms });
    place.n++;
    if (String(x.savedAt ?? '') > place.at) place.at = String(x.savedAt);
    for (const t of terms) {
      place.counts.set(t, (place.counts.get(t) ?? 0) + 1);
      df.set(t, (df.get(t) ?? 0) + 1);
    }
  }

  st = { places, df, byId, n: byId.size };
  statsCache.set(data, st);
  return st;
}

/**
 * 推し量る（定義 2026-10-31-004）。b は pickByRules と同じ形。skip はその id のブックマークを数えない（測るときと整理の候補）。
 * [{ category, subcategory, score, sure }] を点の多い順（同じなら、その組の一番新しい保存の新しい順）。sure は一番の組だけが持てる
 * @param {import('./data.js').Data} data 利用者のデータ
 * @param {import('./data.js').Facts} b 推し量るもの（要約見出しも見る）
 * @param {{ skip?: string }} [options] skip: 数えないブックマークの id
 * @returns {Array<{ category: string, subcategory: string | null, score: number, sure: boolean }>} 点が MIN_SCORE 以上の組
 */
export function inferPlaces(data, b, { skip } = {}) {
  const st = statsOf(data);
  const me = inferTermsOf(b);
  const body = compact(`${b?.title ?? ''}\n${b?.text ?? ''}\n${b?.summary ?? ''}`.replace(/https?:\/\/\S+/g, ' '));
  const sk = skip ? st.byId.get(skip) : null;
  const n = st.n - (sk ? 1 : 0);
  const less = (key, t) => (sk && sk.key === key && sk.terms.has(t) ? 1 : 0);

  const list = [];
  for (const [key, p] of st.places) {
    let score = 0;
    const size = p.n - (sk?.key === key ? 1 : 0);
    if (size > 0) {
      for (const t of me) {
        const c = (p.counts.get(t) ?? 0) - less(key, t);
        if (c <= 0) continue;
        const df = (st.df.get(t) ?? 0) - (sk?.terms.has(t) ? 1 : 0);
        score += (c / (size + SMOOTH)) * Math.log(1 + n / df) * WEIGHT[t[0]];
      }
    }
    for (const [name, weight] of p.names) score += nameScore(name, body, me, weight);
    const base = score;
    if (score > 0 && size > 0) score += (PRIOR * Math.log(1 + size)) / Math.log(1 + n);
    if (score >= MIN_SCORE) list.push({ category: p.category, subcategory: p.subcategory, score, base, at: p.at });
  }

  list.sort((p, q) => q.score - p.score || (q.at > p.at ? 1 : q.at < p.at ? -1 : 0));
  return list.map(({ category, subcategory, score, base }, i) => ({
    category,
    subcategory,
    score,
    sure: i === 0 && base >= SURE_MIN && (!list[1] || score >= SURE_RATIO * list[1].score),
  }));
}

/**
 * 追加の画面のおすすめの札。b は pickByRules と同じ形。[{ category, subcategory, by: 'rule' | 'infer' }] を data.suggestCount まで（0 なら空）。
 * 先頭はルールが当たればその組（自動整理の ON・OFF に関わらず）。続けて推し量った組（ルールの組と同じものは重ねない）
 * @param {import('./data.js').Data} data 利用者のデータ
 * @param {import('./data.js').Facts} b 追加するもの
 * @returns {Array<{ category: string, subcategory: string | null, by: 'rule' | 'infer' }>} おすすめの札
 */
export function suggestPlaces(data, b) {
  const rule = pickByRules(data.rules, b);
  const first = placeExists(data, rule) ? [{ ...rule, by: 'rule' }] : [];
  const rest = inferPlaces(data, b)
    .filter((p) => !first.some((q) => samePlace(p, q)))
    .map(({ category, subcategory }) => ({ category, subcategory, by: 'infer' }));
  return [...first, ...rest].slice(0, data.suggestCount ?? 3);
}

/**
 * 追加の画面の初期の選択（定義 2026-10-30-004・2026-10-31-001・2026-10-31-004）。b は pickByRules と同じ形。自動整理が ON でルールが当たればその組、
 * でなければ「おすすめを最初から選ぶ」が ON で推し量った一番が確かならその組（おすすめの数が OFF でも）。どちらもなければ null（前回の組のまま）。
 * 利用者が自分で選んだあとは当て直さない（画面が見る）
 * @param {import('./data.js').Data} data 利用者のデータ
 * @param {import('./data.js').Facts} b 追加するもの
 * @returns {{ category: string, subcategory: string | null, by: 'rule' | 'infer' } | null} 最初に選ぶ組、なければ null
 */
export function initialPlace(data, b) {
  const rule = data?.autoSort ? pickByRules(data.rules, b) : null;
  if (placeExists(data, rule)) return { ...rule, by: 'rule' };
  if (!data?.suggestFirst) return null;
  const top = inferPlaces(data, b)[0];
  return top?.sure ? { category: top.category, subcategory: top.subcategory, by: 'infer' } : null;
}

// 初期の選択の理由の注
export const PLACE_REASONS = { rule: '自動整理のルールで選びました', infer: 'おすすめから選びました' };
