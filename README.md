# Twimark 拡張

[Twimark](https://github.com/totemonekoze/Twimark)（X・Instagram の投稿、note・Qiita の記事、pixiv の作品、BOOTH の商品、GitHub のリポジトリ、unityroom・ふりーむ！のゲームのブックマークと、自分のメモ）の Chrome / Edge 拡張機能です。開いているページや、サイトのボタンの隣の Twimark のマークから、Twimark に追加します。対応していないページでは、そのページを控えるメモを追加します。

## 入れ方

1. [Releases](https://github.com/totemonekoze/Twimark-extension/releases) から `twimark-extension-<版>.zip` を落とします（「Source code」ではありません）。
2. zip を展開します。
3. `chrome://extensions`（Edge は `edge://extensions`）でデベロッパーモードをオンにし、「パッケージ化されていない拡張機能を読み込む」で、展開したフォルダー（中に `manifest.json` があるもの）を選びます。

手元のソースから入れるときは、このリポジトリの `src` を選びます（ビルドは要りません）。

- 前に別の場所から入れた Twimark があれば、先に「削除」してから読み込む。
- 読み込めないときは、出た窓の文か、拡張のカードの「エラー」の中身を控える。
- 更新は、新しい zip を同じ場所に展開し直して（`src` ならそのまま）、拡張のページで再読み込みする。開いていたサイトのタブも再読み込みする。

## ログイン

ツールバーの Twimark のボタンを押すと、最初の1回だけログインの画面が出る。次のどれかで拡張と Twimark を結ぶ。結んだあとは拡張のトークン（データの読み書きだけ。設定は変えられない）を覚え、パスワードは覚えない。

- ID とパスワードで「ログイン」
- 「Twimark の画面でログイン（パスキー）」: Twimark が新しいタブで開くので、ログインして「許す」を押す
- 「トークンを貼り付ける（予備）」: 一覧の画面の「設定」の「拡張・アプリのトークン」で発行した値を入れる

拡張の「オプション」（設定）には、ログイン中の ID、「接続を確かめる」、「ログアウト」と、対応しているサイトの一覧がある。要らなくなったトークンは、一覧の画面の「設定」でも取り消せる。

つながらないときは、ポップアップの下の版が新しいか（拡張のページで再読み込みしたか）を見る。問い合わせの間は経った秒数が出て、20 秒で「応答がありません（timeout）」になる。「接続できませんでした（network）」なら、ほかの拡張やセキュリティのソフトが通信を止めていないか、拡張の「詳細」の「サイトへのアクセス」が Twimark を許しているかを確かめる。

## 追加のしかた

- ツールバーのTwimarkのボタン: 開いているポストや記事を追加する。対応していないページ（検索の結果など）では「メモを追加」の画面になり、題（タブの題）・本文・URL（https のときだけ入れておく）・カテゴリを入れて、独立のメモとして追加する
- 右クリック: ポストや記事のリンクの上で「Twimarkに追加」、ページの上で「このページをTwimarkに追加」。Xのタイムラインでは、ポストの日時のリンクを右クリックする
- 共有メニュー: Xのポストの共有メニュー、noteの記事の共有メニューと記事下の共有の並び、Qiitaの記事の共有の並びにある「Twimarkに追加」。X の共有ボタンは、ラベルに「共有」か「Share」を含むメニューのボタン（ログインした画面の「ポストを共有」も）。ほかの拡張と取り合わないよう、メニューの最初の項目を複製し、`data-*` の印を外して `data-twimark-item` だけを付ける
- 投稿・記事のアイコン: Xのポストのブックマークのボタン、Instagramの投稿の保存のボタンの左、noteの記事の「スキ」の並び（共有のボタンの左）、Qiitaの記事の「ストック」、pixivの作品のブックマーク（ハート）、BOOTHの商品の「スキ」、GitHubのリポジトリの「Star」、unityroomのゲームの題の右の操作の並び（共有のボタンの右）、ふりーむ！のゲームの「マイリスト」の隣に、Twimark のマーク（黄緑の角丸の四角に T。サイトのしおりと見分けられる形）が出る。押すとその場に小さな画面が出て、カテゴリを選んで追加できる。未保存は輪郭、保存済みは塗りつぶしで、保存済みは押すと保存したカテゴリと「一覧で開く」が出る（保存済みかどうかは5分ごと、追加したときにも読み直す）
- 通信は 20 秒（記事の取得は 8 秒）で打ち切り、「応答がありません」（エラーコード: timeout）を出す

どれもカテゴリ（とサブカテゴリ）を選んで「追加」を押す。「要約見出しを作る」「翻訳する」（開くたびに ON）を OFF にすると、Twimark はその方を作らない。本文を取得できなかったときは、出てくる欄に本文を貼り付けて保存する。


## 開発

```bash
node scripts/self-test.mjs
```

- `src` がそのまま拡張（`manifest.json` と、共有コードの写し `src/shared/`）。依存パッケージは持たない。
- `src/shared/` の `meta.js`・`store.js`・`theme.js` は、Twimark（アプリ）の `src/shared` の写し。正本はアプリ側で、アプリで変えたら写し直す（`AGENTS.md`）。
- ページのボタンの絵（`src/icons/mark.svg`・`mark-saved.svg`）は `design/make-mark.jsx` を Illustrator で動かして書き出す（元の絵は `design/twimark-mark.ai`）。拡張のアイコンの PNG（`src/icons/icon-*.png`）は、アプリの `design/icon/make-icon.jsx` に、このプロジェクトの根を3つ目の引数で渡すと書き出される。
- サイトのボタンの目印は `docs/knowledge/share-menu-dom.md`。

## 配る

1. `src/manifest.json` の版を上げ、`node scripts/self-test.mjs` を通す。
2. `src` の中身（根に `manifest.json`）を zip にする（PowerShell）: `Compress-Archive -Path src/* -DestinationPath release/twimark-extension-<版>.zip`
3. コミットしてプッシュし、`gh release create v<版> release/twimark-extension-<版>.zip` でリリースに付ける。
