// エラーの型（StoreError）と、画面に出すエラーの文（describeError）。
// StoreError は API の呼び出し（client.js）と名前の検査（config.js の checkName）が投げ、Worker（src/worker）も使う。
// 一覧の画面・アプリ・拡張は、捕まえたエラーを describeError で文にして出す

/** Twimark のエラー。code はエラーコード（'invalid_name'・'unauthorized'・'network'・'timeout' など） */
export class StoreError extends Error {
  /**
   * @param {string} code エラーコード（画面にも出す）
   * @param {string} message 利用者に見せる説明
   */
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

/**
 * 画面に出すエラーの文。メッセージとエラーコード（Twimark の code か、ブラウザの例外の name）を必ず並べる
 * @param {unknown} err 捕まえたもの（StoreError、ブラウザの例外、ほかの値）
 * @param {string} [fallback] メッセージがないときの文
 * @returns {string} 「説明（エラーコード: コード）」の形の文
 */
export function describeError(err, fallback = 'うまくいきませんでした。') {
  if (err instanceof StoreError) return `${err.message || fallback}（エラーコード: ${err.code}）`;

  const name = typeof err?.name === 'string' && err.name !== 'Error' ? err.name : 'unknown';
  const raw = typeof err?.message === 'string' ? err.message : '';
  const known = BROWSER_ERRORS[name];
  const message = known ? `${known}${raw ? ` 詳細: ${raw}` : ''}` : raw || fallback;
  return `${message}（エラーコード: ${name}）`;
}
