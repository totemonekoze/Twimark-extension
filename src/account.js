// 拡張と Twimark のアカウントを結ぶ（ポップアップと設定で使う）。
// 覚えるのは chrome.storage.local の settings = { token, login, linkedAt } だけで、パスワードは覚えない。
// トークンは拡張のトークン（データの読み書きだけ。設定は変えられない）
import { createStore, PUBLIC_URL, StoreError } from './shared/store.js';

const DEVICE = 'Chrome / Edge 拡張';

export const loadSettings = async () => (await chrome.storage.local.get('settings')).settings ?? null;
const saveSettings = (token, login) => chrome.storage.local.set({ settings: { token, login, linkedAt: new Date().toISOString() } });
export const clearSettings = () => chrome.storage.local.remove('settings');

// ID とパスワードでログインし、拡張のトークンを受け取って覚える
export async function loginWithPassword(login, password) {
  const { token } = await createStore({ base: PUBLIC_URL }).call('/api/login/password', { method: 'POST', body: { login, password, device: DEVICE, client: 'extension' } });
  await saveSettings(token, login);
  return login;
}

// 貼り付けたトークン（予備）。使えるか /api/session で確かめてから覚える
export async function linkWithToken(token) {
  const session = await createStore({ base: PUBLIC_URL, token }).call('/api/session');
  if (!session.login) throw new StoreError('unauthorized', 'このトークンは使えません。一覧の画面の「設定」で発行し直してください。');
  await saveSettings(token, session.login);
  return session.login;
}

// トークンを Twimark で取り消してから忘れる（取り消せなくても忘れる）
export async function logout() {
  const settings = await loadSettings();
  if (settings?.token) await createStore({ base: PUBLIC_URL, token: settings.token }).call('/api/logout', { method: 'POST' }).catch(() => {});
  await clearSettings();
}

// Twimark の画面でログインして受け渡す（パスキーも使える）。受け取りは link.js
export const openLinkPage = () => chrome.tabs.create({ url: `${PUBLIC_URL}/?extension=link` });

// Twimark の宛先が許されているか（Chrome の「サイトへのアクセス」で外されていると、通信ができない）
export const hostAllowed = () => chrome.permissions.contains({ origins: [`${PUBLIC_URL}/*`] }).catch(() => true);
