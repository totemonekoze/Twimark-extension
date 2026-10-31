// 拡張のポップアップ。まだ Twimark と結んでいなければ、最初にログインの画面を出す（ID とパスワード、Twimark の画面での受け渡し、予備のトークン）。
// 結んでいれば追加の画面。ツールバーのボタンでは開いているタブのURL、右クリックと共有メニューからは ?url= のURLを追加する。
// 追加できないページでは、そのページを控える独立のメモの追加の画面（題はタブの題、URL は https のときだけ入れておく）。
// 保存先は Twimark の Worker（PUBLIC_URL）で、覚えた拡張のトークンで認証する。問い合わせの間は経った秒数を出し、失敗したらエラーコードを出す。
// 追加の画面には、おすすめの札と、その場で新しいカテゴリ・サブカテゴリを作るボタンを出す（Twimark の定義 2026-10-31-001）
import { createStore, describeError, initialPlace, memoId, ops, PLACE_REASONS, SITES, PUBLIC_URL, suggestPlaces } from './shared/store.js';
import { parseUrl, fetchMeta } from './shared/meta.js';
import { clearSettings, hostAllowed, linkWithToken, loadSettings, loginWithPassword, openLinkPage } from './account.js';
import { bookmarkOf, similarItems } from './bookmark.js';

const $ = (s) => document.querySelector(s);
const statusEl = $('[data-status]');
const form = $('[data-form]');
const select = $('[data-category]');
const paste = $('[data-paste-text]');
const submit = $('[data-submit]');
const memoForm = $('[data-memo-form]');
const memoSelect = $('[data-memo-category]');
const memoSubmit = $('[data-memo-submit]');
const fromWindow = new URLSearchParams(location.search).get('url');
if (fromWindow) document.documentElement.classList.add('window');

const say = (el, text, kind = '') => { el.textContent = text; el.dataset.kind = kind; };
const status = (text, kind) => say(statusEl, text, kind);
const memoStatus = (text, kind) => say($('[data-memo-status]'), text, kind);
const close = () => window.close();
$('[data-close]').addEventListener('click', close);
$('[data-memo-close]').addEventListener('click', close);
$('[data-options]').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
$('[data-version]').textContent = `版 ${chrome.runtime.getManifest().version}`;

// network のときは、通信を止めるものの見当を足す
const failure = (err, fallback) => `${describeError(err, fallback)}${err?.code === 'network' ? ' ほかの拡張やセキュリティのソフトが、通信を止めていないか確かめてください。' : ''}`;

// 問い合わせの間、経った秒数を数えて出す（show は出す先。既定は追加の画面）
async function counting(label, task, show = status) {
  const t0 = Date.now();
  const tick = () => show(`${label}（${Math.floor((Date.now() - t0) / 1000)} 秒）`);
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
  $('[data-memo]').hidden = true;
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
// 追加するページ（URL と題）。右クリックと共有メニューからは URL だけ。chrome:// などで取れなければ空
async function targetTab() {
  if (fromWindow) return { url: fromWindow, title: '' };
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return { url: tab?.url ?? '', title: tab?.title ?? '' };
}
// カテゴリごとの <optgroup> に、カテゴリそのものとサブカテゴリを並べる。値は [カテゴリ, サブカテゴリ] の JSON。前回選んだ組を選んでおく
function fillCategories(target, data, lastPlace) {
  const option = (category, sub, label) => Object.assign(document.createElement('option'), { value: JSON.stringify([category, sub]), textContent: label });
  target.replaceChildren(...data.categories.map((c) => {
    const g = Object.assign(document.createElement('optgroup'), { label: c });
    g.append(option(c, null, c), ...(data.subcategories[c] ?? []).map((s) => option(c, s, `${c} › ${s}`)));
    return g;
  }));
  if ([...target.options].some((o) => o.value === lastPlace)) target.value = lastPlace;
}
// おすすめの札・初期の選択・その場で作るボタン。facts は suggestPlaces に渡す中身（URL・サイト・作者・題・本文）。
// 初期の選択は、自動整理のルール（ON のとき）、おすすめの一番（「おすすめを最初から選ぶ」が ON のとき）、前回の組の順。自分で選んだら当て直さない
const placeValue = (p) => JSON.stringify([p.category, p.subcategory ?? null]);
function setupPlaces(store, data, facts) {
  const reason = $('[data-reason]');
  const pick = (p, why = '') => { select.value = placeValue(p); reason.textContent = why; reason.hidden = !why; paint(); };
  const initial = initialPlace(data, facts);
  if (initial) pick(initial, PLACE_REASONS[initial.by]);
  select.onchange = () => { const [category, subcategory] = JSON.parse(select.value); pick({ category, subcategory }); };
  function paint() {
    const suggest = suggestPlaces(data, facts);
    $('[data-suggest-part]').hidden = !suggest.length;
    $('[data-suggest]').replaceChildren(...suggest.map((p) => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'chip' });
      b.setAttribute('aria-pressed', String(select.value === placeValue(p)));
      if (p.by === 'rule') b.append(Object.assign(document.createElement('span'), { className: 'tag', textContent: 'ルール' }));
      b.append(p.subcategory ? `${p.category} › ${p.subcategory}` : p.category);
      b.addEventListener('click', () => pick(p));
      return b;
    }));
    $('[data-create]').hidden = data.addCreate === 'none';
    // サブカテゴリは今選んでいるカテゴリに作るので、カテゴリが1つもなければ出さない
    $('[data-new="subcategory"]').hidden = data.addCreate !== 'both' || !select.value;
  }
  // 作る: 名前の欄を出し、「作る」で作って選び直す。断られたら、追加の失敗と同じ所に出す
  let kind = null;
  const nameField = $('[data-new-name]');
  for (const b of document.querySelectorAll('[data-new]')) {
    b.onclick = () => {
      kind = b.dataset.new;
      nameField.placeholder = kind === 'category' ? '新しいカテゴリの名前' : `「${JSON.parse(select.value)[0]}」の新しいサブカテゴリの名前`;
      $('[data-new-form]').hidden = false;
      nameField.focus();
    };
  }
  const make = async () => {
    const name = nameField.value.trim();
    // カテゴリを作るときは選択を読まない（カテゴリが1つもないと選択が空のため）
    const category = kind === 'subcategory' ? JSON.parse(select.value)[0] : null;
    try {
      data = await store.update(kind === 'subcategory' ? ops.addSubcategory(category, name) : ops.addCategory(name));
    } catch (err) {
      status(failure(err, '作れませんでした。'), 'error');
      return;
    }
    fillCategories(select, data, '');
    nameField.value = '';
    $('[data-new-form]').hidden = true;
    status('');
    pick(kind === 'subcategory' ? { category, subcategory: name } : { category: name, subcategory: null });
  };
  $('[data-new-save]').onclick = make;
  // 名前の欄の Enter で、追加の形を送らない
  nameField.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); make(); } };
  paint();
}

// トークンが取り消されていたら、忘れてログインからやり直す（やり直したら true）
async function relogin(err) {
  if (err?.code !== 'unauthorized') return false;
  await clearSettings();
  showLogin('ログインが切れました。もう一度ログインしてください。');
  return true;
}

async function showAdd(settings) {
  $('[data-login]').hidden = true;
  $('[data-who]').textContent = settings.login ? `ログイン中: ${settings.login} ·` : '';
  const { lastPlace } = await chrome.storage.local.get('lastPlace');
  const target = await targetTab();
  const parsed = parseUrl(target.url);
  $('[data-add]').hidden = !parsed;
  $('[data-memo]').hidden = Boolean(parsed);
  if (!(await hostAllowed())) {
    (parsed ? status : memoStatus)('Twimark への通信が許されていません。chrome://extensions の Twimark の「詳細」で、「サイトへのアクセス」を「すべてのサイト」にしてください。', 'error');
    return;
  }

  const store = createStore({ base: PUBLIC_URL, token: settings.token });
  if (!parsed) { await showMemo(store, target, lastPlace); return; }
  const [loaded, meta] = await counting('Twimark に問い合わせています…', Promise.allSettled([store.load(), fetchMeta(parsed)]));
  if (loaded.status === 'rejected') {
    if (!(await relogin(loaded.reason))) status(failure(loaded.reason, '読み込めませんでした。'), 'error');
    return;
  }
  const { data } = loaded.value;
  const item = meta.status === 'fulfilled' ? meta.value : null;

  $('[data-site]').textContent = SITES[parsed.site];
  $('[data-author]').textContent = item ? `${item.author.name}${item.author.handle ? ` @${item.author.handle}` : ''}` : parsed.handle ? `@${parsed.handle}` : '';
  $('[data-title]').textContent = item?.title ?? '';
  $('[data-text]').textContent = item?.text ?? '';
  $('[data-url]').textContent = item?.url ?? parsed.url ?? '';
  fillCategories(select, data, lastPlace);
  paste.hidden = Boolean(item);
  form.hidden = false;

  if (data.bookmarks.some((b) => b.id === parsed.id)) {
    status('このページはもう保存されています。', 'ok');
    submit.disabled = true;
    return;
  }
  status(item ? '' : '本文を取得できませんでした。貼り付けると保存できます。', item ? '' : 'error');
  setupPlaces(store, data, { site: parsed.site, url: item?.url ?? parsed.url ?? target.url, author: item?.author ?? { name: '', handle: parsed.handle ?? '' }, title: item?.title ?? '', text: item?.text ?? '' });
  select.focus();

  // 類似の投稿の確かめ（Twimark の定義 2026-10-31-009）。「追加」で似ているものがあれば保存せずに出す。出したあとに選択やメモを変えてもよく、
  // 「追加する」はそのときの値で保存する。「戻る」は閉じるだけ
  const similarBox = $('[data-similar]');
  const closeSimilar = () => { similarBox.hidden = true; $('[data-actions]').hidden = false; };
  const node = (tag, props = {}, ...kids) => { const n = Object.assign(document.createElement(tag), props); n.append(...kids); return n; };
  const similarRow = (s) => {
    const dot = s.color ? [node('i', { className: 'dot' })] : [];
    if (dot[0]) dot[0].style.background = s.color;
    return node('li', {}, node('a', { href: s.url, target: '_blank', rel: 'noopener noreferrer' },
      s.thumb ? node('img', { className: 'thumb', src: s.thumb, alt: '', referrerPolicy: 'no-referrer' }) : node('span', { className: 'thumb', textContent: s.initial }),
      node('span', { className: 'stack' }, node('b', { textContent: s.label }), node('span', { className: 'muted', textContent: s.who }),
        node('span', { className: 'muted' }, ...dot, `${s.place} · ${s.day}`), node('span', { className: 'why', textContent: s.reason }))));
  };
  $('[data-similar-back]').onclick = () => { closeSimilar(); submit.focus(); };
  $('[data-similar-ok]').onclick = () => { closeSimilar(); saveNow(); };

  form.onsubmit = (e) => {
    e.preventDefault();
    const pasted = form.elements.namedItem('text').value.trim();
    if (!item && !pasted) { status('本文を貼り付けてください。', 'error'); return; }
    const similar = similarItems(data, bookmarkOf(parsed, item, JSON.parse(select.value), pasted));
    if (!similar.length) { saveNow(); return; }
    $('[data-similar-list]').replaceChildren(...similar.map(similarRow));
    similarBox.hidden = false;
    $('[data-actions]').hidden = true;
    $('[data-similar-ok]').focus();
  };
  async function saveNow() {
    const [category, subcategory] = JSON.parse(select.value);
    const pasted = form.elements.namedItem('text').value.trim();
    const wants = { summary: form.elements.namedItem('wantSummary').checked, translation: form.elements.namedItem('wantTranslation').checked };
    const bookmark = bookmarkOf(parsed, item, [category, subcategory], pasted, form.elements.namedItem('note').value, wants);
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
  }
}

// 対応していないページ: 独立のメモ（題 80 文字・本文 5000 文字、どちらかが要る。URL は空か https）。同じ URL のメモがあっても止めない
async function showMemo(store, target, lastPlace) {
  const field = (name) => memoForm.elements.namedItem(name);
  field('title').value = target.title.slice(0, 80);
  // Worker が受ける URL は 500 文字まで（長い検索の結果などは入れない）
  field('url').value = /^https:\/\//.test(target.url) && target.url.length <= 500 ? target.url : '';
  let data;
  try {
    ({ data } = await counting('Twimark に問い合わせています…', store.load(), memoStatus));
  } catch (err) {
    if (!(await relogin(err))) memoStatus(failure(err, '読み込めませんでした。'), 'error');
    return;
  }
  memoStatus('');
  fillCategories(memoSelect, data, lastPlace);
  const filled = () => Boolean(field('title').value.trim() || field('text').value.trim());
  memoForm.oninput = () => { memoSubmit.disabled = !filled(); };
  memoSubmit.disabled = !filled();
  field('text').focus();
  memoForm.onsubmit = async (e) => {
    e.preventDefault();
    if (!filled()) return;
    const url = field('url').value.trim();
    if (url && !/^https:\/\//.test(url)) { memoStatus('URL は https で始まるものにしてください。', 'error'); field('url').focus(); return; }
    const [category, subcategory] = JSON.parse(memoSelect.value);
    memoSubmit.disabled = true;
    memoStatus('保存中…');
    try {
      await store.update(ops.add({ site: 'memo', id: memoId(), title: field('title').value, text: field('text').value, url, category, subcategory }));
      await chrome.storage.local.set({ lastPlace: memoSelect.value });
      chrome.runtime.sendMessage({ type: 'twimark-changed' }).catch(() => {});
      memoStatus('追加しました。', 'ok');
      if (fromWindow) setTimeout(close, 900);
    } catch (err) {
      memoStatus(failure(err, '保存できませんでした。'), 'error');
      memoSubmit.disabled = false;
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
