"""Answer grading, hints, memory tricks and multiple-choice options."""
import difflib
import random
import re

STOPWORDS = set(
    "a an the of in on at to for and or is are was were be been being it its this that these those "
    "with as by from which who whom what when where how can could will would should may might do does "
    "did has have had into than then so such not no also their there they them his her he she we you i "
    "if but about over under between using used use called known more most other each any all both "
    "one two while until".split()
)


def stem(word: str) -> str:
    for suffix in ("ing", "ed", "es", "ly", "s"):
        if word.endswith(suffix) and len(word) - len(suffix) >= 3:
            return word[: -len(suffix)]
    return word


def keywords(text: str) -> list:
    """(stem, original_word) for every meaningful word."""
    out = []
    for w in re.findall(r"[a-zA-Z0-9]+", text.lower()):
        if w in STOPWORDS or (len(w) <= 2 and not w.isdigit()):
            continue
        out.append((stem(w), w))
    return out


def unique_keywords(text: str) -> list:
    return list(dict(keywords(text)).items())


def _matches(s: str, pool: list) -> bool:
    return any(s == p or difflib.SequenceMatcher(None, s, p).ratio() >= 0.8 for p in pool)


def grade(card: dict, reply: str) -> dict:
    """Compare a spoken/typed reply with the model answer by key terms."""
    expected = unique_keywords(card["answer"])
    if not expected:
        return {"verdict": "wrong", "hit": [], "missed": [], "marks": 0}
    given = [s for s, _ in keywords(reply)]
    hit = [w for s, w in expected if _matches(s, given)]
    missed = [w for s, w in expected if not _matches(s, given)]
    score = len(hit) / len(expected)
    verdict = "correct" if score >= 0.6 else "partial" if score >= 0.3 else "wrong"
    return {"verdict": verdict, "hit": hit, "missed": missed,
            "marks": {"correct": 2, "partial": 1, "wrong": 0}[verdict]}


def is_cloze(card: dict) -> bool:
    return card["question"].startswith("Fill in the blank")


def make_hint(card: dict, level: int) -> str:
    kws = [w for _, w in unique_keywords(card["answer"])]
    if not kws:
        return "Think about the definition in your notes."
    first = kws[0]
    if is_cloze(card):
        return f"It starts with {first[0]} and has {len(first)} letters." if level == 1 else f"It starts with {first[:3]}."
    return (f"The answer has {len(kws)} key terms. One starts with {first[0]}." if level == 1
            else f"One key term is {first}.")


def mnemonic(answer: str) -> str:
    """'Mutual exclusion, hold and wait, no preemption, circular wait' -> MHPC"""
    parts = [re.sub(r"^and\s+", "", p.strip(), flags=re.I) for p in re.split(r"[,;]\s*", answer)]
    parts = [p for p in parts if p]
    if not 3 <= len(parts) <= 7:
        return ""
    letters = []
    for p in parts:
        k = keywords(p)
        letters.append((k[0][1] if k else p)[0].upper())
    return "".join(letters)


def make_options(card: dict, cards: list):
    """Multiple choice: the right answer plus three look-alike answers from other cards."""
    same = [c["answer"] for c in cards
            if c["id"] != card["id"] and is_cloze(c) == is_cloze(card)
            and c["answer"].lower() != card["answer"].lower()]
    same = sorted(set(same), key=lambda a: abs(len(a) - len(card["answer"])))[:6]
    random.shuffle(same)
    wrong = same[:3]
    if len(wrong) < 3:
        return None
    options = [card["answer"]] + wrong
    random.shuffle(options)
    return {"options": options, "correct": options.index(card["answer"])}


def plain(card: dict) -> str:
    return card["question"].replace("Fill in the blank: ", "").replace("_____", "...")


def narrate(card: dict) -> str:
    """How NOVA reads a card aloud in revision-audio mode."""
    if is_cloze(card):
        return card["question"].replace("Fill in the blank: ", "").replace("_____", card["answer"])
    m = re.match(r"^What is (.+)\?$", card["question"])
    return f"{m.group(1)} is {card['answer']}." if m else f"{card['question']} {card['answer']}."


def letter_grade(percent: int) -> str:
    return "A" if percent >= 85 else "B" if percent >= 70 else "C" if percent >= 55 else "D" if percent >= 40 else "F"
