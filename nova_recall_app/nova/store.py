"""Progress, spaced repetition (Leitner boxes), history, mistakes and dashboard data."""
import datetime as dt
import json
import random
import threading
from pathlib import Path

INTERVALS = {1: 0, 2: 1, 3: 3, 4: 7, 5: 14, 6: 30}


def today() -> str:
    return dt.date.today().isoformat()


class Store:
    def __init__(self, folder):
        self.dir = Path(folder)
        self.dir.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        self.progress = self._load("progress.json", {})
        self.history = self._load("history.json", [])
        self.mistakes = self._load("mistakes.json", {})
        self.state = self._load("state.json", {})

    def _load(self, name, default):
        try:
            return json.loads((self.dir / name).read_text())
        except (OSError, ValueError):
            return default

    def _save(self, name, obj):
        try:
            (self.dir / name).write_text(json.dumps(obj, indent=1))
        except OSError:
            pass

    # ---- scheduling ----
    def is_due(self, cid) -> bool:
        s = self.progress.get(cid)
        return bool(s) and s["due"] <= today()

    def record(self, card, verdict):
        with self.lock:
            s = self.progress.get(card["id"], {"box": 1, "seen": 0, "correct": 0})
            s["seen"] += 1
            if verdict == "correct":
                s["box"] = min(6, s["box"] + 1)
                s["correct"] += 1
            elif verdict == "wrong":
                s["box"] = 1
            s["due"] = (dt.date.today() + dt.timedelta(days=INTERVALS[s["box"]])).isoformat()
            self.progress[card["id"]] = s
            if verdict == "correct":
                self.mistakes.pop(card["id"], None)
            else:
                old = self.mistakes.get(card["id"], {"n": 0})
                self.mistakes[card["id"]] = {"q": card["question"], "a": card["answer"],
                                             "t": card["topic"], "n": old["n"] + 1}
            self._save("progress.json", self.progress)
            self._save("mistakes.json", self.mistakes)

    def pick(self, cards, count, topic=None, mode="std"):
        pool = [c for c in cards if not topic or topic == "ALL" or c["topic"] == topic]
        due = sorted((c for c in pool if self.is_due(c["id"])), key=lambda c: self.progress[c["id"]]["box"])
        fresh = [c for c in pool if c["id"] not in self.progress]
        random.shuffle(fresh)
        rest = [c for c in pool if c not in due and c not in fresh]
        random.shuffle(rest)
        chosen = (due + fresh + rest)[:count]
        if mode != "deck":
            random.shuffle(chosen)
        return chosen

    # ---- history ----
    def log_session(self, right, total):
        with self.lock:
            d = today()
            row = next((h for h in self.history if h["d"] == d), None)
            if row:
                row["n"] += total
                row["r"] += right
            else:
                self.history.append({"d": d, "n": total, "r": right})
            self.history = self.history[-60:]
            self._save("history.json", self.history)

    def streak(self) -> int:
        days = {h["d"] for h in self.history}
        d, n = dt.date.today(), 0
        if d.isoformat() not in days:
            d -= dt.timedelta(days=1)
        while d.isoformat() in days:
            n += 1
            d -= dt.timedelta(days=1)
        return n

    # ---- dashboard ----
    def summary(self, cards) -> dict:
        seen = ok = mastered = due = 0
        topics = {}
        for c in cards:
            s = self.progress.get(c["id"])
            t = topics.setdefault(c["topic"], {"seen": 0, "ok": 0})
            if s:
                t["seen"] += s["seen"]
                t["ok"] += s["correct"]
                seen += s["seen"]
                ok += s["correct"]
                mastered += s["box"] >= 5
            if not s or self.is_due(c["id"]):
                due += 1
        return {"seen": seen, "ok": ok, "mastered": mastered, "due": due, "topics": topics,
                "accuracy": round(ok / seen * 100) if seen else 0}

    def dashboard(self, cards) -> dict:
        s = self.summary(cards)
        week = []
        for k in range(6, -1, -1):
            d = dt.date.today() - dt.timedelta(days=k)
            h = next((x for x in self.history if x["d"] == d.isoformat()), {"n": 0, "r": 0})
            week.append({"day": d.strftime("%a"), "n": h["n"], "r": h["r"]})
        boxes = [0] * 6
        for c in cards:
            boxes[self.progress[c["id"]]["box"] - 1 if c["id"] in self.progress else 0] += 1
        weak = sorted(({"topic": k, "seen": v["seen"], "accuracy": round(v["ok"] / v["seen"] * 100)}
                       for k, v in s["topics"].items() if v["seen"]), key=lambda x: x["accuracy"])
        return {"streak": self.streak(), "accuracy": s["accuracy"], "mastered": s["mastered"], "due": s["due"],
                "week": week, "topics": weak, "boxes": boxes,
                "mistakes": [{"id": k, **v} for k, v in self.mistakes.items()]}

    def clear_mistakes(self):
        with self.lock:
            self.mistakes.clear()
            self._save("mistakes.json", self.mistakes)

    # ---- exam countdown ----
    def get_exam(self):
        return self.state.get("exam")

    def set_exam(self, name, date):
        with self.lock:
            self.state["exam"] = {"name": name or "Your exam", "date": date}
            self._save("state.json", self.state)

    def exam_text(self, cards) -> str:
        e = self.get_exam()
        if not e:
            return "No exam saved yet. Add one in Study tools."
        try:
            days = (dt.date.fromisoformat(e["date"]) - dt.date.today()).days
        except ValueError:
            return "Pick a valid exam date."
        if days < 0:
            return f"{e['name']} has passed."
        if days == 0:
            return f"{e['name']} is today. Good luck!"
        due = self.summary(cards)["due"]
        return f"{days} days until {e['name']}. You have {due} cards to review, about {-(-due // days)} a day."
