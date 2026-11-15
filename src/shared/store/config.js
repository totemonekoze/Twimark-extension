// 上限・サイト・選択肢・公開の URL と、名前の検査（checkName）、アプリへの戻り先の検査（isAppRedirect）。
// 一覧の画面・アプリ・拡張と Worker（src/worker）が使う。名前の決まり（LIMITS、checkName）は Worker も使う。
// 選択肢の値（CATEGORY_SORTS・CHIP_LAYOUTS・ADD_CREATES・SUGGEST_COUNTS）は、データの形をそろえる normalize（data.js）も見る
import { StoreError } from './errors.js';

// 新しいアカウントのカテゴリ（今あるアカウントは変えない）
export const DEFAULT_CATEGORIES = ['新しいカテゴリ'];
// memoTitle は独立のメモの題、note はブックマークへの書き添え
export const LIMITS = {
  category: 20, categories: 30, subcategories: 30, text: 5000, memoTitle: 80, note: 2000, rules: 100, ruleValue: 100,
};
// memo は独立のメモ（URL のないこともあるカード）。ほかは追加できるサイト
export const SITES = {
  x: 'X', note: 'note', qiita: 'Qiita', instagram: 'Instagram', pixiv: 'pixiv', booth: 'BOOTH',
  github: 'GitHub', unityroom: 'unityroom', freem: 'ふりーむ！',
  gmap: 'Google マップ', cookpad: 'クックパッド', delish: 'デリッシュキッチン', kurashiru: 'クラシル',
  rakutenrecipe: '楽天レシピ', hotpepper: 'ホットペッパーグルメ', gnavi: 'ぐるなび',
  memo: 'メモ',
};
export const PUBLIC_URL = 'https://twimark.ho-service.workers.dev';

// アプリへのログインの受け渡し（?app=）の戻り先として受け付けるもの。
// exp://u.expo.dev/…（Expo Go はサインインしたアカウントのプロジェクトしか開かない）、twimark://、手元の開発サーバー（localhost と家庭内のアドレス）だけ。
// ほかの exp:// は、他人の PC から読み込んだアプリに端末のトークンが渡ってしまうので断る
const PRIVATE_HOST = /^(localhost|127\.0\.0\.1|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;

/**
 * アプリへの戻り先（?app= の値）として受け付けるか（上の決まり）
 * @param {unknown} raw ?app= の値
 * @returns {boolean} 受け付けるなら true
 */
export function isAppRedirect(raw) {
  if (typeof raw !== 'string' || raw.length > 500 || /[\s#\\]/.test(raw)) return false;
  if (/^twimark:\/\/[^@]*$/.test(raw)) return true;
  const m = raw.match(/^exp:\/\/([^/:?@]+)(?::\d{1,5})?(?:[/?]|$)/);
  return Boolean(m) && (m[1] === 'u.expo.dev' || PRIVATE_HOST.test(m[1]));
}

/**
 * カテゴリ・サブカテゴリの名前を検査する。前後の空白を除き、空か LIMITS.category 文字を超えれば投げる
 * @param {unknown} raw 入れられた名前
 * @param {string} [what] エラーの文に出す名前の種類（「サブカテゴリ」など）
 * @returns {string} 前後の空白を除いた名前
 * @throws {StoreError} invalid_name（空か長すぎる）
 */
export function checkName(raw, what = 'カテゴリ') {
  const name = typeof raw === 'string' ? raw.trim() : '';
  if (!name || name.length > LIMITS.category) {
    throw new StoreError('invalid_name', `${what}名を${LIMITS.category}文字以内で入れてください。`);
  }
  return name;
}

// カテゴリの画面の並び順（定義 2026-10-30-002）。手動（position）・件数順・最近保存した順
export const CATEGORY_SORTS = ['manual', 'count', 'recent'];
// 縦長の一覧のカテゴリの絞り込みの形（定義 2026-10-30-003）。よく使うものだけ並べる・1つの札にまとめる・全部並べる（2段）
export const CHIP_LAYOUTS = ['pinned', 'single', 'rows'];
// 追加の画面でその場で作れるもの（定義 2026-10-31-001）。作らない・カテゴリだけ・カテゴリとサブカテゴリ
export const ADD_CREATES = ['none', 'category', 'both'];
// 追加の画面のおすすめの数（0・1・3。設定の「おすすめの数」）
export const SUGGEST_COUNTS = [0, 1, 3];
