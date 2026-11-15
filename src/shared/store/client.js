// Worker の API（/api/data と /api/ops）の呼び出し（createStore）。応答は data.js の normalize でそろえて返す。
// 一覧の画面（src/site）は同じオリジンの Cookie、拡張とアプリ（src/mobile）は端末のトークン（Bearer）で認証する。
// 送る操作は ops.js の ops が作る。失敗は errors.js の StoreError にして投げる
import { StoreError } from './errors.js';
import { normalize } from './data.js';

async function failure(res) {
  let body = null;
  try { body = await res.json(); } catch { /* 本文が JSON でないときは状態だけで判断する */ }
  if (body?.error?.code) return new StoreError(body.error.code, body.error.message ?? '');
  if (res.status === 401) return new StoreError('unauthorized', 'ログインしてください。');
  return new StoreError('http', `Twimark がエラーを返しました（${res.status}）。`);
}

// Workers AI を待つ操作（1回 15 秒まで、fillAi は5件で2回ずつ）は、打ち切りまでを長くする。追加は待たずに返す（定義 2026-11-07-002）
const SLOW_OPS = new Set(['refreshAi', 'fillAi']);
const SLOW_WAIT = 180_000;

/**
 * Twimark の API の窓口を作る。
 * base は Twimark の URL（一覧の画面は同じオリジンなので空）。token があれば Bearer で送り、なければ Cookie を使う。
 * timeout ミリ秒たっても応答（本文まで）が来なければ打ち切り、timeout の StoreError にする（いつまでも待たない）
 * @param {{ base?: string, token?: string, timeout?: number }} [options] 既定は base 空・token 空・timeout 20 秒
 * @param {typeof fetch} [fetchImpl] 送るのに使う fetch（試験で差し替える）
 * @returns {{
 *   call: (path: string, options?: { method?: string, body?: unknown, wait?: number }) => Promise<any>,
 *   load: () => Promise<{ data: import('./data.js').Data }>,
 *   update: (op: import('./ops.js').Op) => Promise<import('./data.js').Data>,
 * }} call は応答の JSON を返し、失敗したら StoreError を投げる
 */
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
    update: async (op) => normalize(await call('/api/ops', {
      method: 'POST',
      body: op,
      wait: SLOW_OPS.has(op?.op) ? SLOW_WAIT : timeout,
    })),
  };
}
