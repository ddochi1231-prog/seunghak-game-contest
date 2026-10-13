// 엔트리 런타임(EntryJS)을 처음 게임을 열 때 불러와서 .ent 에서 푼 project.json 을 실행한다.
(function () {
  const L = "vendor/lib/";
  const SCRIPTS = [
    "jquery/jquery.min.js", "jquery-ui/jquery-ui.min.js", "lodash/lodash.min.js",
    "PreloadJS/lib/preloadjs-0.6.0.min.js", "EaselJS/lib/easeljs-0.8.0.min.js", "SoundJS/lib/soundjs-0.6.0.min.js",
    "velocity/velocity.min.js", "socket.io-client/socket.io.js",
    "entry-tool/dist/entry-tool.js",
    "entry-js/extern/util/filbert.js", "entry-js/extern/util/CanvasInput.js", "entry-js/extern/util/ndgmr.Collision.js",
    "entry-js/extern/util/handle.js", "entry-js/extern/util/bignumber.min.js",
    "entry-js/extern/lang/ko.js", "entry-js/extern/util/static.js", "entry-js/dist/entry.min.js",
  ];
  let ready = null, current = null;

  function css(href) { const l = document.createElement("link"); l.rel = "stylesheet"; l.href = href; document.head.appendChild(l); }
  function script(src, tries = 3) {
    return new Promise((ok, no) => {
      const s = document.createElement("script"); s.src = src; s.async = false;
      s.onload = ok;
      s.onerror = () => { s.remove(); tries > 1 ? setTimeout(() => script(src, tries - 1).then(ok, no), 600) : no(new Error("load " + src)); };
      document.head.appendChild(s);
    });
  }
  function boot(host, onProgress) {
    if (ready) return ready;
    ready = (async () => {
      css(L + "entry-js/dist/entry.css"); css(L + "entry-tool/dist/entry-tool.css");
      // entry.min.js 가 기대하는 전역값 (편집기 전용이라 빈 값으로 충분)
      window.EntryVideoLegacy = window.EntryVideoLegacy || {};
      window.EntrySoundEditor = window.EntrySoundEditor || {};
      // 이 대회에는 카메라·마이크를 쓰는 게임이 없으므로 권한 팝업이 뜨지 않게 막는다
      try { if (navigator.mediaDevices) navigator.mediaDevices.getUserMedia = () => { return Promise.reject(new DOMException("blocked", "NotAllowedError")); }; } catch (e) {}
      let n = 0;
      for (const s of SCRIPTS) {
        if (s.startsWith("entry-tool/")) { try { window.exports = undefined; } catch (e) {} }
        await script(L + s);
        onProgress && onProgress(++n / SCRIPTS.length);
      }
      Entry.init(host, { type: "minimize", libDir: "vendor/lib", fonts: [], hardwareEnable: false, textCodingEnable: false });
      // 말풍선 위치 계산은 그림이 아직 준비되지 않은 순간에 실패할 수 있다. 다음 프레임에 다시 시도하면 되므로 게임이 멈추지 않게 한다
      if (Entry.Dialog && Entry.Dialog.prototype.update) {
        const upd = Entry.Dialog.prototype.update;
        Entry.Dialog.prototype.update = function () { try { return upd.apply(this, arguments); } catch (e) { Entry.requestUpdate = true; } };
      }
      // 그림이 아직 불러와지는 중일 때 충돌 판정이 오류로 게임을 멈추지 않게, 오류는 '닿지 않음'으로 처리
      if (window.ndgmr) for (const fn of ["checkPixelCollision", "checkRectCollision"]) {
        const orig = ndgmr[fn];
        if (orig) ndgmr[fn] = function () { try { return orig.apply(this, arguments); } catch (e) { return false; } };
      }
    })().catch((e) => { ready = null; throw e; });
    return ready;
  }

  // 학교 네트워크가 잠깐 끊겨도 바로 실패하지 않도록 3번까지 다시 시도
  async function fetchJson(url, tries = 4) {
    for (let i = 1; ; i++) {
      try { const r = await fetch(url, { cache: "no-cache" }); if (!r.ok) throw new Error(r.status); return await r.json(); }
      catch (e) { if (i >= tries) throw e; await new Promise((ok) => setTimeout(ok, 700 * i)); }
    }
  }

  // 게임의 모든 그림을 먼저 내려받아 두어 시작할 때 빈 화면·판정 오류가 없게 한다
  function preload(project) {
    const urls = new Set();
    (function walk(n) {
      if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === "object") for (const k in n) { if (k === "fileurl" && /\.(png|jpe?g|gif|svg|webp)$/i.test(n[k])) urls.add(n[k]); else walk(n[k]); }
    })(project.objects);
    return Promise.all([...urls].map((u) => new Promise((ok) => { const im = new Image(); im.onload = im.onerror = ok; im.src = u; setTimeout(ok, 8000); })));
  }

  window.EntryPlayer = {
    boot, opened: false,
    async open(game) {
      const p = await fetchJson(`games/${game.id}/project.json`);
      this.stop();
      await preload(p);
      try { await Entry.loadProject(p); } catch (e) { /* 편집기 전용 후처리 오류는 무시 */ }
      current = game; this.opened = true;
    },
    // 장면이 여러 개인 게임에서 지금이 마지막(결과) 장면인지: 0 = 아님/장면 하나, 1 = 첫 장면 등 이전 장면, 2 = 마지막 장면
    sceneStage() {
      const sc = (window.Entry && Entry.scene && Entry.scene.scenes_) || [];
      if (sc.length < 2) return 0;
      const i = sc.indexOf(Entry.scene.selectedScene);
      return i === sc.length - 1 ? 2 : 1;
    },
    state() { return window.Entry && Entry.engine ? Entry.engine.state : "stop"; },
    run() { if (Entry.engine.state !== "run") Entry.engine.toggleRun(); },
    stop() { if (window.Entry && Entry.engine && Entry.engine.state !== "stop") Entry.engine.toggleStop(); },
    restart() { this.stop(); setTimeout(() => this.run(), 50); },
    // 점수 변수 읽기 (id 우선, 없으면 이름)
    readVar(game) {
      if (!game.scoreVar || !window.Entry) return null;
      const vs = Entry.variableContainer.variables_ || [];
      const v = vs.find((x) => x.id_ === game.scoreVar.id) || vs.find((x) => x.name_ === game.scoreVar.name);
      if (!v) return null;
      const n = Number(v.getValue());
      return isFinite(n) ? n : null;
    },
    fullscreen(el) { (el.requestFullscreen || el.webkitRequestFullscreen || function () {}).call(el); },
  };
})();
