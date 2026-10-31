// 自己テスト。manifest の参照と import、トークンの受け取り、ボタンの目印と絵、ポップアップと設定の画面を確かめる。依存パッケージは使わない。
// アプリ（Twimark の scripts/self-test.mjs）から、拡張の分を移したもの（定義 2026-10-25-011）。共有コード（src/shared）の試験はアプリにある
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { parseUrl } from '../src/shared/meta.js';

const tests = [];
const test = (name, fn) => tests.push([name, fn]);

// PNG の頭の IHDR から大きさを読む
const pngSize = (path) => {
  const b = readFileSync(new URL(path, import.meta.url));
  assert.equal(b.subarray(1, 4).toString(), 'PNG', path);
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
};
test('アイコン: 拡張の PNG があり、大きさが合う', () => {
  for (const size of [16, 32, 48, 128]) assert.deepEqual(pngSize(`../src/icons/icon-${size}.png`), [size, size], size);
});

test('拡張の link.js: Twimark の画面から、決まった形のトークンだけを受け取る', async () => {
  const { runInNewContext } = await import('node:vm');
  const ORIGIN_LINK = 'https://twimark.ho-service.workers.dev';
  let onMessage = null;
  const saved = [];
  const posted = [];
  const window = { addEventListener: (type, fn) => { if (type === 'message') onMessage = fn; }, postMessage: (m, o) => posted.push([m, o]) };
  const sandbox = { window, document: { documentElement: { dataset: {} } }, chrome: { storage: { local: { set: async (v) => { saved.push(v); } } } } };
  runInNewContext(readFileSync(new URL('../src/link.js', import.meta.url), 'utf8'), sandbox);
  assert.equal(sandbox.document.documentElement.dataset.twimarkExtension, 'ready');
  const token = 'A'.repeat(43);
  const send = async (event) => { onMessage({ source: window, origin: ORIGIN_LINK, ...event }); await new Promise((r) => setTimeout(r, 0)); };
  await send({ origin: 'https://evil.test', data: { type: 'twimark-extension-token', token } });
  await send({ source: {}, data: { type: 'twimark-extension-token', token } });
  await send({ data: { type: 'other', token } });
  await send({ data: { type: 'twimark-extension-token', token: 'short' } });
  await send({ data: { type: 'twimark-extension-token', token: `${token}<script>` } });
  assert.equal(saved.length, 0, '受け取ってはいけないものを受け取った');
  await send({ data: { type: 'twimark-extension-token', token, login: 'owner' } });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].settings.token, token);
  assert.equal(saved[0].settings.login, 'owner');
  assert.equal(JSON.stringify(posted.at(-1)), JSON.stringify([{ type: 'twimark-extension-linked' }, ORIGIN_LINK]));
  // link.js の対象は Twimark のオリジンだけ
  const manifest = JSON.parse(readFileSync(new URL('../src/manifest.json', import.meta.url), 'utf8'));
  const linkScript = manifest.content_scripts.find((s) => s.js.includes('link.js'));
  assert.deepEqual(linkScript.matches, [`${ORIGIN_LINK}/*`]);
  assert.ok(!manifest.content_scripts.some((s) => s !== linkScript && s.matches.some((m) => m.includes('twimark'))));
});
// src をそのまま読み込むので、manifest と import の先がすべて src の中にあるかを確かめる
test('拡張: manifest の参照とページの import が、すべて src の中にある', () => {
  const source = (path) => new URL(`../src/${path}`, import.meta.url);
  const has = (path) => existsSync(source(path));
  const manifest = JSON.parse(readFileSync(source('manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  const refs = [manifest.action?.default_popup, manifest.options_page, manifest.background?.service_worker,
    ...(manifest.content_scripts ?? []).flatMap((s) => [...(s.js ?? []), ...(s.css ?? [])]),
    ...Object.values(manifest.icons ?? {}), ...Object.values(manifest.action?.default_icon ?? {})].filter(Boolean);
  for (const ref of refs) assert.ok(has(ref), `manifest.json の ${ref} がない`);
  // ページの <script src>・<link href> と、そこから辿る import（'..' で外に出るものは欠けと同じ扱い）
  const seen = new Set();
  const visit = (path, from) => {
    assert.ok(!path.startsWith('../') && has(path), `${from} が指す ${path} が src にない`);
    if (seen.has(path) || !path.endsWith('.js')) return;
    seen.add(path);
    const js = readFileSync(source(path), 'utf8');
    // import './x'、import … from './x'、export … from './x'（行の途中の import() は辿らない）
    for (const [, spec] of js.matchAll(/(?:^|\n)\s*(?:import\s*|(?:import|export)\b[^'"]*?\bfrom\s*)['"](\.[^'"]+)['"]/g)) {
      const to = new URL(spec, `https://x/ext/${path}`).pathname;
      visit(to.startsWith('/ext/') ? to.slice(5) : `..${to}`, path);
    }
  };
  for (const page of refs.filter((r) => r.endsWith('.html'))) {
    for (const [, ref] of readFileSync(source(page), 'utf8').matchAll(/\s(?:src|href)="([^":]+)"/g)) visit(ref, page);
  }
  assert.ok(seen.has('shared/store.js'), 'ポップアップが shared/ を読んでいない（辿り方の誤り）');
  // service worker は module（manifest の background.type）なので import できる。import の先も src の中にあること
  assert.equal(manifest.background.type, 'module');
  visit(manifest.background.service_worker, 'manifest.json');
  assert.ok(seen.has('shared/meta.js') && seen.has('bookmark.js'), 'background.js が shared/meta.js と bookmark.js を読んでいない');
  // コンテンツスクリプトは import できない
  for (const path of manifest.content_scripts.flatMap((s) => s.js)) {
    assert.doesNotMatch(readFileSync(source(path), 'utf8'), /(?:^|\n)\s*(?:import|export)\b/, path);
  }
});
// ---- 定義 2026-10-24-003（投稿・記事のブックマークのアイコン） ----
// 定義 2026-10-25-009 で、対象に Instagram・pixiv・BOOTH を足した。版は 2026-10-25-010 で 0.6.1、その追記で 0.6.2、そのレビューの差し戻しで 0.6.3 に
// 定義 2026-10-26-002 で GitHub・unityroom・ふりーむ！を足し、006（メモの追加）と合わせて版を 0.7.0 に。007（要約見出しを作る・翻訳するのトグル）で 0.8.0 に
test('拡張: content.js の対象は X・Instagram・note・Qiita・pixiv・BOOTH・GitHub・unityroom・ふりーむ！だけ。アイコンの絵が4つあり、版は 0.9.0', () => {
  const manifest = JSON.parse(readFileSync(new URL('../src/manifest.json', import.meta.url), 'utf8'));
  const content = manifest.content_scripts.find((s) => s.js.includes('content.js'));
  for (const m of content.matches) assert.match(m, /^https:\/\/((mobile\.)?twitter\.com|x\.com|note\.com|qiita\.com|www\.instagram\.com|www\.pixiv\.net|booth\.pm|\*\.booth\.pm|github\.com|unityroom\.com|www\.freem\.ne\.jp)\/\*$/, m);
  for (const site of ['x.com', 'note.com', 'qiita.com', 'www.instagram.com', 'www.pixiv.net', 'booth.pm', 'github.com', 'unityroom.com', 'www.freem.ne.jp']) {
    assert.ok(content.matches.includes(`https://${site}/*`), site);
    // 拡張が下見を自分で取るので、取得先のホストも許す
    if (site !== 'x.com') assert.ok(manifest.host_permissions.includes(`https://${site}/*`), `host_permissions: ${site}`);
  }
  assert.deepEqual(Object.keys(manifest.icons), ['16', '32', '48', '128']);
  for (const p of Object.values(manifest.icons)) assert.ok(existsSync(new URL(`../src/${p}`, import.meta.url)), p);
  assert.equal(manifest.version, '0.9.0');
});
test('拡張: GitHub・unityroom・ふりーむ！のボタンの目印と URL の形。右クリックの対象にもある', () => {
  const js = readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
  for (const sel of ['[data-testid="star-button"], [data-testid="unstar-button"], .starring-container', '.game_actionArea', 'li.game-btn-favorite',
    "'github.com': iconsGithub, 'unityroom.com': iconsUnityroom, 'www.freem.ne.jp': iconsFreem", "[role=\"tooltip\"], .tooltip", "'data-size', 'data-variant', 'data-component'"]) assert.ok(js.includes(sel), sel);
  // content.js が作る URL は parseUrl が受ける正規の形
  for (const [re, path, url] of [[/const GH_REPO = (\/.+\/);/, '/cloudflare/workers-sdk/tree/main', 'https://github.com/cloudflare/workers-sdk'],
    [/const UR_GAME = (\/.+\/);/, '/games/bozucrane/webgl', 'https://unityroom.com/games/bozucrane'], [/const FREEM_GAME = (\/.+\/);/, '/win/game/12083', 'https://www.freem.ne.jp/win/game/12083']]) {
    const source = js.match(re)[1];
    assert.ok(new RegExp(source.slice(1, -1)).test(path), path);
    assert.equal(parseUrl(url)?.url, url);
  }
  const bg = readFileSync(new URL('../src/background.js', import.meta.url), 'utf8');
  for (const p of ["'https://github.com/*/*'", "'https://unityroom.com/games/*'", "'https://www.freem.ne.jp/win/game/*'"]) assert.ok(bg.includes(p), p);
});
test('拡張: bookmarkOf はポップアップと小さな画面で同じブックマークを作る（取れなければ貼り付けの本文）', async () => {
  const { bookmarkOf } = await import('../src/bookmark.js');
  const parsed = parseUrl('https://x.com/jack/status/20');
  const item = { url: 'https://x.com/jack/status/20', author: { name: 'jack', handle: 'jack' }, postedAt: '2006-03-21T20:50:14.000Z', title: '', text: 'just setting up my twttr', photos: [], videos: [] };
  const b = bookmarkOf(parsed, item, ['ツール', 'CLI'], '', 'メモ');
  assert.deepEqual({ id: b.id, site: b.site, text: b.text, category: b.category, subcategory: b.subcategory, note: b.note }, { id: parsed.id, site: 'x', text: 'just setting up my twttr', category: 'ツール', subcategory: 'CLI', note: 'メモ' });
  const pasted = bookmarkOf(parsed, null, ['ツール', null], '貼った本文');
  assert.equal(pasted.text, '貼った本文');
  assert.equal(pasted.author.handle, 'jack');
  assert.equal(pasted.subcategory, null);
  // ポップアップは bookmarkOf を使い、追加のあとに background.js へ読み直しを頼む
  const popup = readFileSync(new URL('../src/popup.js', import.meta.url), 'utf8');
  assert.match(popup, /bookmarkOf\(parsed, item,/);
  assert.match(popup, /type: 'twimark-changed'/);
});
test('拡張: content.js がブックマーク（にあたる）ボタンの目印と、重ねて置かない印を持つ', () => {
  const js = readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
  for (const sel of ['[data-engagement-action="bookmark"]', '[data-testid="bookmark"]', 'スキをつけたユーザーを見る', 'button[aria-label^="ストック"]', "attachShadow({ mode: 'closed' })", "type: 'twimark-state'", "type: 'twimark-save'"]) assert.ok(js.includes(sel), sel);
  const bg = readFileSync(new URL('../src/background.js', import.meta.url), 'utf8');
  for (const t of ['twimark-state', 'twimark-save', 'twimark-link', 'twimark-open', 'twimark-changed']) assert.ok(bg.includes(`'${t}'`), t);
  // 別の拡張やページからの知らせは受けない
  assert.match(bg, /sender\.id === chrome\.runtime\.id/);
});
// ---- 定義 2026-10-25-009（拡張のボタンの絵、Instagram・pixiv・BOOTH、設定の画面、対応していないページの文） ----
test('拡張のボタンの絵: Illustrator が書き出した mark.svg・mark-saved.svg が 24 の格子で、content.js が同じ座標を使う', () => {
  const js = readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
  for (const name of ['mark.svg', 'mark-saved.svg']) {
    const svg = readFileSync(new URL(`../src/icons/${name}`, import.meta.url), 'utf8');
    assert.match(svg, /viewBox="0 0 24 24"/, name);
    for (const [, points] of svg.matchAll(/points="([^"]+)"/g)) assert.ok(js.includes(points), `${name}: ${points}`);
  }
  assert.ok(existsSync(new URL('../design/make-mark.jsx', import.meta.url)));
  // 定義 2026-10-25-010: しおりをやめて T を入れた角丸の四角。色は黄緑に固定し、チェックの丸（アクセント）は使わない
  assert.ok(js.includes("stroke: '#76A040'") && js.includes("fill: '#8DB255'"));
  assert.ok(!js.includes('badge') && !js.includes('19 21.5') && !js.includes("stroke: 'currentColor'"));
  // 形は g の子に入れるので、node は子を受け取る（受け取らないと絵が空になり、ボタンが見えなくなる）
  assert.ok(js.includes('const node = (tag, attrs, ...kids)') && js.includes('n.append(...kids)'));
});
test('拡張: Instagram・pixiv・BOOTH の目印と、計測の印を外すこと。共有メニューは X・note・Qiita だけ', () => {
  const js = readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
  for (const sel of ['svg[aria-label="保存する"]', 'button.gtm-main-bookmark', "flexDirection === 'row-reverse'", '.item-card, .l-item-card-favorite', '/^gtm-/']) assert.ok(js.includes(sel), sel);
  assert.match(js, /const SHARE = \{ 'qiita\.com': scanQiita, 'note\.com': scanNote \};/);
  const css = readFileSync(new URL('../src/content.css', import.meta.url), 'utf8');
  assert.ok(css.includes('[data-twimark-row] { display: flex;'));
});
// 定義 2026-10-26-006: 対応していないページは、文の代わりにメモの追加の画面。対応しているサイトは設定の画面に SITES から出す
test('拡張: 対応していないページではメモの追加の画面を出し、設定の画面は対応しているサイトを SITES から作り、options.js の指す data-* をすべて持つ', () => {
  const popup = readFileSync(new URL('../src/popup.js', import.meta.url), 'utf8');
  const popupHtml = readFileSync(new URL('../src/popup.html', import.meta.url), 'utf8');
  assert.ok(!popup.includes('UNSUPPORTED') && !popup.includes('このページは追加できません'));
  assert.match(popup, /ops\.add\(\{ site: 'memo', id: memoId\(\), title: field\('title'\)\.value, text: field\('text'\)\.value, url, category, subcategory \}\)/);
  // URL は https で、Worker が受ける 500 文字までのときだけ入れておく（レビュー）
  assert.match(popup, /field\('url'\)\.value = \/\^https:\\\/\\\/\/\.test\(target\.url\) && target\.url\.length <= 500 \? target\.url : '';/);
  assert.match(popupHtml, /name="url" type="url" maxlength="500"/);
  for (const [, name] of popup.matchAll(/\$\('\[(data-[a-z-]+)/g)) assert.ok(popupHtml.includes(name), `popup.html: ${name}`);
  assert.match(popupHtml, /name="title" maxlength="80"/);
  assert.match(popupHtml, /name="text" rows="5" maxlength="5000"/);
  assert.ok(readFileSync(new URL('../src/popup.css', import.meta.url), 'utf8').includes('.msg { white-space: pre-line; }'));
  const html = readFileSync(new URL('../src/options.html', import.meta.url), 'utf8');
  const js = readFileSync(new URL('../src/options.js', import.meta.url), 'utf8');
  assert.match(js, /Object\.entries\(SITES\)\.filter\(\(\[key\]\) => key !== 'memo'\)/);
  assert.ok(html.includes('data-supported') && html.includes('ほかのページでは、ボタンを押すとメモの追加になります。'));
  for (const [, name] of js.matchAll(/\$\('\[(data-[a-z-]+)/g)) assert.ok(html.includes(name), name);
  assert.match(html, /<link rel="stylesheet" href="options\.css" \/>/);
  assert.doesNotMatch(html, /<style/);
});
// ---- レビューで足した試験（定義 2026-10-24-003） ----
test('拡張のアイコン: 追加したら同じ投稿のアイコンを全部塗り、ページを送ったら小さな画面を閉じ、ほかで保存済みなら保存済みとして返す', () => {
  const js = readFileSync(new URL('../src/content.js', import.meta.url), 'utf8');
  assert.match(js, /item\.dataset\.twimarkUrl = url;/);
  assert.match(js, /other\.dataset\.twimarkUrl === url\) paint\(other, true/);
  assert.match(js, /addEventListener\('scroll', \(e\) => \{ if \(panel && !e\.composedPath\(\)\.includes\(panel\)\) closePanel\(\); \}, \{ capture: true, passive: true \}\)/);
  const bg = readFileSync(new URL('../src/background.js', import.meta.url), 'utf8');
  assert.match(bg, /err\?\.code !== 'duplicate'\) throw err;\s*forget\(\);\s*return \{ ok: true, already: true \};/);
});

// ---- 公開リポジトリに個人の値を入れない（アプリの定義 2026-10-26-001）。アプリの self-test.mjs にも同じ試験がある ----
test('追跡中と未追跡のファイルに、メールアドレス・利用者名のパス・アカウントIDがない', () => {
  // 許すメールアドレス: コミットの共同作者、GitHub の noreply、試験用の example
  const allowMail = /^(noreply@anthropic\.com|[\w.+-]+@users\.noreply\.github\.com|[^@]+@([\w-]+\.)*example(\.com)?)$/i;
  const root = new URL('../', import.meta.url);
  const found = [];
  for (const f of execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0')) {
    if (!f || !existsSync(new URL(f, root))) continue;
    const buf = readFileSync(new URL(f, root));
    if (buf.includes(0)) continue;
    const s = buf.toString();
    for (const [m] of s.matchAll(/[\w.%+-]+@(?:[\w-]+\.)+[A-Za-z]{2,}/g)) if (!allowMail.test(m)) found.push(`${f}: メールアドレス`);
    if (/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s`"'<]/i.test(s) || /\/(Users|home)\/[\w.-]+\//.test(s)) found.push(`${f}: 利用者名のパス`);
    if (/["']?account_id["']?\s*[:=]|\b[0-9a-f]{32}\b/i.test(s)) found.push(`${f}: アカウントID`);
  }
  assert.deepEqual(found, []);
});

// ---- Twimark の定義 2026-10-31-001（おすすめのカテゴリと、その場で作る） ----
test('拡張: 写した store.js は Twimark のものと先頭の1行のほかは同じ（WorkSpace に Twimark があるときだけ比べる）', () => {
  const copy = readFileSync(new URL('../src/shared/store.js', import.meta.url), 'utf8');
  assert.ok(copy.startsWith('// Twimark（アプリ）の src/shared/store.js の写し。'));
  for (const name of ['suggestPlaces', 'initialPlace', 'pickByRules', 'setAddCreate', 'setSuggestFirst']) assert.ok(copy.includes(name), name);
  const app = new URL('../../../../Application/Twimark/src/shared/store.js', import.meta.url);
  if (!existsSync(app)) return;
  assert.equal(copy.slice(copy.indexOf('\n') + 1), readFileSync(app, 'utf8'));
});

test('拡張: ポップアップと小さな画面に、おすすめの札・初期の選択の理由・「＋ カテゴリ」「＋ サブカテゴリ」があり、作るのは background.js の twimark-create', () => {
  const has = (text, part) => assert.ok(text.includes(part), part);
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const popup = read('../src/popup.js');
  const html = read('../src/popup.html');
  const content = read('../src/content.js');
  const background = read('../src/background.js');
  for (const part of ['data-suggest-part', 'data-reason', 'data-new="category"', 'data-new="subcategory"', 'data-new-form', 'data-new-name', 'data-new-save']) has(html, part);
  for (const part of ['const initial = initialPlace(data, facts);', 'const suggest = suggestPlaces(data, facts);', "$('[data-create]').hidden = data.addCreate === 'none';", "$('[data-new=\"subcategory\"]').hidden = data.addCreate !== 'both' || !select.value;",
    "ops.addSubcategory(category, name) : ops.addCategory(name)", "if (p.by === 'rule')"]) has(popup, part);
  for (const part of ["type: 'twimark-create'", 'if (s.initial) pick(s.initial, s.initial.reason);', "s.addCreate === 'none' ? []", "if (p.by === 'rule')"]) has(content, part);
  for (const part of ["'twimark-create': (m) => create(m),", 'suggest: facts ? suggestPlaces(data, facts) : [],', 'initial: initial ? { ...initial, reason: PLACE_REASONS[initial.by] } : null,', "author: { name: '', handle: parsed.handle ?? '' }, title: '', text: ''"]) has(background, part);
});

// Twimark の定義 2026-10-31-001 の追補（レビューの差し戻し）
test('拡張: カテゴリが1つもなくても「＋ カテゴリ」で作れる（選択を読むのはサブカテゴリのときだけ）。小さな画面にも「おすすめ」の見出し', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
  const popup = read('../src/popup.js');
  const content = read('../src/content.js');
  // 作るときに選択（空のことがある）をいつも読む形は残っていない
  assert.ok(!popup.includes('const [category] = JSON.parse(select.value);'));
  assert.ok(popup.includes("const category = kind === 'subcategory' ? JSON.parse(select.value)[0] : null;"));
  assert.ok(content.includes("category: kind === 'subcategory' ? JSON.parse(select.value)[0] : null"));
  assert.ok(!content.includes("category: JSON.parse(select.value)[0], name"));
  assert.ok(content.includes("const paintSub = () => { if (subButton) subButton.hidden = !select.value; };"));
  assert.ok(content.includes("el('span', { className: 'muted', textContent: 'おすすめ' }), chips)"));
  assert.ok(content.includes('button[hidden] { display: none; }'));
});

let failed = 0;
for (const [name, fn] of tests) {
  try {
    await fn();
    console.log(`ok   ${name}`);
  } catch (e) {
    failed++;
    console.log(`FAIL ${name}
     ${e.message}`);
  }
}
console.log(failed ? `${failed}件失敗しました。` : `${tests.length}件すべて成功しました。`);
process.exitCode = failed ? 1 : 0;
