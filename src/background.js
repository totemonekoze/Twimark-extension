// 右クリックのメニューと、共有メニューに差し込んだ項目（content.js）から、追加の画面を小さなウィンドウで開く。
// 投稿・記事のアイコン（content.js）の問い合わせも受ける: 保存済みか（twimark-state）、その場の追加（twimark-save）、
// 連携の画面（twimark-link）、一覧で開く（twimark-open）。/api/data は覚えておき、5分たつか、追加したら読み直す。
// module の service worker（manifest の background.type）なので、shared/ を import できる
import { createStore, describeError, ops, PUBLIC_URL } from './shared/store.js';
import { fetchMeta, parseUrl } from './shared/meta.js';
import { DEFAULT_ACCENT } from './shared/theme.js';
import { loadSettings, openLinkPage } from './account.js';
import { bookmarkOf } from './bookmark.js';

const TARGETS = [
  'https://x.com/*/status/*', 'https://twitter.com/*/status/*', 'https://mobile.twitter.com/*/status/*',
  'https://note.com/*/n/*', 'https://qiita.com/*/items/*',
  'https://www.instagram.com/p/*', 'https://www.instagram.com/reel/*', 'https://www.instagram.com/*/p/*', 'https://instagram.com/p/*', 'https://instagram.com/reel/*',
  'https://www.pixiv.net/artworks/*', 'https://www.pixiv.net/*/artworks/*', 'https://pixiv.net/artworks/*', 'https://pixiv.net/*/artworks/*', 'https://booth.pm/*/items/*', 'https://*.booth.pm/items/*',
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
  return {
    linked: true,
    accent: data.accent ?? DEFAULT_ACCENT,
    saved: saved ? { category: saved.category, sub: saved.subcategory ?? null } : null,
    categories: data.categories,
    subcategories: data.subcategories,
    lastPlace: lastPlace ?? null,
  };
}

// その場の追加。本文を取れず、貼り付けもなければ needText を返す（小さな画面が本文の欄を出す）
async function save({ url, place, text = '' }) {
  const parsed = parseUrl(url);
  const settings = await loadSettings();
  if (!parsed || !settings?.token) return { error: '追加できません。' };
  const item = await fetchMeta(parsed).catch(() => null);
  if (!item && !text.trim()) return { needText: true };
  try {
    await createStore({ base: PUBLIC_URL, token: settings.token }).update(ops.add(bookmarkOf(parsed, item, place, text.trim())));
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
  'twimark-save': (m) => save(m),
  'twimark-link': () => openLinkPage(),
  'twimark-open': (m) => openList(m),
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
