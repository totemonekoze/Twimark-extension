// 自動整理のルールの種類・名前（RULE_KINDS・RULE_NAMES・ruleLabel）と、ブックマークへの当て方（pickByRules）。
// おすすめと最初の選択（suggest.js）、整理の候補とルールの案（sort.js）、追加の記録（ops.js）が pickByRules を使う。
// 一覧の画面とアプリの設定はルールの名前を出すのに、Worker（src/worker）はルールの検査に RULE_KINDS を使う
import { SITES } from './config.js';
import { foldRule } from './text.js';

// 自動整理のルール（定義 2026-10-30-004）。条件の種類と、比べるときのそろえ方（NFKC・小文字。そろえ方は text.js の foldRule）
export const RULE_KINDS = ['site', 'author', 'word', 'url'];
export const RULE_NAMES = { site: 'サイト', author: '作者', word: '語', url: 'URL' };

/**
 * 一覧に出すルールの名前（「サイト: GitHub」など）
 * @param {import('./data.js').Rule} r ルール
 * @returns {string} 「種類の名前: 値」（サイトは SITES の名前）
 */
export const ruleLabel = (r) => `${RULE_NAMES[r.kind]}: ${r.kind === 'site' ? SITES[r.value] ?? r.value : r.value}`;

/**
 * ルールを上から順に見て、最初に当たったものの行き先を返す。
 * b は { site, url, author: { name, handle }, title, text }（足りないものは空）。上のルールから順に見て、最初に当たったものの
 * { category, subcategory }、なければ null。作者は先頭の @ を除いた値が handle と同じか、名前と同じ。語は題と本文に、URL は URL に含むか
 * @param {import('./data.js').Rule[]} rules ルールの並び（配列でなければ当たりなし）
 * @param {import('./data.js').Facts} b 当てるもの
 * @returns {import('./data.js').Place | null} 当たったルールの行き先、なければ null
 */
export function pickByRules(rules, b) {
  const handle = foldRule(b?.author?.handle).replace(/^@/, '');
  const name = foldRule(b?.author?.name);
  const url = foldRule(b?.url);
  const body = foldRule(`${b?.title ?? ''}\n${b?.text ?? ''}`);

  for (const r of Array.isArray(rules) ? rules : []) {
    const v = foldRule(r.value);
    if (!v) continue;
    const hit = r.kind === 'site' ? b?.site === r.value
      : r.kind === 'author' ? (Boolean(handle) && v.replace(/^@/, '') === handle) || (Boolean(name) && v === name)
        : r.kind === 'word' ? body.includes(v)
          : r.kind === 'url' ? url.includes(v) : false;
    if (hit) return { category: r.category, subcategory: r.subcategory ?? null };
  }
  return null;
}
