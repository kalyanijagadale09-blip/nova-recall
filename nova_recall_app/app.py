#!/usr/bin/env python3
"""NOVA Recall: a voice study coach. Run:  python app.py"""
import argparse
import threading
import webbrowser
from pathlib import Path

from nova.server import serve


def main():
    ap = argparse.ArgumentParser(description="NOVA Recall voice study coach")
    ap.add_argument("--port", type=int, default=8000)
    ap.add_argument("--no-browser", action="store_true", help="don't open the browser automatically")
    args = ap.parse_args()
    server, _ = serve(Path(__file__).resolve().parent, args.port)
    url = f"http://localhost:{args.port}"
    print(f"NOVA Recall is running at {url}\nOpen it in Google Chrome. Press Ctrl+C to stop.")
    if not args.no_browser:
        threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")


if __name__ == "__main__":
    main()
