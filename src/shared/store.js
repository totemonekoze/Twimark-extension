// Twimark（アプリ）の src/shared/store.js の写し。正本はアプリ側。アプリで変えたら写し直す（AGENTS.md）
// ブックマークの保存先の窓口。Twimark の Worker の API（/api/data と /api/ops）を通して D1 を読み書きする。
// 一覧の画面（src/site）は同じオリジンの Cookie、拡張（別のプロジェクト Twimark-extension）とアプリ（src/mobile）は端末のトークン（Bearer）で認証する。
// 名前の決まり（LIMITS、checkName）は Worker（src/worker）も使う
// 中身は話題ごとに store/ の 10 ファイルにあり（定義 2026-11-15-001）、ここは名前を出すだけで処理を書かない。使う側はここから import する。
// store/ の中は、下の行の順に上のファイルだけを読む。何を直すならどのファイルかは、Twimark の docs/knowledge/code-map.md
export { StoreError, describeError } from './store/errors.js';
export {
  ADD_CREATES, CATEGORY_SORTS, CHIP_LAYOUTS, DEFAULT_CATEGORIES, LIMITS, PUBLIC_URL, SITES, SUGGEST_COUNTS,
  checkName, isAppRedirect,
} from './store/config.js';
export { foldRule, termsOf } from './store/text.js';
export { RULE_KINDS, RULE_NAMES, pickByRules, ruleLabel } from './store/rules.js';
export { emptyData, memoId, normalize, placeExists, subOf } from './store/data.js';
export { PLACE_REASONS, inferPlaces, initialPlace, suggestPlaces } from './store/suggest.js';
export {
  SIMILAR_REASONS, similarBookmarks, similarNear, similarPair, similarPasses, similarReviewPairs,
} from './store/similar.js';
export { ruleProposals, sortCandidates } from './store/sort.js';
export { addTrace, ops, similarBrief } from './store/ops.js';
export { createStore } from './store/client.js';
