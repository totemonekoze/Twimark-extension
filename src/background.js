// 右クリックのメニューと、共有メニューに差し込んだ項目（content.js）から、追加の画面を小さなウィンドウで開く。
// 投稿・記事のアイコン（content.js）の問い合わせも受ける: 保存済みか（twimark-state）、その場の追加（twimark-save）、
// 連携の画面（twimark-link）、一覧で開く（twimark-open）、その場でカテゴリ・サブカテゴリを作る（twimark-create）、下見を見たおすすめ（twimark-suggest）。/api/data は覚えておき、5分たつか、追加したら読み直す。
// module の service worker（manifest の background.type）なので、shared/ を import できる
import { createStore, describeError, initialPlace, ops, PLACE_REASONS, PUBLIC_URL, suggestPlaces } from './shared/store.js';
import { fetchMeta, parseUrl } from './shared/meta.js';
import { DEFAULT_ACCENT } from './shared/theme.js';
import { loadSettings, openLinkPage } from './account.js';
import { bookmarkOf, similarItems } from './bookmark.js';

const TARGETS = [
  'https://x.com/*/status/*', 'https://twitter.com/*/status/*', 'https://mobile.twitter.com/*/status/*',
  'https://note.com/*/n/*', 'https://qiita.com/*/items/*',
  'https://www.instagram.com/p/*', 'https://www.instagram.com/reel/*', 'https://www.instagram.com/*/p/*', 'https://instagram.com/p/*', 'https://instagram.com/reel/*',
  'https://www.pixiv.net/artworks/*', 'https://www.pixiv.net/*/artworks/*', 'https://pixiv.net/artworks/*', 'https://pixiv.net/*/artworks/*', 'https://booth.pm/*/items/*', 'https://*.booth.pm/items/*',
  // GitHub は予約の名前（settings など）も当たるが、そのページではポップアップがメモの追加になる
  'https://github.com/*/*', 'https://www.github.com/*/*', 'https://unityroom.com/games/*', 'https://www.freem.ne.jp/win/game/*', 'https://freem.ne.jp/win/game/*',
  // Google マップの場所と短い URL、レシピ、お店（Twimark の定義 2026-10-31-008）
  'https://www.google.com/maps/place/*', 'https://www.google.co.jp/maps/place/*', 'https://maps.google.com/maps/place/*', 'https://maps.app.goo.gl/*', 'https://goo.gl/maps/*',
  'https://cookpad.com/jp/recipes/*', 'https://cookpad.com/recipe/*', 'https://delishkitchen.tv/recipes/*', 'https://www.kurashiru.com/recipes/*', 'https://recipe.rakuten.co.jp/recipe/*',
  'https://www.hotpepper.jp/str*', 'https://r.gnavi.co.jp/*',
];
const FRESH = 5 * 60 * 1000;

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: 'twimark-link', title: 'Twimarkに追加', contexts: ['link'], targetUrlPatterns: TARGETS });
    chrome.contextMenus.create({ id: 'twimark-page', title: 'このページをTwimarkに追加', contexts: ['page'], documentUrlPatterns: TARGETS });
  });
});

function openAdd(url) {
  if (typeof url !== 'string' || !url) return;
  chrome.windows.create({ url: chrome.runtime.getURL(`popup.html?url=${encodeURIComponent(url)}`), type: 'popup', width: 440, height: 620 });
}

chrome.contextMenus.onClicked.addListener((info) => openAdd(info.menuItemId === 'twimark-link' ? info.linkUrl : info.pageUrl));

// 覚えた /api/data。{ at, token, data } か null。読み込み中は同じ Promise を使う
let cache = null;
let loading = null;
const forget = () => { cache = null; };
chrome.storage.onChanged.addListener((changes) => { if (changes.settings) forget(); });

// null は未連携（トークンがないか、取り消された）
async function current() {
  const settings = await loadSettings();
  if (!settings?.token) return null;
  if (cache && cache.token === settings.token && Date.now() - cache.at < FRESH) return cache;
  loading ??= createStore({ base: PUBLIC_URL, token: settings.token }).load()
    .then(({ data }) => { cache = { at: Date.now(), token: settings.token, data }; return cache; })
    .catch((err) => { if (err?.code === 'unauthorized') return null; throw err; })
    .finally(() => { loading = null; });
  return loading;
}

// アイコンの形と、小さな画面に出すもの
async function state(url) {
  const parsed = parseUrl(url);
  const c = await current();
  if (!c) return { linked: false };
  const { data } = c;
  const saved = parsed ? data.bookmarks.find((b) => b.id === parsed.id) : null;
  const { lastPlace } = await chrome.storage.local.get('lastPlace');
  // おすすめと初期の選択（Twimark の定義 2026-10-31-001）。小さな画面は下見を取らないので、URL・サイト・X の handle だけで判定する
  // 開いてすぐは URL・サイト・handle だけで決め、続けて twimark-suggest で下見を見て出し直す
  const facts = parsed && !saved ? { site: parsed.site, url: parsed.url ?? url, author: { name: '', handle: parsed.handle ?? '' }, title: '', text: '' } : null;
  return {
    linked: true,
    accent: data.accent ?? DEFAULT_ACCENT,
    saved: saved ? { category: saved.category, sub: saved.subcategory ?? null } : null,
    categories: data.categories,
    subcategories: data.subcategories,
    lastPlace: lastPlace ?? null,
    ...places(data, facts),
    suggestCount: data.suggestCount,
    addCreate: data.addCreate,
  };
}
const places = (data, facts) => {
  const initial = facts ? initialPlace(data, facts) : null;
  return { suggest: facts ? suggestPlaces(data, facts) : [], initial: initial ? { ...initial, reason: PLACE_REASONS[initial.by] } : null };
};

// 小さな画面が開いたあと、ポップアップと同じ下見（作者・題・本文）を取って、おすすめと初期の選択を出し直す（Twimark の定義 2026-10-31-004）。
// 下見を取れなければ null（小さな画面は今の札のまま）
async function suggestFor({ url }) {
  const parsed = parseUrl(url);
  const c = await current();
  if (!parsed || !c) return { suggest: null };
  const item = await fetchMeta(parsed).catch(() => null);
  if (!item) return { suggest: null };
  return places(c.data, { site: parsed.site, url: item.url ?? parsed.url ?? url, author: item.author ?? { name: '', handle: parsed.handle ?? '' }, title: item.title ?? '', text: item.text ?? '' });
}

// その場の追加。本文を取れず、貼り付けもなければ needText を返す（小さな画面が本文の欄を出す）。wants は要約見出しを作る・翻訳する。
// 保存済みと似ているものがあれば、保存せずに similar（similarItems の行）を返す。小さな画面が確かめの段を出し、「追加する」で confirmed をつけて送り直す（Twimark の定義 2026-10-31-009）
async function save({ url, place, text = '', wants = {}, confirmed = false }) {
  const parsed = parseUrl(url);
  const settings = await loadSettings();
  if (!parsed || !settings?.token) return { error: '追加できません。' };
  const item = await fetchMeta(parsed).catch(() => null);
  if (!item && !text.trim()) return { needText: true };
  const bookmark = bookmarkOf(parsed, item, place, text.trim(), '', wants);
  if (!confirmed) {
    const c = await current();
    const similar = c ? similarItems(c.data, bookmark) : [];
    if (similar.length) return { similar };
  }
  try {
    await createStore({ base: PUBLIC_URL, token: settings.token }).update(ops.add(bookmark));
  } catch (err) {
    // ほかの端末で保存済み（覚えた内容が古い）。保存済みとして返し、読み直す
    if (err?.code !== 'duplicate') throw err;
    forget();
    return { ok: true, already: true };
  }
  await chrome.storage.local.set({ lastPlace: JSON.stringify(place) });
  forget();
  return { ok: true };
}

// 小さな画面から、新しいカテゴリ（kind: 'category'）か、category のサブカテゴリ（kind: 'subcategory'）を作る。
// 作ったあとの state に、作った組（created: [カテゴリ, サブカテゴリ]）を足して返す。断られたら { error }
async function create({ kind, category, name, url }) {
  const settings = await loadSettings();
  if (!settings?.token) return { error: 'Twimark にログインして連携してください。' };
  const next = String(name ?? '').trim();
  const sub = kind === 'subcategory';
  const data = await createStore({ base: PUBLIC_URL, token: settings.token }).update(sub ? ops.addSubcategory(category, next) : ops.addCategory(next));
  cache = { at: Date.now(), token: settings.token, data };
  return { ...(await state(url)), created: sub ? [category, next] : [next, null] };
}

// 一覧の画面を、そのカテゴリ（とサブカテゴリ）で開く
function openList({ category, sub }) {
  const u = new URL(PUBLIC_URL);
  if (category) u.searchParams.set('category', category);
  if (sub) u.searchParams.set('sub', sub);
  chrome.tabs.create({ url: u.href });
}

const HANDLERS = {
  'twimark-add': (m) => openAdd(m.url),
  'twimark-changed': () => forget(),
  'twimark-state': (m) => state(m.url),
  'twimark-suggest': (m) => suggestFor(m),
  'twimark-save': (m) => save(m),
  'twimark-link': () => openLinkPage(),
  'twimark-open': (m) => openList(m),
  'twimark-create': (m) => create(m),
};
// 答えは sendResponse で返す（onMessage は Promise を返しても待たないブラウザがある）。失敗は { error } にする
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = sender.id === chrome.runtime.id ? HANDLERS[message?.type] : null;
  if (!handler) return false;
  Promise.resolve().then(() => handler(message)).then(
    (result) => sendResponse(result ?? { ok: true }),
    (err) => sendResponse({ error: describeError(err, 'うまくいきませんでした。'), code: err?.code ?? null }),
  );
  return true;
});
