// Twimark の画面（一覧の画面）の上で動き、ログインのあとに画面（site/auth.js）が渡す拡張のトークンを受け取る。
// 拡張がいることは <html data-twimark-extension="ready"> で知らせる（画面はこのしるしがあるときだけ渡す）。
// 受け取るのは、同じ画面から（source が window）・Twimark のオリジン・決まった type・トークンの形が合うものだけ
(() => {
  const ORIGIN = 'https://twimark.ho-service.workers.dev';
  const TOKEN = /^[A-Za-z0-9_-]{20,200}$/;
  document.documentElement.dataset.twimarkExtension = 'ready';
  window.addEventListener('message', (event) => {
    const data = event.data;
    if (event.source !== window || event.origin !== ORIGIN || data?.type !== 'twimark-extension-token') return;
    if (typeof data.token !== 'string' || !TOKEN.test(data.token)) return;
    const login = typeof data.login === 'string' ? data.login.slice(0, 64) : '';
    chrome.storage.local.set({ settings: { token: data.token, login, linkedAt: new Date().toISOString() } })
      .then(() => window.postMessage({ type: 'twimark-extension-linked' }, ORIGIN));
  });
})();
