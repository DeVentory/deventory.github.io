/* 책상 화면: 글 카드, 필터·검색, 읽기 화면, 테마 토글 */
(() => {
  const { CATS, ICONS, esc, inline, markdown, Theme } = window.Lib;
  const POSTS = window.POSTS || [];
  const $ = id => document.getElementById(id);
  const desk = $("desk"), grid = $("grid"), chipsEl = $("chips"), countEl = $("count");
  const qEl = $("q"), themeBtn = $("themeBtn"), termBtn = $("termBtn");
  const reader = $("reader"), paperBody = $("paperBody"), readerClose = $("readerClose");
  const BASE_TITLE = document.title;

  const state = { cat: "all", q: "" };
  let openedFromApp = false;
  let lastFocus = null;

  // 글마다 고정된 기울기 (새로고침해도 안 바뀜)
  const angleOf = slug => {
    let h = 0;
    for (const c of slug) h = (h * 31 + c.charCodeAt(0)) | 0;
    return ((Math.abs(h) % 45) / 10 - 2.2).toFixed(1);
  };

  // ---- 책상 ----
  function renderChips() {
    const all = [["all", "🗂️ 전체", POSTS.length]];
    Object.keys(CATS).forEach(k => all.push([k, `${ICONS[k]} ${CATS[k]}`, POSTS.filter(p => p.category === k).length]));
    chipsEl.innerHTML = all.map(([k, label, n]) =>
      `<button type="button" class="chip" data-cat="${esc(k)}" aria-pressed="${state.cat === k}">${esc(label)} <span class="chip__n">${n}</span></button>`).join("");
  }
  function matches(p) {
    if (state.cat !== "all" && p.category !== state.cat) return false;
    const q = state.q.trim().toLowerCase();
    return !q || (p.title + " " + p.tags.join(" ")).toLowerCase().includes(q);
  }
  function renderGrid() {
    const list = POSTS.filter(matches);
    grid.innerHTML = list.map(p => `
      <a class="note note--${esc(p.category)}${p.pinned ? " is-pinned" : ""}" href="#${esc(p.slug)}" style="--r:${angleOf(p.slug)}deg">
        <span class="note__tape" aria-hidden="true"></span>
        ${p.pinned ? `<span class="note__pin" role="img" aria-label="고정된 글">📌</span>` : ""}
        <span class="note__kind">${ICONS[p.category] || "📄"} ${esc(CATS[p.category] || p.category)}${p.source === "velog" ? " · Velog" : ""}</span>
        <span class="note__title">${esc(p.title)}</span>
        <span class="note__meta"><time datetime="${esc(p.date)}">${esc(p.date)}</time>${p.tags.length ? " · " + p.tags.map(t => "#" + esc(t)).join(" ") : ""}</span>
      </a>`).join("");
    countEl.textContent = list.length ? `${list.length}개의 글` : "";
    if (!list.length) grid.innerHTML = `<p class="empty">일치하는 글이 없어요 🍃</p>`;
  }
  chipsEl.addEventListener("click", e => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    state.cat = b.dataset.cat;
    renderChips();
    renderGrid();
    chipsEl.querySelector(`[data-cat="${state.cat}"]`).focus({ preventScroll: true });
  });
  qEl.addEventListener("input", () => { state.q = qEl.value; renderGrid(); });
  grid.addEventListener("click", e => {
    if (e.target.closest(".note") && !(e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button)) openedFromApp = true;
  });

  // ---- 읽기 화면 ----
  const isReaderOpen = () => !reader.hidden;
  function showReader(p) {
    if (!isReaderOpen()) lastFocus = document.activeElement;
    paperBody.innerHTML =
      `<p class="paper__meta">${ICONS[p.category] || ""} ${esc(CATS[p.category] || p.category)} · ${esc(p.date)}${p.tags.length ? " · " + p.tags.map(t => "#" + esc(t)).join(" ") : ""}</p>` +
      `<h1 id="paperTitle">${inline(p.title)}</h1>` + markdown(p.body) +
      (p.source === "velog" && /^https:\/\/velog\.io\//.test(p.url || "")
        ? `<p class="paper__origin">📝 <a href="${esc(p.url)}" target="_blank" rel="noopener noreferrer">Velog에서 원문 보기 ↗</a></p>` : "");
    reader.hidden = false;
    reader.scrollTop = 0;
    document.documentElement.classList.add("reader-open");
    document.title = `${p.title} — DeVentory`;
    updateInert();
    readerClose.focus({ preventScroll: true });
    document.dispatchEvent(new Event("readerchange"));
  }
  function hideReader() {
    if (!isReaderOpen()) return;
    reader.hidden = true;
    document.documentElement.classList.remove("reader-open");
    document.title = BASE_TITLE;
    openedFromApp = false;
    updateInert();
    if (lastFocus && document.contains(lastFocus) && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
    document.dispatchEvent(new Event("readerchange"));
  }
  function closeReader() {
    if (openedFromApp) history.back();                         // 해시 변경 → sync() 가 닫아 준다
    else { history.replaceState(null, "", location.pathname + location.search); sync(); }
  }
  function sync() {
    let slug = "";
    try { slug = decodeURIComponent(location.hash.slice(1)); } catch (e) {}
    const p = POSTS.find(x => x.slug === slug);
    if (p) showReader(p); else hideReader();
  }
  window.addEventListener("hashchange", sync);
  readerClose.addEventListener("click", closeReader);
  reader.addEventListener("click", e => { if (e.target === reader || e.target.classList.contains("reader__scroll")) closeReader(); });

  // 화면 뒤쪽은 조작 못 하게 막는다 (키보드 포커스 포함)
  function updateInert() {
    const t = window.Terminal.isOpen(), r = isReaderOpen();
    desk.inert = r || t;
    reader.inert = t;
  }
  document.addEventListener("terminalchange", updateInert);

  // ---- 키보드 ----
  const editable = el => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  document.addEventListener("keydown", e => {
    if (document.querySelector("dialog[open]")) return;          // 편집·로그인 창이 열려 있으면 그쪽이 처리
    if (e.key === "Escape" && !window.Terminal.isOpen() && isReaderOpen()) { e.preventDefault(); closeReader(); return; }
    if ((e.key === "`" || e.code === "Backquote") && !editable(e.target) && !(e.ctrlKey || e.metaKey || e.altKey)) {
      e.preventDefault();
      window.Terminal.toggle();
    }
  });
  termBtn.addEventListener("click", () => window.Terminal.open());

  // ---- 테마 ----
  function paintThemeBtn() {
    const dark = Theme.current() === "dark";
    themeBtn.setAttribute("aria-checked", String(dark));
  }
  themeBtn.addEventListener("click", () => Theme.set(Theme.current() === "dark" ? "light" : "dark"));
  document.addEventListener("themechange", paintThemeBtn);
  if (window.matchMedia) {
    matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
      const s = Theme.stored();
      if (s !== "light" && s !== "dark") Theme.set("auto");
    });
  }

  // 주인 전용 기능(owner.js)이 목록을 다시 그릴 때 쓴다
  window.Desk = { refresh() { renderChips(); renderGrid(); sync(); }, sync };

  // ---- 시작 ----
  renderChips();
  renderGrid();
  paintThemeBtn();
  sync();
})();
