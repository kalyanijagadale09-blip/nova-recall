#!/usr/bin/env python3
"""Build the installable mobile app (PWA) into ./docs from the shared interface in ./static.

    python3 build_pwa.py

Then publish ./docs with GitHub Pages (see MOBILE.md). The phone runs the app on its own:
local-api.js replaces the Python server, so no computer needs to be on.
"""
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "docs"
VERSION = "v1"


def make_icons(out: Path):
    from PIL import Image, ImageDraw, ImageFont
    def draw(size, pad=0.0):
        im = Image.new("RGBA", (size, size), (13, 22, 52, 255))
        d = ImageDraw.Draw(im)
        s = int(size * (0.58 - pad))
        x0 = (size - s) // 2
        d.rounded_rectangle([x0, x0, x0 + s, x0 + s], radius=int(s * 0.28), fill=(255, 226, 122, 255))
        font = None
        for f in ("/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf", "/System/Library/Fonts/Supplemental/Georgia Bold.ttf",
                  "/Library/Fonts/Georgia Bold.ttf", "C:/Windows/Fonts/georgiab.ttf"):
            try:
                font = ImageFont.truetype(f, int(s * 0.7))
                break
            except OSError:
                continue
        font = font or ImageFont.load_default()
        d.text((size / 2, size / 2), "N", fill=(13, 22, 52, 255), font=font, anchor="mm")
        return im
    draw(192).save(out / "icon-192.png")
    draw(512).save(out / "icon-512.png")
    draw(512, pad=0.08).save(out / "icon-maskable.png")
    draw(180).convert("RGB").save(out / "apple-touch-icon.png")


def main():
    if OUT.exists():
        shutil.rmtree(OUT)
    (OUT / "static").mkdir(parents=True)
    for name in ("style.css", "app.js", "local-api.js"):
        shutil.copy(ROOT / "static" / name, OUT / "static" / name)

    html = (ROOT / "static" / "index.html").read_text(encoding="utf-8")
    head = ('<meta name="theme-color" content="#0D1634">\n'
            '<meta name="mobile-web-app-capable" content="yes">\n<meta name="apple-mobile-web-app-capable" content="yes">\n'
            '<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">\n<meta name="apple-mobile-web-app-title" content="NOVA Recall">\n'
            '<link rel="manifest" href="manifest.webmanifest">\n<link rel="apple-touch-icon" href="apple-touch-icon.png">\n<link rel="icon" href="icon-192.png">\n')
    html = html.replace("</head>", head + "</head>")
    html = html.replace('<script src="static/app.js"></script>',
                        '<script src="static/local-api.js"></script>\n<script src="static/app.js"></script>\n'
                        '<script>if("serviceWorker" in navigator)addEventListener("load",()=>navigator.serviceWorker.register("sw.js"))</script>')
    (OUT / "index.html").write_text(html, encoding="utf-8")

    (OUT / "manifest.webmanifest").write_text(json.dumps({
        "name": "NOVA Recall", "short_name": "NOVA", "description": "Voice study coach: quizzes you on your own notes.",
        "start_url": "./", "scope": "./", "display": "standalone", "orientation": "portrait",
        "background_color": "#0D1634", "theme_color": "#0D1634",
        "icons": [{"src": "icon-192.png", "sizes": "192x192", "type": "image/png"},
                  {"src": "icon-512.png", "sizes": "512x512", "type": "image/png"},
                  {"src": "icon-maskable.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}, indent=2))

    (OUT / "sw.js").write_text(f'''const V="nova-recall-{VERSION}";
const ASSETS=["./","index.html","manifest.webmanifest","static/style.css","static/app.js","static/local-api.js","icon-192.png","icon-512.png","apple-touch-icon.png"];
self.addEventListener("install",e=>{{e.waitUntil(caches.open(V).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting()))}});
self.addEventListener("activate",e=>{{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==V).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))}});
// stale-while-revalidate: open instantly (even offline), refresh files in the background
self.addEventListener("fetch",e=>{{
  if(e.request.method!=="GET"||new URL(e.request.url).origin!==location.origin)return;
  e.respondWith(caches.open(V).then(async c=>{{const hit=await c.match(e.request);
    const net=fetch(e.request).then(r=>{{if(r.ok)c.put(e.request,r.clone());return r}}).catch(()=>hit);return hit||net}}))}});
''')
    (OUT / ".nojekyll").write_text("")
    try:
        make_icons(OUT)
    except ImportError:
        print("Install Pillow (pip install pillow) to generate the app icons.")
    print(f"Built {OUT}. Publish this folder with GitHub Pages (see MOBILE.md).")


if __name__ == "__main__":
    main()
