// 文字のそろえ方（foldRule）と、ブックマークの題・本文・作者・URL から語を取り出すこと（termsOf）。
// 自動整理のルール（rules.js）、おすすめのカテゴリ（suggest.js）、類似の投稿（similar.js）、ルールの案（sort.js）が使い、
// Worker（src/worker）もルールの値をそろえるのに foldRule を使う。AI・辞書・Intl.Segmenter は使わない（suggest.js の頭の注）

/**
 * 比べるときのそろえ方（NFKC・小文字、前後の空白を除く）。自動整理のルール（定義 2026-10-30-004）から使っている
 * @param {unknown} s そろえるもの（null・undefined は空の文字列）
 * @returns {string} そろえた文字列
 */
export const foldRule = (s) => String(s ?? '').normalize('NFKC').toLowerCase().trim();

// 語を抜く（termsOf）。どれも NFKC・小文字。'a:' 作者（@handle、なければ name:<名前>）、'u:' URL の「ホスト＋最初の段」、's:' サイト、
// 't:' ハッシュタグ、'w:' 題と本文の語（2文字以上の英数字の語、2文字以上のカタカナの続き、漢字の続き（2〜4文字ならそのもの、3文字以上なら2文字ずつの組も））。
// URL は除き、絵文字・記号は区切り。ひらがなだけの語は使わない
const TAG = /#[\p{L}\p{N}_]+/gu;
// 保存する URL の最初の段が決まった語のサイト（/p/・/artworks/・/ja/・/games/・/win/）。同じサイトと同じ意味になるので、URL の最初の段は比べない
// （定義 2026-10-31-001 の追補）
const FIXED_PATH = new Set(['instagram', 'pixiv', 'booth', 'unityroom', 'freem']);
// よく出る英語の語（どのカテゴリにも出るので比べない）
const STOP = new Set('the and for with this that from are was were you your our have has had not but all can will just about into out more one new http https www com net org jp co html amp rt of to in on at is it by an or be as so if we my me do no up go vs via'.split(' '));

/**
 * 文から 'w:' の語（上の注の 'w:'）を抜き、1つずつ add に渡す
 * @param {string} text foldRule でそろえた文
 * @param {(term: string) => void} add 語（'w:…'）を受け取る関数
 * @returns {void}
 */
export function wordsOf(text, add) {
  for (const w of text.match(/[a-z0-9]{2,}/g) ?? []) if (!STOP.has(w) && !/^\d+$/.test(w)) add(`w:${w}`);
  for (const w of text.match(/[\p{Script=Katakana}ー]{2,}/gu) ?? []) if (/[^ー]/.test(w)) add(`w:${w}`);
  for (const run of text.match(/\p{Script=Han}{2,}/gu) ?? []) {
    if (run.length <= 4) add(`w:${run}`);
    if (run.length >= 3) for (let i = 0; i < run.length - 1; i++) add(`w:${run.slice(i, i + 2)}`);
  }
}

// 要約見出し（b.summary）の語。termsOf と同じ抜き方の 't:' と 'w:' だけ（定義 2026-11-10-001）
function summaryTerms(summary, add) {
  const text = foldRule(summary).replace(/https?:\/\/\S+/g, ' ');
  for (const tag of text.match(TAG) ?? []) add(`t:${tag}`);
  wordsOf(text.replace(/#/g, ' '), add);
}

/**
 * termsOf に要約見出しの語を足したもの（おすすめの数え上げと推し量りだけが使う。類似の投稿とルールの案は termsOf のまま）
 * @param {import('./data.js').Facts} b 語を抜くもの
 * @returns {Set<string>} 語の集まり（'a:…'・'u:…'・'s:…'・'t:…'・'w:…'）
 */
export function inferTermsOf(b) {
  const out = termsOf(b);
  if (typeof b?.summary === 'string' && b.summary) summaryTerms(b.summary, (t) => out.add(t));
  return out;
}

/**
 * ブックマークの語を抜く（上の注の決まり）。要約見出しは見ない
 * @param {import('./data.js').Facts} b 語を抜くもの
 * @returns {Set<string>} 語の集まり（'a:…'・'u:…'・'s:…'・'t:…'・'w:…'）
 */
export function termsOf(b) {
  const out = new Set();
  const add = (t) => out.add(t);

  const handle = foldRule(b?.author?.handle).replace(/^@/, '');
  const name = foldRule(b?.author?.name);
  if (handle) add(`a:@${handle}`);
  else if (name) add(`a:name:${name}`);

  try {
    const u = new URL(String(b?.url ?? ''));
    const first = u.pathname.split('/').filter(Boolean)[0];
    if (first && !FIXED_PATH.has(b?.site)) add(`u:${u.hostname.replace(/^www\./, '')}/${first}`.toLowerCase());
  } catch { /* URL のないメモや、形の違うもの */ }

  if (b?.site) add(`s:${b.site}`);

  const body = foldRule(`${b?.title ?? ''}\n${b?.text ?? ''}`).replace(/https?:\/\/\S+/g, ' ');
  for (const tag of body.match(TAG) ?? []) add(`t:${tag}`);
  wordsOf(body.replace(/#/g, ' '), add);
  return out;
}

/**
 * 比べるための詰めた形（foldRule でそろえ、文字と数字のほかを除く）
 * @param {unknown} s 詰めるもの
 * @returns {string} 詰めた文字列
 */
export const compact = (s) => foldRule(s).replace(/[^\p{L}\p{N}]+/gu, '');
