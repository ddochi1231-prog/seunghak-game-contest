(function () {
  const $ = (s, r = document) => r.querySelector(s);
  const app = $("#app");
  const CFG = window.APP_CONFIG;
  const LS = "gamecontest-user";
  let games = [], user = null, data = null, ticker = null, adminPw = "";
  let filter = "all", search = "", order = "default";
  let gv = null; // 게임 화면 상태

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const stars = (n) => "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
  const fmt = (g, v) => (g.rankType === "time_low" ? (Math.round(v * 10) / 10).toFixed(1) : Math.round(v * 100) / 100) + g.unit;
  const medal = (r) => ({ 1: "🥇", 2: "🥈", 3: "🥉" }[r] || r);
  const ago = (t) => { const s = (Date.now() - t) / 1000; return s < 60 ? "방금" : s < 3600 ? Math.floor(s / 60) + "분 전" : s < 86400 ? Math.floor(s / 3600) + "시간 전" : Math.floor(s / 86400) + "일 전"; };
  let toastT;
  function toast(msg, bad) { const t = $("#toast"); t.textContent = msg; t.className = "toast show" + (bad ? " bad" : ""); clearTimeout(toastT); toastT = setTimeout(() => (t.className = "toast"), 3200); }
  const gameOf = (id) => games.find((g) => g.id === id);
  const isMine = (g) => user && user.grade === g.grade && user.klass === g.class && user.name === g.author;

  /* ---------- 시작 ---------- */
  async function init() {
    $("#brand-text").textContent = CFG.title;
    document.title = CFG.title;
    if (Api.demo) $("#demo-banner").hidden = false;
    games = await (await fetch("games/manifest.json")).json();
    Api.games = games;
    try { user = JSON.parse(localStorage.getItem(LS)); } catch (e) {}
    window.addEventListener("hashchange", route);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
    route();
    setInterval(() => { if (!document.hidden) poll(); }, CFG.pollMs);
  }

  async function poll() {
    const r = await Api.call("poll", { userId: user ? user.id : "" });
    if (r && r.ok) { data = r; renderLive(); }
  }

  function renderWho() {
    $("#who").innerHTML = user
      ? `<span class="chip">${user.grade}학년 ${user.klass}반 ${user.num}번 ${esc(user.name)}</span><button class="btn ghost sm" id="logout">나가기</button>`
      : `<a class="btn sm" href="#/join">대회 참가하기 →</a>`;
    const lo = $("#logout");
    if (lo) lo.onclick = () => { cleanupGame(); localStorage.removeItem(LS); user = null; data = null; location.hash = "#/"; route(); };
  }

  /* ---------- 데스크탑·노트북 전용 ---------- */
  // 게임이 키보드(A/D, 방향키, Tab, Space 등)와 마우스를 쓰기 때문에 터치 기기와 좁은 화면은 막는다.
  const MIN_WIDTH = 980;
  const isTouchDevice = () => /Android|iPhone|iPad|iPod|Mobile|Tablet/i.test(navigator.userAgent) || !matchMedia("(pointer: fine)").matches;
  const screenState = () => (isTouchDevice() ? "touch" : innerWidth < MIN_WIDTH ? "narrow" : "ok");
  let lastScreen = "ok";

  function viewDesktopOnly(kind) {
    document.body.classList.add("blocked");
    app.innerHTML = `<div class="desktop-only"><div class="do-icon">🖥️</div>
      <h1>${kind === "touch" ? "컴퓨터에서 만나요!" : "창을 조금 더 크게 해 주세요"}</h1>
      <p>${kind === "touch"
        ? "이 게임 대회는 <b>키보드와 마우스</b>로 하는 게임이라<br>데스크탑이나 노트북에서만 즐길 수 있어요.<br>(스마트폰·태블릿은 지원하지 않아요)"
        : "게임 화면이 잘 보이도록 브라우저 창을 크게 해 주세요.<br>(가로 " + MIN_WIDTH + "px 이상 필요 · 지금 " + innerWidth + "px)"}</p>
      <p class="hint">권장: 최신 크롬 · 엣지 / 키보드·마우스 사용</p></div>`;
  }

  // 게임 중에는 방향키·스페이스·Tab 이 페이지를 움직이거나 버튼을 다시 누르지 않게 한다
  window.addEventListener("keydown", (e) => {
    if (!gv || !gv.ready || EntryPlayer.state() !== "run") return;
    const t = e.target, typing = t && /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName);
    if (!typing && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " ", "Tab", "Enter"].includes(e.key)) e.preventDefault();
  }, true);

  let resizeT;
  window.addEventListener("resize", () => {
    clearTimeout(resizeT);
    resizeT = setTimeout(() => { const s = screenState(); if ((s === "ok") !== (lastScreen === "ok")) route(); }, 200);
  });

  function route() {
    cleanupGame();
    lastScreen = screenState();
    document.body.classList.toggle("blocked", lastScreen !== "ok");
    if (lastScreen !== "ok") { $("#who").innerHTML = ""; return viewDesktopOnly(lastScreen); }
    renderWho();
    const h = location.hash.replace(/^#/, "") || "/";
    if (h === "/admin") return viewAdmin();
    document.querySelectorAll('[data-nav]').forEach(a => a.classList.toggle('active', a.dataset.nav === h));
    if (h === "/join") return user ? viewHome() : viewLogin();
    if (h === "/guide") return viewGuide();
    if (h === "/ranking") return viewRanking();
    if (h === "/records") return user ? viewRecords() : viewLogin();
    if (!user && h.startsWith("/game/")) return viewLogin();
    const m = h.match(/^\/game\/(g\d+)$/);
    if (m && gameOf(m[1])) return viewGame(gameOf(m[1]));
    viewHome();
  }

  /* ---------- 로그인 ---------- */
  function viewLogin() {
    app.innerHTML = `
    <form class="login" id="lf">
      <h1>🎮 ${esc(CFG.title)}</h1>
      <p class="lead" style="text-align:center">학년, 반, 번호, 이름을 적고 들어오세요!</p>
      <div class="row">
        <label class="field"><span>학년</span><select id="lg">${[1, 2, 3, 4, 5, 6].map((n) => `<option ${n === 6 ? "selected" : ""}>${n}</option>`).join("")}</select></label>
        <label class="field"><span>반</span><input id="lk" type="number" min="1" max="20" inputmode="numeric" required></label>
        <label class="field"><span>번호</span><input id="ln" type="number" min="1" max="60" inputmode="numeric" required></label>
      </div>
      <label class="field"><span>이름</span><input id="lm" maxlength="8" autocomplete="off" required placeholder="예: 홍길동"></label>
      <p class="err" id="le"></p>
      <button class="btn" style="width:100%" id="lb">들어가기</button>
    </form>
    <p class="hint" style="text-align:center"><a href="#/admin">선생님 화면</a></p>`;
    $("#lf").onsubmit = async (e) => {
      e.preventDefault();
      const name = $("#lm").value.trim().replace(/\s+/g, "");
      if (!/^[가-힣a-zA-Z]{2,8}$/.test(name)) return ($("#le").textContent = "이름을 한글로 정확히 써 주세요.");
      $("#lb").disabled = true; $("#le").textContent = "";
      const r = await Api.call("login", { grade: +$("#lg").value, klass: +$("#lk").value, num: +$("#ln").value, name });
      $("#lb").disabled = false;
      if (!r.ok) return ($("#le").textContent = r.error || "로그인에 실패했어요.");
      user = r.user; localStorage.setItem(LS, JSON.stringify(user));
      location.hash = "#/"; route(); poll();
    };
  }

  /* ---------- 목록 ---------- */
  function viewHome() {
    app.innerHTML = `<section class="hero"><div class="hero-copy"><span class="eyebrow">2026 승학초 게임 페스티벌</span><h1>우리가 만든 게임,<br>함께 즐기는 도전!</h1><p>6학년 친구들의 상상력이 담긴 10개의 게임.<br>새로운 기록에 도전하고, 친구에게 응원을 보내요.</p><a href="#games-section" id="explore" class="btn hero-btn">게임 만나러 가기 <span>↗</span></a><span class="hero-small">누구나 즐겁게, 서로를 존중하며</span></div><div class="hero-art" aria-hidden="true"><span class="spark s1">✦</span><span class="spark s2">✧</span><span class="float-pill">READY, PLAY!</span><div class="controller"><div class="cross">✚</div><div class="pad-buttons"><i></i><i></i><i></i><i></i></div><div class="pad-center"><i></i><i></i></div></div><div class="art-shadow"></div><span class="art-star">★</span><span class="float-heart">♥</span></div></section>
    <section class="stats"><div><span class="stat-icon lavender">▦</span><p><b>10 <small>개</small></b><span>친구들이 만든 게임</span></p></div><div><span class="stat-icon peach">✎</span><p><b>10 <small>명</small></b><span>멋진 게임 제작자</span></p></div><div><span class="stat-icon mint">⚑</span><p><b id="my-count">${user ? '0' : '—'} <small>개</small></b><span>내가 도전한 게임</span></p></div><div><span class="stat-icon yellow">♡</span><p><b id="review-count">0 <small>개</small></b><span>친구들이 남긴 응원</span></p></div></section>
    <section id="games-section"><div class="section-heading"><div><h2>어떤 게임에 도전할까요? <span>10</span></h2><p>마음에 드는 게임을 골라 시작해 보세요.</p></div><label class="search-box">⌕ <input id="search" placeholder="게임 또는 제작자 찾기" aria-label="게임 또는 제작자 찾기"></label></div><div class="filter-row"><div class="filters">${[['all','전체 게임'],['1','6학년 1반'],['2','6학년 2반'],['3','6학년 3반']].map(([v,n])=>`<button class="filter ${filter===v?'active':''}" data-filter="${v}">${n}</button>`).join('')}</div><select id="sort" aria-label="게임 정렬"><option value="default">기본 순서</option><option value="reviews">후기 많은 순</option><option value="rating">별점 높은 순</option></select></div><div id="closed"></div><div class="grid" id="grid"></div></section><footer class="page-footer">작은 상상, 커다란 즐거움. <b>승학초등학교 게임 페스티벌</b> <span>서로 응원하는 우리들의 대회 ♡</span></footer>`;
    $("#explore").onclick=e=>{e.preventDefault();$("#games-section").scrollIntoView({behavior:"smooth"});};
    $("#search").value=search; $("#sort").value=order;
    $("#search").oninput=e=>{search=e.target.value;renderLive();};
    $("#sort").onchange=e=>{order=e.target.value;renderLive();};
    document.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;document.querySelectorAll('[data-filter]').forEach(x=>x.classList.toggle('active',x===b));renderLive();});
    renderLive(); poll();
  }
  const MODE = { score_high: "🏆 점수 대결", time_low: "⏱ 빠른 클리어", review: "⭐ 별점 평가" };
  const RULE = {
    score_high: "점수가 높을수록 순위가 올라가요. 게임이 끝나면 점수가 자동으로 기록돼요.",
    time_low: "빨리 클리어할수록 순위가 올라가요. 클리어하면 ‘클리어했어요!’ 버튼을 눌러요.",
    review: "이 게임은 점수 대신 친구들의 별점과 후기로 평가해요.",
  };
  const gnum = (g) => Number(g.id.slice(1));

  function cardHtml(g) {
    const d = data && data.games[g.id];
    const bottom = g.rankType === "review"
      ? (d && d.reviewCount ? `응원 ${d.reviewCount}개` : "첫 후기를 남겨 주세요")
      : d && d.top[0] ? `🥇 ${esc(d.top[0].label)} <b>${fmt(g, d.top[0].value)}</b>` : "첫 도전자를 기다려요";
    return `<a class="card tone-${gnum(g) % 5}" href="#/game/${g.id}"><div class="thumb"><span class="game-number">GAME ${String(gnum(g)).padStart(2, "0")}</span><img class="game-art" src="${g.thumb}" alt="${esc(g.title)} 대표 그림" onerror="this.remove()"><span class="mode-badge">${MODE[g.rankType]}</span></div>
      <div class="body"><div class="card-heading"><h3>${esc(g.title)}</h3><span>›</span></div>
      <div class="meta"><span class="author-avatar">${esc(g.author[0])}</span>${g.grade}학년 ${g.class}반 ${esc(g.author)}</div>
      <p class="desc">${esc(g.desc)}</p>
      <div class="card-rating"><span>${stars(d ? d.avg : 0)}</span> ${d && d.reviewCount ? d.avg.toFixed(1) : ""}<small>후기 ${d ? d.reviewCount : 0}개</small></div>
      <div class="card-bottom"><span>${bottom}</span><b>▶ 플레이</b></div></div></a>`;
  }

  function starBoard() {
    if (!data) return "";
    const rows = games.map((g) => ({ g, d: data.games[g.id] })).filter((x) => x.d && x.d.reviewCount > 0)
      .sort((a, b) => b.d.avg - a.d.avg || b.d.reviewCount - a.d.reviewCount).slice(0, 5);
    if (!rows.length) return `<p class="hint">아직 후기가 없어요. 게임을 해 보고 별점을 남겨 주세요 ⭐</p>`;
    return `<ul class="rank-list">${rows.map((x, i) =>
      `<li><span class="no">${medal(i + 1)}</span><span class="nm"><a href="#/game/${x.g.id}"><b>${esc(x.g.title)}</b></a> <span class="meta" style="display:inline">${esc(x.g.author)}</span></span><span class="val"><span class="stars">★</span> ${x.d.avg.toFixed(1)} <span class="hint">(${x.d.reviewCount})</span></span></li>`).join("")}</ul>`;
  }

  /* ---------- 참가 안내 / 게임별 순위 / 내 기록 ---------- */
  function viewGuide() {
    app.innerHTML = `<div class="page-title"><span class="eyebrow">GUIDE</span><h1>참가 안내</h1><p class="lead">처음이라면 이 순서대로 해 보세요!</p></div>
    <div class="guide-grid">
      <section class="panel"><span class="step">01</span><h2>들어가기</h2><p>‘대회 참가하기’를 누르고 학년, 반, 번호, 이름을 적어요. 이름은 친구들에게 ‘김○○’처럼 일부만 보여요.</p></section>
      <section class="panel"><span class="step">02</span><h2>게임 고르기</h2><p>목록에서 마음에 드는 게임 카드를 눌러요. 게임 소개와 조작법을 읽고 ▶ 시작 버튼을 누르면 바로 플레이할 수 있어요.</p></section>
      <section class="panel"><span class="step">03</span><h2>기록 남기기</h2><p>🏆 점수 대결: 게임이 끝나면 점수가 자동으로 기록돼요.<br>⏱ 빠른 클리어: 클리어하면 ‘클리어했어요!’ 버튼을 눌러요.<br>⭐ 별점 평가: 점수 없이 별점과 후기로 평가해요.</p></section>
      <section class="panel"><span class="step">04</span><h2>응원 남기기</h2><p>게임을 해 본 뒤 별점과 후기를 남겨요. 내가 만든 게임에는 후기를 쓸 수 없고, 고운 말을 써야 해요. 순위는 5초마다 저절로 바뀌어요.</p></section>
    </div>
    <div class="panel" style="margin-top:20px"><b>게임별 순위 방식</b><ul class="rank-list">${games.map((g) => `<li><span class="no">${gnum(g)}</span><span class="nm"><a href="#/game/${g.id}"><b>${esc(g.title)}</b></a></span><span class="val" style="font-weight:600;font-size:.85rem">${MODE[g.rankType]}</span></li>`).join("")}</ul></div>`;
  }

  function viewRanking() {
    app.innerHTML = `<div class="page-title"><span class="eyebrow">RANKING</span><h1>게임별 순위</h1><p class="lead">친구들의 도전 기록이에요. 자동으로 새로 바뀌어요 🔄</p></div>
      <div class="panel" style="margin-bottom:18px"><b>🌟 별점 인기 순위</b><div id="starboard"></div></div>
      <div class="grid" id="rank-overview"></div>`;
    renderLive(); poll();
  }

  function viewRecords() {
    app.innerHTML = `<div class="page-title"><span class="eyebrow">MY RECORDS</span><h1>내 도전 기록</h1><p class="lead">${esc(user.name)} 친구의 기록과 후기예요.</p></div><div class="grid" id="records"></div>`;
    renderLive(); poll();
  }

  /* ---------- 실시간 갱신 ---------- */
  function renderLive() {
    if ($("#grid")) {
      let visible=games.filter(g=>(filter==='all'||String(g.class)===filter)&&`${g.title} ${g.author}`.includes(search.trim()));
      if(order!=='default') visible.sort((a,b)=>((data?.games[b.id]?.[order==='rating'?'avg':'reviewCount']||0)-(data?.games[a.id]?.[order==='rating'?'avg':'reviewCount']||0)));
      $("#grid").innerHTML = visible.map(cardHtml).join("") || '<p class="empty">찾는 게임이 없어요. 다른 이름으로 찾아보세요.</p>';
      if(data){$("#my-count").innerHTML=Object.values(data.games).filter(g=>g.mine).length+' <small>개</small>';$("#review-count").innerHTML=Object.values(data.games).reduce((n,g)=>n+g.reviewCount,0)+' <small>개</small>';}
      $("#closed").innerHTML = data && !data.open ? `<div class="panel" style="margin-bottom:12px">🏁 대회가 끝났어요. 기록은 더 이상 바뀌지 않아요.</div>` : "";
    }
    if ($("#starboard")) $("#starboard").innerHTML = starBoard();
    if ($("#rank-overview")) $("#rank-overview").innerHTML = games.map((g) => { const d = data && data.games[g.id];
      const body = g.rankType === "review"
        ? `<p class="empty" style="padding:10px 0">⭐ 점수 대신 별점으로 평가해요<br><b>${d && d.reviewCount ? d.avg.toFixed(1) + "점 (후기 " + d.reviewCount + "개)" : "첫 후기를 기다려요"}</b></p>`
        : `<ul class="rank-list">${d && d.top.length ? d.top.slice(0, 5).map((r) => `<li class="${r.mine ? "mine" : ""}"><span class="no">${medal(r.rank)}</span><span class="nm">${esc(r.label)}</span><b>${fmt(g, r.value)}</b></li>`).join("") : '<li class="empty">첫 번째 도전자를 기다려요!</li>'}</ul>`;
      return `<article class="panel"><a href="#/game/${g.id}"><h3>${esc(g.title)} ↗</h3></a><span class="hint">${MODE[g.rankType]}</span>${body}</article>`; }).join("");
    if ($("#records")) $("#records").innerHTML = games.map((g) => { const d = data && data.games[g.id]; const myRev = data && data.reviews[g.id] && data.reviews[g.id].find((r) => r.mine);
      const rec = g.rankType === "review" ? "⭐ 별점 평가 게임" : d && d.mine ? `<b>${d.mine.rank}위 · ${fmt(g, d.mine.value)}</b>` : "아직 도전 기록이 없어요";
      return `<a class="panel" href="#/game/${g.id}"><h3>${esc(g.title)} ↗</h3><p>${rec}</p><span class="hint">${myRev ? "♡ 내 후기: " + stars(myRev.rating) : "게임에 도전하고 응원을 남겨요"}</span></a>`; }).join("");
    if (gv) { renderRank(); renderReviews(); }
  }

  /* ---------- 게임 화면 ---------- */
  function viewGame(g) {
    const t = g.rankType;
    app.innerHTML = `<p><a href="#/" class="btn ghost sm">← 게임 목록</a></p>
    <div class="game-head tone-${gnum(g) % 5}"><img class="game-art-lg" src="${g.thumb}" alt="" onerror="this.remove()"><div><span class="eyebrow">GAME ${String(gnum(g)).padStart(2, "0")} · ${MODE[t]}</span><h1>${esc(g.title)}</h1><p class="lead" style="margin:0">${g.grade}학년 ${g.class}반 ${esc(g.author)} 제작</p><p class="gdesc">${esc(g.desc)}</p></div></div>
    <div class="game"><section>
      <div class="panel">
        <div class="stage-wrap" id="stagewrap"><div class="loading" id="loading"><div>게임을 불러오는 중…<br><small>처음에는 조금 걸려요</small></div><div class="bar"><i id="pbar"></i></div></div><button class="play-overlay" id="playOverlay" hidden><span>▶</span><em>게임 시작!</em></button></div>
        <div class="controls">
          <button class="btn ok" id="bRun">▶ 시작</button>
          <button class="btn ghost" id="bRestart">↻ 다시 시작</button>
          <button class="btn ghost" id="bStop">■ 멈춤</button>
          <button class="btn ghost" id="bFull">⛶ 크게 보기</button>
          ${t === "score_high" ? `<button class="btn" id="bSubmit">🏆 점수 기록하기</button>` : ""}
          ${t === "time_low" ? `<button class="btn" id="bClear">🏁 클리어했어요!</button>` : ""}
        </div>
        <div class="status"><div class="score-box" id="live">대기 중</div><span class="hint" id="rule"></span></div>
      </div>
      <div class="panel info" style="margin-top:16px">
        <h2>🎮 게임 안내</h2>
        <dl><dt>특징</dt><dd>${esc(g.desc)}</dd><dt>조작</dt><dd>${esc(g.controls)}</dd><dt>진행</dt><dd>${esc(g.steps)}</dd><dt>끝나는 때</dt><dd>${esc(g.finish)}</dd></dl>
      </div></section>
      <aside class="panel">
        <div class="tabs"><button class="tab on" data-t="rank">${t === "review" ? "⭐ 별점" : "🏆 순위"}</button><button class="tab" data-t="rev">💬 후기</button></div>
        <div id="pane-rank"></div>
        <div id="pane-rev" hidden><div id="reviews"></div><div id="rform"></div></div>
      </aside></div>`;
    $("#rule").textContent = RULE[t];
    gv = { g, runStart: 0, peak: null, cur: null, last: "stop", ready: false, rating: 0, touched: false };
    document.querySelectorAll(".tab").forEach((b) => (b.onclick = () => {
      document.querySelectorAll(".tab").forEach((x) => x.classList.toggle("on", x === b));
      $("#pane-rank").hidden = b.dataset.t !== "rank"; $("#pane-rev").hidden = b.dataset.t !== "rev";
    }));
    renderReviewForm(); renderLive(); poll();
    const bind = (id, f) => { const e = $("#" + id); if (e) e.onclick = f; };
    const begin = () => { if (gv.ready) { gv.runStart = Date.now(); gv.peak = null; gv.cur = null; gv.endSent = false; gv.sawEarlier = false; gv.last = "run"; EntryPlayer.run(); const o = $("#playOverlay"); if (o) o.hidden = true; } };
    bind("bRun", begin); bind("playOverlay", begin);
    bind("bRestart", () => { if (gv.ready) { gv.runStart = Date.now(); gv.peak = null; gv.cur = null; gv.endSent = false; gv.sawEarlier = false; gv.last = "run"; EntryPlayer.restart(); const o = $("#playOverlay"); if (o) o.hidden = true; } });
    bind("bStop", () => EntryPlayer.stop());
    bind("bFull", () => EntryPlayer.fullscreen($("#stagewrap")));
    bind("bSubmit", () => submitScoreNow());
    bind("bClear", () => {
      if (gv.last !== "run") return toast("먼저 게임을 시작해 주세요!", true);
      const s = (Date.now() - gv.runStart) / 1000; gv.last="stop"; EntryPlayer.stop(); sendScore(s);
    });
    bind("bManual", () => { const v = parseFloat($("#manual").value); if (!isFinite(v)) return toast("숫자를 써 주세요.", true); sendScore(v); });
    startGame(g);
  }

  async function startGame(g) {
    // 엔트리는 한 페이지에서 프로젝트를 여러 번 바꾸면 이전 게임이 섞이므로, 두 번째 게임부터는 새로 불러온다 (라이브러리는 캐시됨)
    if (EntryPlayer.opened) return location.reload();
    const host = ensureHost();
    host.style.display = "";
    $("#stagewrap").prepend(host);
    try {
      await EntryPlayer.boot(host, (p) => { const b = $("#pbar"); if (b) b.style.width = Math.round(p * 100) + "%"; });
      if (!gv || gv.g !== g) return;
      await EntryPlayer.open(g);
      if (!gv || gv.g !== g) return;
      gv.ready = true;
      const l = $("#loading"); if (l) l.remove();
      const o = $("#playOverlay"); if (o) o.hidden = false;
      ticker = setInterval(tick, 200);
    } catch (e) {
      const l = $("#loading");
      if (l) l.innerHTML = `<div>게임을 불러오지 못했어요 😢<br><small>${esc(e.message || e)}</small><br><br><button class="btn" onclick="location.reload()">다시 시도</button></div>`;
    }
  }
  function ensureHost() {
    let h = document.getElementById("entry");
    if (!h) { h = document.createElement("div"); h.id = "entry"; }
    return h;
  }

  function tick() {
    if (!gv || !gv.ready) return;
    const s = EntryPlayer.state(), g = gv.g, scored = g.rankType === "score_high";
    if (s === "run" && gv.last !== "run") { gv.runStart = Date.now(); gv.peak = null; gv.cur = null; gv.endSent = false; gv.sawEarlier = false; }
    if (s === "run") {
      const v = EntryPlayer.readVar(g);
      if (v != null) { gv.cur = v; if (gv.peak == null || v > gv.peak) gv.peak = v; }
      const sec = ((Date.now() - gv.runStart) / 1000).toFixed(1);
      $("#live").textContent = scored ? `점수 ${v == null ? 0 : v}${g.unit}` : `${sec}초`;
      // 결과 장면(마지막 장면)에 도착하면 게임이 끝난 것으로 보고 점수를 자동 기록
      const st = EntryPlayer.sceneStage();
      if (st === 1) gv.sawEarlier = true;
      if (scored && st === 2 && gv.sawEarlier && !gv.endSent) {
        gv.endSent = true; const fv = finalValue();
        if (fv != null && fv > 0) { gv.peak = null; sendScore(fv); }
      }
    } else if (gv.last === "run") {
      const v = finalValue();
      if (scored && v != null && v > 0) { gv.peak = null; gv.cur = null; sendScore(v); }
      else $("#live").textContent = "멈춤";
      const o = $("#playOverlay"); if (o) { o.hidden = false; o.querySelector("em").textContent = "다시 하기!"; }
    }
    gv.last = s;
  }

  // 점수로 낼 값: peak(플레이 중 최고) 또는 final(끝났을 때 값)
  function finalValue() {
    const g = gv.g;
    if (g.scoreMode === "final") { const v = EntryPlayer.readVar(g); return v != null ? v : gv.cur; }
    return gv.peak != null ? gv.peak : EntryPlayer.readVar(g);
  }

  function submitScoreNow() {
    if (!gv.ready) return;
    const v = finalValue();
    if (v == null || v <= 0) return toast("아직 기록할 점수가 없어요.", true);
    gv.peak = null; gv.cur = null; sendScore(v);
  }

  async function sendScore(v) {
    const g = gv.g;
    $("#live").textContent = `기록 ${fmt(g, v)}`;
    const r = await Api.call("score", { userId: user.id, gameId: g.id, value: v });
    if (!r.ok) return toast(r.error || "기록을 보내지 못했어요.", true);
    toast(r.improved ? `🎉 ${fmt(g, v)} 기록 완료! 내 최고 기록이에요.` : `${fmt(g, v)} — 내 최고 기록(${fmt(g, r.best)})보다 낮아서 최고 기록은 그대로예요.`);
    poll();
  }

  function renderRank() {
    const g = gv.g, d = data && data.games[g.id], box = $("#pane-rank");
    if (!box) return;
    if (!d) return (box.innerHTML = `<p class="empty">불러오는 중…</p>`);
    if (g.rankType === "review") {
      const order2 = games.filter((x) => data.games[x.id] && data.games[x.id].reviewCount > 0).sort((a, b) => data.games[b.id].avg - data.games[a.id].avg || data.games[b.id].reviewCount - data.games[a.id].reviewCount);
      const pos = order2.findIndex((x) => x.id === g.id) + 1;
      return (box.innerHTML = `<div class="star-big"><div class="stars">${stars(d.avg)}</div><b>${d.reviewCount ? d.avg.toFixed(1) : "-"}</b><span class="hint">후기 ${d.reviewCount}개</span>${pos ? `<p>전체 별점 <b>${pos}위</b> / ${order2.length}개 게임</p>` : `<p class="hint">첫 별점을 남겨 주세요!</p>`}</div><p class="hint">이 게임은 점수 대신 별점과 후기로 평가해요. 💬 후기 탭에서 응원을 남겨 주세요.</p>`);
    }
    const rows = d.top.map((r) => `<li class="${r.mine ? "mine" : ""}"><span class="no">${medal(r.rank)}</span><span class="nm">${esc(r.label)}</span><span class="val">${fmt(g, r.value)}</span></li>`).join("");
    const me = d.mine && d.mine.rank > 10 ? `<p class="hint">내 순위: <b>${d.mine.rank}위</b> · ${fmt(g, d.mine.value)}</p>` : "";
    box.innerHTML = `<p class="hint">참가 ${d.players}명 · 자동 갱신 중 🔄</p>` + (rows ? `<ul class="rank-list">${rows}</ul>` : `<p class="empty">아직 기록이 없어요.<br>첫 번째 도전자가 되어 보세요!</p>`) + me;
  }

  function renderReviews() {
    const g = gv.g, box = $("#reviews"); if (!box) return;
    const list = (data && data.reviews[g.id]) || [];
    const d = data && data.games[g.id];
    box.innerHTML = `<p class="hint">${d ? `<span class="stars">${stars(d.avg)}</span> ${d.reviewCount ? d.avg.toFixed(1) : "-"} · 후기 ${d.reviewCount}개` : ""}</p>` +
      (list.length ? list.map((r) => `<div class="review"><div class="who2"><span>${esc(r.label)} <span class="stars">${stars(r.rating)}</span></span><span>${ago(r.at)}</span></div><p>${esc(r.text)}</p></div>`).join("") : `<p class="empty">아직 후기가 없어요.</p>`);
    // 내 후기를 입력칸에 채움 (아직 안 만졌을 때만)
    const mine = list.find((r) => r.mine);
    if (!gv.touched && mine && $("#rtext")) {
      $("#rtext").value = mine.text; gv.rating = mine.rating; paintStars();
      const del = $("#rdel"); if (del) del.hidden = false;
    }
  }

  function renderReviewForm() {
    const g = gv.g, box = $("#rform");
    if (isMine(g)) return (box.innerHTML = `<p class="hint" style="margin-top:12px">내가 만든 게임에는 후기를 쓸 수 없어요. 친구들의 후기를 읽어 보세요 😊</p>`);
    box.innerHTML = `<hr style="border:0;border-top:1px solid var(--line);margin:14px 0">
      <b>내 후기 쓰기</b>
      <div class="starpick" id="starpick">${[1, 2, 3, 4, 5].map((n) => `<button type="button" data-n="${n}" aria-label="${n}점">★</button>`).join("")}</div>
      <textarea id="rtext" rows="3" maxlength="200" placeholder="재미있었던 점, 좋았던 점을 친절하게 적어 주세요 (200자)"></textarea>
      <div class="hint" style="text-align:right"><span id="rcnt">0</span>/200</div>
      <div class="controls"><button class="btn" id="rsave">후기 저장</button><button class="btn ghost" id="rdel" hidden>삭제</button></div>`;
    document.querySelectorAll("#starpick button").forEach((b) => (b.onclick = () => { gv.rating = +b.dataset.n; gv.touched = true; paintStars(); }));
    $("#rtext").oninput = () => { gv.touched = true; $("#rcnt").textContent = $("#rtext").value.length; };
    $("#rsave").onclick = async () => {
      if (!gv.rating) return toast("별점을 골라 주세요 ⭐", true);
      const r = await Api.call("review", { userId: user.id, gameId: g.id, rating: gv.rating, text: $("#rtext").value });
      if (!r.ok) return toast(r.error || "저장하지 못했어요.", true);
      toast("후기를 저장했어요! 고마워요 💙"); gv.touched = false; $("#rdel").hidden = false; poll();
    };
    $("#rdel").onclick = async () => {
      if (!confirm("내 후기를 지울까요?")) return;
      await Api.call("deleteReview", { userId: user.id, gameId: g.id });
      $("#rtext").value = ""; gv.rating = 0; gv.touched = false; paintStars(); $("#rdel").hidden = true; poll();
    };
    paintStars();
  }
  function paintStars() {
    document.querySelectorAll("#starpick button").forEach((b) => b.classList.toggle("on", +b.dataset.n <= gv.rating));
    const c = $("#rcnt"); if (c && $("#rtext")) c.textContent = $("#rtext").value.length;
  }

  function cleanupGame() {
    if (ticker) { clearInterval(ticker); ticker = null; }
    if (gv) {
      if (gv.ready && gv.last === "run" && gv.g.rankType === "score_high" && user) { const v = finalValue(); if (v > 0) Api.call("score", { userId: user.id, gameId: gv.g.id, value: v }); }
      if (gv.ready) EntryPlayer.stop();
      const h = document.getElementById("entry");
      if (h) { document.body.appendChild(h); h.style.display = "none"; }
    }
    gv = null;
  }

  /* ---------- 선생님(관리자) ---------- */
  function viewAdmin() {
    app.innerHTML = `<p><a href="#/" class="btn ghost sm">← 돌아가기</a></p><h1>선생님 화면</h1>
      <form class="login" id="af" style="margin:12px 0;max-width:380px"><label class="field"><span>관리자 암호</span><input id="ap" type="password" autocomplete="off"></label><p class="err" id="ae"></p><button class="btn" style="width:100%">열기</button></form><div id="aout"></div>`;
    $("#af").onsubmit = async (e) => { e.preventDefault(); adminPw = $("#ap").value; await adminCall("list"); };
  }
  async function adminCall(op, extra) {
    const r = await Api.call("admin", { password: adminPw, op, ...(extra || {}) });
    if (!r.ok) { const e = $("#ae"); if (e) e.textContent = r.error; else toast(r.error, true); return; }
    $("#af").hidden = true;
    let h = `<div class="panel" style="margin-bottom:14px"><b>대회 상태:</b> ${r.open ? "진행 중" : "종료"} <button class="btn sm ${r.open ? "bad" : "ok"}" id="aopen" style="margin-left:8px">${r.open ? "대회 종료(기록 잠금)" : "대회 다시 열기"}</button></div>`;
    for (const g of games) {
      const d = r.games[g.id], rv = r.reviews[g.id] || [];
      h += `<div class="panel" style="margin-bottom:14px"><h3 style="margin:0 0 6px">${esc(g.title)} <span class="meta">${g.grade}-${g.class} ${esc(g.author)} · 기록 ${d.players}명</span> <button class="btn ghost sm" data-reset="${g.id}">기록 초기화</button></h3><p class="hint" style="margin:0 0 8px">📌 교사 참고: ${esc(g.ops)}</p>
      <table class="tbl"><tr><th>순위</th><th>학생</th><th>기록</th><th></th></tr>${d.top.map((s) => `<tr><td>${s.rank}</td><td>${esc(s.label)}</td><td>${fmt(g, s.value)}</td><td>${s.userId ? `<button class="btn bad sm" data-ds="${g.id}|${esc(s.userId)}">삭제</button>` : ""}</td></tr>`).join("") || `<tr><td colspan="4" class="hint">기록 없음</td></tr>`}</table>
      <table class="tbl" style="margin-top:8px"><tr><th>후기</th><th>작성자</th><th></th></tr>${rv.map((x) => `<tr><td>${"★".repeat(x.rating)} ${esc(x.text)}</td><td>${esc(x.label)}</td><td><button class="btn bad sm" data-dr="${x.id}">삭제</button></td></tr>`).join("") || `<tr><td colspan="3" class="hint">후기 없음</td></tr>`}</table></div>`;
    }
    h = `<div class="controls"><button class="btn ghost" id="export-data">상위 10명 기록·후기 내려받기 (CSV)</button></div>` + h;
    $("#aout").innerHTML = h;
    $("#export-data").onclick=()=>{const rows=[['종류','게임','학생','순위','기록 또는 별점','후기']];for(const g of games){for(const x of r.games[g.id].top) rows.push(['기록',g.title,x.label,x.rank,x.value,'']);for(const x of r.reviews[g.id]||[]) rows.push(['후기',g.title,x.label,'',x.rating,x.text]);}const safe=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';const url=URL.createObjectURL(new Blob(['\ufeff'+rows.map(row=>row.map(safe).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='승학초-게임대회.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
    $("#aopen").onclick = () => adminCall("setOpen", { open: !r.open });
    document.querySelectorAll("[data-dr]").forEach((b) => (b.onclick = () => confirm("이 후기를 삭제할까요?") && adminCall("deleteReview", { id: Number(b.dataset.dr) })));
    document.querySelectorAll("[data-ds]").forEach((b) => (b.onclick = () => { const [gameId, userId] = b.dataset.ds.split("|"); confirm("이 기록을 삭제할까요?") && adminCall("deleteScore", { gameId, userId }); }));
    document.querySelectorAll("[data-reset]").forEach((b) => (b.onclick = () => confirm("이 게임의 모든 기록을 지울까요?") && adminCall("resetGame", { gameId: b.dataset.reset })));
  }

  init().catch(() => { app.innerHTML = `<div class="panel empty">게임 목록을 불러오지 못했어요.<br><button class="btn" onclick="location.reload()">다시 불러오기</button></div>`; });
})();
