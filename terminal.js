/* 숨은 터미널. 백틱(`) 키 또는 푸터 버튼으로 열고 Esc로 닫는다. */
(() => {
  const { CATS, esc, inline, markdown, Theme } = window.Lib;
  const POSTS = window.POSTS || [];
  const term = document.getElementById("term");
  const scroller = document.getElementById("termScroll");
  const out = document.getElementById("out");
  const form = document.getElementById("form");
  const input = document.getElementById("cmd");
  const promptEl = document.getElementById("prompt");

  let cwd = "~";           // "~" 또는 카테고리 이름
  const history = [];
  let hpos = 0;
  let started = false;
  let lastFocus = null;

  const setPrompt = () => { promptEl.textContent = `guest@deventory:${cwd === "~" ? "~" : "~/" + cwd}$`; };
  const scrollDown = () => { scroller.scrollTop = scroller.scrollHeight; };
  const print = (html, cls = "") => {
    const d = document.createElement("div");
    if (cls) d.className = cls;
    d.innerHTML = html;
    out.appendChild(d);
    scrollDown();
    return d;
  };
  const cmdLink = (label, cmd) => `<button type="button" class="link" data-cmd="${esc(cmd)}">${esc(label)}</button>`;

  // ---- 명령어 ----
  const visible = () => (cwd === "~" ? POSTS : POSTS.filter(p => p.category === cwd));
  const findPost = arg => {
    if (!arg) return null;
    if (arg.includes("/")) { const [d, sl] = arg.split("/"); return POSTS.find(p => p.category === d && p.slug === sl) || null; }
    if (/^\d+$/.test(arg)) return visible()[Number(arg) - 1] || null;
    return POSTS.find(p => p.slug === arg) || POSTS.find(p => p.slug.includes(arg.toLowerCase())) || null;
  };

  const cmds = {
    help() {
      const rows = [
        ["ls [카테고리]", "글 목록"], ["cat <번호|이름>", "터미널 안에서 글 읽기"], ["open <번호|이름>", "책상 화면에서 글 열기"],
        ["cd <카테고리>", "카테고리 이동 (cd .. 로 복귀)"], ["tree", "카테고리 구조"], ["tags", "태그 목록"],
        ["grep <단어>", "제목·태그 검색"], ["about", "소개"], ["theme <light|dark|auto>", "사이트 테마"], ["clear", "화면 지우기"],
      ];
      print(rows.map(([a, b]) => `<span class="accent">${esc(a.padEnd(26))}</span> <span class="dim">${esc(b)}</span>`).join("\n"));
      print(`<span class="dim">팁: Tab 자동완성, ↑↓ 기록, Esc로 닫기. 눌러서 실행되는 항목도 있습니다.</span>`);
    },
    ls(args) {
      let list = visible();
      if (args[0]) args[0] = args[0].replace(/\/+$/, "");
      if (args[0]) {
        if (!CATS[args[0]]) return print(`ls: '${esc(args[0])}': 그런 카테고리가 없습니다. (${Object.keys(CATS).join(", ")})`, "warn");
        list = POSTS.filter(p => p.category === args[0]);
      }
      if (!list.length) return print("(비어 있음)", "dim");
      list.forEach((p, n) => print(
        `<span class="dim">${String(n + 1).padStart(2)}</span> <span class="c dim">${esc(p.category)}</span> <span class="d dim">${esc(p.date)}</span> <span class="t">${p.pinned ? "📌 " : ""}${cmdLink(p.title, "cat " + p.slug)}</span>`, "row"));
    },
    cat(args) {
      if (!args[0]) return print(esc("사용법: cat <번호|이름>"), "warn");
      const p = findPost(args[0]);
      if (!p) return print(`cat: '${esc(args[0])}': 글을 찾을 수 없습니다. ls 로 목록을 확인하세요.`, "warn");
      const el = print(`<div class="meta">${esc(p.date)} · ${esc(CATS[p.category] || p.category)} · ${p.tags.map(t => "#" + esc(t)).join(" ")}</div><h1 style="margin-top:0">${inline(p.title)}</h1>${markdown(p.body)}`, "post");
      el.scrollIntoView({ block: "start" });
    },
    open(args) {
      if (!args[0]) return print(esc("사용법: open <번호|이름>"), "warn");
      const p = findPost(args[0]);
      if (!p) return print(`open: '${esc(args[0])}': 글을 찾을 수 없습니다.`, "warn");
      close();
      location.hash = "#" + p.slug;
    },
    cd(args) {
      const t = (args[0] || "").replace(/\/+$/, "");
      if (t.includes("/")) {
        const [d, slug] = t.split("/");
        if (CATS[d] && POSTS.some(p => p.slug === slug && p.category === d)) return cmds.cat([t]);
        return print(`cd: '${esc(t)}': 그런 경로가 없습니다.`, "warn");
      }
      if (!t || t === "~" || t === "..") cwd = "~";
      else if (CATS[t]) cwd = t;
      else return print(`cd: '${esc(t)}': 그런 카테고리가 없습니다.`, "warn");
      setPrompt();
    },
    tree() {
      const lines = ["."];
      const keys = Object.keys(CATS);
      keys.forEach((k, ki) => {
        const ps = POSTS.filter(p => p.category === k);
        lines.push(`${ki === keys.length - 1 ? "└──" : "├──"} ${cmdLink(k + "/", "cd " + k)} <span class="dim">${esc(CATS[k])} (${ps.length})</span>`);
      });
      print(lines.join("\n"));
    },
    tags() {
      const m = {};
      POSTS.forEach(p => p.tags.forEach(t => (m[t] = (m[t] || 0) + 1)));
      print(Object.entries(m).map(([t, n]) => cmdLink("#" + t, "grep " + t) + `<span class="dim">(${n})</span>`).join("  "));
    },
    grep(args) {
      const q = args.join(" ").toLowerCase();
      if (!q) return print(esc("사용법: grep <단어>"), "warn");
      const hit = POSTS.filter(p => (p.title + " " + p.tags.join(" ")).toLowerCase().includes(q));
      if (!hit.length) return print("(결과 없음)", "dim");
      hit.forEach(p => print(`${cmdLink(p.title, "cat " + p.slug)} <span class="dim">${esc(p.date)}</span>`));
    },
    about() {
      print(`<span class="accent">DeVentory</span> — 공부한 것과 만든 것을 기록합니다.\n<span class="dim">(임시 소개문입니다. 실제 내용으로 교체하세요.)</span>`);
    },
    theme(args) {
      const t = args[0];
      if (!["light", "dark", "auto"].includes(t)) return print(esc("사용법: theme <light|dark|auto>"), "warn");
      Theme.set(t);
      print(`<span class="dim">테마: ${esc(t)}${t === "auto" ? " (시스템 설정을 따름)" : ""}</span>`);
    },
    clear() { out.innerHTML = ""; },
    whoami() { print("guest"); },
    sudo() { print("guest 는 sudo 권한이 없습니다. 이 사고는 보고되지 않습니다.", "warn"); },
  };

  function run(raw) {
    const text = raw.trim();
    print(`<span class="p">${esc(promptEl.textContent)}</span> ${esc(text)}`, "cmdline");
    if (!text) return;
    const [name, ...args] = text.split(/\s+/);
    if (Object.prototype.hasOwnProperty.call(cmds, name)) cmds[name](args);
    else print(`${esc(name)}: command not found. ${cmdLink("help", "help")} 를 입력해 보세요.`, "warn");
  }

  // ---- Tab 자동완성 ----
  const commonPrefix = list => list.reduce((a, b) => { let i = 0; while (i < a.length && a[i] === b[i]) i++; return a.slice(0, i); });
  function complete(value) {
    const parts = value.split(/\s+/);
    const frag = parts[parts.length - 1];
    let pool;
    if (parts.length === 1) pool = Object.keys(cmds);
    else {
      const first = parts[0];
      const dirs = Object.keys(CATS).map(c => c + "/");
      const inCat = c => POSTS.filter(p => p.category === c).map(p => c + "/" + p.slug);
      const [d] = frag.split("/");
      const deep = frag.includes("/") && CATS[d];   // "study/..." 형태
      if (first === "cd") pool = deep ? inCat(d) : [...dirs, ".."];
      else if (first === "ls") pool = dirs;
      else if (first === "cat" || first === "open") pool = deep ? inCat(d) : [...visible().map(p => p.slug), ...dirs];
      else if (first === "theme") pool = ["light", "dark", "auto"];
      else if (first === "grep") pool = [...new Set(POSTS.flatMap(p => p.tags))];
      else pool = [];
    }
    const m = pool.filter(c => c.startsWith(frag.toLowerCase()));
    if (!m.length) return { value, candidates: [] };
    const head = value.slice(0, value.length - frag.length);
    if (m.length === 1) return { value: head + m[0] + (m[0].endsWith("/") ? "" : " "), candidates: m };
    return { value: head + commonPrefix(m), candidates: m };
  }
  window.__complete = complete; // 테스트용

  // ---- 입력 처리 ----
  form.addEventListener("submit", e => {
    e.preventDefault();
    const v = input.value;
    if (v.trim()) history.push(v);
    hpos = history.length;
    input.value = "";
    run(v);
  });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowUp") { e.preventDefault(); if (hpos > 0) input.value = history[--hpos]; }
    else if (e.key === "ArrowDown") { e.preventDefault(); input.value = hpos < history.length - 1 ? history[++hpos] : (hpos = history.length, ""); }
    else if (e.key === "l" && e.ctrlKey) { e.preventDefault(); cmds.clear(); }
    else if (e.key === "Tab") {
      e.preventDefault();
      const r = complete(input.value);
      input.value = r.value;
      if (r.candidates.length > 1) {
        print(`<span class="p">${esc(promptEl.textContent)}</span> ${esc(input.value)}`, "cmdline");
        print(r.candidates.map(c => `<span class="accent">${esc(c)}</span>`).join("  "));
      }
    }
  });
  out.addEventListener("click", e => {
    const el = e.target.closest("[data-cmd]");
    if (!el) return;
    run(el.dataset.cmd);
    input.focus({ preventScroll: true });
  });
  scroller.addEventListener("click", e => {
    if (!getSelection().toString() && !e.target.closest("button, a")) input.focus({ preventScroll: true });
  });

  // ---- 열기·닫기 ----
  function start() {
    print(String.raw`   ___       _   __          __
  / _ \___  | | / /__ ___  / /____  ______ __
 / // / -_) | |/ / -_) _ \/ __/ _ \/ __/ // /
/____/\__/  |___/\__/_//_/\__/\___/_/  \_, /
                                      /___/ `, "banner");
  print(`<span class="dim">숨겨진 터미널을 찾으셨네요 🎉  ${POSTS.length} posts</span>`);
    print(`${cmdLink("help", "help")}  ${cmdLink("ls", "ls")}  ${cmdLink("tree", "tree")}  ${cmdLink("about", "about")}`);
    run("ls");
  }
  function isOpen() { return !term.hidden; }
  function open() {
    if (isOpen()) return;
    lastFocus = document.activeElement;
    term.hidden = false;
    document.documentElement.classList.add("term-open");
    if (!started) { started = true; setPrompt(); start(); }
    input.focus({ preventScroll: true });
    document.dispatchEvent(new Event("terminalchange"));
  }
  function close() {
    if (!isOpen()) return;
    term.hidden = true;
    document.documentElement.classList.remove("term-open");
    document.dispatchEvent(new Event("terminalchange"));
    if (lastFocus && document.contains(lastFocus) && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    lastFocus = null;
  }
  term.addEventListener("keydown", e => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); }
  });
  document.getElementById("termClose").addEventListener("click", close);

  window.Terminal = { open, close, isOpen, toggle: () => (isOpen() ? close() : open()) };
})();
