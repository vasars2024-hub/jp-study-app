#!/usr/bin/env python3
"""Merge Mazii N1–N4 xlsx dumps and emit TypeScript grammar modules."""
from __future__ import annotations

import hashlib
import json
import re
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DOWNLOADS = Path.home() / "Downloads"
OUT_DIR = ROOT / "src" / "renderer" / "data" / "grammar"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}

HINTS = [
    (r"\b(because|since|due to|cause|reason)\b", "cause-reason"),
    (r"\b(if|when|unless|provided|as long as|condition)\b", "condition"),
    (r"\b(even if|even though|although|despite)\b", "concessions"),
    (r"\b(purpose|in order to|so as to|so that)\b", "purpose-goal"),
    (r"\b(can|able|possible|capability)\b", "ability"),
    (r"\b(must|have to|should|ought|need to|obligation|necessary)\b", "necessary-obligation"),
    (r"\b(want|wish|desire|hope)\b", "desire"),
    (r"\b(seem|appear|look like|apparently|probably|might)\b", "speculation"),
    (r"\b(compare|than|contrast)\b", "compare"),
    (r"\b(while|at the same time|simultaneously)\b", "simultaneous"),
    (r"\b(after|before|until|as soon as)\b", "time-sequence"),
    (r"\b(example|for instance|such as)\b", "for-example"),
    (r"\b(passive)\b", "passive"),
    (r"\b(hear|heard|reportedly)\b", "heard"),
    (r"\b(experience|have done|ever)\b", "experience"),
    (r"\b(try|attempt|effort)\b", "action-effort"),
    (r"\b(finish|complete|end up)\b", "finish"),
    (r"\b(limit|only|just|nothing but)\b", "limit"),
    (r"\b(not|never|negative)\b", "negative"),
    (r"\b(suggest|how about|shall we)\b", "invite-suggest"),
    (r"\b(please|request)\b", "request"),
    (r"\b(prohibit|ban|must not|forbidden)\b", "ban"),
    (r"\b(humble|honorific|respectful|formal|business)\b", "reverent-humble"),
    (r"\b(result|consequently)\b", "result"),
    (r"\b(decide|decision)\b", "decision"),
    (r"\b(plan|intend|going to)\b", "plan"),
    (r"\b(surprise|unexpected|contrary)\b", "surprise"),
    (r"\b(emphasize|emphasis|indeed)\b", "emphasize"),
    (r"\b(means|called|definition)\b", "definition"),
]


def col_row(cell_ref: str) -> tuple[int, int]:
    m = re.match(r"([A-Z]+)(\d+)", cell_ref)
    assert m
    col = 0
    for ch in m.group(1):
        col = col * 26 + (ord(ch) - 64)
    return col - 1, int(m.group(2)) - 1


def read_xlsx(path: Path) -> list[list[str]]:
    with zipfile.ZipFile(path) as z:
        shared: list[str] = []
        if "xl/sharedStrings.xml" in z.namelist():
            root = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in root.findall("m:si", NS):
                texts = [
                    t.text or ""
                    for t in si.iter("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}t")
                ]
                shared.append("".join(texts))
        sheet = ET.fromstring(z.read("xl/worksheets/sheet1.xml"))
        rows: dict[int, dict[int, str]] = {}
        for c in sheet.findall(".//m:c", NS):
            ref = c.get("r")
            if not ref:
                continue
            col, row = col_row(ref)
            v = c.find("m:v", NS)
            if v is None:
                continue
            val = v.text or ""
            if c.get("t") == "s":
                val = shared[int(val)]
            rows.setdefault(row, {})[col] = val
        maxc = max((max(r) + 1 for r in rows.values()), default=0)
        return [[rows.get(r, {}).get(c, "") for c in range(maxc)] for r in range(max(rows) + 1)]


def merge_level(level: str) -> list[dict[str, str]]:
    files = sorted(DOWNLOADS.glob(f"Grammar-{level}-Mazii*.xlsx"))
    seen: set[str] = set()
    items: list[dict[str, str]] = []
    for f in files:
        rows = read_xlsx(f)
        for row in rows[1:]:
            if not row or not row[0]:
                continue
            word = str(row[0]).strip()
            if not word or word in seen:
                continue
            seen.add(word)
            items.append(
                {
                    "word": word,
                    "phonetic": str(row[1]).strip() if len(row) > 1 else "",
                    "mean": str(row[2]).strip() if len(row) > 2 else "",
                    "comment": str(row[3]).strip() if len(row) > 3 else "",
                }
            )
    return items


def infer_fns(mean: str) -> list[str]:
    hits: list[str] = []
    for pat, fid in HINTS:
        if re.search(pat, mean, re.I) and fid not in hits:
            hits.append(fid)
        if len(hits) >= 3:
            break
    return hits or ["other"]


def infer_reg(mean: str, title: str) -> str:
    hay = (mean + " " + title).lower()
    if re.search(r"business|formal|敬語", hay):
        return "business"
    if re.search(r"casual|colloquial|slang|口語", hay):
        return "casual"
    if re.search(r"literary|written|文語", hay):
        return "literary"
    return "neutral"


def slug(s: str) -> str:
    h = hashlib.md5(s.encode("utf-8")).hexdigest()[:6]
    base = re.sub(r"[^a-z0-9]+", "-", re.sub(r"[\u3040-\u30ff\u4e00-\u9fff]", "", s.lower()))[:24].strip("-")
    return f"{base or 'g'}-{h}"


def esc(s: str) -> str:
    return s.replace("\\", "\\\\").replace("'", "\\'").replace("\n", " ")


def existing_titles(level: str) -> set[str]:
    titles: set[str] = set()
    for p in OUT_DIR.glob(f"{level.lower()}*.ts"):
        if "mazii" in p.name:
            continue
        text = p.read_text(encoding="utf-8")
        for m in re.finditer(r"title:\s*'([^']+)'", text):
            titles.add(m.group(1))
    return titles


def gen(level: str, items: list[dict[str, str]], out_name: str, const_name: str) -> None:
    existing = existing_titles(level)
    exist_n = {re.sub(r"\s+", "", t) for t in existing}
    out: list[str] = []
    skipped = 0
    for it in items:
        word = it["word"].strip()
        if not word:
            continue
        if word in existing or re.sub(r"\s+", "", word) in exist_n:
            skipped += 1
            continue
        mean = it.get("mean") or "Grammar pattern"
        fns = infer_fns(mean)
        reg = infer_reg(mean, word)
        sid = f"{level.lower()}m-{slug(word)}"
        fns_lit = ", ".join(f"'{f}'" for f in fns)
        out.append(
            f"""  {{
    id: '{sid}',
    lang: 'ja',
    level: '{level}',
    title: '{esc(word)}',
    meaning: '{esc(mean)}',
    structure: '{esc(word)}',
    explanation: '{esc(mean)}',
    functions: [{fns_lit}],
    register: '{reg}',
    examples: [],
  }}"""
        )
    path = OUT_DIR / out_name
    body = ",\n".join(out)
    header = (
        "import type { GrammarPoint } from './types';\n\n"
        f"/** Mazii {level} import — deduped against core/{level.lower()}-extra. "
        "Generated by tools/import-mazii-grammar.py */\n"
        f"export const {const_name}: GrammarPoint[] = [\n"
    )
    path.write_text(header + body + "\n];\n", encoding="utf-8")
    print(f"{level}: wrote {len(out)} (skipped {skipped}) -> {path}")


def main() -> None:
    for level, out_name, const_name in (
        ("N1", "n1-mazii.ts", "N1_MAZII"),
        ("N2", "n2-mazii.ts", "N2_MAZII"),
        ("N3", "n3-mazii.ts", "N3_MAZII"),
        ("N4", "n4-mazii.ts", "N4_MAZII"),
    ):
        items = merge_level(level)
        (ROOT / "tools" / f"_mazii_{level.lower()}.json").write_text(
            json.dumps(items, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        gen(level, items, out_name, const_name)


if __name__ == "__main__":
    main()
