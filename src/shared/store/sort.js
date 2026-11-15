// 整理の候補（sortCandidates）と、自動整理のルールの案（ruleProposals）。
// 一覧の画面とアプリの設定の「自動整理」が使う。どちらもおすすめの数え上げ（suggest.js の statsOf）とルールの当て方（rules.js）の上に立つ
import { foldRule } from './text.js';
import { pickByRules } from './rules.js';
import { placeExists, samePlace, subOf } from './data.js';
import { inferPlaces, keyOf, statsOf } from './suggest.js';

const newer = (x, y) => String(y.b.savedAt).localeCompare(String(x.b.savedAt));
// 本番のデータ（2026-11-10、178件）を scripts/suggest-eval.mjs の「たぶん」の行で測って決めた（定義 2026-11-10-001 の完了報告）。
// 件数の見込みで点が上がったので測り直した。確かではない一番の1番目の率は、点 1 以上で 50.9%（108件）、1.25 以上で 53.3%（92件）、
// 1.5 以上で 51.9%（79件）。件数はあまり変わらないので、率の高い方
const MAYBE_MIN = 1.25;

/**
 * 整理の候補（定義 2026-10-30-004・2026-10-31-004・2026-11-02-002・2026-11-10-001）。[{ b, to: { category, subcategory }, by: 'rule' | 'infer' | 'review' | 'maybe' }]。
 * 先にルールが当たる行き先と今の場所が違うもの（未分類とメモも）、続けて未分類でルールが当たらず、推し量った一番が確かなもの、
 * 今ある組に入っていてルールが当たらず、その1件を数えずに推し量った一番が確かで今の場所と違うもの（見直し）、
 * 未分類で確かではないが点が MAYBE_MIN 以上のもの（たぶん）。それぞれ保存の新しい順。外した行き先（b.sortDismissed）と同じ候補は出さない
 * @param {import('./data.js').Data} data 利用者のデータ
 * @returns {Array<{
 *   b: import('./data.js').Bookmark, to: import('./data.js').Place, by: 'rule' | 'infer' | 'review' | 'maybe',
 * }>} 候補（種類の順に並べ、種類の中は保存の新しい順）
 */
export function sortCandidates(data) {
  const st = statsOf(data);
  const lists = { rule: [], infer: [], review: [], maybe: [] };
  const put = (b, to, by) => {
    if (b.sortDismissed !== keyOf(to.category, to.subcategory)) lists[by].push({ b, to, by });
  };

  for (const b of data.bookmarks) {
    const to = pickByRules(data.rules, b);
    if (placeExists(data, to)) {
      if (b.category !== to.category || subOf(data, b) !== (to.subcategory ?? null)) {
        put(b, { category: to.category, subcategory: to.subcategory ?? null }, 'rule');
      }
    } else if (!data.categories.includes(b.category)) {
      const top = inferPlaces(data, b, { skip: b.id })[0];
      if (top?.sure || top?.score >= MAYBE_MIN) {
        put(b, { category: top.category, subcategory: top.subcategory }, top.sure ? 'infer' : 'maybe');
      }
    } else if (st.byId.has(b.id)) {
      const top = inferPlaces(data, b, { skip: b.id })[0];
      if (top?.sure && !samePlace(top, { category: b.category, subcategory: b.subcategory || null })) {
        put(b, { category: top.category, subcategory: top.subcategory }, 'review');
      }
    }
  }

  return [
    ...lists.rule.sort(newer),
    ...lists.infer.sort(newer),
    ...lists.review.sort(newer),
    ...lists.maybe.sort(newer),
  ];
}

// ルールの案（定義 2026-10-31-004）。これまでの保存（今ある組にあるもの）から、作者・URL の段・ハッシュタグ・語（英数字・カタカナは3文字以上、漢字は2文字以上）・
// サイトごとに、それを持つ保存が3件以上（サイトは5件以上）あり、その8割以上（サイトは9割以上）が1つの組にあるもの。件数の多い順に10個まで。
// 同じ種類と値のルールがもうあるもの、今のルールでもうその組に送られるものは出さない。[{ kind, value, category, subcategory, hits, inPlace }]
// 語として持つかで選んだあと、ルールは部分一致で当たる（語の「art」が「start」にも）ので、hits・inPlace と割合は、数えている保存に案のルールを当てて数え直す
const PROPOSAL_MAX = 10;

// 数え上げの語（text.js の termsOf の形）を、同じものに当たるルールにする。ルールにしない語は null
function ruleOfTerm(t) {
  const v = t.slice(2);
  if (t[0] === 'a') return { kind: 'author', value: v.startsWith('name:') ? v.slice(5) : v };
  if (t[0] === 'u') return { kind: 'url', value: v };
  if (t[0] === 's') return { kind: 'site', value: v };
  if (t[0] === 't') return { kind: 'word', value: v };
  return /\p{Script=Han}/u.test(v) || v.length >= 3 ? { kind: 'word', value: v } : null;
}

/**
 * ルールの案（上の注）
 * @param {import('./data.js').Data} data 利用者のデータ
 * @returns {Array<{
 *   kind: string, value: string, category: string, subcategory: string | null, hits: number, inPlace: number,
 * }>} 案（hits はルールが当たる保存の件数、inPlace はそのうち案の組にある件数）
 */
export function ruleProposals(data) {
  const st = statsOf(data);
  const found = [];
  for (const [t, hits] of st.df) {
    const site = t[0] === 's';
    if (hits < (site ? 5 : 3)) continue;
    let best = null;
    for (const p of st.places.values()) {
      const c = p.counts.get(t) ?? 0;
      if (c > (best?.c ?? 0)) best = { p, c };
    }
    if (!best || best.c / hits < (site ? 0.9 : 0.8)) continue;
    const rule = ruleOfTerm(t);
    if (!rule) continue;

    const counts = new Map();
    let all = 0;
    for (const b of data.bookmarks) {
      const key = st.byId.get(b.id)?.key;
      if (!key || !pickByRules([rule], b)) continue;
      all++;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const [key, c] = [...counts].reduce((m, e) => (e[1] > m[1] ? e : m), ['', 0]);
    // 件数の下限も数え直した数で見る（URL の段は語として日本語をパーセントの形に、ポートを落として数えるので、ルールが1件も当たらないことがある）
    if (all < (site ? 5 : 3) || c / all < (site ? 0.9 : 0.8)) continue;
    const p = st.places.get(key);
    found.push({ ...rule, category: p.category, subcategory: p.subcategory, hits: all, inPlace: c });
  }

  found.sort((x, y) => y.hits - x.hits || y.inPlace - x.inPlace);
  const out = [];
  for (const f of found) {
    if (out.length >= PROPOSAL_MAX) break;
    const known = data.rules.some((r) => r.kind === f.kind
      && foldRule(r.value).replace(/^@/, '') === foldRule(f.value).replace(/^@/, ''));
    if (known) continue;
    // 漢字の2文字の組などで、同じ組・同じ件数の長い語の案がもうあれば重ねない
    const sameLonger = (o) => o.kind === 'word' && samePlace(o, f) && o.hits === f.hits
      && (o.value.includes(f.value) || f.value.includes(o.value));
    if (f.kind === 'word' && out.some(sameLonger)) continue;
    const mine = data.bookmarks
      .filter((b) => st.byId.get(b.id)?.key === keyOf(f.category, f.subcategory) && pickByRules([f], b));
    if (mine.every((b) => samePlace(pickByRules(data.rules, b) ?? {}, f))) continue;
    out.push(f);
  }
  return out;
}
