# ファイルを入れ替えても service worker は古いまま動く

読み込んだ拡張の `src` を入れ替えて（`git pull` や zip の展開）、拡張のページで再読み込みしないと、次のようになる。

- ページの `content.js` と、ポップアップなどの拡張のページは、開くたびにファイルから読むので新しくなる。
- service worker は、ブラウザに控えたスクリプトのまま動く。ブラウザを開き直しても、manifest の版を上げても変わらない（Chrome 157 で確かめた）。`chrome.runtime.getManifest()` は新しい値を返すので、古いことは manifest からは分からない。
- 古い service worker は新しい知らせを知らないので、`onMessage` のリスナーが `false` を返し、`sendMessage` は `undefined` で解ける。

2026-11-07 に、利用者の Edge の service worker の控え（`Service Worker/ScriptCache`）は 2026-10-25 のもので、`twimark-create` と `twimark-suggest` を持っていなかった。このため小さな画面の「作る」が失敗し、札が出なかった。ツールバーのポップアップは Worker へ直接送るので動いていた。

0.12.0 からは `background.js` の `BUILD` を `twimark-version` で返し、ページと拡張のページが manifest の版と比べる。`chrome.runtime.reload()` のあとは、新しいスクリプトで動く。版を上げるときは `BUILD` も同じにする（`scripts/self-test.mjs` が見る）。
