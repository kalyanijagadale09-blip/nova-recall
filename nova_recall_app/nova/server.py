"""Tiny JSON API + static file server (Python standard library only)."""
import json
import mimetypes
import re
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from . import assistant, grading, pdf_import
from .notes import load_cards, parse_text
from .store import Store

STARTER = """# Operating Systems

Process: an instance of a program that is currently being executed
Thread: the smallest unit of execution within a process
Deadlock: a situation where processes wait forever for resources held by each other

Q: What are the four necessary conditions for deadlock?
A: Mutual exclusion, hold and wait, no preemption, and circular wait

Q: What is the difference between a process and a thread?
A: A process has its own memory space while threads of the same process share memory

- Round robin scheduling gives each process a fixed time quantum in turns.
- Paging divides physical memory into fixed-size frames to avoid external fragmentation.
- A semaphore is a synchronization variable used to control access to shared resources.

# Data Structures

Stack - a linear structure that follows last in first out order
Queue - a linear structure that follows first in first out order
Binary search runs in logarithmic time but requires a sorted array.
A hash table maps keys to values using a hash function for fast lookup.
"""


class App:
    def __init__(self, root: Path):
        self.root = root
        self.static = root / "static"
        self.notes_dir = root / "notes"
        self.notes_dir.mkdir(exist_ok=True)
        self.notes_file = self.notes_dir / "my_notes.md"
        if not self.notes_file.exists():
            self.notes_file.write_text(STARTER, encoding="utf-8")
        self.store = Store(root / "data")
        self.lock = threading.Lock()

    def cards(self):
        return load_cards(self.notes_dir)

    def find(self, cid):
        return next((c for c in self.cards() if c["id"] == cid), None)

    def rich(self, card, all_cards, mode):
        out = dict(card)
        out["keywords"] = [w for _, w in grading.unique_keywords(card["answer"])]
        out["hints"] = [grading.make_hint(card, 1), grading.make_hint(card, 2)]
        out["mnemonic"] = grading.mnemonic(card["answer"])
        out["plain"] = grading.plain(card)
        if mode == "mcq":
            out["mcq"] = grading.make_options(card, all_cards)
        return out

    # ---- API handlers: each takes the parsed JSON body (dict) and returns JSON-able data ----
    def api_notes(self, body):
        return {"text": self.notes_file.read_text(encoding="utf-8"), "count": len(self.cards())}

    def api_notes_save(self, body):
        self.notes_file.write_text(body.get("text", ""), encoding="utf-8")
        return {"count": len(self.cards())}

    def api_notes_append(self, body):
        old = self.notes_file.read_text(encoding="utf-8").rstrip()
        self.notes_file.write_text(old + "\n\n" + body.get("text", "").strip() + "\n", encoding="utf-8")
        return {"count": len(self.cards())}

    def api_topics(self, body):
        cards = self.cards()
        return {"topics": list(dict.fromkeys(c["topic"] for c in cards)),
                "concepts": [{"id": c["id"], "label": grading.plain(c)[:70]} for c in cards]}

    def api_session(self, body):
        cards, mode = self.cards(), body.get("mode", "std")
        chosen = self.store.pick(cards, int(body.get("count", 6)), body.get("topic"), mode)
        return {"cards": [self.rich(c, cards, mode) for c in chosen]}

    def api_grade(self, body):
        card = self.find(body.get("id"))
        if not card:
            return {"error": "unknown card"}
        return grading.grade(card, body.get("reply", ""))

    def api_record(self, body):
        card = self.find(body.get("id"))
        if card:
            self.store.record(card, body.get("verdict", "wrong"))
        return {"ok": True}

    def api_finish(self, body):
        results, mode = body.get("results", []), body.get("mode", "std")
        right = sum(r["verdict"] == "correct" for r in results)
        if results:
            self.store.log_session(right, len(results))
        marks = sum(r.get("marks", {"correct": 2, "partial": 1, "wrong": 0}[r["verdict"]]) for r in results)
        top = len(results) * 2
        percent = round(marks / top * 100) if top else 0
        cards = {c["id"]: c for c in self.cards()}
        review = [{"question": grading.plain(cards[r["id"]]), "answer": cards[r["id"]]["answer"]}
                  for r in results if r["verdict"] != "correct" and r["id"] in cards]
        return {"right": right, "total": len(results), "marks": marks / 2 if mode == "exam" else marks, "max": top,
                "percent": percent, "grade": grading.letter_grade(percent), "review": review}

    def api_teach(self, body):
        cards, target, text = self.cards(), body.get("target", ""), body.get("text", "")
        given = [s for s, _ in grading.keywords(text)]
        items = []
        if target.startswith("C:"):
            card = next((c for c in cards if c["id"] == target[2:]), None)
            for s, w in (grading.unique_keywords(card["answer"]) if card else []):
                items.append({"label": w, "hit": grading._matches(s, given)})
        else:
            for c in (c for c in cards if "T:" + c["topic"] == target):
                kws = [s for s, _ in grading.unique_keywords(c["answer"])]
                hit = bool(kws) and sum(grading._matches(s, given) for s in kws) / len(kws) >= 0.5
                items.append({"label": grading.plain(c)[:48], "hit": hit})
        covered = sum(i["hit"] for i in items)
        return {"items": items, "covered": covered, "total": len(items),
                "percent": round(covered / len(items) * 100) if items else 0,
                "missing": [i["label"] for i in items if not i["hit"]]}

    def api_revision(self, body):
        topic = body.get("topic", "ALL")
        return {"items": [{"id": c["id"], "topic": c["topic"], "line": grading.narrate(c),
                           "question": c["question"], "plain": grading.plain(c), "answer": c["answer"]}
                          for c in self.cards() if topic == "ALL" or "T:" + c["topic"] == topic]}

    def api_dashboard(self, body):
        return self.store.dashboard(self.cards())

    def api_mistakes_clear(self, body):
        self.store.clear_mistakes()
        return {"ok": True}

    def api_assist(self, body):
        return assistant.route(body.get("text", ""), self.store, self.cards())

    def api_exam(self, body):
        if "date" in body:
            self.store.set_exam(body.get("name"), body["date"])
        return {"exam": self.store.get_exam(), "text": self.store.exam_text(self.cards())}

    def api_pdf(self, raw, filename):
        text, count = pdf_import.pdf_to_notes(raw, filename)
        if count:
            self.api_notes_append({"text": text})
        return {"count": count, "cards": len(self.cards())}


ROUTES = {
    "/api/notes": "api_notes", "/api/notes/save": "api_notes_save", "/api/notes/append": "api_notes_append",
    "/api/topics": "api_topics", "/api/session": "api_session", "/api/grade": "api_grade",
    "/api/record": "api_record", "/api/finish": "api_finish", "/api/teach": "api_teach",
    "/api/revision": "api_revision", "/api/dashboard": "api_dashboard", "/api/mistakes/clear": "api_mistakes_clear",
    "/api/assist": "api_assist", "/api/exam": "api_exam",
}


def make_handler(app: App):
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def _send(self, code, payload, ctype="application/json"):
            data = payload if isinstance(payload, bytes) else json.dumps(payload).encode()
            self.send_response(code)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(len(data)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(data)

        def _dispatch(self):
            path = urlparse(self.path).path
            length = int(self.headers.get("Content-Length") or 0)
            raw = self.rfile.read(length) if length else b""
            try:
                if path == "/api/pdf":
                    name = self.headers.get("X-Filename", "document.pdf")
                    return self._send(200, app.api_pdf(raw, re.sub(r"[^\w .-]", "", name)))
                if path in ROUTES:
                    body = json.loads(raw or b"{}")
                    return self._send(200, getattr(app, ROUTES[path])(body))
            except Exception as exc:  # report to the UI instead of crashing the server
                return self._send(500, {"error": str(exc)})
            return self._send(404, {"error": "not found"})

        def do_POST(self):
            self._dispatch()

        def do_GET(self):
            path = urlparse(self.path).path
            if path.startswith("/api/"):
                return self._dispatch()
            rel = "index.html" if path in ("", "/") else path.lstrip("/").removeprefix("static/")
            target = (app.static / rel).resolve()
            if app.static.resolve() not in target.parents or not target.is_file():
                return self._send(404, {"error": "not found"})
            ctype = mimetypes.guess_type(target.name)[0] or "application/octet-stream"
            self._send(200, target.read_bytes(), ctype + ("; charset=utf-8" if ctype.startswith("text") or "javascript" in ctype else ""))

    return Handler


def serve(root: Path, port: int = 8000):
    app = App(root)
    return ThreadingHTTPServer(("127.0.0.1", port), make_handler(app)), app
