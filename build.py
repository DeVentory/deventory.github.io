#!/usr/bin/env python3
"""posts/*.md 와 Velog RSS 를 모아 posts.js 를 만든다.

사용:
  python3 build.py                  # Velog 를 받아 보고, 실패하면 경고만 하고 md 글만으로 빌드
  python3 build.py --require-velog  # Velog 를 못 받으면 실패 (배포 자동화용: 이전 배포를 지키기 위해)
  python3 build.py --no-velog       # 네트워크 없이 md 글만
"""
import argparse, datetime, email.utils, hashlib, json, pathlib, re, sys, urllib.parse, urllib.request
import xml.etree.ElementTree as ET
from html.parser import HTMLParser

ROOT = pathlib.Path(__file__).parent
CATEGORIES = ("study", "project", "security")


# ---------- Velog HTML -> Markdown (이 사이트 렌더러가 지원하는 문법만) ----------
class HtmlToMd(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.bufs = [[]]          # 버퍼 스택 (인용문 처리용)
        self.lists = []           # 열린 목록 깊이
        self.in_pre = False
        self.pre_lang = ""
        self.pre_buf = []
        self.skip = 0
        self.href = []
        self.link_buf = []

    # 출력 도우미
    def w(self, s):
        (self.link_buf[-1] if self.link_buf else self.bufs[-1]).append(s)

    def block(self):
        if not self.lists:
            self.w("\n\n")

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if self.skip or tag in ("script", "style"):
            if tag in ("script", "style"):
                self.skip += 1
            return
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.w("\n\n" + "#" * min(int(tag[1]), 3) + " ")
        elif tag == "p":
            self.block()
        elif tag == "br":
            self.w("\n")
        elif tag in ("strong", "b"):
            self.w("**")
        elif tag in ("em", "i"):
            self.w("*")
        elif tag == "pre":
            self.in_pre, self.pre_buf, self.pre_lang = True, [], ""
        elif tag == "code":
            if self.in_pre:
                m = re.search(r"language-([\w+#-]+)", a.get("class", "") or "")
                if m:
                    self.pre_lang = re.sub(r"\W", "", m.group(1))
            else:
                self.w("`")
        elif tag in ("ul", "ol"):
            if not self.lists:
                self.w("\n\n")
            self.lists.append(tag)
        elif tag == "li":
            self.w("\n" + "  " * (len(self.lists) - 1) + "- ")
        elif tag == "blockquote":
            self.bufs.append([])
        elif tag == "hr":
            self.w("\n\n---\n\n")
        elif tag == "a":
            self.href.append(a.get("href", ""))
            self.link_buf.append([])
        elif tag == "img":
            src = a.get("src", "") or ""
            if re.match(r"https?://", src):
                self.w(f"![{(a.get('alt') or '').replace(']', '').replace(chr(10), ' ')}]({src})")
        elif tag in ("tr",):
            self.w("\n\n")
        elif tag in ("td", "th"):
            pass

    def handle_endtag(self, tag):
        if tag in ("script", "style"):
            self.skip = max(0, self.skip - 1)
            return
        if self.skip:
            return
        if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.w("\n\n")
        elif tag == "p":
            self.block()
        elif tag in ("strong", "b"):
            self.w("**")
        elif tag in ("em", "i"):
            self.w("*")
        elif tag == "pre":
            body = "".join(self.pre_buf).strip("\n")
            self.in_pre = False
            self.w(f"\n\n```{self.pre_lang}\n{body}\n```\n\n")
        elif tag == "code" and not self.in_pre:
            self.w("`")
        elif tag in ("ul", "ol"):
            if self.lists:
                self.lists.pop()
            if not self.lists:
                self.w("\n\n")
        elif tag == "blockquote":
            inner = re.sub(r"\n{3,}", "\n\n", "".join(self.bufs.pop())).strip()
            if not inner.strip():
                return                       # 내용 없는 인용문은 버린다
            quoted = "\n".join(("> " + l) if l.strip() else ">" for l in inner.split("\n"))
            self.w("\n\n" + quoted + "\n\n")
        elif tag == "a":
            text = "".join(self.link_buf.pop()).strip()
            href = self.href.pop()
            self.w(f"[{text}]({href})" if text and re.match(r"https?://\S+$", href) else text)
        elif tag in ("td", "th"):
            self.w(" | ")

    def handle_data(self, data):
        if self.skip:
            return
        if self.in_pre:
            self.pre_buf.append(data)
        else:
            self.w(re.sub(r"\s+", " ", data))

    def result(self):
        s = "".join(self.bufs[0])
        s = re.sub(r"[ \t]+\n", "\n", s)
        s = re.sub(r"\n{3,}", "\n\n", s)
        s = re.sub(r" \| \n", "\n", s)
        return s.strip()


def html_to_md(html):
    p = HtmlToMd()
    p.feed(html)
    p.close()
    return p.result()


# ---------- Velog ----------
def slugify(text):
    import unicodedata
    s = unicodedata.normalize("NFKD", text.lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:48]


def fetch_velog(user, default_cat, overrides=None):
    overrides = overrides or {}
    url = f"https://api.velog.io/rss/@{user}"
    req = urllib.request.Request(url, headers={"User-Agent": "tech-blog-build/1.0"})
    with urllib.request.urlopen(req, timeout=30) as r:
        xml = r.read()
    root = ET.fromstring(xml)
    posts, seen = [], set()
    kst = datetime.timezone(datetime.timedelta(hours=9))
    for it in root.findall(".//item"):
        link = (it.findtext("link") or "").strip()
        if not link.startswith("https://velog.io/"):
            continue                                   # 예상 밖 주소는 가져오지 않는다
        title = (it.findtext("title") or "").strip()
        tags = [c.text.strip() for c in it.findall("category") if c.text and c.text.strip()]
        cat = next((t for t in tags if t in CATEGORIES), default_cat)
        tags = [t for t in tags if t not in CATEGORIES]
        try:
            dt = email.utils.parsedate_to_datetime(it.findtext("pubDate")).astimezone(kst)
            date = dt.strftime("%Y-%m-%d")
        except Exception:
            date = ""
        tail = urllib.parse.unquote(link.rstrip("/").rsplit("/", 1)[-1])   # 퍼센트 인코딩을 풀어야 한글 글도 주소 이름이 맞게 나온다
        slug = "velog-" + (slugify(tail) or hashlib.sha1(link.encode()).hexdigest()[:8])
        while slug in seen:
            slug += "-" + hashlib.sha1(link.encode()).hexdigest()[:4]
        seen.add(slug)
        # Velog RSS에는 태그가 없어서, site.json 의 overrides(주소→카테고리·태그)로 분류한다
        ov = overrides.get(urllib.parse.unquote(link), {})
        cat = ov.get("category", cat)
        tags = [t for t in ov.get("tags", tags) if t not in CATEGORIES]
        posts.append({"slug": slug, "title": title, "date": date, "category": cat,
                      "tags": tags + ["velog"], "pinned": bool(ov.get("pinned", False)),
                      "body": html_to_md(it.findtext("description") or ""),
                      "source": "velog", "url": link})
    return posts


# ---------- 로컬 md ----------
def load_md():
    posts = []
    for f in sorted((ROOT / "posts").glob("*.md")):
        text = f.read_text(encoding="utf-8")
        m = re.match(r"---\n(.*?)\n---\n(.*)", text, re.S)
        meta, body = ({}, text) if not m else ({}, m.group(2))
        if m:
            for line in m.group(1).splitlines():
                k, _, v = line.partition(":")
                meta[k.strip()] = v.strip()
        posts.append({
            "slug": f.stem, "title": meta.get("title", f.stem), "date": meta.get("date", ""),
            "category": meta.get("category", "etc"),
            "tags": [t.strip() for t in meta.get("tags", "").split(",") if t.strip()],
            "pinned": meta.get("pinned", "").lower() in ("true", "yes", "1"),
            "body": body.strip(),
        })
    return posts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--require-velog", action="store_true")
    ap.add_argument("--no-velog", action="store_true")
    args = ap.parse_args()

    site = json.loads((ROOT / "site.json").read_text(encoding="utf-8")) if (ROOT / "site.json").exists() else {}
    posts = load_md()

    if not args.no_velog and site.get("velog_user"):
        try:
            vel = fetch_velog(site["velog_user"], site.get("default_category", "study"), site.get("overrides"))
            titles = {p["title"] for p in vel}
            dropped = [p for p in posts if p["title"] in titles]
            posts = [p for p in posts if p["title"] not in titles]   # 같은 제목이면 Velog 쪽이 우선
            posts += vel
            print(f"Velog {len(vel)}개 가져옴, 같은 제목의 md 사본 {len(dropped)}개는 Velog 글로 대체")
        except Exception as e:
            print(f"경고: Velog 글을 가져오지 못했어요 ({e})", file=sys.stderr)
            if args.require_velog:
                sys.exit(1)

    pins = set(site.get("pinned", []))
    for p in posts:
        if p["slug"] in pins:
            p["pinned"] = True

    posts.sort(key=lambda p: (p["pinned"], p["date"], p["slug"]), reverse=True)
    (ROOT / "posts.js").write_text(
        "window.POSTS = " + json.dumps(posts, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    print(f"{len(posts)} posts -> posts.js")


if __name__ == "__main__":
    main()
