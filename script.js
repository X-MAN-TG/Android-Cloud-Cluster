(function(){
"use strict";

/* ============================================================
   0. SMALL UTILITIES
   ============================================================ */
function slugify(str){
  return String(str)
    .replace(/[—–]/g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}
function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function showToast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('visible');
  clearTimeout(showToast._tm);
  showToast._tm = setTimeout(()=> t.classList.remove('visible'), 1700);
}
function copyToClipboard(text){
  if(navigator.clipboard && window.isSecureContext){
    navigator.clipboard.writeText(text).catch(()=>fallbackCopy(text));
  } else {
    fallbackCopy(text);
  }
}
function fallbackCopy(text){
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position='fixed'; ta.style.opacity='0';
  document.body.appendChild(ta); ta.select();
  try{ document.execCommand('copy'); }catch(e){}
  document.body.removeChild(ta);
}

/* ============================================================
   1. PARSE THE EMBEDDED MARKDOWN INTO CHAPTERS
   ============================================================ */
const RAW = window.REPORT_MARKDOWN || "";

function parseReport(md){
  const lines = md.split("\n");
  const h2re = /^##\s+(.+)$/;
  const h1re = /^#\s+(.+)$/;
  let chapters = [];
  let cur = null;
  let overviewLines = [];
  let docTitle = "Documentation";

  for(let i=0;i<lines.length;i++){
    const line = lines[i];
    const h1m = line.match(h1re);
    const h2m = line.match(h2re);
    if(h1m && !cur && chapters.length===0){ docTitle = h1m[1].trim(); }
    if(h2m){
      if(cur) chapters.push(cur);
      const title = h2m[1].trim();
      const numMatch = title.match(/Part\s+(\d+)/i);
      cur = {
        id: slugify(title),
        num: numMatch ? numMatch[1] : String(chapters.length+1),
        title: title,
        lines: [line],
        headings: []
      };
    } else if(cur){
      cur.lines.push(line);
    } else {
      overviewLines.push(line);
    }
  }
  if(cur) chapters.push(cur);

  // sub-headings per chapter (h3/h4) for nav + rail toc
  chapters.forEach(ch=>{
    ch.lines.forEach(l=>{
      const h3 = l.match(/^###\s+(.+)$/);
      const h4 = l.match(/^####\s+(.+)$/);
      if(h3) ch.headings.push({level:3, text:h3[1].trim(), id:slugify(h3[1].trim())});
      else if(h4) ch.headings.push({level:4, text:h4[1].trim(), id:slugify(h4[1].trim())});
    });
    ch.raw = ch.lines.join("\n");
    const wc = ch.raw.split(/\s+/).filter(Boolean).length;
    ch.readingMinutes = Math.max(1, Math.round(wc/200));
    ch.wordCount = wc;
  });

  const overview = {
    id: "overview",
    num: "00",
    title: "Overview",
    raw: overviewLines.join("\n"),
    headings: []
  };
  const ovWc = overview.raw.split(/\s+/).filter(Boolean).length;
  overview.readingMinutes = Math.max(1, Math.round(ovWc/200));

  return { docTitle, overview, chapters };
}

const REPORT = parseReport(RAW);
const ALL_CHAPTERS = [REPORT.overview, ...REPORT.chapters];

/* ============================================================
   2. GFM-STYLE ADMONITION PREPROCESSING  ( > [!TYPE] ... )
   ============================================================ */
const CALLOUT_META = {
  DANGER:  {cls:"callout-danger",  label:"Danger",  icon:"⚠"},
  WARNING: {cls:"callout-warning", label:"Warning", icon:"!"},
  NOTE:    {cls:"callout-note",    label:"Note",     icon:"i"},
  TIP:     {cls:"callout-info",    label:"Tip",      icon:"i"},
  INFO:    {cls:"callout-info",    label:"Info",     icon:"i"},
  SUCCESS: {cls:"callout-success", label:"Best Practice", icon:"✓"}
};

function preprocessCallouts(md){
  const lines = md.split("\n");
  let out = [];
  for(let i=0;i<lines.length;i++){
    const m = lines[i].match(/^>\s*\[!(\w+)\]\s*(.*)$/);
    if(m){
      const type = m[1].toUpperCase();
      const meta = CALLOUT_META[type] || CALLOUT_META.NOTE;
      const titleText = m[2].trim();
      let body = [];
      let j = i+1;
      while(j<lines.length && lines[j].trim().startsWith(">")){
        body.push(lines[j].replace(/^>\s?/, ""));
        j++;
      }
      const bodyHtml = marked.parseInline(body.join(" "));
      out.push(`<div class="callout ${meta.cls}"><span class="callout-title">${escapeHtml(titleText||meta.label)}</span>${bodyHtml}</div>`);
      i = j-1;
    } else {
      out.push(lines[i]);
    }
  }
  return out.join("\n");
}

/* ============================================================
   3. RENDER PIPELINE (markdown -> enhanced DOM)
   ============================================================ */
marked.setOptions({ gfm:true, breaks:false });

let mermaidCounter = 0;

function renderMarkdownToNode(raw){
  const processed = preprocessCallouts(raw);
  const html = marked.parse(processed);
  const wrapper = document.createElement("div");
  wrapper.innerHTML = html;
  enhanceHeadings(wrapper);
  enhanceTables(wrapper);
  return wrapper;
}

function enhanceHeadings(root){
  root.querySelectorAll("h1,h2,h3,h4").forEach(h=>{
    const id = slugify(h.textContent);
    h.id = id;
    const wrap = document.createElement("span");
    wrap.className = "heading-wrap";
    const inner = document.createElement("span");
    inner.innerHTML = h.innerHTML;
    const anchor = document.createElement("a");
    anchor.className = "heading-anchor";
    anchor.href = "#" + id;
    anchor.setAttribute("aria-label","Copy link to this section");
    anchor.textContent = "#";
    anchor.addEventListener("click", (e)=>{
      e.preventDefault();
      const url = location.origin + location.pathname + "#" + currentChapterId + "/" + id;
      copyToClipboard(url);
      showToast("Section link copied");
      history.replaceState(null, "", "#"+currentChapterId+"/"+id);
    });
    wrap.appendChild(inner);
    wrap.appendChild(anchor);
    h.innerHTML = "";
    h.appendChild(wrap);
  });
}

function enhanceTables(root){
  root.querySelectorAll("table").forEach(table=>{
    const scroll = document.createElement("div");
    scroll.className = "table-scroll";
    table.parentNode.insertBefore(scroll, table);
    scroll.appendChild(table);
    const ths = table.querySelectorAll("thead th");
    ths.forEach((th, colIdx)=>{
      const arrow = document.createElement("span");
      arrow.className = "sort-arrow";
      arrow.textContent = "⇅";
      th.appendChild(arrow);
      th.addEventListener("click", ()=> sortTable(table, colIdx, th));
    });
  });
}

function sortTable(table, colIdx, th){
  const tbody = table.querySelector("tbody");
  if(!tbody) return;
  const rows = Array.from(tbody.querySelectorAll("tr"));
  const dir = th.dataset.dir === "asc" ? "desc" : "asc";
  table.querySelectorAll("thead th").forEach(t=>{ t.dataset.dir=""; const a=t.querySelector('.sort-arrow'); if(a) a.textContent="⇅";});
  th.dataset.dir = dir;
  const arrow = th.querySelector(".sort-arrow");
  if(arrow) arrow.textContent = dir === "asc" ? "↑" : "↓";
  rows.sort((a,b)=>{
    const av = a.children[colIdx] ? a.children[colIdx].textContent.trim() : "";
    const bv = b.children[colIdx] ? b.children[colIdx].textContent.trim() : "";
    const an = parseFloat(av), bn = parseFloat(bv);
    let cmp;
    if(!isNaN(an) && !isNaN(bn) && /^-?[\d.]+/.test(av) && /^-?[\d.]+/.test(bv)) cmp = an-bn;
    else cmp = av.localeCompare(bv);
    return dir === "asc" ? cmp : -cmp;
  });
  rows.forEach(r=>tbody.appendChild(r));
}

function enhanceCodeSafe(root){
  const pres = Array.from(root.querySelectorAll("pre > code")).map(c=>c.parentElement);
  pres.forEach(pre=>{
    const code = pre.querySelector("code");
    if(!code) return;
    const langMatch = (code.className||"").match(/language-(\w+)/);
    const lang = langMatch ? langMatch[1] : "";

    if(lang === "mermaid"){
      const container = document.createElement("div");
      container.className = "diagram-container";
      const id = "mermaid-" + (++mermaidCounter);
      const mpre = document.createElement("pre");
      mpre.className = "mermaid";
      mpre.id = id;
      mpre.textContent = code.textContent;
      container.appendChild(mpre);
      pre.replaceWith(container);
      return;
    }

    const codeText = code.textContent;
    const lineCount = codeText.split("\n").length;
    const block = document.createElement("div");
    block.className = "code-block" + (lineCount > 25 ? " collapsed" : "");
    const header = document.createElement("div");
    header.className = "code-block-header";
    header.innerHTML = `
      <span class="code-lang-badge">${escapeHtml(lang || "text")}</span>
      <span class="spacer"></span>
      ${lineCount > 25 ? '<button class="code-btn" data-act="toggle">Expand</button>' : ''}
      <button class="code-btn" data-act="wrap">Wrap</button>
      <button class="code-btn" data-act="fullscreen">Fullscreen</button>
      <button class="code-btn" data-act="copy">Copy</button>
    `;
    const newPre = document.createElement("pre");
    const newCode = document.createElement("code");
    if(lang) newCode.className = "language-" + lang;
    newCode.textContent = codeText;
    newPre.appendChild(newCode);
    const fade = document.createElement("div");
    fade.className = "code-fade";

    block.appendChild(header);
    block.appendChild(newPre);
    block.appendChild(fade);

    pre.replaceWith(block);

    header.querySelectorAll("button").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        const act = btn.dataset.act;
        if(act === "toggle"){
          block.classList.toggle("collapsed");
          btn.textContent = block.classList.contains("collapsed") ? "Expand" : "Collapse";
        } else if(act === "wrap"){
          block.classList.toggle("wrap");
        } else if(act === "fullscreen"){
          block.classList.toggle("fullscreen");
          btn.textContent = block.classList.contains("fullscreen") ? "Exit" : "Fullscreen";
        } else if(act === "copy"){
          copyToClipboard(codeText);
          showToast("Code copied");
        }
      });
    });

    try{ hljs.highlightElement(newCode); }catch(e){}
  });
}

/* ============================================================
   4. NAV TREE (sidebar)
   ============================================================ */
const navTreeEl = document.getElementById("navTree");
let currentChapterId = null;

function buildNavTree(){
  navTreeEl.innerHTML = "";
  ALL_CHAPTERS.forEach(ch=>{
    const wrap = document.createElement("div");
    wrap.className = "nav-chapter";
    wrap.dataset.id = ch.id;

    const head = document.createElement("button");
    head.className = "nav-chapter-head";
    head.innerHTML = `
      <svg class="chev" width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 6l6 6-6 6" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
      <span class="nav-chapter-num">${ch.num}</span>
      <span class="nav-chapter-title">${escapeHtml(ch.title.replace(/^Part\s+\d+\s+—\s+/,''))}</span>
    `;
    head.addEventListener("click", ()=>{
      const wasOpen = wrap.classList.contains("open");
      document.querySelectorAll(".nav-chapter.open").forEach(w=>{ if(w!==wrap) w.classList.remove("open"); });
      wrap.classList.toggle("open", !wasOpen || currentChapterId !== ch.id);
      navigateTo(ch.id);
      if(window.innerWidth <= 880) document.getElementById("sidebar").classList.add("collapsed");
    });

    const secList = document.createElement("ul");
    secList.className = "nav-sections";
    ch.headings.filter(h=>h.level===3).forEach(h=>{
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#"+ch.id+"/"+h.id;
      a.textContent = h.text;
      a.addEventListener("click", (e)=>{
        e.preventDefault();
        navigateTo(ch.id, h.id);
        if(window.innerWidth <= 880) document.getElementById("sidebar").classList.add("collapsed");
      });
      li.appendChild(a);
      secList.appendChild(li);
    });

    wrap.appendChild(head);
    wrap.appendChild(secList);
    navTreeEl.appendChild(wrap);
  });
}

function setActiveNav(chapterId, headingId){
  document.querySelectorAll(".nav-chapter").forEach(w=>{
    const active = w.dataset.id === chapterId;
    w.querySelector(".nav-chapter-head").classList.toggle("active-chapter", active);
    if(active) w.classList.add("open");
  });
  document.querySelectorAll(".nav-sections a").forEach(a=>{
    a.classList.toggle("active", headingId && a.getAttribute("href") === "#"+chapterId+"/"+headingId);
  });
}

/* ============================================================
   5. RIGHT RAIL TOC + BREADCRUMB + PREV/NEXT
   ============================================================ */
function buildRailToc(ch){
  const rail = document.getElementById("railToc");
  rail.innerHTML = "";
  if(ch.headings.length === 0){
    rail.innerHTML = '<span style="color:var(--text-faint); font-size:12.5px;">No subsections</span>';
    return;
  }
  ch.headings.forEach(h=>{
    const a = document.createElement("a");
    a.href = "#"+ch.id+"/"+h.id;
    a.textContent = h.text;
    if(h.level===4) a.classList.add("sub");
    a.addEventListener("click",(e)=>{
      e.preventDefault();
      scrollToHeading(h.id);
    });
    rail.appendChild(a);
  });
  document.getElementById("readingTime").textContent = `${ch.readingMinutes} min read · ${ch.wordCount.toLocaleString()} words`;
}

function buildBreadcrumb(ch){
  const bc = document.getElementById("breadcrumb");
  bc.innerHTML = `<span>Handbook</span><span class="sep">/</span><span class="current">${escapeHtml(ch.title)}</span>`;
}

function buildPrevNext(ch){
  const idx = ALL_CHAPTERS.findIndex(c=>c.id===ch.id);
  const prev = ALL_CHAPTERS[idx-1];
  const next = ALL_CHAPTERS[idx+1];
  const nav = document.getElementById("prevNext");
  nav.innerHTML = "";
  if(prev){
    const a = document.createElement("a");
    a.className = "pn-link prev"; a.href="#"+prev.id;
    a.innerHTML = `<span class="pn-label">← Previous</span><span class="pn-title">${escapeHtml(prev.title)}</span>`;
    a.addEventListener("click",(e)=>{e.preventDefault(); navigateTo(prev.id);});
    nav.appendChild(a);
  }
  if(next){
    const a = document.createElement("a");
    a.className = "pn-link next"; a.href="#"+next.id;
    a.innerHTML = `<span class="pn-label">Next →</span><span class="pn-title">${escapeHtml(next.title)}</span>`;
    a.addEventListener("click",(e)=>{e.preventDefault(); navigateTo(next.id);});
    nav.appendChild(a);
  }
}

/* ============================================================
   6. CHAPTER RENDER + ROUTER
   ============================================================ */
const articleRoot = document.getElementById("articleRoot");
let observer = null;

function navigateTo(chapterId, headingId){
  if(chapterId !== currentChapterId){
    renderChapter(chapterId, headingId);
  } else if(headingId){
    scrollToHeading(headingId);
  }
}

function renderChapter(chapterId, headingId){
  const ch = ALL_CHAPTERS.find(c=>c.id===chapterId) || REPORT.overview;
  currentChapterId = ch.id;

  const node = renderMarkdownToNode(ch.raw);
  articleRoot.innerHTML = "";
  while(node.firstChild) articleRoot.appendChild(node.firstChild);
  enhanceCodeSafe(articleRoot);

  document.title = ch.title + " — Phone-Cluster Cloud Handbook";
  buildBreadcrumb(ch);
  buildRailToc(ch);
  buildPrevNext(ch);
  setActiveNav(ch.id, headingId);

  history.replaceState(null, "", "#" + ch.id + (headingId ? "/"+headingId : ""));

  requestAnimationFrame(()=>{
    if(headingId) scrollToHeading(headingId);
    else window.scrollTo({top:0, behavior:"instant" in window ? "instant" : "auto"});
    initMermaid();
    initScrollSpy();
  });
}

function scrollToHeading(id){
  const el = document.getElementById(id);
  if(el){
    const y = el.getBoundingClientRect().top + window.scrollY - (parseInt(getComputedStyle(document.documentElement).getPropertyValue('--topbar-h'))||60) - 14;
    window.scrollTo({top:y, behavior:"smooth"});
  }
}

function initMermaid(){
  if(window.mermaid){
    try{
      window.mermaid.initialize({ startOnLoad:false, theme: document.body.getAttribute('data-theme')==='light' ? 'default':'dark',
        themeVariables: { fontFamily:"Inter, sans-serif" } });
      window.mermaid.run({ querySelector: ".mermaid" });
    }catch(e){ console.warn("mermaid render issue", e); }
  } else {
    window.addEventListener('mermaid-ready', initMermaid, {once:true});
  }
}

function initScrollSpy(){
  if(observer) observer.disconnect();
  const headings = articleRoot.querySelectorAll("h2,h3,h4");
  if(!headings.length) return;
  observer = new IntersectionObserver((entries)=>{
    entries.forEach(entry=>{
      if(entry.isIntersecting){
        const id = entry.target.id;
        document.querySelectorAll(".rail-toc a").forEach(a=>{
          a.classList.toggle("active", a.getAttribute("href") === "#"+currentChapterId+"/"+id);
        });
      }
    });
  }, { rootMargin: "-100px 0px -70% 0px" });
  headings.forEach(h=>observer.observe(h));
}

/* ============================================================
   7. SEARCH
   ============================================================ */
function buildSearchIndex(){
  const idx = [];
  ALL_CHAPTERS.forEach(ch=>{
    idx.push({chapterId:ch.id, chapterTitle:ch.title, headingId:null, text:ch.title, snippet:ch.raw.replace(/[#>*`_\[\]|-]/g," ").trim().slice(0,150)});
    const blocks = ch.raw.split(/\n(?=#{2,4}\s)/);
    blocks.forEach(b=>{
      const hm = b.match(/^#{2,4}\s+(.+)$/m);
      if(hm){
        const text = hm[1].trim();
        const id = slugify(text);
        const snippet = b.replace(/^#{2,4}\s+.+$/m,"").replace(/[#>*`_\[\]|-]/g," ").replace(/\s+/g," ").trim().slice(0,150);
        idx.push({chapterId:ch.id, chapterTitle:ch.title, headingId:id, text, snippet});
      }
    });
  });
  return idx;
}
const SEARCH_INDEX = buildSearchIndex();

const searchInput = document.getElementById("searchInput");
const searchResults = document.getElementById("searchResults");
let activeResultIdx = -1;

function runSearch(q){
  q = q.trim().toLowerCase();
  if(!q){ searchResults.hidden = true; searchResults.innerHTML=""; return; }
  const matches = SEARCH_INDEX.filter(item =>
    item.text.toLowerCase().includes(q) || item.snippet.toLowerCase().includes(q)
  ).slice(0, 9);

  searchResults.innerHTML = "";
  activeResultIdx = -1;
  if(matches.length === 0){
    searchResults.innerHTML = '<div class="sr-empty">No results for “'+escapeHtml(q)+'”</div>';
  } else {
    matches.forEach(m=>{
      const a = document.createElement("a");
      a.className = "search-result-item";
      a.href = "#"+m.chapterId + (m.headingId? "/"+m.headingId:"");
      const hi = (s)=> escapeHtml(s).replace(new RegExp('('+q.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+')','ig'), '<mark>$1</mark>');
      a.innerHTML = `<div class="sr-chapter">${escapeHtml(m.chapterTitle)}</div><div class="sr-title">${hi(m.text)}</div><div class="sr-snippet">${hi(m.snippet)}</div>`;
      a.addEventListener("click",(e)=>{
        e.preventDefault();
        navigateTo(m.chapterId, m.headingId);
        searchResults.hidden = true;
        searchInput.value = "";
        searchInput.blur();
      });
      searchResults.appendChild(a);
    });
  }
  searchResults.hidden = false;
}

searchInput.addEventListener("input", ()=> runSearch(searchInput.value));
searchInput.addEventListener("focus", ()=> { if(searchInput.value) runSearch(searchInput.value); });
searchInput.addEventListener("keydown",(e)=>{
  const items = Array.from(searchResults.querySelectorAll(".search-result-item"));
  if(e.key === "ArrowDown"){ e.preventDefault(); activeResultIdx = Math.min(items.length-1, activeResultIdx+1); updateActiveResult(items); }
  else if(e.key === "ArrowUp"){ e.preventDefault(); activeResultIdx = Math.max(0, activeResultIdx-1); updateActiveResult(items); }
  else if(e.key === "Enter"){ if(items[activeResultIdx]) items[activeResultIdx].click(); }
  else if(e.key === "Escape"){ searchResults.hidden = true; searchInput.blur(); }
});
function updateActiveResult(items){
  items.forEach((it,i)=> it.classList.toggle("active", i===activeResultIdx));
  if(items[activeResultIdx]) items[activeResultIdx].scrollIntoView({block:"nearest"});
}
document.addEventListener("click",(e)=>{
  if(!e.target.closest(".search-wrap")) searchResults.hidden = true;
});

/* ============================================================
   8. THEME / SIDEBAR / FOCUS MODE / PRINT / BACK-TO-TOP
   ============================================================ */
const themeToggle = document.getElementById("themeToggle");
function applyTheme(theme){
  document.body.setAttribute("data-theme", theme);
  try{ localStorage.setItem("pcc-theme", theme); }catch(e){}
  initMermaid();
}
themeToggle.addEventListener("click", ()=>{
  const cur = document.body.getAttribute("data-theme");
  applyTheme(cur === "dark" ? "light" : "dark");
});
(function initTheme(){
  let saved = null;
  try{ saved = localStorage.getItem("pcc-theme"); }catch(e){}
  if(saved) document.body.setAttribute("data-theme", saved);
  else if(window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches){
    document.body.setAttribute("data-theme","light");
  }
})();

document.getElementById("sidebarToggle").addEventListener("click", ()=>{
  document.getElementById("sidebar").classList.toggle("collapsed");
});

const focusBtn = document.getElementById("focusModeBtn");
focusBtn.addEventListener("click", ()=> document.body.classList.toggle("focus-mode"));

document.getElementById("printBtn").addEventListener("click", ()=> window.print());

const backToTop = document.getElementById("backToTop");
backToTop.addEventListener("click", ()=> window.scrollTo({top:0, behavior:"smooth"}));

/* progress bar + back-to-top visibility */
window.addEventListener("scroll", ()=>{
  const doc = document.documentElement;
  const scrolled = (doc.scrollTop) / ((doc.scrollHeight - doc.clientHeight) || 1) * 100;
  document.getElementById("progressBar").style.width = Math.min(100,scrolled) + "%";
  backToTop.classList.toggle("visible", doc.scrollTop > 500);
}, {passive:true});

/* keyboard shortcuts */
document.addEventListener("keydown",(e)=>{
  const tag = (e.target.tagName||"").toLowerCase();
  const typing = tag === "input" || tag === "textarea" || e.target.isContentEditable;
  if(e.key === "/" && !typing){ e.preventDefault(); searchInput.focus(); }
  else if(e.key.toLowerCase() === "f" && !typing){ document.body.classList.toggle("focus-mode"); }
  else if(e.key === "Escape"){
    document.querySelectorAll(".code-block.fullscreen").forEach(b=>b.classList.remove("fullscreen"));
    searchResults.hidden = true;
  }
  else if(e.key === "ArrowLeft" && !typing && e.altKey){
    const idx = ALL_CHAPTERS.findIndex(c=>c.id===currentChapterId);
    if(idx>0) navigateTo(ALL_CHAPTERS[idx-1].id);
  }
  else if(e.key === "ArrowRight" && !typing && e.altKey){
    const idx = ALL_CHAPTERS.findIndex(c=>c.id===currentChapterId);
    if(idx < ALL_CHAPTERS.length-1) navigateTo(ALL_CHAPTERS[idx+1].id);
  }
});

/* ============================================================
   9. MINI CLUSTER WIDGET (decorative, tied to the subject matter)
   ============================================================ */
(function initMiniCluster(){
  const el = document.getElementById("miniCluster");
  const total = 10, off = 1; // one node "offline" — matches Part 1.4 reality
  const offlineIdx = 6;
  for(let i=0;i<total;i++){
    const d = document.createElement("div");
    d.className = "mini-node" + (i===offlineIdx ? "" : " on");
    el.appendChild(d);
  }
})();

/* ============================================================
   10. HASH ROUTING + INIT
   ============================================================ */
function parseHash(){
  const h = location.hash.replace(/^#/, "");
  if(!h) return {chapterId: "overview", headingId: null};
  const [chapterId, headingId] = h.split("/");
  return {chapterId, headingId};
}
window.addEventListener("hashchange", ()=>{
  const {chapterId, headingId} = parseHash();
  if(chapterId !== currentChapterId) renderChapter(chapterId, headingId);
  else if(headingId) scrollToHeading(headingId);
});

buildNavTree();
const initial = parseHash();
renderChapter(initial.chapterId, initial.headingId);

})();
