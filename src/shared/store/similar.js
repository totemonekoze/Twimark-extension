// 類似の投稿。追加するものに似ている保存済みのもの（similarBookmarks）と、保存済みどうしの見直し（similarReviewPairs）。
// 一覧の画面・アプリ・拡張の追加の画面の確かめと、一覧の画面の類似の見直しが使い、追加の記録（ops.js）は下限に届かなかったもの（similarNear）を記録する。
// scripts/similar-eval.mjs は similarPair・similarPasses で下限を測る
import { compact, foldRule, termsOf } from './text.js';

// ---- 類似の投稿（定義 2026-10-31-009。AI は使わない。おすすめと同じ termsOf の語） ----
// 強い印（同じリンク先・同じ場所・同じ題）か、語の重なりが下限以上のものを似ているとする。語の重なりは、語の珍しさ（idf）で重みを付けたコサイン
// （同じ作者なら SIMILAR_AUTHOR を足す）が SIMILAR_WORDS 以上で、かつ重なった語の珍しさの合計（1 つの保存にしかない語が 1 ほど）が SIMILAR_MASS 以上。
// 短い日本語の文は語が2つほどしか取れず、よくある語2つだけでコサインが高くなるので、合計の下限で「珍しい語を含む重なり」だけにする。
// 下限と重みは、作った組の試験（scripts/self-test.mjs）を通したうえで、scripts/similar-eval.mjs で本番のデータを読むだけで測って決めた（定義 2026-10-31-009 の完了報告）
const SIMILAR_WORDS = 0.35;
const SIMILAR_MASS = 1.2;
const SIMILAR_AUTHOR = 0.15;
const STRONG = 3;
export const SIMILAR_REASONS = { link: '同じリンク', place: '同じ場所', title: '同じ題', words: '内容が近い' };
// 場所・お店のサイト（題が場所・お店の名前）
const PLACE_SITES = new Set(['gmap', 'hotpepper', 'gnavi']);
// 外のリンクの「ホスト＋パス」。短縮・X の投稿・サイトのトップだけの URL は除く
const SHORT_HOSTS = new Set([
  't.co', 'bit.ly', 'goo.gl', 'ow.ly', 'buff.ly', 'tinyurl.com', 'amzn.to', 'is.gd', 'dlvr.it', 'ift.tt',
]);

function linkOf(raw) {
  try {
    const u = new URL(raw.replace(/[)\]）」』。、,.!?！？]+$/u, ''));
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    if (!path || SHORT_HOSTS.has(host)
      || (/^(?:(?:mobile\.)?twitter|x)\.com$/.test(host) && /\/status\//.test(path))) return null;
    return `${host}${path}`.toLowerCase();
  } catch {
    return null;
  }
}

const linksOf = (text) => new Set(
  (String(text ?? '').match(/https?:\/\/[^\s<>"'「」]+/g) ?? []).map(linkOf).filter(Boolean),
);

function similarFacts(b) {
  const words = new Set([...termsOf(b)].filter((t) => t[0] === 'w' || t[0] === 't'));
  const links = linksOf(`${b?.title ?? ''}\n${b?.text ?? ''}\n${b?.url ?? ''}`);
  const place = PLACE_SITES.has(b?.site) ? compact(b?.title) : '';
  const handle = foldRule(b?.author?.handle).replace(/^@/, '');
  return {
    words,
    links,
    place: place.length >= 4 ? place : '',
    title: compact(b?.title),
    body: compact(`${b?.title ?? ''}\n${b?.text ?? ''}`),
    author: handle || foldRule(b?.author?.name),
  };
}

const similarCache = new WeakMap();
function similarStats(data) {
  let st = similarCache.get(data);
  if (st) return st;
  const items = data.bookmarks.filter((x) => x.site !== 'memo').map((x) => ({ x, f: similarFacts(x) }));
  const df = new Map();
  for (const { f } of items) for (const t of f.words) df.set(t, (df.get(t) ?? 0) + 1);
  st = { items, df };
  similarCache.set(data, st);
  return st;
}

/**
 * 2つのものの比べの結果
 * @typedef {object} Measure
 * @property {'link' | 'place' | 'title' | null} reason 強い印（なければ null）
 * @property {number} words 語の重なり（コサインと同じ作者の足し）
 * @property {number} mass 重なった語の珍しさの合計
 */

// 2つの事実（similarFacts）の比べ（data の語の数え上げを使う）。{ reason（強い印か null）, words（コサインと同じ作者の足し）, mass（珍しさの合計） }
function similarMeasure(data) {
  const { items, df } = similarStats(data);
  const n = items.length + 1;
  const idf = (t) => Math.log(1 + n / ((df.get(t) ?? 0) + 1));
  // 珍しさの合計は、どの語にもある最大の idf（log(1 + n)）を 1 として数える（保存の数で下限が変わらないように）
  const top = Math.log(1 + n);
  const norm = (words) => Math.sqrt([...words].reduce((s, t) => s + idf(t) ** 2, 0));
  return {
    items,
    compare(me, f) {
      const reason = [...me.links].some((l) => f.links.has(l)) ? 'link'
        : (me.place && f.body.includes(me.place)) || (f.place && me.body.includes(f.place)) ? 'place'
          : me.title && me.title === f.title ? 'title' : null;
      let words = 0;
      let mass = 0;
      for (const t of me.words) if (f.words.has(t)) { words += idf(t) ** 2; mass += idf(t) / top; }
      const mine = norm(me.words);
      words = words && mine ? words / (mine * norm(f.words)) : 0;
      if (words && me.author && me.author === f.author) words += SIMILAR_AUTHOR;
      return { reason, words, mass };
    },
  };
}

/**
 * 似ているとするか。下限を変えて測るときは words・mass を渡す（scripts/similar-eval.mjs）
 * @param {Measure} s 比べの結果
 * @param {number} [words] 語の重なりの下限
 * @param {number} [mass] 珍しさの合計の下限
 * @returns {boolean} 強い印があるか、両方の下限以上なら true
 */
export const similarPasses = (s, words = SIMILAR_WORDS, mass = SIMILAR_MASS) => (
  Boolean(s.reason) || (s.words >= words && s.mass >= mass)
);

const similarScore = (s) => (s.reason ? STRONG : 0) + s.words;
const newerSaved = (p, q) => String(q.bookmark.savedAt).localeCompare(String(p.bookmark.savedAt));

// b と保存済み（独立のメモと、b と同じ id を除く）をすべて比べる
function similarAll(data, b) {
  const m = similarMeasure(data);
  const me = similarFacts(b);
  return m.items.filter(({ x }) => x.id !== b?.id).map(({ x, f }) => ({ bookmark: x, ...m.compare(me, f) }));
}

/**
 * b（pickByRules と同じ形と id）に似ている保存済みのもの。[{ bookmark, score, reason }] を点の多い順に limit まで。独立のメモと、b と同じ id は数えない
 * @param {import('./data.js').Data} data 利用者のデータ
 * @param {import('./data.js').Facts} b 比べるもの
 * @param {{ limit?: number }} [options] limit: 出す数（既定 3）
 * @returns {Array<{
 *   bookmark: import('./data.js').Bookmark, score: number, reason: 'link' | 'place' | 'title' | 'words',
 * }>} 似ているもの（reason は強い印、なければ 'words'）
 */
export function similarBookmarks(data, b, { limit = 3 } = {}) {
  return similarAll(data, b).filter((s) => similarPasses(s))
    .map((s) => ({ bookmark: s.bookmark, score: similarScore(s), reason: s.reason ?? 'words' }))
    .sort((p, q) => q.score - p.score || newerSaved(p, q)).slice(0, limit);
}

/**
 * 小数第3位までに丸める（記録に残す点を短くする）
 * @param {number} v 丸める値
 * @returns {number} 丸めた値
 */
export const round3 = (v) => Math.round(v * 1000) / 1000;

/**
 * 下限に届かなかったもののうち、語の重なりのある上位3件（定義 2026-11-02-002 の記録の near）。[{ id, words, mass }]
 * @param {import('./data.js').Data} data 利用者のデータ
 * @param {import('./data.js').Facts} b 比べるもの
 * @returns {Array<{ id: string, words: number, mass: number }>} words・mass は round3 で丸めたもの
 */
export function similarNear(data, b) {
  return similarAll(data, b).filter((s) => !similarPasses(s) && s.words > 0)
    .sort((p, q) => q.words - p.words)
    .slice(0, 3)
    .map((s) => ({ id: s.bookmark.id, words: round3(s.words), mass: round3(s.mass) }));
}

/**
 * 保存済みの2つの比べ（a の事実から b を見る）。scripts/similar-eval.mjs が見直しの答えを測るのに使う
 * @param {import('./data.js').Data} data 利用者のデータ（語の珍しさを数える）
 * @param {import('./data.js').Facts} a 比べる側
 * @param {import('./data.js').Facts} b 比べられる側
 * @returns {Measure} 比べの結果
 */
export const similarPair = (data, a, b) => similarMeasure(data).compare(similarFacts(a), similarFacts(b));

// 類似の見直し（定義 2026-11-02-002）。保存済み（独立のメモを除く）どうしで、ゆるい下限を超えた組か強い印の組を、点の多い順に。
// labels（data.similarLabels、[[a, b, same], ...]）にある組は出さない。[{ a, b, reason, words, mass, now（今の下限で確かめに出るか） }]
// ゆるい下限は、本番のデータ（2026-11-02、74件・2701組）で組が 20〜60 ほど出る所に決めた（45組。定義 2026-11-02-002 の完了報告）。
// そのデータでは今の下限を超える組が1つもなく、コサインの大きい組も少ないので、低い所になった。保存が増えて組が多すぎたら上げる
const REVIEW_WORDS = 0.07;
const REVIEW_MASS = 0.5;

// ponytail: 保存のすべての組を比べる（n² / 2）。数千件で重くなったら、語の転置の索引で候補の組だけを比べる
/**
 * 類似の見直しの組（上の注）
 * @param {import('./data.js').Data} data 利用者のデータ
 * @param {Array<[string, string, boolean]>} [labels] 答えた組（既定は data.similarLabels）
 * @returns {Array<Measure & {
 *   a: import('./data.js').Bookmark, b: import('./data.js').Bookmark, now: boolean,
 * }>} a は id の小さい方
 */
export function similarReviewPairs(data, labels = data.similarLabels ?? []) {
  const m = similarMeasure(data);
  const done = new Set(labels.map(([a, b]) => (a < b ? `${a}\n${b}` : `${b}\n${a}`)));
  const out = [];
  for (let i = 0; i < m.items.length; i++) {
    for (let j = i + 1; j < m.items.length; j++) {
      const [p, q] = m.items[i].x.id < m.items[j].x.id ? [m.items[i], m.items[j]] : [m.items[j], m.items[i]];
      if (done.has(`${p.x.id}\n${q.x.id}`)) continue;
      const s = m.compare(p.f, q.f);
      if (!s.reason && (s.words < REVIEW_WORDS || s.mass < REVIEW_MASS)) continue;
      out.push({ a: p.x, b: q.x, ...s, now: similarPasses(s) });
    }
  }
  return out.sort((p, q) => similarScore(q) - similarScore(p));
}
