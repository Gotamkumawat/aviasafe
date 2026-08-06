#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, HTTPServer
from pathlib import Path
import os

class SPARequestHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        if self.path in ('/sms', '/sms/'):
            self.path = '/sms.html'
        requested_path = self.translate_path(self.path)
        if self.path != '/' and not Path(requested_path).exists():
            self.path = '/index.html'
        return super().send_head()

if __name__ == '__main__':
    os.chdir(Path(__file__).parent)
    port = int(os.environ.get('PORT', '5000'))
    server = HTTPServer(('0.0.0.0', port), SPARequestHandler)
    print(f'Serving SPA fallback on http://localhost:{port}')
    server.serve_forever()
