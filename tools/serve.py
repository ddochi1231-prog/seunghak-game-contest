"""로컬 개발 서버.
  python tools/serve.py 8001          실제 config.js 그대로 (구글시트 연결)
  python tools/serve.py 8001 --demo   config.js 의 apiUrl 을 비워 연습 모드로 (구글시트에 아무것도 안 씀)
"""
import http.server, os, re, socketserver, sys

args = [a for a in sys.argv[1:] if not a.startswith("--")]
DEMO = "--demo" in sys.argv
os.chdir(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web"))


class S(socketserver.ThreadingMixIn, http.server.HTTPServer):
    request_queue_size = 128
    daemon_threads = True


class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def do_GET(self):
        if DEMO and self.path.split("?")[0] == "/config.js":
            src = open("config.js", encoding="utf-8").read()
            body = re.sub(r'apiUrl:\s*"[^"]*"', 'apiUrl: ""', src).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/javascript; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()


S(("", int(args[0]) if args else 8000), H).serve_forever()
