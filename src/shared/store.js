// Twimark（アプリ）の src/shared/store.js の写し。正本はアプリ側。アプリで変えたら写し直す（AGENTS.md）
// ブックマークの保存先。Twimark の Worker の API（/api/data と /api/ops）を通して D1 を読み書きする。
// 一覧の画面（src/site）は同じオリジンの Cookie、拡張（別のプロジェクト Twimark-extension）とアプリ（src/mobile）は端末のトークン（Bearer）で認証する。
// 名前の決まり（LIMITS、checkName）は Worker（src/worker）も使う

// 新しいアカウントのカテゴリ（今あるアカウントは変えない）
export const DEFAULT_CATEGORIES = ['新しいカテゴリ'];
// memoTitle は独立のメモの題、note はブックマークへの書き添え
export const LIMITS = { category: 20, categories: 30, subcategories: 30, text: 5000, memoTitle: 80, note: 2000, rules: 100, ruleValue: 100 };
// memo は独立のメモ（URL のないこともあるカード）。ほかは追加できるサイト
export const SITES = {
  x: 'X', note: 'note', qiita: 'Qiita', instagram: 'Instagram', pixiv: 'pixiv', booth: 'BOOTH', github: 'GitHub', unityroom: 'unityroom', freem: 'ふりーむ！',
  gmap: 'Google マップ', cookpad: 'クックパッド', delish: 'デリッシュキッチン', kurashiru: 'クラシル', rakutenrecipe: '楽天レシピ', hotpepper: 'ホットペッパーグルメ', gnavi: 'ぐるなび',
  memo: 'メモ',
};
export const PUBLIC_URL = 'https://twimark.ho-service.workers.dev';

// アプリへのログインの受け渡し（?app=）の戻り先として受け付けるもの。
// exp://u.expo.dev/…（Expo Go はサインインしたアカウントのプロジェクトしか開かない）、twimark://、手元の開発サーバー（localhost と家庭内のアドレス）だけ。
// ほかの exp:// は、他人の PC から読み込んだアプリに端末のトークンが渡ってしまうので断る
const PRIVATE_HOST = /^(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;
export function isAppRedirect(raw) {
  if (typeof raw !== 'string' || raw.length > 500 || /[\s#\\]/.test(raw)) return false;
  if (/^twimark:\/\/[^@]*$/.test(raw)) return true;
  const m = raw.match(/^exp:\/\/([^/:?@]+)(?::\d{1,5})?(?:[/?]|$)/);
  return Boolean(m) && (m[1] === 'u.expo.dev' || PRIVATE_HOST.test(m[1]));
}

export class StoreError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// ブラウザの例外（パスキーなど）の name ごとの説明
const BROWSER_ERRORS = {
  NotAllowedError: 'パスキーの操作が取りやめられたか、時間切れになりました。もう一度やり直してください。',
  InvalidStateError: 'このパスキーはもう登録されています。',
  SecurityError: 'このページの URL ではパスキーを使えません。',
  NotSupportedError: 'この端末かブラウザは、求めたパスキーの方式に対応していません。',
  AbortError: '操作が中断されました。',
  TimeoutError: '時間切れになりました。',
  NetworkError: '通信できませんでした。',
};

// 画面に出すエラーの文。メッセージとエラーコード（Twimark の code か、ブラウザの例外の name）を必ず並べる
export function describeError(err, fallback = 'うまくいきませんでした。') {
  if (err instanceof StoreError) return `${err.message || fallback}（エラーコード: ${err.code}）`;
  const name = typeof err?.name === 'string' && err.name !== 'Error' ? err.name : 'unknown';
  const raw = typeof err?.message === 'string' ? err.message : '';
  const known = BROWSER_ERRORS[name];
  const message = known ? `${known}${raw ? ` 詳細: ${raw}` : ''}` : raw || fallback;
  return `${message}（エラーコード: ${name}）`;
}

export function checkName(raw, what = 'カテゴリ') {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name || name.length > LIMITS.category) throw new StoreError('invalid_name', `${what}名を${LIMITS.category}文字以内で入れてください。`);
  return name;
}

// カテゴリの画面の並び順（定義 2026-10-30-002）。手動（position）・件数順・最近保存した順
export const CATEGORY_SORTS = ['manual', 'count', 'recent'];
// 縦長の一覧のカテゴリの絞り込みの形（定義 2026-10-30-003）。よく使うものだけ並べる・1つの札にまとめる・全部並べる（2段）
export const CHIP_LAYOUTS = ['pinned', 'single', 'rows'];
// 追加の画面でその場で作れるもの（定義 2026-10-31-001）。作らない・カテゴリだけ・カテゴリとサブカテゴリ
export const ADD_CREATES = ['none', 'category', 'both'];

// 自動整理のルール（定義 2026-10-30-004）。条件の種類と、比べるときのそろえ方（NFKC・小文字）
export const RULE_KINDS = ['site', 'author', 'word', 'url'];
export const RULE_NAMES = { site: 'サイト', author: '作者', word: '語', url: 'URL' };
// 一覧に出すルールの名前（「サイト: GitHub」など）
export const ruleLabel = (r) => `${RULE_NAMES[r.kind]}: ${r.kind === 'site' ? SITES[r.value] ?? r.value : r.value}`;
export const foldRule = (s) => String(s ?? '').normalize('NFKC').toLowerCase().trim();
// b は { site, url, author: { name, handle }, title, text }（足りないものは空）。上のルールから順に見て、最初に当たったものの
// { category, subcategory }、なければ null。作者は先頭の @ を除いた値が handle と同じか、名前と同じ。語は題と本文に、URL は URL に含むか
export function pickByRules(rules, b) {
  const handle = foldRule(b?.author?.handle).replace(/^@/, '');
  const name = foldRule(b?.author?.name);
  const url = foldRule(b?.url);
  const body = foldRule(`${b?.title ?? ''}\n${b?.text ?? ''}`);
  for (const r of Array.isArray(rules) ? rules : []) {
    const v = foldRule(r.value);
    if (!v) continue;
    const hit = r.kind === 'site' ? b?.site === r.value
      : r.kind === 'author' ? (Boolean(handle) && v.replace(/^@/, '') === handle) || (Boolean(name) && v === name)
        : r.kind === 'word' ? body.includes(v)
          : r.kind === 'url' ? url.includes(v) : false;
    if (hit) return { category: r.category, subcategory: r.subcategory ?? null };
  }
  return null;
}

// 今もある行き先か（カテゴリと、あればそのサブカテゴリ）
export const placeExists = (data, p) => Boolean(p) && data.categories.includes(p.category) && (!p.subcategory || (data.subcategories[p.category] ?? []).includes(p.subcategory));
// ---- おすすめのカテゴリ（定義 2026-10-31-001・2026-10-31-004。AI・辞書・Intl.Segmenter は使わない。アプリの Hermes と拡張でも同じに動かすため） ----
// 語を抜く（termsOf）。どれも NFKC・小文字。'a:' 作者（@handle、なければ name:<名前>）、'u:' URL の「ホスト＋最初の段」、's:' サイト、
// 't:' ハッシュタグ、'w:' 題と本文の語（2文字以上の英数字の語、2文字以上のカタカナの続き、漢字の続き（2〜4文字ならそのもの、3文字以上なら2文字ずつの組も））。
// URL は除き、絵文字・記号は区切り。ひらがなだけの語は使わない
const TAG = /#[\p{L}\p{N}_]+/gu;
// 保存する URL の最初の段が決まった語のサイト（/p/・/artworks/・/ja/・/games/・/win/）。同じサイトと同じ意味になるので、URL の最初の段は比べない
// （定義 2026-10-31-001 の追補）
const FIXED_PATH = new Set(['instagram', 'pixiv', 'booth', 'unityroom', 'freem']);
// よく出る英語の語（どのカテゴリにも出るので比べない）
const STOP = new Set('the and for with this that from are was were you your our have has had not but all can will just about into out more one new http https www com net org jp co html amp rt of to in on at is it by an or be as so if we my me do no up go vs via'.split(' '));
function wordsOf(text, add) {
  for (const w of text.match(/[a-z0-9]{2,}/g) ?? []) if (!STOP.has(w) && !/^\d+$/.test(w)) add(`w:${w}`);
  for (const w of text.match(/[\p{Script=Katakana}ー]{2,}/gu) ?? []) if (/[^ー]/.test(w)) add(`w:${w}`);
  for (const run of text.match(/\p{Script=Han}{2,}/gu) ?? []) {
    if (run.length <= 4) add(`w:${run}`);
    if (run.length >= 3) for (let i = 0; i < run.length - 1; i++) add(`w:${run.slice(i, i + 2)}`);
  }
}
export function termsOf(b) {
  const out = new Set();
  const add = (t) => out.add(t);
  const handle = foldRule(b?.author?.handle).replace(/^@/, '');
  const name = foldRule(b?.author?.name);
  if (handle) add(`a:@${handle}`);
  else if (name) add(`a:name:${name}`);
  try {
    const u = new URL(String(b?.url ?? ''));
    const first = u.pathname.split('/').filter(Boolean)[0];
    if (first && !FIXED_PATH.has(b?.site)) add(`u:${u.hostname.replace(/^www\./, '')}/${first}`.toLowerCase());
  } catch { /* URL のないメモや、形の違うもの */ }
  if (b?.site) add(`s:${b.site}`);
  const body = foldRule(`${b?.title ?? ''}\n${b?.text ?? ''}`).replace(/https?:\/\/\S+/g, ' ');
  for (const tag of body.match(TAG) ?? []) add(`t:${tag}`);
  wordsOf(body.replace(/#/g, ' '), add);
  return out;
}

// 重み・下限（定義 2026-10-31-004）。scripts/suggest-eval.mjs で本番のデータ（2026-10-31、今ある組のブックマーク 65件・組 15）を読むだけで測って決めた。
// そのデータは 65件中 63件が X で、作者はほぼ重ならず、ハッシュタグもないので、効いているのは主に本文の語とカテゴリ名。保存が増えたら測り直す。
// 語の種類の重み（作者 > URL の段 > ハッシュタグ > 語 > サイト）。保存の割合は件数＋SMOOTH で割る（1件だけの組が割合 1 で勝ちすぎないように）
const WEIGHT = { a: 3, u: 2, t: 1, w: 0.25, s: 0.1 };
const SMOOTH = 0.5;
// カテゴリ名: 本文と題に名前そのものがあれば NAME_FULL、名前の語が b の語にあれば1つにつき NAME_WORD（サブカテゴリの組では、カテゴリの名前は半分）
const NAME_FULL = 1;
const NAME_WORD = 0.5;
// 点がこれより小さい組は出さない。一番が SURE_MIN 以上で、2番より SURE_GAP 以上なら「確か」（最初から選ぶ・整理の候補に出す）。
// 確かのときの1番目が8割以上になる所（上のデータで 6件・83.3%）。差を小さくすると件数は増えるが、5割ほどに下がる
const MIN_SCORE = 0.1;
const SURE_MIN = 1;
const SURE_GAP = 2;
const compact = (s) => foldRule(s).replace(/[^\p{L}\p{N}]+/gu, '');
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

// 組ごとの数え上げ（data ごとに1度だけ作る）。行き先は今ある組（カテゴリの直下と各サブカテゴリ）ぜんぶ。保存は今ある組にあるものだけを数える
const statsCache = new WeakMap();
const keyOf = (category, subcategory) => `${category}\n${subcategory ?? ''}`;
function statsOf(data) {
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
    const terms = termsOf(x);
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

// 推し量る（定義 2026-10-31-004）。b は pickByRules と同じ形。skip はその id のブックマークを数えない（測るときと整理の候補）。
// [{ category, subcategory, score, sure }] を点の多い順（同じなら、その組の一番新しい保存の新しい順）。sure は一番の組だけが持てる
export function inferPlaces(data, b, { skip } = {}) {
  const st = statsOf(data);
  const me = termsOf(b);
  const body = compact(`${b?.title ?? ''}\n${b?.text ?? ''}`.replace(/https?:\/\/\S+/g, ' '));
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
    if (score >= MIN_SCORE) list.push({ category: p.category, subcategory: p.subcategory, score, at: p.at });
  }
  list.sort((p, q) => q.score - p.score || (q.at > p.at ? 1 : q.at < p.at ? -1 : 0));
  return list.map(({ category, subcategory, score }, i) => ({
    category, subcategory, score, sure: i === 0 && score >= SURE_MIN && score - (list[1]?.score ?? 0) >= SURE_GAP,
  }));
}

const samePlace = (p, q) => p.category === q.category && (p.subcategory ?? null) === (q.subcategory ?? null);
// 追加の画面のおすすめの数（0・1・3。設定の「おすすめの数」）
export const SUGGEST_COUNTS = [0, 1, 3];
// 追加の画面のおすすめの札。b は pickByRules と同じ形。[{ category, subcategory, by: 'rule' | 'infer' }] を data.suggestCount まで（0 なら空）。
// 先頭はルールが当たればその組（自動整理の ON・OFF に関わらず）。続けて推し量った組（ルールの組と同じものは重ねない）
export function suggestPlaces(data, b) {
  const rule = pickByRules(data.rules, b);
  const first = placeExists(data, rule) ? [{ ...rule, by: 'rule' }] : [];
  const rest = inferPlaces(data, b).filter((p) => !first.some((q) => samePlace(p, q))).map(({ category, subcategory }) => ({ category, subcategory, by: 'infer' }));
  return [...first, ...rest].slice(0, data.suggestCount ?? 3);
}

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
const SHORT_HOSTS = new Set(['t.co', 'bit.ly', 'goo.gl', 'ow.ly', 'buff.ly', 'tinyurl.com', 'amzn.to', 'is.gd', 'dlvr.it', 'ift.tt']);
function linkOf(raw) {
  try {
    const u = new URL(raw.replace(/[)\]）」』。、,.!?！？]+$/u, ''));
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    const path = u.pathname.replace(/\/+$/, '');
    if (!path || SHORT_HOSTS.has(host) || (/^(?:(?:mobile\.)?twitter|x)\.com$/.test(host) && /\/status\//.test(path))) return null;
    return `${host}${path}`.toLowerCase();
  } catch {
    return null;
  }
}
const linksOf = (text) => new Set((String(text ?? '').match(/https?:\/\/[^\s<>"'「」]+/g) ?? []).map(linkOf).filter(Boolean));
function similarFacts(b) {
  const words = new Set([...termsOf(b)].filter((t) => t[0] === 'w' || t[0] === 't'));
  const links = linksOf(`${b?.title ?? ''}\n${b?.text ?? ''}\n${b?.url ?? ''}`);
  const place = PLACE_SITES.has(b?.site) ? compact(b?.title) : '';
  const handle = foldRule(b?.author?.handle).replace(/^@/, '');
  return { words, links, place: place.length >= 4 ? place : '', title: compact(b?.title), body: compact(`${b?.title ?? ''}\n${b?.text ?? ''}`), author: handle || foldRule(b?.author?.name) };
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
// b（pickByRules と同じ形と id）に似ている保存済みのもの。[{ bookmark, score, reason }] を点の多い順に limit まで。独立のメモと、b と同じ id は数えない
export function similarBookmarks(data, b, { limit = 3 } = {}) {
  const { items, df } = similarStats(data);
  const me = similarFacts(b);
  const n = items.length + 1;
  const idf = (t) => Math.log(1 + n / ((df.get(t) ?? 0) + 1));
  // 珍しさの合計は、どの語にもある最大の idf（log(1 + n)）を 1 として数える（保存の数で下限が変わらないように）
  const top = Math.log(1 + n);
  const norm = (words) => Math.sqrt([...words].reduce((s, t) => s + idf(t) ** 2, 0));
  const mine = norm(me.words);
  const out = [];
  for (const { x, f } of items) {
    if (x.id === b?.id) continue;
    const reason = [...me.links].some((l) => f.links.has(l)) ? 'link'
      : (me.place && f.body.includes(me.place)) || (f.place && me.body.includes(f.place)) ? 'place'
        : me.title && me.title === f.title ? 'title' : null;
    let words = 0;
    let mass = 0;
    for (const t of me.words) if (f.words.has(t)) { words += idf(t) ** 2; mass += idf(t) / top; }
    words = words && mine ? words / (mine * norm(f.words)) : 0;
    if (words && me.author && me.author === f.author) words += SIMILAR_AUTHOR;
    if (!reason && (words < SIMILAR_WORDS || mass < SIMILAR_MASS)) continue;
    out.push({ bookmark: x, score: (reason ? STRONG : 0) + words, reason: reason ?? 'words' });
  }
  return out.sort((p, q) => q.score - p.score || String(q.bookmark.savedAt).localeCompare(String(p.bookmark.savedAt))).slice(0, limit);
}

// 追加の画面の初期の選択（定義 2026-10-30-004・2026-10-31-001・2026-10-31-004）。b は pickByRules と同じ形。自動整理が ON でルールが当たればその組、
// でなければ「おすすめを最初から選ぶ」が ON で推し量った一番が確かならその組（おすすめの数が OFF でも）。どちらもなければ null（前回の組のまま）。
// 利用者が自分で選んだあとは当て直さない（画面が見る）
export function initialPlace(data, b) {
  const rule = data?.autoSort ? pickByRules(data.rules, b) : null;
  if (placeExists(data, rule)) return { ...rule, by: 'rule' };
  if (!data?.suggestFirst) return null;
  const top = inferPlaces(data, b)[0];
  return top?.sure ? { category: top.category, subcategory: top.subcategory, by: 'infer' } : null;
}
// 整理の候補（定義 2026-10-30-004・2026-10-31-004）。[{ b, to: { category, subcategory }, by: 'rule' | 'infer' }]。
// 先にルールが当たる行き先と今の場所が違うもの（未分類とメモも）、続けて未分類でルールが当たらず、推し量った一番が確かなもの。それぞれ保存の新しい順
const newer = (x, y) => String(y.b.savedAt).localeCompare(String(x.b.savedAt));
export function sortCandidates(data) {
  const rule = [];
  const infer = [];
  for (const b of data.bookmarks) {
    const to = pickByRules(data.rules, b);
    if (placeExists(data, to)) {
      if (b.category !== to.category || subOf(data, b) !== (to.subcategory ?? null)) rule.push({ b, to, by: 'rule' });
    } else if (!data.categories.includes(b.category)) {
      const top = inferPlaces(data, b, { skip: b.id })[0];
      if (top?.sure) infer.push({ b, to: { category: top.category, subcategory: top.subcategory }, by: 'infer' });
    }
  }
  return [...rule.sort(newer), ...infer.sort(newer)];
}

// ルールの案（定義 2026-10-31-004）。これまでの保存（今ある組にあるもの）から、作者・URL の段・ハッシュタグ・語（英数字・カタカナは3文字以上、漢字は2文字以上）・
// サイトごとに、それを持つ保存が3件以上（サイトは5件以上）あり、その8割以上（サイトは9割以上）が1つの組にあるもの。件数の多い順に10個まで。
// 同じ種類と値のルールがもうあるもの、今のルールでもうその組に送られるものは出さない。[{ kind, value, category, subcategory, hits, inPlace }]
// 語として持つかで選んだあと、ルールは部分一致で当たる（語の「art」が「start」にも）ので、hits・inPlace と割合は、数えている保存に案のルールを当てて数え直す
const PROPOSAL_MAX = 10;
function ruleOfTerm(t) {
  const v = t.slice(2);
  if (t[0] === 'a') return { kind: 'author', value: v.startsWith('name:') ? v.slice(5) : v };
  if (t[0] === 'u') return { kind: 'url', value: v };
  if (t[0] === 's') return { kind: 'site', value: v };
  if (t[0] === 't') return { kind: 'word', value: v };
  return /\p{Script=Han}/u.test(v) || v.length >= 3 ? { kind: 'word', value: v } : null;
}
export function ruleProposals(data) {
  const st = statsOf(data);
  const found = [];
  for (const [t, hits] of st.df) {
    const site = t[0] === 's';
    if (hits < (site ? 5 : 3)) continue;
    let best = null;
    for (const p of st.places.values()) { const c = p.counts.get(t) ?? 0; if (c > (best?.c ?? 0)) best = { p, c }; }
    if (!best || best.c / hits < (site ? 0.9 : 0.8)) continue;
    const rule = ruleOfTerm(t);
    if (!rule) continue;
    const counts = new Map();
    let all = 0;
    for (const b of data.bookmarks) {
      const key = st.byId.get(b.id)?.key;
      if (!key || !pickByRules([rule], b)) continue;
      all++;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const [key, c] = [...counts].reduce((m, e) => (e[1] > m[1] ? e : m), ['', 0]);
    // 件数の下限も数え直した数で見る（URL の段は語として日本語をパーセントの形に、ポートを落として数えるので、ルールが1件も当たらないことがある）
    if (all < (site ? 5 : 3) || c / all < (site ? 0.9 : 0.8)) continue;
    const p = st.places.get(key);
    found.push({ ...rule, category: p.category, subcategory: p.subcategory, hits: all, inPlace: c });
  }
  found.sort((x, y) => y.hits - x.hits || y.inPlace - x.inPlace);
  const out = [];
  for (const f of found) {
    if (out.length >= PROPOSAL_MAX) break;
    if (data.rules.some((r) => r.kind === f.kind && foldRule(r.value).replace(/^@/, '') === foldRule(f.value).replace(/^@/, ''))) continue;
    // 漢字の2文字の組などで、同じ組・同じ件数の長い語の案がもうあれば重ねない
    if (f.kind === 'word' && out.some((o) => o.kind === 'word' && samePlace(o, f) && o.hits === f.hits && (o.value.includes(f.value) || f.value.includes(o.value)))) continue;
    const mine = data.bookmarks.filter((b) => st.byId.get(b.id)?.key === keyOf(f.category, f.subcategory) && pickByRules([f], b));
    if (mine.every((b) => samePlace(pickByRules(data.rules, b) ?? {}, f))) continue;
    out.push(f);
  }
  return out;
}
// 初期の選択の理由の注
export const PLACE_REASONS = { rule: '自動整理のルールで選びました', infer: 'おすすめから選びました' };

export const emptyData = () => normalize(null);

// 形の合わないものは落とす（古い画面や壊れた応答でも描けるように）
export function normalize(raw) {
  const names = (list) => (Array.isArray(list) ? list.filter((c) => typeof c === 'string' && c) : []);
  const categories = names(raw?.categories);
  const subcategories = {};
  for (const c of categories) subcategories[c] = names(raw?.subcategories?.[c]);
  const bookmarks = Array.isArray(raw?.bookmarks) ? raw.bookmarks.filter((b) => b && typeof b.id === 'string' && typeof b.url === 'string') : [];
  const categoryColors = {};
  for (const c of categories) if (typeof raw?.categoryColors?.[c] === 'string') categoryColors[c] = raw.categoryColors[c];
  const hex = (v) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : null);
  // テーマは shared/theme.js の THEMES のどれか（知らない値は端末に合わせる）
  const theme = ['light', 'dark', 'cream'].includes(raw?.theme) ? raw.theme : 'system';
  const pinnedCategories = names(raw?.pinnedCategories).filter((c) => categories.includes(c));
  const categorySort = CATEGORY_SORTS.includes(raw?.categorySort) ? raw.categorySort : 'manual';
  const chipLayout = CHIP_LAYOUTS.includes(raw?.chipLayout) ? raw.chipLayout : 'rows';
  const autoSort = raw?.autoSort === true;
  const rules = (Array.isArray(raw?.rules) ? raw.rules : [])
    .filter((r) => Number.isInteger(r?.id) && RULE_KINDS.includes(r.kind) && typeof r.value === 'string' && typeof r.category === 'string')
    .map((r) => ({ id: r.id, kind: r.kind, value: r.value, category: r.category, subcategory: typeof r.subcategory === 'string' ? r.subcategory : null }));
  const suggestFirst = raw?.suggestFirst === true;
  const addCreate = ADD_CREATES.includes(raw?.addCreate) ? raw.addCreate : 'both';
  const suggestCount = SUGGEST_COUNTS.includes(raw?.suggestCount) ? raw.suggestCount : 3;
  return { categories, subcategories, categoryColors, accent: hex(raw?.accent), accentOn: hex(raw?.accentOn), theme, pinnedCategories, categorySort, chipLayout, autoSort, rules, suggestFirst, addCreate, suggestCount, bookmarks };
}

// ブックマークのサブカテゴリのうち、今もあるものだけ（なければ null）
export const subOf = (data, b) => (b.subcategory && data.subcategories?.[b.category]?.includes(b.subcategory) ? b.subcategory : null);

// 一覧を変える操作。Worker の POST /api/ops に { op, args } で送る（検査は Worker が行う）
export const ops = {
  add: (bookmark) => ({ op: 'add', args: [bookmark] }),
  remove: (id) => ({ op: 'remove', args: [id] }),
  setCategory: (id, category, subcategory = null) => ({ op: 'setCategory', args: [id, category, subcategory] }),
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
  addRule: (kind, value, category, subcategory = null) => ({ op: 'addRule', args: [kind, value, category, subcategory] }),
  removeRule: (id) => ({ op: 'removeRule', args: [id] }),
  sortRules: (ids) => ({ op: 'sortRules', args: [ids] }),
  // まとめて移す。moves は [[id, カテゴリ, サブカテゴリ], ...]（1〜500件）
  moveBookmarks: (moves) => ({ op: 'moveBookmarks', args: [moves] }),
  // 追加の画面（定義 2026-10-31-001）。おすすめを最初から選ぶか（真偽）と、その場で作れるもの（ADD_CREATES のどれか）
  setSuggestFirst: (on) => ({ op: 'setSuggestFirst', args: [on] }),
  setAddCreate: (value) => ({ op: 'setAddCreate', args: [value] }),
  // おすすめの数（SUGGEST_COUNTS のどれか。定義 2026-10-31-004）
  setSuggestCount: (n) => ({ op: 'setSuggestCount', args: [n] }),
  // テーマ（'system' | 'light' | 'dark' | 'cream'）
  setTheme: (value) => ({ op: 'setTheme', args: [value] }),
  // カテゴリを別のカテゴリの下へ入れる・サブカテゴリをカテゴリに戻す・サブカテゴリを別のカテゴリへ移す
  nestCategory: (name, parent) => ({ op: 'nestCategory', args: [name, parent] }),
  // index は、カテゴリにしたものを入れるカテゴリの並びの位置（なければ一番後ろ）
  promoteSubcategory: (category, name, index) => ({ op: 'promoteSubcategory', args: index === undefined ? [category, name] : [category, name, index] }),
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

// 独立のメモの id（memo: と 16 桁の乱数）。利用者の中で重ならなければよいので Math.random（アプリの Hermes には crypto がないことがある）
export const memoId = () => `memo:${Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`;

async function failure(res) {
  let body = null;
  try { body = await res.json(); } catch { /* 本文が JSON でないときは状態だけで判断する */ }
  if (body?.error?.code) return new StoreError(body.error.code, body.error.message ?? '');
  if (res.status === 401) return new StoreError('unauthorized', 'ログインしてください。');
  return new StoreError('http', `Twimark がエラーを返しました（${res.status}）。`);
}

// Workers AI を待つ操作（追加は翻訳と要約見出しを作ってから返す。1回 15 秒まで、fillAi は5件で2回ずつ）は、打ち切りまでを長くする
const SLOW_OPS = new Set(['add', 'refreshAi', 'fillAi']);
const SLOW_WAIT = 180_000;

// base は Twimark の URL（一覧の画面は同じオリジンなので空）。token があれば Bearer で送り、なければ Cookie を使う。
// timeout ミリ秒たっても応答（本文まで）が来なければ打ち切り、timeout の StoreError にする（いつまでも待たない）
export function createStore({ base = '', token = '', timeout = 20_000 } = {}, fetchImpl = fetch) {
  async function call(path, { method = 'GET', body, wait = timeout } = {}) {
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), wait);
    try {
      let res;
      try {
        res = await fetchImpl(`${base}${path}`, {
          method,
          credentials: token ? 'omit' : 'same-origin',
          signal: abort.signal,
          headers: {
            accept: 'application/json',
            ...(token ? { authorization: `Bearer ${token}` } : {}),
            ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          },
          ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
        });
      } catch {
        throw new StoreError('network', 'Twimark に接続できませんでした。');
      }
      if (!res.ok) throw await failure(res);
      return await res.json();
    } catch (err) {
      if (abort.signal.aborted) throw new StoreError('timeout', 'Twimark から応答がありません。通信の状態を確かめて、やり直してください。');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  return {
    call,
    load: async () => ({ data: normalize(await call('/api/data')) }),
    // op は ops のどれかが返す { op, args }。成功したら操作のあとのデータを返す
    update: async (op) => normalize(await call('/api/ops', { method: 'POST', body: op, wait: SLOW_OPS.has(op?.op) ? SLOW_WAIT : timeout })),
  };
}
