"""Turn a PDF's text into note lines (one sentence per line, so each becomes a quiz card)."""
import io
import re


def text_to_lines(text: str) -> list:
    sentences = re.split(r"(?<=[.!?])\s+", re.sub(r"\s+", " ", text))
    out = []
    for s in (x.strip() for x in sentences):
        n = len(s.split())
        if 7 <= n <= 32 and re.match(r"^[A-Z0-9]", s) and re.search(r"[a-z]", s):
            out.append(s)
    return out


def pdf_to_notes(data: bytes, name: str, max_pages: int = 40, limit: int = 150):
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("PDF import needs the pypdf package: pip install pypdf") from exc
    reader = PdfReader(io.BytesIO(data))
    lines = []
    for page in reader.pages[:max_pages]:
        for line in text_to_lines(page.extract_text() or ""):
            if len(lines) < limit:
                lines.append(line)
    title = re.sub(r"\.pdf$", "", name, flags=re.I) or "Imported PDF"
    return "# " + title + "\n" + "\n".join(lines), len(lines)
