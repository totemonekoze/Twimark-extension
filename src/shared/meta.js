// Twimark（アプリ）の src/shared/meta.js の写し。正本はアプリ側。アプリで変えたら写し直す（AGENTS.md）
// 追加できるURLの判定と、保存する項目の取得。X は fxtwitter、note・Qiita・Instagram・pixiv・BOOTH はページのHTMLの JSON-LD と OGP から取る。
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

// { site, id, url, handle } か null。url はクエリなどを除いた保存用の形
export function parseUrl(raw) {
  const url = typeof raw === 'string' ? raw.trim() : '';
  let m;
  if ((m = url.match(X_WEB))) return { site: 'x', id: `x:${m[1]}`, key: m[1], handle: null, url: null };
  if ((m = url.match(X_POST)) && m[1] !== 'i') return { site: 'x', id: `x:${m[2]}`, key: m[2], handle: m[1], url: `https://x.com/${m[1]}/status/${m[2]}` };
  if ((m = url.match(NOTE))) return { site: 'note', id: `note:${m[2]}`, key: m[2], handle: m[1], url: `https://note.com/${m[1]}/n/${m[2]}` };
  if ((m = url.match(QIITA))) return { site: 'qiita', id: `qiita:${m[2]}`, key: m[2], handle: m[1], url: `https://qiita.com/${m[1]}/items/${m[2]}` };
  if ((m = url.match(INSTAGRAM)) && !['p', 'reel'].includes(m[1])) return { site: 'instagram', id: `instagram:${m[2]}`, key: m[2], handle: m[1] ?? null, url: `https://www.instagram.com/p/${m[2]}/` };
  if ((m = url.match(PIXIV))) return { site: 'pixiv', id: `pixiv:${m[1]}`, key: m[1], handle: null, url: `https://www.pixiv.net/artworks/${m[1]}` };
  if ((m = url.match(BOOTH)) && m[1] !== 'www') return { site: 'booth', id: `booth:${m[2]}`, key: m[2], handle: m[1] ?? null, url: `https://booth.pm/ja/items/${m[2]}` };
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

// JSON-LD の Article / BlogPosting（@graph の中も探す）
export function readArticleLd(html) {
  for (const m of html.matchAll(/<script\b[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let json;
    try { json = JSON.parse(m[1]); } catch { continue; }
    const nodes = [json].flat().flatMap((n) => n?.['@graph'] ?? [n]);
    const article = nodes.find((n) => /Article|BlogPosting/.test([n?.['@type']].flat().join(' ')));
    if (article) return article;
  }
  return null;
}

export function extractArticle(html, parsed) {
  const meta = readMeta(html);
  const ld = readArticleLd(html) ?? {};
  const author = [ld.author].flat()[0];
  const title = (typeof ld.headline === 'string' && ld.headline) || meta['og:title'] || '';
  if (!title) return null;
  const published = Date.parse(ld.datePublished ?? meta['article:published_time'] ?? '');
  // pixiv の作品のページの og:image は、作品の絵（embed.pixiv.net）のことも、pixiv のロゴ（s.pximg.net/www/images/）のこともある。ロゴは使わない（作品の絵は fetchMeta が ajax から取る）
  const og = meta['og:image'] ?? '';
  const image = /^https:\/\/s\.pximg\.net\/www\/images\//.test(og) ? '' : og;
  // Instagram は og:title と og:description の両方にキャプションが入る。description の「… - <ID> on <月 日, 年>: "<キャプション>".」が読めれば、
  // 本文だけにし、ID と投稿日も取る。名前は og:title の「<名前> on Instagram」
  const insta = parsed.site === 'instagram' && (meta['og:description'] ?? '').match(/^[^"]*?([A-Za-z0-9_.]{1,30}) on ([A-Z][a-z]+ \d{1,2}, \d{4}): "([\s\S]*)"\.?\s*$/);
  const date = insta ? Date.parse(`${insta[2]} UTC`) : published;
  const handle = (insta && insta[1]) || parsed.handle || '';
  const instaName = insta && (meta['og:title'] ?? '').match(/^(.+?) on Instagram/)?.[1];
  return {
    author: { name: instaName || (typeof author?.name === 'string' && author.name ? author.name : handle), handle },
    postedAt: Number.isNaN(date) ? null : new Date(date).toISOString(),
    title: insta ? '' : title.trim(),
    text: (insta ? insta[3] : meta['og:description'] ?? meta.description ?? '').trim().slice(0, TEXT_MAX),
    photos: /^https:\/\//.test(image) ? [{ url: image }] : [],
    videos: [],
  };
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
    const res = await fetchImpl(parsed.url, { credentials: 'omit', signal: abort.signal });
    const item = res.ok ? extractArticle(await res.text(), parsed) : null;
    if (item && parsed.site === 'pixiv' && !item.photos.length) item.photos = await pixivImage(parsed, fetchImpl, abort.signal);
    return item && { ...item, url: parsed.url };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
