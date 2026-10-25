// 拡張のポップアップ。まだ Twimark と結んでいなければ、最初にログインの画面を出す（ID とパスワード、Twimark の画面での受け渡し、予備のトークン）。
// 結んでいれば追加の画面。ツールバーのボタンでは開いているタブのURL、右クリックと共有メニューからは ?url= のURLを追加する。
// 保存先は Twimark の Worker（PUBLIC_URL）で、覚えた拡張のトークンで認証する。問い合わせの間は経った秒数を出し、失敗したらエラーコードを出す
import { createStore, describeError, ops, SITES, PUBLIC_URL } from './shared/store.js';
import { parseUrl, fetchMeta } from './shared/meta.js';
import { clearSettings, hostAllowed, linkWithToken, loadSettings, loginWithPassword, openLinkPage } from './account.js';
import { bookmarkOf } from './bookmark.js';

const $ = (s) => document.querySelector(s);
const statusEl = $('[data-status]');
const form = $('[data-form]');
const select = $('[data-category]');
const paste = $('[data-paste-text]');
const submit = $('[data-submit]');
// 対応していないページで出す文（この改行のまま）
const UNSUPPORTED = `このページは追加できません。
対応しているサイトは以下です。
・X
・Instagram
・note
・Qiita
・pixiv
・BOOTH`;
const fromWindow = new URLSearchParams(location.search).get('url');
if (fromWindow) document.documentElement.classList.add('window');

const say = (el, text, kind = '') => { el.textContent = text; el.dataset.kind = kind; };
const status = (text, kind) => say(statusEl, text, kind);
const close = () => window.close();
$('[data-close]').addEventListener('click', close);
$('[data-options]').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
$('[data-version]').textContent = `版 ${chrome.runtime.getManifest().version}`;

// network のときは、通信を止めるものの見当を足す
const failure = (err, fallback) => `${describeError(err, fallback)}${err?.code === 'network' ? ' ほかの拡張やセキュリティのソフトが、通信を止めていないか確かめてください。' : ''}`;

// 問い合わせの間、経った秒数を数えて出す
async function counting(label, task) {
  const t0 = Date.now();
  const tick = () => status(`${label}（${Math.floor((Date.now() - t0) / 1000)} 秒）`);
  tick();
  const timer = setInterval(tick, 1000);
  try {
    return await task;
  } finally {
    clearInterval(timer);
  }
}

// ---- 最初のログインの画面 ----
function showLogin(message = '') {
  $('[data-add]').hidden = true;
  $('[data-login]').hidden = false;
  $('[data-who]').textContent = '';
  const loginStatus = $('[data-login-status]');
  say(loginStatus, message, message ? 'error' : '');
  const loginForm = $('[data-login-form]');
  loginForm.elements.namedItem('login').focus();
  const done = (login) => { say(loginStatus, `${login} と結びました。`, 'ok'); start(); };
  loginForm.onsubmit = async (e) => {
    e.preventDefault();
    const button = $('[data-login-submit]');
    button.disabled = true;
    say(loginStatus, 'ログインしています…');
    try {
      done(await loginWithPassword(loginForm.elements.namedItem('login').value.trim(), loginForm.elements.namedItem('password').value));
    } catch (err) {
      // パスキーだけでログインする ID は、Twimark の画面でのログインを使う
      say(loginStatus, err?.code === 'passkey_only' ? `${describeError(err)} 下の「Twimark の画面でログイン」を使ってください。` : failure(err, 'ログインできませんでした。'), 'error');
    } finally {
      button.disabled = false;
    }
  };
  const tokenForm = $('[data-token-form]');
  tokenForm.onsubmit = async (e) => {
    e.preventDefault();
    say(loginStatus, '確かめています…');
    try {
      done(await linkWithToken(tokenForm.elements.namedItem('token').value.trim()));
    } catch (err) {
      say(loginStatus, failure(err, '結べませんでした。'), 'error');
    }
  };
  $('[data-link-page]').onclick = () => { openLinkPage(); say(loginStatus, 'Twimark の画面で「許す」を押すと、ここも進みます。'); };
}
// Twimark の画面（link.js）や設定で結んだら、開いているポップアップも進める
chrome.storage.onChanged.addListener((changes) => {
  if (changes.settings?.newValue?.token && !$('[data-login]').hidden) start();
});

// ---- 追加の画面 ----
async function targetUrl() {
  if (fromWindow) return fromWindow;
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab?.url ?? '';
}

async function showAdd(settings) {
  $('[data-login]').hidden = true;
  $('[data-add]').hidden = false;
  $('[data-who]').textContent = settings.login ? `ログイン中: ${settings.login} ·` : '';
  const { lastPlace } = await chrome.storage.local.get('lastPlace');
  const parsed = parseUrl(await targetUrl());
  if (!parsed) {
    // 間違いではないので、エラーの赤ではなく、ふつうの文字で改行して出す（popup.css の .msg の pre-line）
    status(UNSUPPORTED, '');
    return;
  }
  if (!(await hostAllowed())) {
    status('Twimark への通信が許されていません。chrome://extensions の Twimark の「詳細」で、「サイトへのアクセス」を「すべてのサイト」にしてください。', 'error');
    return;
  }

  const store = createStore({ base: PUBLIC_URL, token: settings.token });
  const [loaded, meta] = await counting('Twimark に問い合わせています…', Promise.allSettled([store.load(), fetchMeta(parsed)]));
  if (loaded.status === 'rejected') {
    // トークンが取り消されていたら、忘れてログインからやり直す
    if (loaded.reason?.code === 'unauthorized') {
      await clearSettings();
      showLogin('ログインが切れました。もう一度ログインしてください。');
      return;
    }
    status(failure(loaded.reason, '読み込めませんでした。'), 'error');
    return;
  }
  const { data } = loaded.value;
  const item = meta.status === 'fulfilled' ? meta.value : null;

  $('[data-site]').textContent = SITES[parsed.site];
  $('[data-author]').textContent = item ? `${item.author.name} @${item.author.handle}` : parsed.handle ? `@${parsed.handle}` : '';
  $('[data-title]').textContent = item?.title ?? '';
  $('[data-text]').textContent = item?.text ?? '';
  $('[data-url]').textContent = item?.url ?? parsed.url ?? '';
  // カテゴリごとの <optgroup> に、カテゴリそのものとサブカテゴリを並べる。値は [カテゴリ, サブカテゴリ] の JSON
  const option = (category, sub, label) => Object.assign(document.createElement('option'), { value: JSON.stringify([category, sub]), textContent: label });
  select.replaceChildren(...data.categories.map((c) => {
    const g = Object.assign(document.createElement('optgroup'), { label: c });
    g.append(option(c, null, c), ...(data.subcategories[c] ?? []).map((s) => option(c, s, `${c} › ${s}`)));
    return g;
  }));
  if ([...select.options].some((o) => o.value === lastPlace)) select.value = lastPlace;
  paste.hidden = Boolean(item);
  form.hidden = false;

  if (data.bookmarks.some((b) => b.id === parsed.id)) {
    status('このページはもう保存されています。', 'ok');
    submit.disabled = true;
    return;
  }
  status(item ? '' : '本文を取得できませんでした。貼り付けると保存できます。', item ? '' : 'error');
  select.focus();

  form.onsubmit = async (e) => {
    e.preventDefault();
    const [category, subcategory] = JSON.parse(select.value);
    const pasted = form.elements.namedItem('text').value.trim();
    if (!item && !pasted) { status('本文を貼り付けてください。', 'error'); return; }
    const bookmark = bookmarkOf(parsed, item, [category, subcategory], pasted, form.elements.namedItem('note').value);
    submit.disabled = true;
    status('保存中…');
    try {
      await store.update(ops.add(bookmark));
      await chrome.storage.local.set({ lastPlace: select.value });
      // ページのアイコンを保存済みの形にするため、background.js に覚えた内容を読み直させる
      chrome.runtime.sendMessage({ type: 'twimark-changed' }).catch(() => {});
      status('追加しました。', 'ok');
      if (fromWindow) setTimeout(close, 900);
    } catch (err) {
      status(failure(err, '保存できませんでした。'), 'error');
      submit.disabled = err?.code === 'duplicate';
    }
  };
}

async function main() {
  const settings = await loadSettings();
  if (!settings?.token) { showLogin(); return; }
  await showAdd(settings);
}
// 結んだ直後は、ログインの画面の続きと、保存領域の変わった知らせの両方から呼ばれる。動いている間は重ねて動かさない
let running = null;
function start() {
  running ??= main().catch((err) => status(failure(err, '読み込めませんでした。'), 'error')).finally(() => { running = null; });
  return running;
}

start();
