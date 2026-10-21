# NOVA Recall

A voice study coach, built in Python. It turns your notes into questions, reads them aloud, listens to your spoken answers, grades them, and schedules weak topics to come back sooner.

```
Notes -> Question maker -> Spoken question -> Spoken answer -> Speech-to-text
      -> Python grader -> Spoken feedback -> Spaced-repetition schedule
```

## Run it

```bash
pip install -r requirements.txt     # only needed for PDF import
python3 app.py
```

Your browser opens at http://localhost:8000. **Use Google Chrome**: it provides the speech recognition and the voices. No other libraries, no PyAudio, no Homebrew.

Options: `python3 app.py --port 9000`, `python3 app.py --no-browser`.

## What it does

| Section | What you get |
|---|---|
| Quiz | Standard, multiple choice (say "option B") or timed exam. Hints, mistake memory tricks (e.g. MHPC), per-card spaced repetition |
| Assistant | Voice commands: time, date, maths, web search, open sites, definitions (Wikipedia), timers, reminders, "quiz me" |
| Flashcards | Flip cards, mark "I knew it" / "Study again" |
| Teach it back | Explain a concept aloud; NOVA shows which key points you covered |
| Viva | Examiner mode: 5 timed questions, follow-ups, marks out of 10 and a grade |
| Hands-free | "Hey NOVA" wake word and revision audio (notes read aloud with quick checks) |
| Dashboard | Streak, accuracy, weakest topics, review boxes, mistake notebook with a printable revision sheet |
| Study tools | Focus timer, exam countdown with cards-per-day, spoken reminders |
| Notes | Editor with autosave, dictate by voice, upload .txt/.md, import PDF |

## Writing notes

One item per line, mix freely:

```
# Operating Systems                       <- heading sets the topic
Deadlock: processes waiting forever...    <- becomes "What is Deadlock?"
Stack - a linear structure that...        <- same, with a dash
Q: What are the conditions for deadlock?  <- exact question
A: Mutual exclusion, hold and wait, ...   <- and its answer
Paging divides memory into frames.        <- any full sentence becomes fill-in-the-blank
```

## Mobile app (iPhone and Android)

A phone version that runs with no server is in `docs/`. Publish it free with GitHub Pages and install it from the browser. See **MOBILE.md**.

## Project structure

```
app.py              start the server and open the browser
nova/
  notes.py          notes -> question cards
  grading.py        key-term grading, hints, memory tricks, MCQ options
  store.py          spaced repetition (Leitner boxes), history, mistakes, dashboard data
  assistant.py      voice-command routing, safe calculator, Wikipedia lookup
  pdf_import.py     PDF text -> note lines
  server.py         JSON API + static files (Python standard library only)
static/             the interface (index.html, style.css, app.js) and local-api.js, the on-device engine for phones
build_pwa.py        builds the installable phone app into docs/
docs/               the phone app, ready to publish (generated)
notes/my_notes.md   your notes (edited from the Notes tab)
data/               your progress (created automatically, git-ignored)
```

Python does the thinking (parsing, grading, scheduling, assistant, PDF). The browser handles the screen and the speech engines.

## Presenting on Google Meet

1. Join the meeting in Chrome and open NOVA Recall in another tab.
2. Click **Present now -> A tab**, choose the NOVA Recall tab, and **tick "Share tab audio"** so the audience hears NOVA.
3. Press **Run demo** on the Quiz tab for a scripted run, or **Start session** for live answers. Use headphones to avoid echo.

## Notes

- Speech recognition uses Chrome's online service, so it needs internet.
- Definitions ("who is...") use Wikipedia and need internet.
- Scanned PDFs (images of text) can't be imported; PDFs with real text can.
