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
