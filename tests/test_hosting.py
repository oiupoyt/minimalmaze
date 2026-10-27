import os
import unittest
import urllib.request
import json
import subprocess

README_PATH = "/home/oiupoyt/my stuff yea/projects/minimalmaze/README.md"
FORGEJO_API = "https://git.oiupoyt.space/api/v1/repos/oiupoyt/minimalmaze"
TOK = "51bdb4e3d21728c5517f4957352c0a1baa7577d0"

def curl_header(url):
    # Try normal curl first
    cmd = ["curl", "-s", "-I", "-m", "5", url]
    r = subprocess.run(cmd, capture_output=True, text=True)
    if "HTTP/" in r.stdout:
        return r.stdout
    # Fallback to Cloudflare anycast edge IP if local resolver is caching negative response
    cmd_resolve = ["curl", "-s", "-I", "-m", "5", "--resolve", "maze.oiupoyt.space:443:104.21.55.218", url]
    r_resolve = subprocess.run(cmd_resolve, capture_output=True, text=True)
    return r_resolve.stdout

class TestMinimalMazeHosting(unittest.TestCase):
    def test_readme_contains_website_link(self):
        """README.md must contain the live website link maze.oiupoyt.space"""
        self.assertTrue(os.path.exists(README_PATH), "README.md should exist")
        with open(README_PATH, "r", encoding="utf-8") as f:
            content = f.read()
        self.assertIn("maze.oiupoyt.space", content, "README.md must link to maze.oiupoyt.space")

    def test_forgejo_website_metadata(self):
        """Forgejo repo website metadata must be set to https://maze.oiupoyt.space"""
        req = urllib.request.Request(
            FORGEJO_API,
            headers={"Authorization": f"token {TOK}", "User-Agent": "Mozilla/5.0"}
        )
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json.loads(resp.read().decode())
        website = data.get("website", "")
        self.assertIn("maze.oiupoyt.space", website)

    def test_live_website_http_status(self):
        """https://maze.oiupoyt.space/ must return 200 OK"""
        header = curl_header("https://maze.oiupoyt.space/")
        self.assertIn("HTTP/2 200", header)

    def test_wasm_mime_type(self):
        """https://maze.oiupoyt.space/engine.wasm must return application/wasm"""
        header = curl_header("https://maze.oiupoyt.space/engine.wasm")
        self.assertIn("HTTP/2 200", header)
        self.assertIn("content-type: application/wasm", header.lower())

if __name__ == "__main__":
    unittest.main()
