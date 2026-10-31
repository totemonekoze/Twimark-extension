---
title: X・note・Qiitaの共有メニューの目印
type: knowledge
confidence: medium
created: 2026-09-24
last_verified: 2026-10-31
---

# X・note・Qiitaの共有メニューとブックマークのボタンの目印

`src/content.js` が「Twimarkに追加」と、投稿・記事のしおりのアイコン（定義 2026-10-24-003）を差し込むときに頼っている目印。サイトの画面が変わって差し込みが出なくなったら、まずここを確かめる。

## X（2026-09、ログインしていない表示で確認）

- 共有ボタンは `button[data-engagement-action="share"]`（`aria-haspopup="menu"`、`data-slot="xds-menu-trigger"`）。`aria-label` は言語で変わる（日本語は「共有」）。
- 押すと `div[role="menu"][data-slot="xds-menu-content"]` が出る。`aria-labelledby` が共有ボタンの `id`。項目は `div[role="menuitem"][data-slot="xds-menu-item"]`（`span > svg` とラベルの `div`）。
- ポストの `article` に `data-testid` はない。ポストのURLは、共有ボタンの祖先にある `/<handle>/status/<数字>` のリンク（日時や返信の数）から取る。
- メニューを閉じるには、メニューそのものではなく、フォーカスのある要素（共有ボタン）へ `keydown` の Escape を送る。
- 開くのはスクリプトの `click()` では開かず、実際のクリックが要る。
- 2026-10-25 もログインしていない表示では同じ（項目は「チャット経由で送信」「リンクをコピー」「Share post via ...」）。
- ログインした表示は確かめていない。共有ボタンの `aria-label` は「ポストを共有」「Share post」で、`data-engagement-action` がないことがある、と考えて、ラベルに「共有」「Share」を含むかで見分ける（`content.js` の `isShare`）。メニューに `aria-labelledby` がないときは、直前（3 秒以内）に押した共有ボタンを使う。
- ほかの拡張が同じメニューの後ろに項目を足すことがある。複製の元はメニューの最初の項目にし、複製からは `data-*` を（`data-slot` 以外）外して、印は `data-twimark-item` だけにする。

- ブックマークのボタン（2026-10-25、ログインしていない表示で確認）: `div[data-engagement-action="bookmark"]`（中に `button[aria-label="ブックマーク"]`）。この包みはもう1段の `<div>`（子は1つ）に入っていて、その親 `div.flex.shrink-0.items-center` がブックマークと共有の並び。包みの中に足すと下に積まれるので、子1つの `<div>` の隣に置く。前の画面の `data-testid="bookmark"`・`removeBookmark` のボタンも見る（ログインした表示は確かめていない）。

## note

- 記事の横の共有ボタンは `#shareButton`（`aria-controls="shareMenuDesktop"`）。メニューは `#shareMenuDesktop[role="menu"]` で、`ul > li > button[role="menuitem"]`。先頭のグループが「リンクをコピー」。
- 記事下の共有の並びは `.o-shareBooster__share` の中の `button.o-shareBooster__item`。アイコンは `<i class="a-icon a-icon--x">` のようにCSSで描いている（`svg` がない）。
- メニューは Escape では閉じない。共有ボタンをもう一度押すと閉じる。
- 2026-10-25 の記事の画面は作りが変わっていた（Tailwind のクラス、ボタンの `id` は `_r_hj_` のような毎回変わる値）。`#shareButton`・`.o-shareBooster__share` はなかった。
  - 記事下の共有の並びは、`button[aria-label="Xでシェア"]`（ほかに「リンクをコピー」「Facebookでシェア」「LINEでシェア」「Threadsでシェア」）をそれぞれ包む `<div>` の並び。末尾に「Twimarkに追加」を足す。
  - 「スキ」の並びは、`button[aria-label*="スキをつけたユーザーを見る"]`（スキの数）を含む `div.flex.items-center.justify-center` が1つの項目で、その親が並び（記事の上・記事下・下に固定の帯）。共有のボタンは並びの中の `button[aria-haspopup="true"]`（ラベルなし）。しおりのアイコンは、共有のボタンの左（なければスキの項目の右）に置く。

## Qiita

- 共有の並びは、左の縦の並びと記事下の2か所。どちらも `button[aria-label="Facebookでシェア"]` を包む `div` が1つのボタンで、その親が並び。はてなブックマークは `a[href*="b.hatena.ne.jp"]`、Xは `aria-label="ポスト"`。
- ボタンの `div` の中の `p[role="tooltip"]` がホバーで出る説明。
- ストックのボタンは `button[aria-label="ストックする"]`（2026-10-25）で、包む `div` が並びの1つ。左の縦の並び（いいね・ストック・ポスト・シェア…）、記事下の並び、狭い画面の並び（広い画面では大きさ0）の3か所。しおりのアイコンは包む `div` の後ろに置く（縦の並びではストックの下、記事下ではストックの右）。

## Instagram（2026-10-25、ログインしていない表示のリール）

- 投稿の操作の並びは `section` の2列のグリッド（左にいいね・コメント・シェアの `div`、右に保存の包み）。3つ目を足すと次の段に落ちる。
- 保存のボタンは `role="button"` の `div` で、中の `svg[aria-label="保存する"]`（言語で「保存」「Save」、保存済みは「Remove」など）。包みの `div` は子が1つ。Twimark のボタンは、包みの中のボタンの直前に置き、包みを横並びにする（`content.css` の `[data-twimark-row]`）。
- 投稿の URL は、祖先にある `/p/`・`/reel/` のリンク（なければページの URL）。

## pixiv（2026-10-25、作品のページ）

- ブックマーク（ハート）は `button.gtm-main-bookmark`。その包みが、いいね！などの並び（`display: flex; flex-direction: row-reverse`）の1つ。見た目で右に置くには、DOM ではブックマークの前に入れる。
- `gtm-` のクラスはサイトの計測の印なので、複製からは外す。

## BOOTH（2026-10-25、商品のページ）

- ログインしていない表示には、商品そのものの「スキ」がない（あるのは「カートに入れる」「ギフトとして贈る」）。
- 「スキ！」は関連商品の札（`li.item-card` の中の `.js-item-card-wish-list-button`、`data-item-id` はその商品）にだけある。Twimark のボタンは、札の外の「スキ」を含むボタンにだけ置く（ログインした表示の目印は、利用者の確認で足す）。

## GitHub（2026-10-26、ログインしていない表示のリポジトリ）

- 見出しの右の並びは `<ul>` の `<li>` の並び（Notifications・Fork・Star）。Star は `a[data-testid="star-button"]`（Primer の `prc-Button-*`、`data-size="small"`）で、ラベル `[data-component="text"]` の中に「Star」の文字と数の札が並ぶ。吹き出しは隣の `span[role="tooltip"]`。
- Twimark のボタンは Star の `<li>` を複製して右に置く。大きさは `data-size`・`data-variant`・`data-component` で決まるので、複製に残す（外すと高さ 32・幅が広くなった）。文字を消したラベルは外す。
- ログインした表示（スター済みは `unstar-button`、前の画面の `.starring-container`）は確かめていない。

## unityroom（2026-10-26、ログインしていない表示のゲームのページ）

- 題の右の操作の並びは `.game_actionArea`。ログインしていない表示には共有のボタン（`.el_shareDropdown` の `button`、絵は Font Awesome の `<i class="fas fa-share-alt">`）だけで、「いいね」「お気に入り」はない。Twimark のボタンは並びの末尾の項目を複製して右に置き、`<i>`（Font Awesome が svg に置き換えていれば svg）を絵に替える。
- ログインした表示の目印は確かめていない。

## ふりーむ！（2026-10-26、ゲームのページ）

- 操作の並びは `li.col` の並び（いいね・サポート・マイリスト・シェア）。「マイリスト」は `li.game-btn-favorite`（絵は `.btn-ico` の `img`、名前は `.btn-text`、`.tooltip` の吹き出しにリンク）。押せる要素（`a`・`button`）は吹き出しの中にしかない。
- Twimark のボタンは `li.game-btn-favorite` を複製して右に置き、`img` を絵に替え、`.btn-text` を「Twimark」にする。吹き出しは外し、`li` そのものを `role="button"`・`tabindex="0"` にする。英語の表示では名前が「Wishlist」。

## 確かめ方

内蔵ブラウザで対象のページを開き、`content.js` の中身を `const chrome = { runtime: { sendMessage: async (m) => { window.__sent = m; } } };` を先に置いて流し込むと、差し込みと送られるURLを確かめられる。ペインが隠れているとページが止まり、スクリプトが終わらないことがある（スクリーンショットを1枚撮ると動き出す）。

## Google マップ・レシピ・お店（2026-10-31、ログインしていない表示。Twimark の定義 2026-10-31-008）

- Google マップ: 場所のパネルの操作の並び（ルート・乗換／保存／付近を検索／モバイルデバイスに送信／共有）は、`div` の横並び（flex）。「保存」は `button[data-value="保存"]`（`aria-label` も「保存」。英語は「Save」）で、包みの `div` が並びの1つ。絵は `span.google-symbols` のフォントの文字、名前は `div.fontLabelMedium`。押したときの動きは `jsaction` 属性（ページ全体の受け手が読む）なので、複製からは `jsaction`・`jslog` を外す。開いたまま別の場所へ移る（ページを読み直さない）ので、場所（パスの名前と `!1s` の印）が変わったら置き直す。地図を動かすと URL の座標だけが変わる。
- クックパッド: ログインしていない表示には、レシピの「保存」がない（あるのはログインへの誘いの文だけ）。ログインした表示の目印は確かめていない（文字が「保存」「保存する」「保存済み」のボタンを見る）。
- デリッシュキッチン: 題の下の「お気に入りに追加」は `div.delish-favorite-button`（ボタンの要素ではない。絵は `svg.icon-favorite`、幅いっぱい 312 × 40）。親は縦に積む block なので、その下に同じ形の「Twimarkに追加」を置く。
- クラシル: 「保存」と件数のボタンは `button.browsi_videos_show_bookmark_button`（ほかのクラスは毎回変わる値）。親は2つの子のグリッドで、ボタンは幅いっぱい。その下に「Twimark」を置く。
- 楽天レシピ: レシピの「お気に入りに追加」は `button.btn_fav_control`（`div.recipe_info_text__note` の中）。ページの上の「お気に入り」（`a.ico_bookmark`）はお気に入りの一覧へのリンクなので使わない。
- ホットペッパーグルメ: お店の見出しの右の「ブックマーク追加」「検討リストへ保存」は `ul.shopHeaderLeadBtn` の `li`（float、幅 130 × 20 の文字の画像）。「検討リストへ保存」は `li.btnShopHeaderKeeplist` で、押したときの動きは `a` の `onclick`（複製からは外す）。`li` は CSS で幅 130 と「保存済」の背景画像を持つので、複製では外す（`content.css`）。
- ぐるなび: お店の「送る」「お気に入り」は `ul.tool-list`（flex）の `li.tool-list__item`。「お気に入り」は `#favorite-root` の中の `a.btn-basic`（絵は CSS の `span.tool-list__icon`、名前は `p.tool-list__btn`）。`li` を複製して右に置く。
