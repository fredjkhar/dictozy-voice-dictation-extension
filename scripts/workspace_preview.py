#!/usr/bin/env python3
"""Loopback-only native-workspace preview. Never included in the Pages artifact."""
import argparse
import functools
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import urlsplit

SITE = Path(__file__).resolve().parents[1] / 'site'

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--port', type=int, default=4198)
    parser.add_argument('--backend-port', type=int, default=4199)
    args = parser.parse_args()
    for port in (args.port, args.backend_port):
        if not 1024 <= port <= 65535: parser.error('Use an unprivileged loopback port.')
    endpoint = f'http://127.0.0.1:{args.backend_port}/api/transcribe'
    class Handler(SimpleHTTPRequestHandler):
        def do_GET(self):
            if self.headers.get('Host') not in {f'127.0.0.1:{args.port}', f'localhost:{args.port}'}:
                self.send_error(403, 'Loopback host required')
                return
            route = urlsplit(self.path).path
            if route == '/workspace-config.js':
                data = ('"use strict";globalThis.DictozyWebConfig=Object.freeze(' + json.dumps({'endpoint':endpoint,'localReview':True}) + ');').encode()
                self.send_response(200); self.send_header('Content-Type','text/javascript'); self.send_header('Content-Length',str(len(data))); self.end_headers(); self.wfile.write(data)
            elif route == '/workspace.html':
                data = (SITE/'workspace.html').read_bytes().replace(b'https://voice-dictation-extension.onrender.com', f'http://127.0.0.1:{args.backend_port}'.encode())
                self.send_response(200); self.send_header('Content-Type','text/html; charset=utf-8'); self.send_header('Content-Length',str(len(data))); self.send_header('Content-Security-Policy', "frame-ancestors 'self'"); self.end_headers(); self.wfile.write(data)
            else:
                super().do_GET()
        def end_headers(self):
            self.send_header('Cache-Control','no-store')
            self.send_header('X-Robots-Tag','noindex')
            self.send_header('Permissions-Policy','microphone=(self), clipboard-write=(self)')
            super().end_headers()
        def log_message(self, *_):
            pass  # No page paths, draft content or request data in review logs.
    server = ThreadingHTTPServer(('127.0.0.1',args.port),functools.partial(Handler,directory=str(SITE)))
    print(f'Local review: http://127.0.0.1:{args.port}/try.html -> stub backend {endpoint}',flush=True)
    server.serve_forever()
if __name__ == '__main__': main()
