// 서버(구글 Apps Script) 또는 데모(localStorage) 와 통신한다.
(function () {
  const BAD = ["시발", "씨발", "병신", "개새끼", "ㅅㅂ", "ㅂㅅ", "지랄", "좆", "꺼져", "죽어", "바보", "멍청"];
  const KEY = "gamecontest-demo-v1";

  function maskName(n) {
    if (!n) return "";
    if (n.length <= 1) return n;
    if (n.length === 2) return n[0] + "○";
    return n[0] + "○".repeat(n.length - 2) + n[n.length - 1];
  }
  function uidOf(userId) { // 짧은 해시 (화면 구분용)
    let h = 5381;
    for (const c of userId) h = ((h << 5) + h + c.charCodeAt(0)) >>> 0;
    return h.toString(16).slice(-6);
  }
  const hasBad = (t) => BAD.some((b) => t.replace(/\s/g, "").includes(b));

  /* ---------- 데모 모드 ---------- */
  const Demo = {
    load() {
      try { return JSON.parse(localStorage.getItem(KEY)) || { users: {}, scores: [], reviews: [], seq: 1, open: true }; }
      catch (e) { return { users: {}, scores: [], reviews: [], seq: 1, open: true }; }
    },
    save(db) { localStorage.setItem(KEY, JSON.stringify(db)); },
    async call(action, p, games) {
      const db = this.load();
      const fail = (msg) => ({ ok: false, error: msg });
      switch (action) {
        case "login": {
          if (![p.grade,p.klass,p.num].every(Number.isInteger) || p.grade<1 || p.grade>6 || p.klass<1 || p.klass>20 || p.num<1 || p.num>60) return fail("학년, 반, 번호를 확인해 주세요.");
          const id = `${p.grade}-${p.klass}-${p.num}`;
          const ex = db.users[id];
          if (ex && ex.name !== p.name) return fail("이 번호에는 다른 이름이 이미 등록되어 있어요. 이름을 다시 확인하거나 선생님께 알려 주세요.");
          if (!ex) db.users[id] = { id, grade: p.grade, klass: p.klass, num: p.num, name: p.name, at: Date.now() };
          this.save(db);
          return { ok: true, user: { id, uid: uidOf(id), grade: p.grade, klass: p.klass, num: p.num, name: p.name } };
        }
        case "poll": return { ok: true, ...this.snapshot(db, games, p.userId) };
        case "score": {
          if (!db.open) return fail("대회가 끝났어요.");
          const g = games.find((x) => x.id === p.gameId); if (!g) return fail("없는 게임이에요.");
          if (g.rankType === "review") return fail("이 게임은 별점으로 평가해요.");
          const u = db.users[p.userId]; if (!u) return fail("다시 로그인해 주세요.");
          const v = Number(p.value); if (!isFinite(v) || v<0 || v>1e9) return fail("올바른 점수를 입력해 주세요.");
          const low = g.rankType === "time_low";
          let row = db.scores.find((s) => s.gameId === g.id && s.userId === p.userId);
          let improved = false;
          if (!row) { row = { gameId: g.id, userId: p.userId, value: v, attempts: 1, at: Date.now() }; db.scores.push(row); improved = true; }
          else { row.attempts++; if (low ? v < row.value : v > row.value) { row.value = v; row.at = Date.now(); improved = true; } }
          this.save(db);
          return { ok: true, improved, best: row.value };
        }
        case "review": {
          if (!db.open) return fail("대회가 끝났어요.");
          const g = games.find((x) => x.id === p.gameId); if (!g) return fail("없는 게임이에요.");
          const u = db.users[p.userId]; if (!u) return fail("다시 로그인해 주세요.");
          const text = String(p.text || "").trim();
          if (u.grade === g.grade && u.klass === g.class && u.name === g.author) return fail("내가 만든 게임에는 후기를 쓸 수 없어요.");
          if (!(p.rating >= 1 && p.rating <= 5)) return fail("별점을 골라 주세요.");
          if (text.length < 2 || text.length > 200) return fail("후기는 2~200자로 써 주세요.");
          if (hasBad(text)) return fail("예쁜 말로 써 주세요.");
          let r = db.reviews.find((x) => x.gameId === g.id && x.userId === p.userId);
          if (r) { r.rating = p.rating; r.text = text; r.edited = Date.now(); }
          else db.reviews.push({ id: db.seq++, gameId: g.id, userId: p.userId, rating: p.rating, text, at: Date.now() });
          this.save(db);
          return { ok: true };
        }
        case "deleteReview": {
          db.reviews = db.reviews.filter((x) => !(x.gameId === p.gameId && x.userId === p.userId));
          this.save(db); return { ok: true };
        }
        case "admin": {
          if (p.password !== "admin") return fail("관리자 암호가 달라요. (데모 암호: admin)");
          if (p.op === "deleteReview") db.reviews = db.reviews.filter((x) => x.id !== p.id);
          if (p.op === "deleteScore") db.scores = db.scores.filter((x) => !(x.gameId === p.gameId && x.userId === p.userId));
          if (p.op === "resetGame") db.scores = db.scores.filter((x) => x.gameId !== p.gameId);
          if (p.op === "setOpen") db.open = !!p.open;
          this.save(db);
          return { ok: true, ...this.snapshot(db, games, "", true) };
        }
      }
      return fail("알 수 없는 요청");
    },
    snapshot(db, games, userId, admin) {
      const out = { open: db.open, games: {}, reviews: {} };
      for (const g of games) {
        const low = g.rankType === "time_low";
        const rows = db.scores.filter((s) => s.gameId === g.id).sort((a, b) => (low ? a.value - b.value : b.value - a.value) || a.at - b.at);
        const mk = (s, i) => { const u = db.users[s.userId] || {}; return { rank: i + 1, label: `${u.grade}학년 ${u.klass}반 ${admin ? u.name : maskName(u.name)}`, value: s.value, mine: s.userId === userId, userId: admin ? s.userId : undefined }; };
        const all = rows.map(mk);
        const rv = db.reviews.filter((r) => r.gameId === g.id).sort((a, b) => b.at - a.at);
        out.games[g.id] = {
          players: rows.length, top: all.slice(0, 10), mine: all.find((r) => r.mine) || null,
          reviewCount: rv.length, avg: rv.length ? rv.reduce((a, r) => a + r.rating, 0) / rv.length : 0,
        };
        out.reviews[g.id] = rv.slice(0, 50).map((r) => { const u = db.users[r.userId] || {}; return { id: r.id, label: `${u.grade}학년 ${u.klass}반 ${admin ? u.name : maskName(u.name)}`, rating: r.rating, text: r.text, at: r.at, mine: r.userId === userId }; });
      }
      return out;
    },
  };

  /* ---------- 서버 모드 ---------- */
  async function remote(url, action, p) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action, ...p }), redirect: "follow" });
    return res.json();
  }

  window.Api = {
    demo: !window.APP_CONFIG.apiUrl,
    games: [],
    async call(action, p) {
      try {
        if (this.demo) return await Demo.call(action, p || {}, this.games);
        return await remote(window.APP_CONFIG.apiUrl, action, p || {});
      } catch (e) {
        return { ok: false, error: "인터넷 연결을 확인해 주세요.", network: true };
      }
    },
    maskName, uidOf,
  };
})();
