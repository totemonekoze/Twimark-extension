// Twimark（アプリ）の src/shared/store.js の写し。正本はアプリ側。アプリで変えたら写し直す（AGENTS.md）
// ブックマークの保存先。Twimark の Worker の API（/api/data と /api/ops）を通して D1 を読み書きする。
// 一覧の画面（src/site）は同じオリジンの Cookie、拡張（別のプロジェクト Twimark-extension）とアプリ（src/mobile）は端末のトークン（Bearer）で認証する。
// 名前の決まり（LIMITS、checkName）は Worker（src/worker）も使う

// 新しいアカウントのカテゴリ（今あるアカウントは変えない）
export const DEFAULT_CATEGORIES = ['新しいカテゴリ'];
// memoTitle は独立のメモの題、note はブックマークへの書き添え
export const LIMITS = { category: 20, categories: 30, subcategories: 30, text: 5000, memoTitle: 80, note: 2000 };
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

export const emptyData = () => ({ categories: [], subcategories: {}, categoryColors: {}, accent: null, accentOn: null, theme: 'system', bookmarks: [] });

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
  return { categories, subcategories, categoryColors, accent: hex(raw?.accent), accentOn: hex(raw?.accentOn), theme, bookmarks };
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
  // 翻訳と要約見出し（Workers AI）。1件の足りない分を作る・選んだ5件までを作る・要約見出しをカードに出すか
  refreshAi: (id) => ({ op: 'refreshAi', args: [id] }),
  fillAi: (ids) => ({ op: 'fillAi', args: [ids] }),
  setSummaryOn: (id, on) => ({ op: 'setSummaryOn', args: [id, on] }),
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
