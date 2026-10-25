// 追加するブックマークを作る（ポップアップと、投稿・記事のアイコンの小さな画面（background.js）で同じもの）。
// item は fetchMeta で取れた中身（取れなければ null。そのときは pasted の本文を使う）。place は [カテゴリ, サブカテゴリ]
export function bookmarkOf(parsed, item, [category, subcategory], pasted = '', note = '') {
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
  };
}
