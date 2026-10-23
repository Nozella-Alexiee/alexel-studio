#!/usr/bin/env python3
"""Tambah terjemahan: python3 scripts/i18n/add.py spec.json  (spec = {"kunci Indonesia": "English", …})."""
import json, re, sys

en = "src/i18n/en.ts"
s = open(en).read()
existing = set(re.findall(r'^  ("(?:[^"\\]|\\.)*"):', s, re.M))
add = []
for k, v in json.load(open(sys.argv[1])).items():
    kj = json.dumps(k, ensure_ascii=False)
    if kj not in existing:
        add.append(f"  {kj}: {json.dumps(v, ensure_ascii=False)},")
if add:
    i = s.rstrip().rfind("};")
    s = s[:i] + "\n".join(add) + "\n" + s[i:]
    open(en, "w").write(s)
print("ditambah", len(add))
