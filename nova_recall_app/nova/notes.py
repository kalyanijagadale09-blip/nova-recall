"""Turn plain-text notes into question cards.

Formats (one item per line, mix freely):
    # Heading                    -> sets the topic
    Q: question / A: answer      -> exact question and answer
    Term: definition  (or - )    -> "What is Term?"
    any sentence of 6+ words     -> fill-in-the-blank
"""
import hashlib
import re
from pathlib import Path

from .grading import STOPWORDS


def make_card(topic, kind, question, answer):
    cid = hashlib.md5(f"{question}|{answer}".encode()).hexdigest()[:10]
    return {"id": cid, "topic": topic, "kind": kind, "question": question.strip(), "answer": answer.strip()}


def make_cloze(sentence: str):
    if len(sentence.split()) < 6:
        return None
    words = re.findall(r"[A-Za-z][A-Za-z\-']+", sentence)
    candidates = [w for w in words if w.lower() not in STOPWORDS and len(w) >= 5]
    if not candidates:
        return None
    target = max(candidates, key=len)
    blanked = re.sub(rf"\b{re.escape(target)}\b", "_____", sentence, count=1)
    return f"Fill in the blank: {blanked}", target


def parse_text(text: str, topic: str = "Notes") -> list:
    cards, lines, i = [], text.splitlines(), 0
    while i < len(lines):
        line = lines[i].strip()
        i += 1
        if not line:
            continue
        if line.startswith("#"):
            topic = line.lstrip("#").strip() or topic
            continue
        q = re.match(r"(?i)^q\s*[:.)]\s*(.+)$", line)
        if q:
            while i < len(lines) and not lines[i].strip():
                i += 1
            if i < len(lines):
                a = re.match(r"(?i)^a\s*[:.)]\s*(.+)$", lines[i].strip())
                if a:
                    i += 1
                    cards.append(make_card(topic, "qa", q.group(1), a.group(1)))
            continue
        line = re.sub(r"^([-*\u2022]\s+|\d+[.)]\s+)", "", line)
        d = re.match(r"^([^:]{2,40}?)(?:\s*(?:::|:|\u2014|\u2013)\s+|\s+-\s+)(.{12,})$", line)
        if d and len(d.group(1).split()) <= 6:
            cards.append(make_card(topic, "def", f"What is {d.group(1).strip()}?", d.group(2)))
            continue
        cloze = make_cloze(line)
        if cloze:
            cards.append(make_card(topic, "cloze", cloze[0], cloze[1]))
    return cards


def load_cards(folder: Path) -> list:
    seen, cards = set(), []
    for f in sorted(p for p in Path(folder).rglob("*")
                    if p.suffix.lower() in {".txt", ".md"} and p.name.lower() != "readme.md"):
        topic = f.stem.replace("_", " ").replace("-", " ").title()
        for card in parse_text(f.read_text(encoding="utf-8", errors="ignore"), topic):
            if card["id"] not in seen:
                seen.add(card["id"])
                cards.append(card)
    return cards
