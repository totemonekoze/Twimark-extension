# Twimark 拡張 作業ルール

## 正本

- 拡張の使い方・配り方: `README.md`
- Knowledge の入口: `docs/INDEX.md`
- 拡張の定義（2026-10-25 まで）と、Twimark 全体の要件: Twimark（アプリ）の `docs/definitions/`・`docs/requirements/current-mvp.md`

## 構成

- ソース=`src`（そのまま読み込める拡張）、配る zip=`release`（Git に入れない）
- `src/shared/` は Twimark（アプリ）の `src/shared` の `meta.js`・`store.js`・`theme.js` の写し。正本はアプリ側。アプリでこれらを変えたら、ここに写し直し（先頭の1行の印は残す）、`node scripts/self-test.mjs` を通す。ここで直すときは、アプリの正本を先に直す
- 依存パッケージは持たない

## このプロジェクトの制約

- このリポジトリは公開（`totemonekoze/Twimark-extension`）。トークン、パスワード、個人の設定はコミットしない。
- 配布は GitHub のリリースに `twimark-extension-<版>.zip` を付ける（`README.md` の「配る」）。ストアには出さない。
