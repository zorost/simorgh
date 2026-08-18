"""Persian letter and search normalization.

Ganjoor stores vocalized Naskh. People type unvocalized Persian with
ی/ک, optional ZWNJ, and mixed Arabic lookalikes. Search has to meet them.
"""

from __future__ import annotations

import re

ARABIC_YEH = "\u064a"
FARSI_YEH = "\u06cc"
ARABIC_KAF = "\u0643"
FARSI_KAF = "\u06a9"
ALEF_MADDA = "\u0622"
ALEF_HAMZA_ABOVE = "\u0623"
ALEF_HAMZA_BELOW = "\u0625"
ALEF = "\u0627"
TATWEEL = "\u0640"
ZWNJ = "\u200c"
ZWJ = "\u200d"

# Combining marks: Arabic tashkeel + Quranic marks commonly used in Ganjoor.
_DIACRITICS = re.compile(
    r"[\u064b-\u065f\u0670\u06d6-\u06ed\u08d3-\u08e1\u08e3-\u08ff]"
)
_SPACES = re.compile(r"[\s\u00a0\u2000-\u200b\u202f\u205f\u3000]+")
_PUNCT = re.compile(r"[،؛؟!.:«»\"'()\[\]{}،,;?…ـ]+")


def normalize(text: str, *, keep_zwnj: bool = False) -> str:
    if not text:
        return ""
    text = text.replace(ARABIC_YEH, FARSI_YEH).replace(ARABIC_KAF, FARSI_KAF)
    text = (
        text.replace(ALEF_MADDA, ALEF)
        .replace(ALEF_HAMZA_ABOVE, ALEF)
        .replace(ALEF_HAMZA_BELOW, ALEF)
    )
    text = text.replace("ة", "ه").replace("ك", FARSI_KAF)
    text = _DIACRITICS.sub("", text)
    text = text.replace(TATWEEL, "")
    if not keep_zwnj:
        text = text.replace(ZWNJ, "").replace(ZWJ, "")
    text = _PUNCT.sub(" ", text)
    text = _SPACES.sub(" ", text)
    # People type ها stuck or spaced; Ganjoor mixes both.
    text = re.sub(r"\s+(ها|ای|تر|ترین)\b", r"\1", text)
    return text.strip()


def tokenize(text: str) -> list[str]:
    return [t for t in normalize(text).split(" ") if t]


def strip_html(html: str) -> str:
    if not html:
        return ""
    text = re.sub(r"<[^>]+>", " ", html)
    text = text.replace("&nbsp;", " ").replace("&zwnj;", ZWNJ)
    text = text.replace("&laquo;", "«").replace("&raquo;", "»")
    return _SPACES.sub(" ", text).strip()
