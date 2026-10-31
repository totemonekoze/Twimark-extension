// Twimark（アプリ）の src/shared/meta.js の写し。正本はアプリ側。アプリで変えたら写し直す（AGENTS.md）
// 追加できるURLの判定と、保存する項目の取得。X は fxtwitter、note・Qiita・Instagram・pixiv・BOOTH・GitHub・unityroom・ふりーむ！と
// レシピ・お店のサイトはページのHTMLの JSON-LD と OGP から取る。Google マップは URL の場所の名前から作る。
// HTML は正規表現で <meta> と JSON-LD だけを読む（DOMParser のない環境とテストでも同じに動くように）。

const TEXT_MAX = 5000;
const X_POST = /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})(?:[/?#].*)?$/;
const X_WEB = /^https:\/\/(?:www\.|mobile\.)?(?:x|twitter)\.com\/i\/(?:web\/)?status\/(\d{1,25})(?:[/?#].*)?$/;
const NOTE = /^https:\/\/note\.com\/([A-Za-z0-9_-]{1,64})\/n\/(n[0-9a-z]{6,24})(?:[/?#].*)?$/;
const QIITA = /^https:\/\/qiita\.com\/([A-Za-z0-9_-]{1,64})\/items\/([0-9a-f]{20})(?:[/?#].*)?$/;
// Instagram の投稿（/p/、/reel/、/<ユーザー>/p/）、pixiv の作品（言語の前置きつきも）、BOOTH の商品（言語の前置きつきと、ショップの下）
const INSTAGRAM = /^https:\/\/(?:www\.)?instagram\.com\/(?:([A-Za-z0-9_.]{1,30})\/)?(?:p|reel)\/([A-Za-z0-9_-]{5,40})\/?(?:[?#].*)?$/;
const PIXIV = /^https:\/\/(?:www\.)?pixiv\.net\/(?:[a-z]{2}\/)?artworks\/(\d{1,12})\/?(?:[?#].*)?$/;
const BOOTH = /^https:\/\/(?:booth\.pm\/[a-z]{2}(?:-[a-z]{2})?|([a-z0-9-]{1,40})\.booth\.pm)\/items\/(\d{1,12})\/?(?:[?#].*)?$/;
// GitHub のリポジトリ（下のパスも受け、最上位に直す）、unityroom のゲーム、ふりーむ！のゲーム
const GITHUB = /^https:\/\/(?:www\.)?github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})(?:[/?#].*)?$/;
// GitHub の予約の名前（ユーザーやリポジトリではないページ）
const GITHUB_RESERVED = new Set(['about', 'account', 'apps', 'codespaces', 'collections', 'contact', 'customer-stories', 'dashboard', 'enterprise', 'events', 'explore', 'features',
  'issues', 'join', 'login', 'logout', 'marketplace', 'new', 'notifications', 'orgs', 'organizations', 'pricing', 'pulls', 'readme', 'search', 'security', 'sessions',
  'settings', 'signup', 'site', 'solutions', 'sponsors', 'stars', 'team', 'topics', 'trending', 'users']);
const UNITYROOM = /^https:\/\/unityroom\.com\/games\/([A-Za-z0-9_-]{1,64})(?:[/?#].*)?$/;
const FREEM = /^https:\/\/(?:www\.)?freem\.ne\.jp\/win\/game\/(\d{1,9})\/?(?:[?#].*)?$/;
// Google マップの場所（定義 2026-10-31-008）。長い URL の /place/<名前>/@<緯度>,<経度>,.../data=...!1s<印>...、
// ?q=<名前>&ftid=<印> の形、短い URL（maps.app.goo.gl・goo.gl/maps）
const GMAP_HOST = '(?:(?:www\\.)?google\\.(?:com|co\\.jp)|maps\\.google\\.(?:com|co\\.jp))';
const GMAP_PLACE = new RegExp(`^https://${GMAP_HOST}(?:/maps)?/place/([^/?#]+)(/[^?#]*)?(?:\\?[^#]*)?(?:#.*)?$`);
const GMAP_FTID = new RegExp(`^https://${GMAP_HOST}(?:/maps)?/?\\?([^#]*)(?:#.*)?$`);
const GMAP_SHORT = /^https:\/\/(?:maps\.app\.goo\.gl|goo\.gl\/maps)\/([A-Za-z0-9_-]{4,64})\/?(?:[?#].*)?$/;
const GMAP_MARK = /^0x[0-9a-f]{1,16}:0x[0-9a-f]{1,16}$/i;
// レシピ（クックパッド・デリッシュキッチン・クラシル・楽天レシピ）とお店（ホットペッパーグルメ・ぐるなび）
const COOKPAD = /^https:\/\/cookpad\.com\/(?:jp\/recipes|recipe)\/(\d{1,12})\/?(?:[?#].*)?$/;
const DELISH = /^https:\/\/delishkitchen\.tv\/recipes\/(\d{1,20})\/?(?:[?#].*)?$/;
const KURASHIRU = /^https:\/\/(?:www\.)?kurashiru\.com\/recipes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\/?(?:[?#].*)?$/;
const RAKUTEN_RECIPE = /^https:\/\/recipe\.rakuten\.co\.jp\/recipe\/(\d{1,12})\/?(?:[?#].*)?$/;
const HOTPEPPER = /^https:\/\/(?:www\.)?hotpepper\.jp\/str(J\d{9})(?:[/?#].*)?$/;
// ぐるなびのお店の ID は英小文字と数字（数字を1つ以上含む）。area・eki などの一覧のページは数字を含まない
const GNAVI = /^https:\/\/r\.gnavi\.co\.jp\/((?=[a-z0-9]*\d)[a-z0-9]{6,16})(?:[/?#].*)?$/;
export const RECIPE_SITES = ['cookpad', 'delish', 'kurashiru', 'rakutenrecipe'];
export const SHOP_SITES = ['hotpepper', 'gnavi'];

// 追加できない URL を入れたときの文（Web・アプリ・Worker・拡張で同じ）
export const UNSUPPORTED_URL = '追加できるのは X・Instagram のポスト、note・Qiita の記事、pixiv の作品、BOOTH の商品、GitHub のリポジトリ、unityroom・ふりーむ！のゲーム、Google マップの場所、クックパッド・デリッシュキッチン・クラシル・楽天レシピのレシピ、ホットペッパーグルメ・ぐるなびのお店の URL です。';

// 入れた文から最初の https://… を抜く（Google マップのアプリの共有は「<場所の名前>\n<短い URL>」のように前に文が付く）。なければそのまま
export function urlIn(raw) {
  const text = typeof raw === 'string' ? raw.trim() : '';
  // 終わりに付いた句読点・閉じかっこ（「…URL。」「（URL）」）は URL に含めない
  return text.match(/https:\/\/[^\s<>"'「」]+/)?.[0].replace(/[)\]）」』。、,.!?！？]+$/u, '') ?? text;
}

const decodeName = (s) => {
  try { return decodeURIComponent(s.replace(/\+/g, ' ')).replace(/\s+/g, ' ').trim(); } catch { return ''; }
};
// Google マップの長い URL を、場所の名前と座標と印だけの保存用の形に。保存の上限（500 文字）を超えるなら名前を縮める
function gmapPlace(name, rest = '', ftid = '') {
  const at = rest.match(/@(-?\d{1,3}(?:\.\d+)?),(-?\d{1,3}(?:\.\d+)?)/);
  const mark = rest.match(/!1s(0x[0-9a-f]{1,16}:0x[0-9a-f]{1,16})/i)?.[1] ?? (GMAP_MARK.test(ftid) ? ftid : null);
  if (!name) return null;
  const coords = at ? `@${at[1]},${at[2]},17z/` : '';
  const tail = `${coords}${mark ? `data=!4m2!3m1!1s${mark}` : ''}`;
  let label = [...name];
  let url;
  do {
    url = `https://www.google.com/maps/place/${encodeURIComponent(label.join(''))}/${tail}`;
    label = label.slice(0, -1);
  } while (url.length > 500 && label.length);
  const near = at ? `@${Number(at[1]).toFixed(3)},${Number(at[2]).toFixed(3)}` : '';
  const key = mark ?? `${name.slice(0, 100)}${near}`;
  return { site: 'gmap', id: `gmap:${key}`, key, handle: null, url, name };
}

// { site, id, url, handle } か null。url はクエリなどを除いた保存用の形。Google マップは場所の名前 name も（短い URL は null）
export function parseUrl(raw) {
  const url = typeof raw === 'string' ? raw.trim() : '';
  let m;
  if ((m = url.match(GMAP_PLACE))) return gmapPlace(decodeName(m[1]), m[2]);
  if ((m = url.match(GMAP_FTID))) {
    const q = new URLSearchParams(m[1]);
    if (GMAP_MARK.test(q.get('ftid') ?? '')) return gmapPlace((q.get('q') ?? '').trim(), '', q.get('ftid'));
  }
  if ((m = url.match(GMAP_SHORT))) return { site: 'gmap', id: `gmap:${m[1]}`, key: m[1], handle: null, url: url.replace(/[?#].*$/, '').replace(/\/$/, ''), name: null };
  if ((m = url.match(COOKPAD))) return { site: 'cookpad', id: `cookpad:${m[1]}`, key: m[1], handle: null, url: `https://cookpad.com/jp/recipes/${m[1]}` };
  if ((m = url.match(DELISH))) return { site: 'delish', id: `delish:${m[1]}`, key: m[1], handle: null, url: `https://delishkitchen.tv/recipes/${m[1]}` };
  if ((m = url.match(KURASHIRU))) return { site: 'kurashiru', id: `kurashiru:${m[1]}`, key: m[1], handle: null, url: `https://www.kurashiru.com/recipes/${m[1]}` };
  if ((m = url.match(RAKUTEN_RECIPE))) return { site: 'rakutenrecipe', id: `rakutenrecipe:${m[1]}`, key: m[1], handle: null, url: `https://recipe.rakuten.co.jp/recipe/${m[1]}/` };
  if ((m = url.match(HOTPEPPER))) return { site: 'hotpepper', id: `hotpepper:${m[1]}`, key: m[1], handle: null, url: `https://www.hotpepper.jp/str${m[1]}/` };
  if ((m = url.match(GNAVI))) return { site: 'gnavi', id: `gnavi:${m[1]}`, key: m[1], handle: null, url: `https://r.gnavi.co.jp/${m[1]}/` };
  if ((m = url.match(X_WEB))) return { site: 'x', id: `x:${m[1]}`, key: m[1], handle: null, url: null };
  if ((m = url.match(X_POST)) && m[1] !== 'i') return { site: 'x', id: `x:${m[2]}`, key: m[2], handle: m[1], url: `https://x.com/${m[1]}/status/${m[2]}` };
  if ((m = url.match(NOTE))) return { site: 'note', id: `note:${m[2]}`, key: m[2], handle: m[1], url: `https://note.com/${m[1]}/n/${m[2]}` };
  if ((m = url.match(QIITA))) return { site: 'qiita', id: `qiita:${m[2]}`, key: m[2], handle: m[1], url: `https://qiita.com/${m[1]}/items/${m[2]}` };
  if ((m = url.match(INSTAGRAM)) && !['p', 'reel'].includes(m[1])) return { site: 'instagram', id: `instagram:${m[2]}`, key: m[2], handle: m[1] ?? null, url: `https://www.instagram.com/p/${m[2]}/` };
  if ((m = url.match(PIXIV))) return { site: 'pixiv', id: `pixiv:${m[1]}`, key: m[1], handle: null, url: `https://www.pixiv.net/artworks/${m[1]}` };
  if ((m = url.match(BOOTH)) && m[1] !== 'www') return { site: 'booth', id: `booth:${m[2]}`, key: m[2], handle: m[1] ?? null, url: `https://booth.pm/ja/items/${m[2]}` };
  if ((m = url.match(GITHUB)) && !GITHUB_RESERVED.has(m[1].toLowerCase())) {
    const repo = m[2].replace(/\.git$/i, '');
    if (!repo || repo === '.' || repo === '..') return null;
    const key = `${m[1]}/${repo}`;
    return { site: 'github', id: `github:${key.toLowerCase()}`, key, handle: m[1], url: `https://github.com/${key}` };
  }
  if ((m = url.match(UNITYROOM))) return { site: 'unityroom', id: `unityroom:${m[1]}`, key: m[1], handle: null, url: `https://unityroom.com/games/${m[1]}` };
  if ((m = url.match(FREEM))) return { site: 'freem', id: `freem:${m[1]}`, key: m[1], handle: null, url: `https://www.freem.ne.jp/win/game/${m[1]}` };
  return null;
}

// fxtwitter の応答から、保存する項目だけを取り出す（Portal の Tips と同じ項目）
export function extractTweet(data) {
  const t = data?.tweet;
  if (!t || typeof t.text !== 'string' || !t.author) return null;
  const photos = (t.media?.photos ?? []).filter((p) => /^https:\/\/pbs\.twimg\.com\//.test(p.url)).map((p) => ({ url: p.url }));
  const videos = (t.media?.videos ?? []).filter((v) => /^https:\/\/pbs\.twimg\.com\//.test(v.thumbnail_url ?? '')).map((v) => ({ thumbnail: v.thumbnail_url }));
  return {
    author: { name: String(t.author.name ?? t.author.screen_name), handle: String(t.author.screen_name) },
    postedAt: typeof t.created_timestamp === 'number' ? new Date(t.created_timestamp * 1000).toISOString() : null,
    title: '',
    text: (t.raw_text?.text ?? t.text).slice(0, TEXT_MAX),
    photos,
    videos,
  };
}

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
export const decodeEntities = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, e) => {
  if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? whole;
  const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1));
  return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
});

// <meta property|name="..." content="..."> を小文字のキーで。同じキーは最初のもの
export function readMeta(html) {
  const meta = {};
  for (const [tag] of html.matchAll(/<meta\b[^>]*>/gi)) {
    const attrs = {};
    for (const m of tag.matchAll(/([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[m[1].toLowerCase()] = decodeEntities(m[2] ?? m[3]);
    const key = (attrs.property ?? attrs.name)?.toLowerCase();
    if (key && attrs.content !== undefined && !(key in meta)) meta[key] = attrs.content;
  }
  return meta;
}

// JSON-LD の Article / BlogPosting と、レシピ（Recipe）・お店（Restaurant・FoodEstablishment とその仲間）（@graph の中も探す）
const LD_TYPES = /Article|BlogPosting|Recipe|Restaurant|FoodEstablishment|CafeOrCoffeeShop|BarOrPub|Bakery|Brewery|Winery|Distillery|IceCreamShop/;
export function readArticleLd(html) {
  for (const m of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let json;
    try { json = JSON.parse(m[1]); } catch { continue; }
    const nodes = [json].flat().flatMap((n) => n?.['@graph'] ?? [n]);
    const article = nodes.find((n) => LD_TYPES.test([n?.['@type']].flat().join(' ')));
    if (article) return article;
  }
  return null;
}

const text1 = (v) => (typeof v === 'string' ? decodeEntities(v).trim() : '');
// レシピの題と本文の、サイトの決まり文句を外す（2026-10-31 に実際のページで確かめた形）
function cleanRecipe(item, site, fromOg) {
  // og:title から取ったとき: 「<題> by <作者>」（クックパッド）、「<題> レシピ・作り方 by <作者> - 楽天レシピ」、「<題> 作り方・レシピ | クラシル」、「<題>のレシピ | デリッシュキッチン」。
  // JSON-LD の name の題（「Pasta by the sea」のような題もある）は、作者や決まり文句を外さない
  if (fromOg) {
    item.title = item.title.replace(/\s*[|｜-]\s*(?:デリッシュキッチン|クラシル|楽天レシピ)$/, '');
    const by = item.title.match(/^(.+?) by (.+)$/);
    if (by) { item.title = by[1]; if (!item.author.name) item.author.name = by[2].trim(); }
    item.title = item.title.replace(/\s*(?:レシピ・作り方|作り方・レシピ)$/, '');
  }
  if (site === 'delish') item.title = item.title.replace(/のレシピ$/, '');
  item.text = item.text
    .replace(/^楽天が運営する楽天レシピ。ユーザーさんが投稿した「[^」\n]*」のレシピ・作り方ページです。/, '')
    .replace(/詳細な材料や調理時間[\s\S]*$/, '')
    .replace(/^「[^」\n]*」の作り方(?:を[^。\n]*紹介しています)?。/, '')
    .trim();
}

export function extractArticle(html, parsed) {
  const meta = readMeta(html);
  const ld = readArticleLd(html) ?? {};
  const recipe = RECIPE_SITES.includes(parsed.site);
  const shop = SHOP_SITES.includes(parsed.site);
  const author = [ld.author].flat()[0];
  // レシピ・お店は name が先（デリッシュキッチン・クラシルの Recipe の headline は「「<題>」をレシピ動画で！」のような宣伝の文）
  const title = ((recipe || shop) && text1(ld.name)) || (typeof ld.headline === 'string' && ld.headline) || meta['og:title'] || '';
  if (!title) return null;
  const published = Date.parse(ld.datePublished ?? meta['article:published_time'] ?? '');
  // pixiv の作品のページの og:image は、作品の絵（embed.pixiv.net）のことも、pixiv のロゴ（s.pximg.net/www/images/）のこともある。ロゴは使わない（作品の絵は fetchMeta が ajax から取る）
  // og:image が https でなければ（ぐるなびは http）、JSON-LD の image の最初の https のものを使う
  const ldImage = [ld.image].flat().map((v) => (typeof v === 'string' ? v : v?.url)).find((v) => /^https:\/\//.test(v ?? '')) ?? '';
  const og = /^https:\/\//.test(meta['og:image'] ?? '') ? meta['og:image'] : ldImage;
  const image = /^https:\/\/s\.pximg\.net\/www\/images\//.test(og) ? '' : og;
  // Instagram は og:title と og:description の両方にキャプションが入る。description の「… - <ID> on <月 日, 年>: "<キャプション>".」が読めれば、
  // 本文だけにし、ID と投稿日も取る。名前は og:title の「<名前> on Instagram」
  const insta = parsed.site === 'instagram' && (meta['og:description'] ?? '').match(/^[^"]*?([A-Za-z0-9_.]{1,30}) on ([A-Z][a-z]+ \d{1,2}, \d{4}): "([\s\S]*)"\.?\s*$/);
  const date = insta ? Date.parse(`${insta[2]} UTC`) : published;
  const handle = (insta && insta[1]) || parsed.handle || '';
  const instaName = insta && (meta['og:title'] ?? '').match(/^(.+?) on Instagram/)?.[1];
  const item = {
    author: { name: instaName || (typeof author?.name === 'string' && author.name ? author.name : handle), handle },
    postedAt: Number.isNaN(date) ? null : new Date(date).toISOString(),
    title: insta ? '' : title.trim(),
    text: (insta ? insta[3] : meta['og:description'] ?? meta.description ?? '').replace(/\r\n?/g, '\n').trim().slice(0, TEXT_MAX),
    photos: /^https:\/\//.test(image) ? [{ url: image }] : [],
    videos: [],
  };
  // GitHub の og:title は「GitHub - owner/repo: 説明」。題を owner/repo、本文を説明にする（og:description は説明の後ろに決まり文句が付く）
  if (parsed.site === 'github') {
    const g = item.title.match(/^GitHub - ([^\s:]+\/[^\s:]+)(?::\s*([\s\S]*))?$/);
    if (g) Object.assign(item, { title: g[1], text: (g[2] ?? '').trim().slice(0, TEXT_MAX) });
  }
  // unityroom・ふりーむ！は、作者をページの作者の欄から取る（unityroom は画像の alt と /users/<ID>、ふりーむ！は /brand/<数字> のリンクの文字）。
  // ふりーむ！の題の後ろと本文の前の決まり文句は外す
  if (parsed.site === 'unityroom') {
    const by = html.match(/class="game_author"[\s\S]{0,400}?href="\/users\/([A-Za-z0-9_-]{1,64})"[\s\S]{0,400}?\balt="([^"]{1,100})"/);
    if (by) item.author = { name: decodeEntities(by[2]).trim(), handle: by[1] };
  }
  if (parsed.site === 'freem') {
    const by = html.match(/class="game-creator-name[\s\S]{0,800}?<a\b[^>]*href="\/brand\/\d+"[^>]*>([^<]{1,100})<\/a>/);
    if (by) item.author = { name: decodeEntities(by[1]).trim(), handle: '' };
    item.title = item.title.replace(/：無料ゲーム配信中！\s*\[ふりーむ！\]$/, '');
    item.text = item.text.replace(/^「[^」\n]*」：/, '');
  }
  if (recipe) cleanRecipe(item, parsed.site, !text1(ld.name));
  // お店: 作者は空。本文は JSON-LD の料理の種類・住所と紹介文。どれもなければ og:description の頭の【…】を外したもの
  if (shop) {
    item.author = { name: '', handle: '' };
    const a = ld.address && typeof ld.address === 'object' ? ld.address : {};
    const place = [text1(ld.servesCuisine), [a.addressRegion, a.addressLocality, a.streetAddress].map(text1).join('')].filter(Boolean).join(' · ');
    const lines = [place, text1(ld.description)].filter(Boolean);
    item.text = (lines.length ? lines.join('\n') : item.text.replace(/^【[^】\n]*】/, '')).slice(0, TEXT_MAX);
    item.title = item.title.replace(/^楽天ぐるなび - /, '');
  }
  return item;
}

// pixiv の作品の絵の URL（ajax の urls.regular）。i.pximg.net は pixiv の Referer がないと読めないので、カードは /api/thumb を通して出す
async function pixivImage(parsed, fetchImpl, signal) {
  try {
    const res = await fetchImpl(`https://www.pixiv.net/ajax/illust/${parsed.key}`, { credentials: 'omit', signal });
    const url = res.ok ? (await res.json())?.body?.urls?.regular : null;
    return typeof url === 'string' && /^https:\/\/i\.pximg\.net\//.test(url) ? [{ url }] : [];
  } catch {
    return [];
  }
}

// 保存する項目（url を含む）を返す。取れなければ null
// timeout ミリ秒で打ち切り、取れなかったとき（null）と同じに扱う（記事のページが重いと、いつまでも待ってしまうため）
export async function fetchMeta(parsed, fetchImpl = fetch, timeout = 8_000) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeout);
  try {
    if (parsed.site === 'x') {
      const res = await fetchImpl(`https://api.fxtwitter.com/${parsed.handle ?? 'i'}/status/${parsed.key}`, { signal: abort.signal });
      const item = res.ok ? extractTweet(await res.json()) : null;
      return item && { ...item, url: `https://x.com/${item.author.handle}/status/${parsed.key}` };
    }
    // Google マップ: 題は URL の場所の名前。ページは名前も住所も持たない（og:title は「Google Maps」）ので読まない。
    // 短い URL は転送の先（長い URL）を得て名前を取る。転送の先が場所の URL でなければ取れなかったものとする。画像は保存しない
    if (parsed.site === 'gmap') {
      let place = parsed;
      if (!place.name) {
        const res = await fetchImpl(parsed.url, { credentials: 'omit', signal: abort.signal });
        place = parseUrl(res.url ?? '');
        if (place?.site !== 'gmap' || !place.name) return null;
      }
      return { author: { name: '', handle: '' }, postedAt: null, title: place.name, text: '', photos: [], videos: [], url: parsed.url };
    }
    // Instagram は Accept-Language で OGP の形を変え、extractArticle は英語の形だけを読む。拡張はブラウザーの言語（日本語）で取るので英語に固定する（定義 2026-10-25-010 のレビュー）
    const headers = parsed.site === 'instagram' ? { 'accept-language': 'en' } : {};
    const res = await fetchImpl(parsed.url, { credentials: 'omit', signal: abort.signal, headers });
    const item = res.ok ? extractArticle(await res.text(), parsed) : null;
    if (item && parsed.site === 'pixiv' && !item.photos.length) item.photos = await pixivImage(parsed, fetchImpl, abort.signal);
    return item && { ...item, url: parsed.url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
