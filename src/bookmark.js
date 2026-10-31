import { SIMILAR_REASONS, similarBookmarks, SITES } from './shared/store.js';
import { CYCLE, tones } from './shared/theme.js';

// 追加するブックマークを作る（ポップアップと、投稿・記事のアイコンの小さな画面（background.js）で同じもの）。
// item は fetchMeta で取れた中身（取れなければ null。そのときは pasted の本文を使う）。place は [カテゴリ, サブカテゴリ]。
// wants は { summary, translation }（要約見出しを作る・翻訳する。false の方は Twimark が作らない。ないときは ON）
export function bookmarkOf(parsed, item, [category, subcategory], pasted = '', note = '', wants = {}) {
  return {
    id: parsed.id,
    site: parsed.site,
    url: item?.url ?? parsed.url ?? `https://x.com/i/status/${parsed.key}`,
    author: item?.author ?? { name: parsed.handle ?? '', handle: parsed.handle ?? '' },
    postedAt: item?.postedAt ?? null,
    title: item?.title ?? '',
    text: item?.text ?? pasted,
    photos: item?.photos ?? [],
    videos: item?.videos ?? [],
    category,
    subcategory,
    note,
    wantSummary: wants.summary !== false,
    wantTranslation: wants.translation !== false,
  };
}

// 類似の投稿の確かめ（Twimark の定義 2026-10-31-009）。ポップアップと小さな画面に出す1行ずつの中身（表示に要る項目だけ）。
// b は追加しようとしているもの（id・site・url・author・title・text）。似ているものがなければ空
export function similarItems(data, b) {
  return similarBookmarks(data, b).map(({ bookmark: x, reason }) => {
    const tone = data.categoryColors?.[x.category] ?? (data.categories.includes(x.category) ? CYCLE[data.categories.indexOf(x.category) % CYCLE.length] : null);
    return {
      id: x.id,
      url: x.url,
      thumb: x.photos?.[0]?.url ?? x.videos?.[0]?.thumbnail ?? null,
      initial: (SITES[x.site] ?? x.site).slice(0, 1),
      label: x.title || String(x.text ?? '').split('\n').find((l) => l.trim()) || x.url,
      who: [x.author?.name, x.author?.handle && `@${x.author.handle}`, SITES[x.site]].filter(Boolean).join(' · '),
      place: x.category ? (x.subcategory ? `${x.category} › ${x.subcategory}` : x.category) : '未分類',
      color: tone ? (tone.startsWith('#') ? tone : tones[tone]?.[0]?.[0] ?? null) : null,
      day: x.savedAt ? new Date(x.savedAt).toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }) : '',
      reason: SIMILAR_REASONS[reason],
    };
  });
}
