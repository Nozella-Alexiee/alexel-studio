#!/usr/bin/env python3
"""Daftar kunci tl("…") di src/ yang belum punya terjemahan Inggris di src/i18n/en.ts."""
import glob, json, re

keys = set(json.loads(m) for m in re.findall(r'^  ("(?:[^"\\]|\\.)*"):', open("src/i18n/en.ts").read(), re.M))
missing = {}
for f in glob.glob("src/**/*.ts*", recursive=True):
    if "i18n/" in f:
        continue
    for m in re.finditer(r'\btl\(\s*("(?:[^"\\]|\\.)*"|\'(?:[^\'\\]|\\.)*\')', open(f).read()):
        lit = m.group(1)
        if lit.startswith("'"):
            lit = '"' + lit[1:-1].replace('"', '\\"') + '"'
        try:
            k = json.loads(lit)
        except Exception:
            continue
        if k not in keys:
            missing.setdefault(k, f)
for k, f in missing.items():
    print(f"{f}\t{k}")
