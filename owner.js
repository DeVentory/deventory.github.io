/* 주인 전용 기능: 글쓰기·수정·고정·삭제.
 * 저장 = GitHub 저장소의 posts/*.md 를 API로 커밋. 토큰이 있어야만 저장된다. */
(() => {
  const { CATS, ICONS, esc, markdown } = window.Lib;
  const cfg = window.BLOG_CONFIG || {};
  if (!cfg.enableOwner || !cfg.owner || !cfg.repo) { const m = document.getElementById("manageBtn"); if (m) m.hidden = true; return; }
  const API = "https://api.github.com";
  const repoPath = `/repos/${cfg.owner}/${cfg.repo}`;
  const $ = id => document.getElementById(id);
  const KEY_TOKEN = "gh_token", KEY_DRAFT = "post_draft";

  let token = null;
  let authed = false;
  let editing = null;     // 수정 중이면 { slug, sha }

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };

  // ---- GitHub API ----
  async function gh(method, path, body) {
    const res = await fetch(API + path, {
      method,
      headers: Object.assign({
        Accept: "application/vnd.github+json",
        Authorization: "Bearer " + token,
        "X-GitHub-Api-Version": "2022-11-28",
      }, body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) {
      const e = new Error((data && data.message) || ("HTTP " + res.status));
      e.status = res.status;
      throw e;
    }
    return data;
  }
  const b64enc = s => { let bin = ""; new TextEncoder().encode(s).forEach(b => { bin += String.fromCharCode(b); }); return btoa(bin); };
  const b64dec = s => new TextDecoder().decode(Uint8Array.from(atob(s.replace(/\n/g, "")), c => c.charCodeAt(0)));
  const filePath = slug => `${repoPath}/contents/posts/${slug}.md`;

  // ---- front matter ----
  function parseMd(text) {
    const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)/);
    const meta = {};
    let body = text;
    if (m) {
      m[1].split("\n").forEach(l => { const i = l.indexOf(":"); if (i > 0) meta[l.slice(0, i).trim()] = l.slice(i + 1).trim(); });
      body = m[2];
    }
    return { meta, body: body.replace(/^\n+/, "") };
  }
  function buildMd(f) {
    const lines = ["---", `title: ${f.title.replace(/\s*\n\s*/g, " ").trim()}`, `date: ${f.date}`, `category: ${f.category}`, `tags: ${f.tags.join(", ")}`];
    if (f.pinned) lines.push("pinned: true");
    lines.push("---", "", f.body.replace(/\s+$/, ""), "");
    return lines.join("\n");
  }
  const toTags = s => s.split(",").map(t => t.trim().replace(/^#/, "")).filter(Boolean);
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
  function slugify(title) {
    const s = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
    if (s) return s.slice(0, 60);
    const d = new Date(), p = n => String(n).padStart(2, "0");
    return `post-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  }

  // ---- 화면 속 글 목록 즉시 반영 (실제 사이트는 1~2분 뒤 빌드됨) ----
  function upsertLocal(f) {
    const POSTS = window.POSTS;
    const i = POSTS.findIndex(p => p.slug === f.slug);
    const item = { slug: f.slug, title: f.title, date: f.date, category: f.category, tags: f.tags, pinned: !!f.pinned, body: f.body.trim() };
    if (i >= 0) POSTS[i] = item; else POSTS.push(item);
    sortLocal();
    window.Desk.refresh();
  }
  function removeLocal(slug) {
    const i = window.POSTS.findIndex(p => p.slug === slug);
    if (i >= 0) window.POSTS.splice(i, 1);
    window.Desk.refresh();
  }
  function sortLocal() {
    window.POSTS.sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || b.date.localeCompare(a.date) || b.slug.localeCompare(a.slug));
  }

  // ---- 알림 ----
  let toastTimer = null;
  function toast(msg, isError) {
    const t = $("toast");
    t.textContent = msg;
    t.classList.toggle("is-error", !!isError);
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, isError ? 7000 : 5000);
  }
  const explain = e => {
    if (e.status === 401) return "토큰이 올바르지 않거나 만료됐어요. 🔑 관리에서 다시 입력해 주세요.";
    if (e.status === 403) return "이 토큰에 쓰기 권한이 없어요. (Contents: Read and write 필요)";
    if (e.status === 404) return "저장소나 파일을 찾지 못했어요. config.js의 저장소 이름과 토큰 범위를 확인해 주세요.";
    if (e.status === 409 || e.status === 422) return "이미 같은 이름의 글이 있거나 다른 곳에서 먼저 수정됐어요. 새로 불러온 뒤 다시 시도해 주세요.";
    return "저장하지 못했어요: " + e.message;
  };

  // ---- 로그인 (토큰) ----
  function applyAuth() {
    $("writeFab").hidden = !authed;
    document.documentElement.classList.toggle("is-owner", authed);
    renderTools();
  }
  async function verify(t) {
    token = t;
    const r = await gh("GET", repoPath);
    if (!r.permissions || !r.permissions.push) { token = null; const e = new Error("쓰기 권한 없음"); e.status = 403; throw e; }
    authed = true;
    store.set(KEY_TOKEN, t);
    applyAuth();
  }
  function logout() {
    token = null; authed = false;
    store.del(KEY_TOKEN);
    applyAuth();
  }

  const authDlg = $("authDlg"), authInput = $("authToken"), authMsg = $("authMsg");
  $("manageBtn").addEventListener("click", () => {
    authMsg.textContent = "";
    $("authLoggedOut").hidden = authed;
    $("authLoggedIn").hidden = !authed;
    authInput.value = "";
    authDlg.showModal();
  });
  $("authForm").addEventListener("submit", async e => {
    e.preventDefault();
    const t = authInput.value.trim();
    if (!t) return;
    authMsg.textContent = "확인하는 중…";
    try { await verify(t); authDlg.close(); toast("✅ 로그인했어요. 이제 글을 쓰거나 고칠 수 있어요."); }
    catch (err) { authMsg.textContent = explain(err); }
  });
  $("authLogout").addEventListener("click", () => { logout(); authDlg.close(); toast("로그아웃했어요. 이 기기에서 토큰을 지웠어요."); });
  $("authCancel").addEventListener("click", () => authDlg.close());

  // ---- 편집기 ----
  const dlg = $("editor"), f = {
    title: $("edTitle"), category: $("edCategory"), tags: $("edTags"), date: $("edDate"), slug: $("edSlug"),
    pinned: $("edPinned"), body: $("edBody"), preview: $("edPreview"), msg: $("edMsg"), save: $("edSave"), heading: $("edHeading"),
  };
  f.category.innerHTML = Object.keys(CATS).map(k => `<option value="${esc(k)}">${ICONS[k]} ${esc(CATS[k])}</option>`).join("");

  function showTab(which) {
    const prev = which === "preview";
    $("edTabEdit").setAttribute("aria-selected", String(!prev));
    $("edTabPreview").setAttribute("aria-selected", String(prev));
    f.body.hidden = prev;
    f.preview.hidden = !prev;
    $("edTools").hidden = prev;
    if (prev) f.preview.innerHTML = `<h1>${esc(f.title.value || "(제목 없음)")}</h1>` + markdown(f.body.value || "");
  }
  $("edTabEdit").addEventListener("click", () => showTab("edit"));
  $("edTabPreview").addEventListener("click", () => showTab("preview"));

  function insert(before, after = "", fallback = "") {
    const el = f.body, a = el.selectionStart, b = el.selectionEnd;
    const sel = el.value.slice(a, b) || fallback;
    el.setRangeText(before + sel + after, a, b, "end");
    el.focus();
    el.dispatchEvent(new Event("input"));
  }
  $("edTools").addEventListener("click", e => {
    const b = e.target.closest("[data-ins]");
    if (!b) return;
    const k = b.dataset.ins;
    if (k === "h") insert("\n# ", "\n", "제목");
    else if (k === "b") insert("**", "**", "굵게");
    else if (k === "c") insert("`", "`", "코드");
    else if (k === "l") insert("\n- ", "", "항목");
    else if (k === "f") insert("\n```\n", "\n```\n", "코드");
    else if (k === "q") insert("\n> ", "\n", "인용");
  });

  function openEditor(init, edit) {
    editing = edit || null;
    f.heading.textContent = edit ? "✏️ 글 수정" : "✏️ 새 글";
    f.title.value = init.title || "";
    f.category.value = init.category || "study";
    f.tags.value = (init.tags || []).join(", ");
    f.date.value = init.date || today();
    f.slug.value = init.slug || "";
    f.slug.disabled = !!edit;
    f.pinned.checked = !!init.pinned;
    f.body.value = init.body || "";
    f.msg.textContent = init.note || "";
    f.save.disabled = false;
    showTab("edit");
    dlg.showModal();
    f.title.focus();
  }
  function persistDraft() {
    if (editing) return;
    store.set(KEY_DRAFT, JSON.stringify({ title: f.title.value, category: f.category.value, tags: f.tags.value, body: f.body.value, pinned: f.pinned.checked }));
  }
  [f.title, f.category, f.tags, f.body, f.pinned].forEach(el => el.addEventListener("input", persistDraft));

  $("writeFab").addEventListener("click", () => {
    let d = null;
    try { d = JSON.parse(store.get(KEY_DRAFT) || "null"); } catch (e) {}
    if (d && (d.title || d.body)) openEditor({ title: d.title, category: d.category, tags: toTags(d.tags || ""), body: d.body, pinned: d.pinned, note: "임시 저장된 내용을 불러왔어요." });
    else openEditor({});
  });
  $("edCancel").addEventListener("click", () => dlg.close());

  $("edForm").addEventListener("submit", async e => {
    e.preventDefault();
    const title = f.title.value.trim();
    const body = f.body.value;
    if (!title || !body.trim()) { f.msg.textContent = "제목과 내용을 입력해 주세요."; return; }
    const slug = editing ? editing.slug : (f.slug.value.trim() || slugify(title));
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) { f.msg.textContent = "주소 이름은 영문 소문자, 숫자, 하이픈(-)만 쓸 수 있어요."; return; }
    if (!editing && window.POSTS.some(p => p.slug === slug)) { f.msg.textContent = "같은 주소 이름의 글이 이미 있어요. 이름을 바꿔 주세요."; return; }
    const post = { slug, title, date: f.date.value || today(), category: f.category.value, tags: toTags(f.tags.value), pinned: f.pinned.checked, body };
    f.save.disabled = true;
    f.msg.textContent = "저장하는 중…";
    try {
      await gh("PUT", filePath(slug), Object.assign(
        { message: `${editing ? "edit" : "post"}: ${title}`, content: b64enc(buildMd(post)) },
        editing ? { sha: editing.sha } : {}));
      upsertLocal(post);
      if (!editing) store.del(KEY_DRAFT);
      dlg.close();
      toast("✅ 저장했어요. 사이트에 반영되는 데 1~2분 걸려요.");
      if (editing) { location.hash = "#" + slug; }
    } catch (err) {
      f.msg.textContent = explain(err);
      f.save.disabled = false;
    }
  });

  // ---- 글 읽기 화면의 수정·고정·삭제 ----
  const tools = $("ownerTools");
  function currentSlug() {
    let s = "";
    try { s = decodeURIComponent(location.hash.slice(1)); } catch (e) {}
    return window.POSTS.some(p => p.slug === s && !p.source) ? s : "";   // Velog 글은 Velog에서 고친다
  }
  function renderTools() {
    const slug = authed && !$("reader").hidden ? currentSlug() : "";
    tools.hidden = !slug;
    if (!slug) return;
    const p = window.POSTS.find(x => x.slug === slug);
    $("toolPin").textContent = p.pinned ? "📌 고정 해제" : "📌 고정";
    resetDelete();
  }
  window.addEventListener("hashchange", renderTools);
  document.addEventListener("readerchange", renderTools);

  async function loadFile(slug) {
    const r = await gh("GET", filePath(slug));
    return { sha: r.sha, ...parseMd(b64dec(r.content)) };
  }
  $("toolEdit").addEventListener("click", async () => {
    const slug = currentSlug();
    if (!slug) return;
    toast("불러오는 중…");
    try {
      const { sha, meta, body } = await loadFile(slug);
      $("toast").hidden = true;
      openEditor({ slug, title: meta.title, date: meta.date, category: meta.category, tags: toTags(meta.tags || ""), pinned: (meta.pinned || "").toLowerCase() === "true", body }, { slug, sha });
    } catch (err) { toast(explain(err), true); }
  });
  $("toolPin").addEventListener("click", async () => {
    const slug = currentSlug();
    if (!slug) return;
    try {
      const { sha, meta, body } = await loadFile(slug);
      const pinned = (meta.pinned || "").toLowerCase() !== "true";
      const post = { slug, title: meta.title, date: meta.date, category: meta.category, tags: toTags(meta.tags || ""), pinned, body };
      await gh("PUT", filePath(slug), { message: `${pinned ? "pin" : "unpin"}: ${meta.title}`, content: b64enc(buildMd(post)), sha });
      upsertLocal(post);
      renderTools();
      toast(pinned ? "📌 고정했어요." : "고정을 해제했어요.");
    } catch (err) { toast(explain(err), true); }
  });
  let delTimer = null, delArmed = false;
  function resetDelete() { delArmed = false; clearTimeout(delTimer); $("toolDelete").textContent = "🗑️ 삭제"; }
  $("toolDelete").addEventListener("click", async () => {
    const slug = currentSlug();
    if (!slug) return;
    if (!delArmed) {                       // 한 번 더 눌러야 삭제
      delArmed = true;
      $("toolDelete").textContent = "정말 삭제? 한 번 더 누르세요";
      delTimer = setTimeout(resetDelete, 4000);
      return;
    }
    resetDelete();
    try {
      const { sha, meta } = await loadFile(slug);
      await gh("DELETE", filePath(slug), { message: `delete: ${meta.title}`, sha });
      removeLocal(slug);
      history.replaceState(null, "", location.pathname + location.search);
      window.Desk.sync();
      toast("🗑️ 삭제했어요. 사이트에 반영되는 데 1~2분 걸려요.");
    } catch (err) { toast(explain(err), true); }
  });

  // ---- 시작: 저장된 토큰이 있으면 조용히 확인 ----
  const saved = store.get(KEY_TOKEN);
  if (saved) verify(saved).catch(() => { token = null; authed = false; store.del(KEY_TOKEN); applyAuth(); });
  applyAuth();
})();
