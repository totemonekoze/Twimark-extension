# Twimark 拡張（配布用）

[Twimark](https://github.com/totemonekoze/Twimark) の Chrome / Edge 拡張機能を配るためのリポジトリです。ソースは Twimark のリポジトリの `src/extension` にあります。

## 入れ方

1. [Releases](https://github.com/totemonekoze/Twimark-extension/releases) から `twimark-extension-<版>.zip` を落とします（「Source code」ではありません）。
2. zip を展開します。
3. `chrome://extensions`（Edge は `edge://extensions`）でデベロッパーモードをオンにし、「パッケージ化されていない拡張機能を読み込む」で、展開したフォルダー（中に `manifest.json` があるもの）を選びます。

## 更新

新しい zip を同じ場所に展開し直し、拡張のページで Twimark を再読み込みします。開いていたサイトのタブも再読み込みします。
