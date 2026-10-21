"""Voice-assistant command handling: time, date, maths, web search, definitions, study actions."""
import ast
import datetime as dt
import json
import operator
import re
import urllib.parse
import urllib.request

SITES = {
    "youtube": "https://www.youtube.com", "google": "https://www.google.com",
    "gmail": "https://mail.google.com", "github": "https://github.com",
    "wikipedia": "https://www.wikipedia.org", "google meet": "https://meet.google.com",
    "maps": "https://maps.google.com", "whatsapp": "https://web.whatsapp.com",
}

_BIN = {ast.Add: operator.add, ast.Sub: operator.sub, ast.Mult: operator.mul, ast.Div: operator.truediv,
        ast.Mod: operator.mod, ast.Pow: operator.pow, ast.FloorDiv: operator.floordiv}
_UN = {ast.USub: operator.neg, ast.UAdd: operator.pos}
_SPOKEN = [
    (r"\bto the power of\b|\braised to\b", "**"), (r"\bmultiplied by\b|\btimes\b|\binto\b", "*"),
    (r"\bdivided by\b|\bover\b", "/"), (r"\bplus\b|\band\b", "+"), (r"\bminus\b|\bsubtract\b", "-"),
    (r"\bmod\b|\bmodulo\b", "%"), (r"(?<=\d)\s*x\s*(?=\d)", "*"),
]


def _eval(node):
    if isinstance(node, ast.Expression):
        return _eval(node.body)
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _BIN:
        a, b = _eval(node.left), _eval(node.right)
        if isinstance(node.op, ast.Pow) and abs(b) > 1000:
            raise ValueError("exponent too large")
        return _BIN[type(node.op)](a, b)
    if isinstance(node, ast.UnaryOp) and type(node.op) in _UN:
        return _UN[type(node.op)](_eval(node.operand))
    raise ValueError("unsupported")


def _tidy(x):
    x = round(x, 6)
    return int(x) if float(x).is_integer() else x


def calculate(text: str):
    """Safe maths from speech ('25 times 4 plus 10'). Returns a number or None."""
    text = text.lower().replace(",", "")
    m = re.search(r"square root of\s+(\d+(?:\.\d+)?)", text)
    if m:
        return _tidy(float(m.group(1)) ** 0.5)
    m = re.search(r"(\d+(?:\.\d+)?)\s*(?:percent|%)\s*of\s*(\d+(?:\.\d+)?)", text)
    if m:
        return _tidy(float(m.group(1)) / 100 * float(m.group(2)))
    text = re.sub(r"\b(calculate|compute|what is|what's|whats|equals?|please)\b", " ", text)
    for pattern, symbol in _SPOKEN:
        text = re.sub(pattern, f" {symbol} ", text)
    text = text.strip()
    if not re.search(r"\d", text) or not re.search(r"[+\-*/%]", text) or not re.fullmatch(r"[\d\s.+\-*/%()]+", text):
        return None
    try:
        return _tidy(_eval(ast.parse(text, mode="eval")))
    except (ValueError, SyntaxError, ZeroDivisionError, OverflowError):
        return None


def wikipedia(topic: str):
    def get(url):
        req = urllib.request.Request(url, headers={"User-Agent": "NOVA-Recall/2.0 (student project)"})
        with urllib.request.urlopen(req, timeout=8) as r:
            return json.loads(r.read().decode())
    found = get("https://en.wikipedia.org/w/api.php?" + urllib.parse.urlencode(
        {"action": "opensearch", "search": topic, "limit": 1, "format": "json"}))
    if not found[1]:
        return None
    title = urllib.parse.quote(found[1][0].replace(" ", "_"))
    page = get(f"https://en.wikipedia.org/api/rest_v1/page/summary/{title}")
    sentences = re.split(r"(?<=[.!?])\s+", page.get("extract", ""))
    return " ".join(sentences[:2]) or None


def normalise(text: str) -> str:
    t = text.lower().replace("\u2018", "'").replace("\u2019", "'").replace("`", "'")
    t = re.sub(r"[.,!?;]+$", "", t)
    t = re.sub(r"\s+", " ", t).strip()
    t = re.sub(r"^(hey |ok |okay )?nova[, ]*", "", t)
    t = re.sub(r"^(can|could|would) you (please )?", "", t)
    return re.sub(r"^please ", "", t).strip()


def _google(q):
    return "https://www.google.com/search?q=" + urllib.parse.quote(q)


def route(text: str, store, cards) -> dict:
    """Return {say, link?, noopen?, action?} for a spoken command."""
    t = normalise(text)
    now = dt.datetime.now()
    if re.match(r"^(hello|hi|hey)\b", t):
        return {"say": "Hello! Ask me the time, a calculation, to search the web, or to quiz you."}
    if re.search(r"\b(what time|the time|current time|time now|time is it|time please)\b", t) or t == "time":
        return {"say": "It's " + now.strftime("%I:%M %p").lstrip("0")}
    if re.search(r"\b(the date|todays date|today's date|what day|current date|date today|date now)\b", t) or t == "date":
        return {"say": "Today is " + now.strftime("%A, %d %B %Y")}
    m = (re.search(r"(?:start|set)(?: a)?(?: focus| study)? timer(?: for)? (\d+)", t)
         or re.search(r"(?:start|set)(?: a)? (\d+) minute (?:focus |study )?timer", t))
    if m:
        return {"say": f"Timer started for {m.group(1)} minutes.", "action": {"type": "timer", "minutes": int(m.group(1))}}
    if re.search(r"start (a )?(pomodoro|focus)", t):
        return {"say": "Focus timer started.", "action": {"type": "timer", "minutes": 25}}
    m = re.search(r"remind me (?:in (\d+) minutes? )?to (.+?)(?: in (\d+) minutes?)?$", t)
    if m:
        mins = int(m.group(1) or m.group(3) or 10)
        return {"say": f"Okay, I'll remind you to {m.group(2)} in {mins} minutes.",
                "action": {"type": "remind", "text": m.group(2), "minutes": mins}}
    if re.search(r"exam|countdown", t):
        return {"say": store.exam_text(cards)}
    if re.search(r"quiz me|(start|begin).*(quiz|session)", t):
        return {"say": "Starting your quiz.", "action": {"type": "quiz"}}
    if re.search(r"progress|dashboard|streak", t):
        s = store.summary(cards)
        return {"say": f"You have a {store.streak()} day streak, {s['accuracy']} percent accuracy, "
                       f"{s['mastered']} cards mastered and {s['due']} to review.",
                "action": {"type": "tab", "tab": "dash"}}
    m = re.match(r"^(?:open|launch|go to)\s+(.+)", t)
    if m:
        k = re.sub(r"^the ", "", m.group(1))
        return {"say": f"Opening {k}.", "link": SITES[k]} if k in SITES else {"say": f"Searching for {k}.", "link": _google(k)}
    m = re.match(r"^play\s+(.+?)(?: on youtube)?$", t)
    if m:
        return {"say": f"Searching YouTube for {m.group(1)}.",
                "link": "https://www.youtube.com/results?search_query=" + urllib.parse.quote(m.group(1))}
    m = re.match(r"^(?:search|google|look up)(?: for)?\s+(.+)", t)
    if m:
        return {"say": f"Searching the web for {m.group(1)}.", "link": _google(m.group(1))}
    value = calculate(t)
    if value is not None:
        return {"say": f"The answer is {value}."}
    m = re.match(r"^(?:who is|who was|what is|what are|what was|tell me about|define|explain)\s+(.+)", t)
    if m:
        try:
            answer = wikipedia(re.sub(r"^(a|an|the)\s+", "", m.group(1)))
            if answer:
                return {"say": answer}
        except Exception:
            return {"say": "I couldn't reach Wikipedia. Check your internet connection."}
    return {"say": "I'm not sure about that. I've added a web search link below if you want it.",
            "link": _google(t), "noopen": True}
