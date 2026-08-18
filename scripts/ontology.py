"""Curated ontology for the Ganjoor graph.

Schools and influence edges are conservative: only relationships a
literature student would not argue with. Theme stems are search keys,
not a complete motif dictionary.
"""

from __future__ import annotations

# Literary school by poet slug. Unlisted poets inherit from century.
SCHOOLS: dict[str, str] = {
    "roodaki": "خراسانی",
    "ferdousi": "خراسانی",
    "daghighi": "خراسانی",
    "khayyam": "خراسانی",
    "naserkhosro": "خراسانی",
    "manoochehri": "خراسانی",
    "farrokhi": "خراسانی",
    "onsori": "خراسانی",
    "asadi": "خراسانی",
    "kesayee": "خراسانی",
    "sanaee": "عراقی",
    "attar": "عراقی",
    "moulavi": "عراقی",
    "saadi": "عراقی",
    "hafez": "عراقی",
    "nezami": "عراقی",
    "khaghani": "عراقی",
    "anvari": "عراقی",
    "khajoo": "عراقی",
    "eraghi": "عراقی",
    "jami": "عراقی",
    "ouhadi": "عراقی",
    "shabestari": "عراقی",
    "abusaeed": "عراقی",
    "babataher": "عراقی",
    "saeb": "هندی",
    "bidel": "هندی",
    "kalim": "هندی",
    "orfi": "هندی",
    "ghaleb": "هندی",
    "naziri": "هندی",
    "kelim": "هندی",
    "bahar": "بازگشت",
    "hatef": "بازگشت",
    "neshat": "بازگشت",
    "parvin": "معاصر",
    "shahriar": "معاصر",
    "iraj": "معاصر",
    "eshghi": "معاصر",
    "aref": "معاصر",
    "iqbal": "معاصر",
    "yazdi": "معاصر",
    "rahi": "معاصر",
}

# source influenced target. Directed, well-attested only.
INFLUENCE: list[tuple[str, str]] = [
    ("roodaki", "ferdousi"),
    ("daghighi", "ferdousi"),
    ("sanaee", "attar"),
    ("attar", "moulavi"),
    ("sanaee", "moulavi"),
    ("saadi", "hafez"),
    ("khajoo", "hafez"),
    ("eraghi", "hafez"),
    ("attar", "hafez"),
    ("nezami", "jami"),
    ("moulavi", "jami"),
    ("hafez", "saeb"),
    ("saeb", "bidel"),
    ("hafez", "shahriar"),
    ("moulavi", "iqbal"),
    ("saadi", "parvin"),
]

# theme_id -> (label_fa, stems)
THEMES: dict[str, tuple[str, list[str]]] = {
    "eshq": ("عشق", ["عشق", "عاشق", "معشوق", "دلبر", "یار"]),
    "may": ("می و ساقی", ["ساقی", "باده", "میکده", "پیاله", "خراباباد"]),
    "rend": ("رندی", ["رند", "رندی"]),
    "zohd": ("زهد و واعظ", ["زاهد", "زهد", "واعظ", "توبه"]),
    "fana": ("فنا", ["فنا", "نیستی"]),
    "marg": ("مرگ", ["مرگ", "اجل", "کفن", "گورستان"]),
    "bagh": ("باغ", ["بلبل", "چمن", "لاله", "نرگس", "سمن"]),
    "shab": ("شب", ["شب", "سحر", "مهتاب"]),
    "feraq": ("فراق", ["فراق", "هجران", "هجر"]),
    "vesal": ("وصال", ["وصال"]),
    "haq": ("حق", ["یزدان", "الله"]),
    "pir": ("پیر", ["پیرمغان", "مرشد", "پیر میخانه"]),
    "safar": ("سفر", ["قافله", "محمل", "منزل"]),
    "falak": ("فلک", ["روزگار", "فلک", "چرخ"]),
    "simorgh": ("سیمرغ", ["سیمرغ", "عنقا"]),
    "shahname": ("حماسه", ["رستم", "سهراب", "سیاوش", "کیخسرو"]),
    "vatan": ("وطن", ["میهن", "ایران"]),
    "dad": ("عدل", ["ستم", "ظالم", "عدل"]),
    "rindi_may": ("رطل", ["رطل", "خمخانه"]),
}

# Extra single-token stems that are too short to put in THEMES as labels.
THEME_ALIASES: dict[str, str] = {
    "می": "may",
    "جام": "may",
    "گل": "bagh",
    "سرو": "bagh",
    "خدا": "haq",
    "حق": "haq",
    "پیر": "pir",
    "سفر": "safar",
    "راه": "safar",
    "مرگ": "marg",
    "عشق": "eshq",
    "یار": "eshq",
}


def school_for(slug: str, hijri_year: int | None) -> str:
    if slug in SCHOOLS:
        return SCHOOLS[slug]
    if hijri_year is None:
        return "نامشخص"
    if hijri_year < 500:
        return "خراسانی"
    if hijri_year < 900:
        return "عراقی"
    if hijri_year < 1200:
        return "هندی"
    if hijri_year < 1300:
        return "بازگشت"
    return "معاصر"


def century_label(hijri_year: int | None) -> str | None:
    if not hijri_year:
        return None
    century = (hijri_year - 1) // 100 + 1
    return f"سدهٔ {century}"
