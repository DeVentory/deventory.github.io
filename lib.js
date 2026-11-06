/* 공유 모듈: 마크다운 렌더러, 카테고리, 테마. (렌더러는 터미널 프로토타입 때 검증한 코드를 그대로 옮김) */
(() => {
  const CATS = { study: "공부 기록", project: "프로젝트", security: "보안 분석" };
  const ICONS = { study: "📒", project: "🧩", security: "🔐" };

  const esc = s => s.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // ---- 마크다운 (필요한 문법만) ----
  function inline(s) {
    s = esc(s);
    s = s.replace(/`([^`]+)`/g, "<code>$1</code>");
    s = s.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    s = s.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, '<img alt="$1" src="$2">');
    s = s.replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    return s;
  }
  function markdown(src) {
    const lines = src.replace(/\r/g, "").split("\n");
    let html = "", i = 0;
    const stack = []; // 열린 목록
    const closeLists = (to = 0) => { while (stack.length > to) { html += "</li></ul>"; stack.pop(); } };
    while (i < lines.length) {
      const line = lines[i];
      const fence = line.match(/^```(\w*)/);
      if (fence) {
        closeLists();
        const buf = []; i++;
        while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
        i++;
        html += `<pre>${fence[1] ? `<span class="lang">${esc(fence[1])}</span>` : ""}<code>${esc(buf.join("\n"))}</code></pre>`;
        continue;
      }
      const h = line.match(/^(#{1,3})\s+(.*)/);
      if (h) { closeLists(); html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; i++; continue; }
      if (/^---+\s*$/.test(line)) { closeLists(); html += "<hr>"; i++; continue; }
      const q = line.match(/^>\s?(.*)/);
      if (q) {
        closeLists();
        const buf = [];
        while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ""));
        html += `<blockquote>${markdown(buf.join("\n"))}</blockquote>`;
        continue;
      }
      const li = line.match(/^(\s*)[-*]\s+(.*)/);
      if (li) {
        const depth = Math.floor(li[1].length / 2) + 1;
        if (depth > stack.length) { while (stack.length < depth) { html += "<ul><li>"; stack.push(1); } }
        else { closeLists(depth); html += "</li><li>"; }
        html += inline(li[2]);
        i++; continue;
      }
      if (!line.trim()) { closeLists(); i++; continue; }
      closeLists();
      const buf = [];
      while (i < lines.length && lines[i].trim() && !/^(```|#{1,3}\s|---+\s*$|>|\s*[-*]\s)/.test(lines[i])) buf.push(lines[i++]);
      html += `<p>${inline(buf.join("<br>"))}</p>`;
    }
    closeLists();
    return html;
  }

  // ---- 테마: light | dark | auto(시스템) ----
  const Theme = {
    resolve(mode) {
      if (mode === "light" || mode === "dark") return mode;
      return window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    },
    stored() { try { return localStorage.getItem("theme"); } catch (e) { return null; } },
    set(mode) {
      try { mode === "auto" ? localStorage.removeItem("theme") : localStorage.setItem("theme", mode); } catch (e) {}
      document.documentElement.dataset.theme = Theme.resolve(mode);
      document.dispatchEvent(new Event("themechange"));
    },
    current() { return document.documentElement.dataset.theme; },
  };

  window.Lib = { CATS, ICONS, esc, inline, markdown, Theme };
})();
