#!/usr/bin/env python3
"""Normalization must map Ganjoor vocalized text to how people type."""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))

from persian import normalize, tokenize  # noqa: E402


def test_yeh_kaf() -> None:
    assert normalize("كي") == "کی"
    assert "ي" not in normalize("يعني")
    assert "ك" not in normalize("كه")


def test_diacritics() -> None:
    vocalized = "اَلا یا اَیُّهَا السّاقی"
    assert normalize(vocalized) == "الا یا ایها الساقی"


def test_known_line() -> None:
    line = "که عشق آسان نمود اوّل ولی افتاد مشکل‌ها"
    typed = "که عشق آسان نمود اول ولی افتاد مشکلها"
    spaced = "که عشق آسان نمود اول ولی افتاد مشکل ها"
    assert normalize(line) == normalize(typed) == normalize(spaced)
    assert "عشق" in tokenize(line)


def test_alef_variants() -> None:
    assert normalize("آسمان") == normalize("اسمان") or "اسمان" in normalize("آسمان")


if __name__ == "__main__":
    test_yeh_kaf()
    test_diacritics()
    test_known_line()
    test_alef_variants()
    print("test_persian: ok")
