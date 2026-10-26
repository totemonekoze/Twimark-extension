// X・note・Qiita の共有メニューと共有の並びに「Twimarkに追加」を足す。押すと background.js が追加の画面を開く。
// 投稿・記事のブックマーク（にあたる）ボタンの隣にも、Twimark のアイコンを足す（下の「投稿・記事のアイコン」）。
// 見た目を合わせるため、サイトの既存の項目を複製してラベルとアイコンだけを変える。見つからないときは何も足さない。
// ほかの拡張と取り合わないよう、複製の元はメニューの最初の項目（サイトのもの。拡張は後ろに足す）にし、
// 複製からは data-* の印（サイトの状態やほかの拡張の印）を外して、自分の印 data-twimark-item だけを付ける
(() => {
  const LABEL = 'Twimarkに追加';
  const MARK = 'data-twimark-item';
  // 複製に残す data-*（サイトの見た目に使うもの）
  const KEPT_DATA = ['data-slot'];
  const SVG = 'http://www.w3.org/2000/svg';
  const X_STATUS = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d{1,25})/;
  const NOTE_PAGE = /^\/([A-Za-z0-9_-]{1,64})\/n\/(n[0-9a-z]{6,24})(?:\/|$)/;
  const QIITA_PAGE = /^\/([A-Za-z0-9_-]{1,64})\/items\/([0-9a-f]{20})(?:\/|$)/;
  const DROPPED = ['id', 'aria-label', 'aria-labelledby', 'aria-describedby', 'aria-controls', 'aria-expanded', 'aria-haspopup', 'title', 'target', 'rel', 'data-testid', 'data-highlighted'];

  function add(url) {
    try {
      chrome.runtime.sendMessage({ type: 'twimark-add', url }).catch(() => {});
    } catch {
      // 拡張を入れ直した直後は古いスクリプトから送れない。ページを読み込み直せば直る
      alert('Twimark: ページを再読み込みしてから、もう一度押してください。');
    }
  }

  // しおりの形のアイコン。元のアイコンが svg なら大きさのクラスを引き継ぐ
  function icon(old) {
    const svg = document.createElementNS(SVG, 'svg');
    const rect = old.getBoundingClientRect();
    if (old instanceof SVGElement) for (const a of ['class', 'width', 'height']) if (old.getAttribute(a)) svg.setAttribute(a, old.getAttribute(a));
    if (!svg.getAttribute('width')) {
      svg.setAttribute('width', rect.width ? String(rect.width) : '20');
      svg.setAttribute('height', rect.height ? String(rect.height) : '20');
    }
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'currentColor');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', 'M6 2.5h12a1 1 0 0 1 1 1V22l-7-4.6L5 22V3.5a1 1 0 0 1 1-1z');
    svg.append(path);
    return svg;
  }

  function makeItem(template, pageUrl, after) {
    const item = template.cloneNode(true);
    for (const el of [item, ...item.querySelectorAll('*')]) {
      const tooltip = el.hasAttribute('data-tooltip');
      DROPPED.forEach((a) => el.removeAttribute(a));
      for (const { name } of [...el.attributes]) if (name.startsWith('data-') && !KEPT_DATA.includes(name)) el.removeAttribute(name);
      if (tooltip) el.setAttribute('data-tooltip', LABEL);
      if (el.tagName === 'A') el.setAttribute('href', '#');
    }
    // svg か img があればそれを、なければ CSS で絵を出している <i>（note の共有の並び）を差し替える
    const glyph = item.querySelector('svg, img') ?? item.querySelector('i');
    if (glyph) glyph.replaceWith(icon(glyph));
    const leaf = [...item.querySelectorAll('*')].reverse().find((n) => !(n instanceof SVGElement) && n.children.length === 0 && n.textContent.trim());
    if (leaf) leaf.textContent = LABEL;
    item.setAttribute(MARK, '');
    const control = item.matches('a, button, [role="menuitem"]') ? item : item.querySelector('a, button, [role="menuitem"]') ?? item;
    control.setAttribute('aria-label', LABEL);
    control.setAttribute('title', LABEL);
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const url = pageUrl();
      if (url) add(url);
      after?.();
    }, true);
    return item;
  }

  // メニューを閉じる。X はフォーカスのある要素（共有ボタン）への Escape で閉じる。
  // note は Escape では閉じないので、まだ開いていれば共有ボタンをもう一度押す
  const closeMenu = (menu) => {
    const trigger = document.getElementById(menu.getAttribute('aria-labelledby') ?? '');
    for (const el of new Set([document.activeElement, trigger, menu])) {
      el?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
    }
    setTimeout(() => {
      if (menu.isConnected && trigger?.getAttribute('aria-expanded') === 'true') trigger.click();
    }, 50);
  };

  // 複製の元: メニューの中の、自分が足したものでない最初の項目
  const firstItem = (menu, selector) => [...menu.querySelectorAll(selector)].find((el) => !el.closest(`[${MARK}]`));

  // X: 共有ボタンで開いたメニュー。古い画面のメニューは aria-labelledby を持たないので、直前に押した共有ボタンを使う。
  // 共有ボタンは data-engagement-action="share" か、ラベルに「共有」「Share」を含むメニューのボタン（ログインした画面は「ポストを共有」「Share post」）
  let lastShare = null;
  const isShare = (el) => Boolean(el?.matches?.('button[data-engagement-action="share"]') || (el?.matches?.('[aria-haspopup="menu"]') && /共有|Share/i.test(el.getAttribute('aria-label') ?? '')));
  document.addEventListener('pointerdown', (e) => {
    const button = e.target.closest?.('[aria-haspopup="menu"]');
    if (isShare(button)) lastShare = { el: button, at: Date.now() };
  }, true);

  // 共有ボタンから祖先をたどり、最初に見つかるポストのリンク（そのポストの日時か返信のリンク）
  function tweetUrl(from) {
    for (let el = from; el && el !== document.body; el = el.parentElement) {
      for (const a of el.querySelectorAll('a[href*="/status/"]')) {
        const m = a.hostname === location.hostname && a.pathname.match(X_STATUS);
        if (m) return `https://x.com/${m[1]}/status/${m[2]}`;
      }
    }
    const m = location.pathname.match(X_STATUS);
    return m ? `https://x.com/${m[1]}/status/${m[2]}` : null;
  }

  function scanX() {
    for (const menu of document.querySelectorAll('[role="menu"]')) {
      if (menu.querySelector(`[${MARK}]`)) continue;
      const labelled = document.getElementById(menu.getAttribute('aria-labelledby') ?? '');
      const trigger = labelled ?? (lastShare && Date.now() - lastShare.at < 3000 ? lastShare.el : null);
      if (!isShare(trigger)) continue;
      const template = firstItem(menu, '[role="menuitem"]');
      const url = template && tweetUrl(trigger);
      // 元の項目の並びの末尾に足す（ほかの拡張が足した項目があっても、その後ろ）
      if (url) template.parentElement.append(makeItem(template, () => url, () => closeMenu(menu)));
    }
  }

  const pageUrl = (re, format) => () => {
    const m = location.pathname.match(re);
    return m ? format(m) : null;
  };
  const noteUrl = pageUrl(NOTE_PAGE, (m) => `https://note.com/${m[1]}/n/${m[2]}`);
  const qiitaUrl = pageUrl(QIITA_PAGE, (m) => `https://qiita.com/${m[1]}/items/${m[2]}`);

  // note: 記事の共有メニュー（先頭の「リンクをコピー」のグループの末尾）と、記事下の共有の並び
  function scanNote() {
    if (!noteUrl()) return;
    for (const menu of document.querySelectorAll('[role="menu"][id^="shareMenu"]')) {
      const template = firstItem(menu, 'li');
      if (!template || menu.querySelector(`[${MARK}]`)) continue;
      template.parentElement.append(makeItem(template, noteUrl, () => closeMenu(menu)));
    }
    for (const bar of document.querySelectorAll('.o-shareBooster__share')) {
      const template = bar.querySelector('button');
      if (template && !bar.querySelector(`[${MARK}]`)) bar.append(makeItem(template, noteUrl));
    }
    // 2026-10 の画面: 共有の並びは「Xでシェア」などのボタンをそれぞれ包んだ <div> の並び。末尾に足す
    for (const x of document.querySelectorAll('button[aria-label="Xでシェア"]')) {
      const wrapper = x.parentElement;
      const group = wrapper?.parentElement;
      if (!group || group.querySelector(`[${MARK}]`) || wrapper.closest('.o-shareBooster__share')) continue;
      group.append(makeItem(wrapper, noteUrl));
    }
  }

  // Qiita: 「Facebookでシェア」を含む共有の並び（左の縦の並びと記事下）。はてなブックマークの後ろに足す
  function scanQiita() {
    if (!qiitaUrl()) return;
    for (const facebook of document.querySelectorAll('button[aria-label="Facebookでシェア"]')) {
      const wrapper = facebook.parentElement;
      const group = wrapper?.parentElement;
      if (!group || group.querySelector(`[${MARK}]`)) continue;
      const last = [...group.children].find((c) => c.querySelector('a[href*="b.hatena.ne.jp"]')) ?? wrapper;
      last.after(makeItem(last, qiitaUrl));
    }
  }

  // ---- 投稿・記事のアイコン ----
  // サイトのブックマーク（にあたる）ボタンの隣に、Twimark のアイコン（T を入れた角丸の四角）を置く。隣の項目を複製して、大きさと押せる範囲を合わせる。
  // 保存済みは塗りつぶす。押すと、その場に小さな画面（Shadow DOM）を出す。問い合わせと追加は background.js
  const ICON = 'data-twimark-icon';
  const ADD_LABEL = 'Twimark に追加';
  const SAVED_LABEL = 'Twimark に保存済み';
  const ask = (message) => {
    try {
      return chrome.runtime.sendMessage(message).catch(() => null);
    } catch {
      return Promise.resolve(null);
    }
  };

  // ページのボタンの絵（design/make-mark.jsx が Illustrator で描いて書き出した icons/mark.svg・mark-saved.svg の座標）。
  // サイトのしおりと見分けるため、Twimark の T を角丸の四角に入れる。未保存は黄緑の輪郭と T、保存済みは黄緑の地に白の T（色はサイトに合わせず固定）
  const T_POINTS = '7.5 7 16.5 7 16.5 9.6 13.3 9.6 13.3 17 10.7 17 10.7 9.6 7.5 9.6 7.5 7';
  const node = (tag, attrs, ...kids) => {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    n.append(...kids);
    return n;
  };
  // 2つの形を持つ svg。paint が data-saved で出す方を替える。大きさは隣のボタンの絵（old）に合わせる
  function mark(old) {
    const svg = icon(old);
    svg.replaceChildren(
      node('g', { 'data-part': 'outline' },
        node('rect', { x: '3', y: '3', width: '18', height: '18', rx: '4.5', fill: 'none', stroke: '#76A040', 'stroke-width': '2' }),
        node('polygon', { points: T_POINTS, fill: '#76A040', stroke: 'none' })),
      node('g', { 'data-part': 'saved', display: 'none' },
        node('rect', { x: '2', y: '2', width: '20', height: '20', rx: '5.5', fill: '#8DB255', stroke: 'none' }),
        node('polygon', { points: T_POINTS, fill: '#FFFFFF', stroke: 'none' })),
    );
    svg.removeAttribute('fill');
    return svg;
  }
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

  // アイコンの形。未保存は輪郭、保存済みは塗り。未保存から保存済みに替わるときは小さく弾む
  function paint(item, saved) {
    const svg = item.querySelector('svg[data-twimark-glyph]');
    if (svg) {
      const was = svg.dataset.saved === '1';
      svg.dataset.saved = saved ? '1' : '';
      svg.querySelector('[data-part="outline"]').setAttribute('display', saved ? 'none' : 'inline');
      svg.querySelector('[data-part="saved"]').setAttribute('display', saved ? 'inline' : 'none');
      if (saved && !was && item.isConnected && !reduceMotion.matches) svg.animate({ scale: [0.92, 1.08, 1] }, { duration: 300, easing: 'ease-out' });
    }
    const control = item.matches('button, a') ? item : item.querySelector('button, a') ?? item;
    const label = saved ? SAVED_LABEL : ADD_LABEL;
    control.setAttribute('aria-label', label);
    control.setAttribute('title', label);
    item.dataset.twimarkSaved = saved ? '1' : '';
  }

  // 隣の項目（anchor）を複製してアイコンにする。数（いいねの数など）の文字は消す
  function makeIcon(anchor, url) {
    const item = anchor.cloneNode(true);
    for (const el of [item, ...item.querySelectorAll('*')]) {
      DROPPED.forEach((a) => el.removeAttribute(a));
      for (const { name } of [...el.attributes]) if (name.startsWith('data-') && !KEPT_DATA.includes(name)) el.removeAttribute(name);
      for (const a of ['aria-pressed', 'aria-haspopup', 'aria-expanded', 'href']) el.removeAttribute(a);
      // サイトの計測の印（pixiv の gtm-main-bookmark など）は外す（押したときにサイトのブックマークとして数えられないように）
      for (const c of [...el.classList]) if (/^gtm-/.test(c)) el.classList.remove(c);
    }
    // 押せるものは最初の1つだけ残す（note の「スキ」の包みは、スキのボタンと数のボタンの2つを持つ）
    const control = item.matches('button, a') ? item : item.querySelector('button, a');
    for (const b of item.querySelectorAll('button, a')) if (b !== control && !b.contains(control)) b.remove();
    const old = item.querySelector('svg');
    const svg = mark(old ?? item);
    svg.setAttribute('data-twimark-glyph', '');
    if (old) old.replaceWith(svg);
    else (item.querySelector('button, a') ?? item).prepend(svg);
    for (const n of item.querySelectorAll('*')) if (!(n instanceof SVGElement) && n.children.length === 0 && n.textContent.trim()) n.textContent = '';
    item.setAttribute(ICON, '');
    // 同じ投稿・記事のアイコンは1ページに複数ある（note は記事の上・下・帯）。追加したら全部を保存済みにするための印
    item.dataset.twimarkUrl = url;
    paint(item, false);
    item.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPanel(item, url);
    }, true);
    ask({ type: 'twimark-state', url }).then((s) => { if (s?.linked) paint(item, Boolean(s.saved)); });
    return item;
  }

  // 小さな画面。サイトの CSS の影響を受けないよう Shadow DOM に作る。外側を押すか Escape で閉じる
  let panel = null;
  const closePanel = () => { panel?.remove(); panel = null; };
  document.addEventListener('pointerdown', (e) => { if (panel && !e.composedPath().includes(panel)) closePanel(); }, true);
  document.addEventListener('keydown', (e) => { if (panel && e.key === 'Escape') closePanel(); }, true);
  // 画面に固定して出すので、ページを送ったらアイコンから離れないよう閉じる（小さな画面の中の送りでは閉じない）
  document.addEventListener('scroll', (e) => { if (panel && !e.composedPath().includes(panel)) closePanel(); }, { capture: true, passive: true });
  const PANEL_CSS = `
    :host { all: initial; position: fixed; z-index: 2147483647; width: 280px; font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; color-scheme: light dark; }
    .box { position: relative; display: grid; gap: 10px; padding: 14px; border-radius: 12px; background: Canvas; color: CanvasText; box-shadow: 0 10px 30px rgb(0 0 0 / .22), 0 0 0 .5px rgb(127 127 127 / .3); animation: pop .22s cubic-bezier(.34, 1.56, .64, 1); }
    @keyframes pop { from { opacity: 0; transform: translateY(-4px) scale(.96); } }
    @media (prefers-reduced-motion: reduce) { .box { animation: none; } }
    h2 { margin: 0 24px 0 0; font-size: 15px; }
    p { margin: 0; }
    .muted { opacity: .7; font-size: 13px; }
    .ok { color: var(--accent); font-weight: 600; }
    .err { color: #D70015; font-size: 13px; }
    select, textarea { width: 100%; box-sizing: border-box; padding: 7px 8px; border: 1px solid rgb(127 127 127 / .4); border-radius: 8px; font: inherit; background: Field; color: FieldText; }
    textarea { resize: vertical; min-height: 70px; }
    .row { display: flex; justify-content: flex-end; gap: 8px; }
    button { padding: 7px 14px; border: 0; border-radius: 8px; font: inherit; font-weight: 600; cursor: pointer; background: rgb(127 127 127 / .16); color: inherit; }
    button.primary { background: var(--accent); color: var(--on); }
    button:disabled { opacity: .5; cursor: default; }
    .x { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; padding: 0; border-radius: 50%; background: none; font-size: 18px; line-height: 1; }
  `;
  const el = (tag, props = {}, ...kids) => {
    const n = Object.assign(document.createElement(tag), props);
    n.append(...kids);
    return n;
  };

  async function openPanel(item, url) {
    closePanel();
    const frame = document.createElement('div');
    frame.setAttribute(ICON, 'panel');
    const root = frame.attachShadow({ mode: 'closed' });
    const box = el('div', { className: 'box' });
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-label', 'Twimark');
    const x = el('button', { className: 'x', type: 'button', textContent: '×', title: '閉じる' });
    x.setAttribute('aria-label', '閉じる');
    x.addEventListener('click', closePanel);
    root.append(el('style', { textContent: PANEL_CSS }), box);
    const r = item.getBoundingClientRect();
    frame.style.top = `${Math.min(r.bottom + 6, innerHeight - 220)}px`;
    frame.style.left = `${Math.max(8, Math.min(r.left + r.width / 2 - 140, innerWidth - 288))}px`;
    document.body.append(frame);
    panel = frame;
    const show = (...kids) => box.replaceChildren(x, el('h2', { textContent: 'Twimark' }), ...kids);
    show(el('p', { className: 'muted', textContent: '読み込み中…' }));

    const s = await ask({ type: 'twimark-state', url });
    if (panel !== frame) return;
    if (!s || s.error) { show(el('p', { className: 'err', textContent: s?.error ?? 'ページを再読み込みしてから、もう一度押してください。' })); return; }
    if (!s.linked) {
      const link = el('button', { className: 'primary', type: 'button', textContent: 'ログインして連携' });
      link.addEventListener('click', () => { ask({ type: 'twimark-link' }); closePanel(); });
      frame.style.setProperty('--accent', '#8DB255');
      frame.style.setProperty('--on', '#000000');
      show(el('p', { textContent: 'Twimark にログインして連携してください。' }), el('div', { className: 'row' }, link));
      return;
    }
    frame.style.setProperty('--accent', s.accent);
    frame.style.setProperty('--on', onColor(s.accent));
    paint(item, Boolean(s.saved));
    if (s.saved) {
      const open = el('button', { className: 'primary', type: 'button', textContent: '一覧で開く' });
      open.addEventListener('click', () => { ask({ type: 'twimark-open', ...s.saved }); closePanel(); });
      show(el('p', { className: 'ok', textContent: `保存済み（${s.saved.sub ? `${s.saved.category} › ${s.saved.sub}` : s.saved.category}）` }), el('div', { className: 'row' }, open));
      return;
    }
    // カテゴリごとの <optgroup> に、カテゴリそのものとサブカテゴリ。値は [カテゴリ, サブカテゴリ] の JSON（ポップアップと同じ）
    const select = el('select');
    select.setAttribute('aria-label', 'カテゴリ');
    const option = (c, sub, label) => el('option', { value: JSON.stringify([c, sub]), textContent: label });
    select.append(...s.categories.map((c) => el('optgroup', { label: c }, option(c, null, c), ...(s.subcategories[c] ?? []).map((sub) => option(c, sub, `${c} › ${sub}`)))));
    if ([...select.options].some((o) => o.value === s.lastPlace)) select.value = s.lastPlace;
    const text = el('textarea', { hidden: true, placeholder: '本文を取得できませんでした。貼り付けてください', maxLength: 5000 });
    const msg = el('p', { className: 'err' });
    const addBtn = el('button', { className: 'primary', type: 'button', textContent: '追加' });
    addBtn.addEventListener('click', async () => {
      addBtn.disabled = true;
      msg.textContent = '';
      const res = await ask({ type: 'twimark-save', url, place: JSON.parse(select.value), text: text.value });
      if (panel !== frame) return;
      addBtn.disabled = false;
      if (res?.needText) { text.hidden = false; text.focus(); msg.textContent = '本文を貼り付けると追加できます。'; return; }
      if (!res?.ok) { msg.textContent = res?.error ?? '追加できませんでした。'; return; }
      for (const other of document.querySelectorAll(`[${ICON}][data-twimark-url]`)) if (other.dataset.twimarkUrl === url) paint(other, true);
      show(el('p', { className: 'ok', textContent: res.already ? 'もう保存されています' : '追加しました' }));
      setTimeout(() => { if (panel === frame) closePanel(); }, 1000);
    });
    show(select, text, msg, el('div', { className: 'row' }, addBtn));
    select.focus();
  }
  // アクセントの地の上の文字。白と黒の読みやすいほう（shared/theme.js の accentSet と同じ決め方）
  function onColor(hex) {
    const lum = (v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    const [r, g, b] = [1, 3, 5].map((i) => lum(parseInt(hex.slice(i, i + 2), 16)));
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return (1.05) / (l + 0.05) >= (l + 0.05) / 0.05 ? '#FFFFFF' : '#000000';
  }

  // 置く。anchor の直後（before があればその直前）。重ねて置かない
  function place(anchor, url, before = null) {
    if (!anchor?.parentElement || !url) return;
    const next = before ?? anchor.nextElementSibling;
    if (next?.hasAttribute?.(ICON) || anchor.parentElement.querySelector(`:scope > [${ICON}]`)) return;
    const item = makeIcon(anchor, url);
    if (before) before.before(item);
    else anchor.after(item);
  }

  // X: ブックマークのボタン。新しい画面は data-engagement-action="bookmark" の包み、前の画面は data-testid="bookmark" のボタン（その親が並びの1つ）。
  // 新しい画面は包みがもう1段の <div> に入っている（その中に足すと下に積まれる）ので、親の子が1つならその親の隣に置く
  function iconsX() {
    const anchors = [...document.querySelectorAll('[data-engagement-action="bookmark"]'),
      ...[...document.querySelectorAll('[data-testid="bookmark"], [data-testid="removeBookmark"]')].map((b) => b.parentElement)];
    for (const a of anchors) {
      if (a.closest(`[${ICON}]`)) continue;
      const up = a.parentElement?.children.length === 1 ? a.parentElement : a;
      place(up, tweetUrl(a));
    }
  }
  // note: 操作の並びの「スキ」の数のボタン（aria-label に「スキをつけたユーザーを見る」）の包み。並びに共有のボタン（aria-haspopup="true"）があればその左
  function iconsNote() {
    const url = noteUrl();
    if (!url) return;
    for (const count of document.querySelectorAll('button[aria-label*="スキをつけたユーザーを見る"]')) {
      const group = count.closest('div.flex.items-center.justify-center');
      const row = group?.parentElement;
      if (!row || row.querySelector(`:scope > [${ICON}]`)) continue;
      const share = [...row.children].find((c) => c !== group && c.querySelector('button[aria-haspopup="true"]'));
      place(group, url, share ?? null);
    }
  }
  // Qiita: 「ストックする」（ストック済みは「ストックを解除」など）のボタンの包み
  function iconsQiita() {
    const url = qiitaUrl();
    if (!url) return;
    for (const b of document.querySelectorAll('button[aria-label^="ストック"]')) if (!b.closest(`[${ICON}]`)) place(b.parentElement, url);
  }

  // Instagram: 投稿の操作の並びの「保存する」（保存済みは「Remove」など）の包みの左。一覧の中の投稿は、祖先にある投稿のリンクから URL を取る
  const IG_POST = /^\/(?:[A-Za-z0-9_.]{1,30}\/)?(?:p|reel)\/([A-Za-z0-9_-]{5,40})\/?/;
  function instagramUrl(from) {
    for (let el = from; el && el !== document.body; el = el.parentElement) {
      for (const a of el.querySelectorAll('a[href*="/p/"], a[href*="/reel/"]')) {
        const m = a.hostname.endsWith('instagram.com') && a.pathname.match(IG_POST);
        if (m) return `https://www.instagram.com/p/${m[1]}/`;
      }
    }
    const m = location.pathname.match(IG_POST);
    return m ? `https://www.instagram.com/p/${m[1]}/` : null;
  }
  // 操作の並びは2列のグリッド（左にいいね・コメント・シェア、右に保存）で、3つ目を足すと次の段に落ちる。
  // そこで保存のボタンの包みの中、ボタンの直前に置き、包みを横並びにする（content.css の [data-twimark-row]）
  function iconsInstagram() {
    for (const svg of document.querySelectorAll('svg[aria-label="保存する"], svg[aria-label="保存"], svg[aria-label="Save"], svg[aria-label="Remove"]')) {
      const button = svg.closest('[role="button"], button');
      const wrapper = button?.parentElement;
      if (!wrapper || button.closest(`[${ICON}]`) || wrapper.querySelector(`:scope > [${ICON}]`)) continue;
      wrapper.setAttribute('data-twimark-row', '');
      place(button, instagramUrl(wrapper), button);
    }
  }
  // pixiv: 作品のページのブックマーク（ハート、button.gtm-main-bookmark）の包みの右
  const PIXIV_PAGE = /^\/(?:[a-z]{2}\/)?artworks\/(\d{1,12})/;
  const pixivUrl = pageUrl(PIXIV_PAGE, (m) => `https://www.pixiv.net/artworks/${m[1]}`);
  function iconsPixiv() {
    const url = pixivUrl();
    if (!url) return;
    for (const b of document.querySelectorAll('button.gtm-main-bookmark')) {
      const wrapper = b.parentElement;
      if (b.closest(`[${ICON}]`) || !wrapper?.parentElement) continue;
      // 並びは row-reverse（右から並ぶ）なので、見た目で右に置くには DOM ではブックマークの前に入れる
      const reverse = getComputedStyle(wrapper.parentElement).flexDirection === 'row-reverse';
      place(wrapper, url, reverse ? wrapper : null);
    }
  }
  // BOOTH: 商品のページの「スキ」の右。関連商品の札（.item-card）の「スキ！」には足さない（ログインしていない表示には、商品そのものの「スキ」がない）
  const BOOTH_PAGE = /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?items\/(\d{1,12})/;
  const boothUrl = pageUrl(BOOTH_PAGE, (m) => `https://booth.pm/ja/items/${m[1]}`);
  function iconsBooth() {
    const url = boothUrl();
    if (!url) return;
    for (const b of document.querySelectorAll('button')) {
      if (!/スキ/.test(b.textContent) || b.closest('.item-card, .l-item-card-favorite') || b.closest(`[${ICON}]`)) continue;
      place(b.closest('.js-item-card-wish-list-button, [class*="wish-list"]') ?? b, url);
    }
  }

  const host = location.hostname;
  const SHARE = { 'qiita.com': scanQiita, 'note.com': scanNote };
  const ICONS = { 'qiita.com': iconsQiita, 'note.com': iconsNote, 'www.instagram.com': iconsInstagram, 'www.pixiv.net': iconsPixiv };
  const isX = /(^|\.)(x|twitter)\.com$/.test(host);
  // 共有メニューへの「Twimarkに追加」は X・note・Qiita だけ
  const scanShare = SHARE[host] ?? (isX ? scanX : () => {});
  const scanIcons = ICONS[host] ?? (/(^|\.)booth\.pm$/.test(host) ? iconsBooth : isX ? iconsX : () => {});
  const scan = () => { scanShare(); scanIcons(); };
  // 変化のたびには調べず、まとめて調べる（requestAnimationFrame は描画されていないタブで止まるので使わない）
  let timer = 0;
  new MutationObserver(() => {
    if (!timer) timer = setTimeout(() => { timer = 0; scan(); }, 80);
  }).observe(document.documentElement, { childList: true, subtree: true });
  scan();
})();
