/**
 * 승학초 게임 대회 - 구글시트 API (Google Apps Script)
 *
 * 설치: 구글시트 → 확장 프로그램 → Apps Script → 이 파일 붙여넣기 →
 *       setup() 한 번 실행(권한 허용) → 배포 → 새 배포 → 웹 앱
 *       (실행 계정: 나 / 액세스: 모든 사용자) → 나온 URL(…/exec)을 web/config.js 의 apiUrl 에 넣는다.
 *
 * 시트 탭(자동 생성): users, scores, reviews, settings
 */

// 게임별 순위 방식. web/games/manifest.json 의 id, rankType, 학생정보와 같아야 한다.
// rankType: score_high(높을수록 위) | time_low(낮을수록 위) | review(점수 없음, 후기 별점으로 평가)
var GAME_RULES = {
  g01: { rankType: 'time_low', grade: 6, klass: 1, author: '김지후' },
  g02: { rankType: 'score_high', grade: 6, klass: 1, author: '박서연' },
  g03: { rankType: 'time_low', grade: 6, klass: 1, author: '윤민기' },
  g04: { rankType: 'review', grade: 6, klass: 1, author: '정민결' },
  g05: { rankType: 'review', grade: 6, klass: 2, author: '김리진' },
  g06: { rankType: 'score_high', grade: 6, klass: 2, author: '박선준' },
  g07: { rankType: 'review', grade: 6, klass: 2, author: '이정연' },
  g08: { rankType: 'review', grade: 6, klass: 2, author: '안다솔' },
  g09: { rankType: 'score_high', grade: 6, klass: 3, author: '조연우' },
  g10: { rankType: 'review', grade: 6, klass: 3, author: '황나경' }
};
var BAD_WORDS = ['시발', '씨발', '병신', '개새끼', 'ㅅㅂ', 'ㅂㅅ', '지랄', '좆', '꺼져', '죽어', '바보', '멍청'];

var TABS = {
  users: ['userId', 'grade', 'klass', 'num', 'name', 'createdAt'],
  scores: ['gameId', 'userId', 'value', 'attempts', 'updatedAt'],
  reviews: ['id', 'gameId', 'userId', 'rating', 'text', 'createdAt', 'updatedAt'],
  settings: ['key', 'value']
};

function setup() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error("구글시트에서 확장 프로그램 → Apps Script를 열고 setup을 실행해 주세요.");
  PropertiesService.getScriptProperties().setProperty("SPREADSHEET_ID", ss.getId());
  Object.keys(TABS).forEach(function (n) {
    var sh = ss.getSheetByName(n) || ss.insertSheet(n);
    if (sh.getLastRow() === 0) {
      sh.getRange(1, 1, 1, TABS[n].length).setValues([TABS[n]]).setFontWeight('bold');
      sh.setFrozenRows(1);
    }
  });
  var st = ss.getSheetByName('settings');
  if (st.getLastRow() < 2) st.getRange(2, 1, 2, 2).setValues([['open', 'true'], ['adminPassword', '여기에암호']]);
  Logger.log('setup 완료: settings 탭의 adminPassword 를 바꿔 주세요.');
}

/* ---------- 입구 ---------- */
function doGet() {
  return json_({ ok: true, msg: '승학초 게임 대회 API 정상 동작 중' });
}

function doPost(e) {
  var lock = LockService.getScriptLock(), locked = false;
  try {
    var p = JSON.parse(e.postData.contents);
    // 조회(poll)는 잠금 없이 처리해 학생이 많아도 막히지 않게 하고, 쓰기만 한 줄로 세운다
    if (p.action !== 'poll') { lock.waitLock(20000); locked = true; }
    var out;
    switch (p.action) {
      case 'login': out = login_(p); break;
      case 'poll': out = poll_(p); break;
      case 'score': out = score_(p); break;
      case 'review': out = review_(p); break;
      case 'deleteReview': out = deleteMyReview_(p); break;
      case 'admin': out = admin_(p); break;
      default: out = fail_('알 수 없는 요청');
    }
    return json_(out);
  } catch (err) {
    return json_(fail_('서버가 바빠요. 잠시 후 다시 해 주세요.'));
  } finally {
    if (locked) { try { lock.releaseLock(); } catch (x) {} }
  }
}

/* ---------- 공통 ---------- */
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function fail_(m) { return { ok: false, error: m }; }
function database_() {
  var id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (!id) throw new Error('시트에서 setup을 먼저 실행해 주세요.');
  return SpreadsheetApp.openById(id);
}
function sheet_(n) { return database_().getSheetByName(n); }
function rows_(n) {
  var sh = sheet_(n), last = sh.getLastRow();
  if (last < 2) return [];
  var h = TABS[n];
  return sh.getRange(2, 1, last - 1, h.length).getValues().map(function (r, i) {
    var o = { _row: i + 2 }; h.forEach(function (k, j) { o[k] = r[j]; }); return o;
  });
}
function append_(n, o) { sheet_(n).appendRow(TABS[n].map(function (k) { return o[k] === undefined ? '' : o[k]; })); }
function setting_(k, def) {
  var r = rows_('settings').filter(function (x) { return x.key === k; })[0];
  return r ? String(r.value) : def;
}
function setSetting_(k, v) {
  var r = rows_('settings').filter(function (x) { return x.key === k; })[0];
  if (r) sheet_('settings').getRange(r._row, 2).setValue(v); else append_('settings', { key: k, value: v });
}
function isOpen_() { return setting_('open', 'true') !== 'false'; }
function maskName_(n) {
  n = String(n || '');
  if (n.length <= 1) return n;
  if (n.length === 2) return n.charAt(0) + '○';
  var m = ''; for (var i = 0; i < n.length - 2; i++) m += '○';
  return n.charAt(0) + m + n.charAt(n.length - 1);
}
function uid_(s) { var h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16).slice(-6); }
function hasBad_(t) { var c = t.replace(/\s/g, ''); return BAD_WORDS.some(function (b) { return c.indexOf(b) >= 0; }); }

/* ---------- 로그인 ---------- */
function login_(p) {
  var g = Number(p.grade), k = Number(p.klass), n = Number(p.num), name = String(p.name || '').replace(/\s/g, '');
  if (!(g >= 1 && g <= 6 && k >= 1 && k <= 20 && n >= 1 && n <= 60)) return fail_('학년/반/번호를 확인해 주세요.');
  if (!/^[가-힣a-zA-Z]{2,8}$/.test(name)) return fail_('이름을 한글로 정확히 써 주세요.');
  var id = g + '-' + k + '-' + n;
  var ex = rows_('users').filter(function (u) { return u.userId === id; })[0];
  if (ex && ex.name !== name) return fail_('이 번호에는 다른 이름이 이미 등록되어 있어요. 이름을 다시 확인하거나 선생님께 알려 주세요.');
  if (!ex) append_('users', { userId: id, grade: g, klass: k, num: n, name: name, createdAt: new Date() });
  return { ok: true, user: { id: id, uid: uid_(id), grade: g, klass: k, num: n, name: name } };
}

/* ---------- 조회 (5초 캐시) ---------- */
function poll_(p) {
  var snap = snapshot_(false);
  var userId = String(p.userId || '');
  var out = { ok: true, open: snap.open, games: {}, reviews: {} };
  Object.keys(snap.games).forEach(function (gid) {
    var g = snap.games[gid];
    out.games[gid] = {
      players: g.players, reviewCount: g.reviewCount, avg: g.avg,
      top: g.top.map(function (r) { return { rank: r.rank, label: r.label, value: r.value, mine: r.userId === userId }; }),
      mine: g.mineMap[userId] || null
    };
    out.reviews[gid] = snap.reviews[gid].map(function (r) { return { id: r.id, label: r.label, rating: r.rating, text: r.text, at: r.at, mine: r.userId === userId }; });
  });
  return out;
}

function snapshot_(admin) {
  var cache = CacheService.getScriptCache(), key = 'snap' + (admin ? 'A' : '');
  if (!admin) { var c = cache.get(key); if (c) return JSON.parse(c); }
  var users = {}; rows_('users').forEach(function (u) { users[u.userId] = u; });
  var scores = rows_('scores'), reviews = rows_('reviews');
  var label = function (id) { var u = users[id] || {}; return u.grade + '학년 ' + u.klass + '반 ' + (admin ? u.name : maskName_(u.name)); };
  var snap = { open: isOpen_(), games: {}, reviews: {} };
  Object.keys(GAME_RULES).forEach(function (gid) {
    var low = GAME_RULES[gid].rankType === 'time_low';
    var rs = scores.filter(function (s) { return s.gameId === gid; }).sort(function (a, b) {
      return (low ? a.value - b.value : b.value - a.value) || (new Date(a.updatedAt) - new Date(b.updatedAt));
    });
    var all = rs.map(function (s, i) { return { rank: i + 1, label: label(s.userId), value: Number(s.value), userId: s.userId }; });
    var mineMap = {}; all.forEach(function (r) { mineMap[r.userId] = { rank: r.rank, label: r.label, value: r.value, mine: true }; });
    var rv = reviews.filter(function (r) { return r.gameId === gid; }).sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); });
    snap.games[gid] = {
      players: all.length, top: all.slice(0, 10), mineMap: mineMap, reviewCount: rv.length,
      avg: rv.length ? rv.reduce(function (a, r) { return a + Number(r.rating); }, 0) / rv.length : 0
    };
    snap.reviews[gid] = rv.slice(0, 30).map(function (r) {
      return { id: r.id, userId: r.userId, label: label(r.userId), rating: Number(r.rating), text: r.text, at: new Date(r.updatedAt).getTime() };
    });
  });
  // 캐시 한 칸은 100KB 까지라 넘치면 저장을 건너뛴다 (조회 자체는 계속 동작)
  if (!admin) { try { var s = JSON.stringify(snap); if (s.length < 90000) cache.put(key, s, 5); } catch (x) {} }
  return snap;
}
function bust_() { CacheService.getScriptCache().remove('snap'); }

/* ---------- 기록 / 후기 ---------- */
function user_(id) { return rows_('users').filter(function (u) { return u.userId === id; })[0]; }

function score_(p) {
  if (!isOpen_()) return fail_('대회가 끝났어요.');
  var rule = GAME_RULES[p.gameId]; if (!rule) return fail_('없는 게임이에요.');
  if (rule.rankType === 'review') return fail_('이 게임은 별점으로 평가해요.');
  if (!user_(p.userId)) return fail_('다시 로그인해 주세요.');
  var v = Number(p.value); if (!isFinite(v) || v < 0 || v > 1e9) return fail_('숫자가 올바르지 않아요.');
  var low = rule.rankType === 'time_low';
  if (low && v < 1) return fail_('기록이 너무 짧아요.');
  var row = rows_('scores').filter(function (s) { return s.gameId === p.gameId && s.userId === p.userId; })[0];
  var improved = false, best = v;
  if (!row) { append_('scores', { gameId: p.gameId, userId: p.userId, value: v, attempts: 1, updatedAt: new Date() }); improved = true; }
  else {
    var sh = sheet_('scores');
    sh.getRange(row._row, 4).setValue(Number(row.attempts) + 1);
    best = Number(row.value);
    if (low ? v < best : v > best) { sh.getRange(row._row, 3).setValue(v); sh.getRange(row._row, 5).setValue(new Date()); improved = true; best = v; }
  }
  bust_();
  return { ok: true, improved: improved, best: best };
}

function review_(p) {
  if (!isOpen_()) return fail_('대회가 끝났어요.');
  var rule = GAME_RULES[p.gameId]; if (!rule) return fail_('없는 게임이에요.');
  var u = user_(p.userId); if (!u) return fail_('다시 로그인해 주세요.');
  if (Number(u.grade) === rule.grade && Number(u.klass) === rule.klass && u.name === rule.author) return fail_('내가 만든 게임에는 후기를 쓸 수 없어요.');
  var rating = Number(p.rating), text = String(p.text || '').trim();
  if (!(rating >= 1 && rating <= 5)) return fail_('별점을 골라 주세요.');
  if (text.length < 2 || text.length > 200) return fail_('후기는 2~200자로 써 주세요.');
  if (hasBad_(text)) return fail_('예쁜 말로 써 주세요.');
  var row = rows_('reviews').filter(function (r) { return r.gameId === p.gameId && r.userId === p.userId; })[0];
  if (row) {
    sheet_('reviews').getRange(row._row, 4, 1, 1).setValue(rating);
    sheet_('reviews').getRange(row._row, 5).setValue(text);
    sheet_('reviews').getRange(row._row, 7).setValue(new Date());
  } else {
    var all = rows_('reviews'), id = all.length ? Math.max.apply(null, all.map(function (r) { return Number(r.id); })) + 1 : 1;
    append_('reviews', { id: id, gameId: p.gameId, userId: p.userId, rating: rating, text: text, createdAt: new Date(), updatedAt: new Date() });
  }
  bust_();
  return { ok: true };
}

function deleteMyReview_(p) {
  var row = rows_('reviews').filter(function (r) { return r.gameId === p.gameId && r.userId === p.userId; })[0];
  if (row) sheet_('reviews').deleteRow(row._row);
  bust_();
  return { ok: true };
}

/* ---------- 관리자 ---------- */
function admin_(p) {
  if (String(p.password) !== setting_('adminPassword', '')) return fail_('관리자 암호가 달라요.');
  if (p.op === 'deleteReview') {
    var r = rows_('reviews').filter(function (x) { return Number(x.id) === Number(p.id); })[0];
    if (r) sheet_('reviews').deleteRow(r._row);
  } else if (p.op === 'deleteScore') {
    var s = rows_('scores').filter(function (x) { return x.gameId === p.gameId && x.userId === p.userId; })[0];
    if (s) sheet_('scores').deleteRow(s._row);
  } else if (p.op === 'resetGame') {
    var rs = rows_('scores').filter(function (x) { return x.gameId === p.gameId; }).reverse();
    rs.forEach(function (x) { sheet_('scores').deleteRow(x._row); });
  } else if (p.op === 'setOpen') {
    setSetting_('open', p.open ? 'true' : 'false');
  }
  bust_();
  var snap = snapshot_(true), out = { ok: true, open: snap.open, games: {}, reviews: {} };
  Object.keys(snap.games).forEach(function (gid) {
    var g = snap.games[gid];
    out.games[gid] = { players: g.players, reviewCount: g.reviewCount, avg: g.avg, top: g.top, mine: null };
    out.reviews[gid] = snap.reviews[gid];
  });
  return out;
}
