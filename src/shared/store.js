// Twimark（アプリ）の src/shared/store.js の写し。正本はアプリ側。アプリで変えたら写し直す（AGENTS.md）
// ブックマークの保存先。Twimark の Worker の API（/api/data と /api/ops）を通して D1 を読み書きする。
// 一覧の画面（src/site）は同じオリジンの Cookie、拡張（別のプロジェクト Twimark-extension）とアプリ（src/mobile）は端末のトークン（Bearer）で認証する。
// 名前の決まり（LIMITS、checkName）は Worker（src/worker）も使う

// 新しいアカウントのカテゴリ（今あるアカウントは変えない）
export const DEFAULT_CATEGORIES = ['新しいカテゴリ'];
// memoTitle は独立のメモの題、note はブックマークへの書き添え
export const LIMITS = { category: 20, categories: 30, subcategories: 30, text: 5000, memoTitle: 80, note: 2000, rules: 100, ruleValue: 100 };
// memo は独立のメモ（URL のないこともあるカード）。ほかは追加できるサイト
export const SITES = { x: 'X', note: 'note', qiita: 'Qiita', instagram: 'Instagram', pixiv: 'pixiv', booth: 'BOOTH', github: 'GitHub', unityroom: 'unityroom', freem: 'ふりーむ！', memo: 'メモ' };
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
// ---- おすすめのカテゴリ（定義 2026-10-31-001。AI は使わない） ----
// 比べる中身: 作者（handle、なければ名前）、URL の「ホスト＋最初の段」、ハッシュタグ、語（3文字以上の英数字の語とカタカナの語。
// URL とハッシュタグの中は除く）、サイト。どれも NFKC・小文字でそろえる
const TAG = /#[\p{L}\p{N}_]+/gu;
// 保存する URL の最初の段が決まった語のサイト（/p/・/artworks/・/ja/・/games/・/win/）。同じサイトと同じ意味になるので、URL の最初の段は比べない
// （定義 2026-10-31-001 の追補）
const FIXED_PATH = new Set(['instagram', 'pixiv', 'booth', 'unityroom', 'freem']);
function traitsOf(b) {
  const handle = foldRule(b?.author?.handle).replace(/^@/, '');
  let path = '';
  try {
    const u = new URL(String(b?.url ?? ''));
    const first = u.pathname.split('/').filter(Boolean)[0];
    if (first && !FIXED_PATH.has(b?.site)) path = `${u.hostname.replace(/^www\./, '')}/${first}`.toLowerCase();
  } catch { /* URL のないメモや、形の違うもの */ }
  const body = foldRule(`${b?.title ?? ''}\n${b?.text ?? ''}`).replace(/https?:\/\/\S+/g, ' ');
  const rest = body.replace(TAG, ' ');
  return {
    author: handle ? `@${handle}` : foldRule(b?.author?.name),
    path,
    tags: new Set(body.match(TAG) ?? []),
    words: new Set([...(rest.match(/[a-z0-9]{3,}/g) ?? []), ...(rest.match(/[\p{Script=Katakana}ー]{3,}/gu) ?? [])]),
    site: b?.site ?? '',
  };
}
// 点: 作者が同じ 4、URL の最初の段が同じ 3（FIXED_PATH のサイトは比べない）、ハッシュタグ 1つにつき 2、語 1つにつき 1（1件で3まで）、サイトが同じ 1
function scoreOf(a, t) {
  let words = 0;
  for (const w of a.words) if (t.words.has(w)) words++;
  return (a.author && a.author === t.author ? 4 : 0) + (a.path && a.path === t.path ? 3 : 0)
    + [...a.tags].filter((x) => t.tags.has(x)).length * 2 + Math.min(words, 3) + (a.site && a.site === t.site ? 1 : 0);
}
// これまでのブックマーク（メモも。未分類と、もうないサブカテゴリのものは除く）の組ごとに点を足し、多い順（同じなら、その組の一番新しい保存の新しい順）
function historyPlaces(data, b) {
  const me = traitsOf(b);
  const places = new Map();
  for (const x of data.bookmarks) {
    const place = { category: x.category, subcategory: x.subcategory || null };
    if (!placeExists(data, place)) continue;
    const n = scoreOf(me, traitsOf(x));
    if (!n) continue;
    const key = `${place.category}\n${place.subcategory ?? ''}`;
    const p = places.get(key) ?? { ...place, score: 0, at: '' };
    p.score += n;
    if (String(x.savedAt ?? '') > p.at) p.at = String(x.savedAt);
    places.set(key, p);
  }
  return [...places.values()]
    .sort((p, q) => q.score - p.score || (q.at > p.at ? 1 : q.at < p.at ? -1 : 0))
    .map(({ category, subcategory }) => ({ category, subcategory, by: 'history' }));
}
const samePlace = (p, q) => p.category === q.category && (p.subcategory ?? null) === (q.subcategory ?? null);
// 追加の画面のおすすめの札。b は pickByRules と同じ形。[{ category, subcategory, by: 'rule' | 'history' }] を SUGGEST_MAX まで。
// 先頭はルールが当たればその組（自動整理の ON・OFF に関わらず）。続けてこれまでの保存から（ルールの組と同じものは重ねない）
export const SUGGEST_MAX = 3;
export function suggestPlaces(data, b) {
  const rule = pickByRules(data.rules, b);
  const first = placeExists(data, rule) ? [{ ...rule, by: 'rule' }] : [];
  return [...first, ...historyPlaces(data, b).filter((p) => !first.some((q) => samePlace(p, q)))].slice(0, SUGGEST_MAX);
}
// 追加の画面の初期の選択（定義 2026-10-30-004・2026-10-31-001）。b は pickByRules と同じ形。自動整理が ON でルールが当たればその組、
// でなければ「おすすめを最初から選ぶ」が ON でこれまでの保存の一番の組。どちらもなければ null（前回の組のまま）。
// 利用者が自分で選んだあとは当て直さない（画面が見る）
export function initialPlace(data, b) {
  const rule = data?.autoSort ? pickByRules(data.rules, b) : null;
  if (placeExists(data, rule)) return { ...rule, by: 'rule' };
  return (data?.suggestFirst && historyPlaces(data, b)[0]) || null;
}
// 整理の候補（定義 2026-10-30-004）。ルールが当たる行き先と今の場所が違うブックマーク（未分類とメモも）を、保存の新しい順に
// [{ b, to: { category, subcategory } }]
export function sortCandidates(data) {
  return data.bookmarks
    .map((b) => ({ b, to: pickByRules(data.rules, b) }))
    .filter(({ b, to }) => placeExists(data, to) && (b.category !== to.category || subOf(data, b) !== (to.subcategory ?? null)))
    .sort((x, y) => String(y.b.savedAt).localeCompare(String(x.b.savedAt)));
}
// 初期の選択の理由の注
export const PLACE_REASONS = { rule: '自動整理のルールで選びました', history: 'おすすめから選びました' };

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
  return { categories, subcategories, categoryColors, accent: hex(raw?.accent), accentOn: hex(raw?.accentOn), theme, pinnedCategories, categorySort, chipLayout, autoSort, rules, suggestFirst, addCreate, bookmarks };
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
