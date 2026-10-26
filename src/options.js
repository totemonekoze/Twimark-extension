// 拡張の設定。アカウントのカード（結んだ ID、接続の確認、ログアウト）、対応しているサイト、ボタンを出すサイト、予備のトークンの貼り付け。覚える内容は account.js
import { createStore, describeError, PUBLIC_URL, SITES } from './shared/store.js';
import { linkWithToken, loadSettings, logout } from './account.js';

// 対応しているサイトは SITES から作る（サイトが増えても直さなくてよい）。メモはサイトではないので除く
document.querySelector('[data-supported]').replaceChildren(...Object.entries(SITES).filter(([key]) => key !== 'memo').map(([, name]) => Object.assign(document.createElement('li'), { textContent: name })));

const $ = (s) => document.querySelector(s);
const statusEl = $('[data-status]');
const status = (text, kind = '') => { statusEl.textContent = text; statusEl.dataset.kind = kind; };
const testButton = $('[data-test]');

async function render() {
  const settings = await loadSettings();
  $('[data-who]').textContent = settings?.token ? settings.login || '（ID 不明）' : 'まだ Twimark と結んでいません';
  $('[data-badge]').hidden = !settings?.token;
  testButton.hidden = !settings?.token;
  $('[data-logout]').hidden = !settings?.token;
  $('[data-login]').hidden = Boolean(settings?.token);
}
chrome.storage.onChanged.addListener((changes) => { if (changes.settings) render(); });

// 読めるかと件数を確かめる。応答がなければ store の時間切れ（20 秒）で失敗を出す。確かめている間はボタンを押せない
testButton.addEventListener('click', async () => {
  const settings = await loadSettings();
  testButton.disabled = true;
  status('確かめています…');
  try {
    const { data } = await createStore({ base: PUBLIC_URL, token: settings?.token ?? '' }).load();
    status(`接続できました（ブックマーク ${data.bookmarks.length}件）。`, 'ok');
  } catch (err) {
    status(describeError(err, '接続できませんでした。'), 'error');
  } finally {
    testButton.disabled = false;
  }
});
$('[data-logout]').addEventListener('click', async () => {
  await logout();
  status('ログアウトしました。', 'ok');
});
// ログインの画面はポップアップにある。開けるブラウザでは開き、開けなければツールバーのボタンを押すよう知らせる
$('[data-login]').addEventListener('click', () => {
  Promise.resolve(chrome.action.openPopup?.()).catch(() => {}).finally(() => status('ツールバーの Twimark のボタンを押すと、ログインの画面が出ます。'));
});

const form = $('[data-form]');
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  status('確かめています…');
  try {
    const login = await linkWithToken(form.elements.namedItem('token').value.trim());
    form.reset();
    status(`${login} と結びました。`, 'ok');
  } catch (err) {
    status(describeError(err, '結べませんでした。'), 'error');
  }
});

$('[data-version]').textContent = `版 ${chrome.runtime.getManifest().version}`;
render();
