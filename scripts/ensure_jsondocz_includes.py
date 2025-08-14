#!/usr/bin/env python3
from pathlib import Path

root = Path(__file__).resolve().parent.parent / 'ESP32_AP-Flasher' / 'src'

files = list(root.rglob('*.cpp')) + list(root.rglob('*.h'))
updated = []
for f in files:
    txt = f.read_text(encoding='utf-8')
    if 'JsonDocumentz' in txt and '#include "JsonDocumentz.h"' not in txt:
        # Try to insert after ArduinoJson include if present
        if '#include <ArduinoJson.h>' in txt:
            txt = txt.replace('#include <ArduinoJson.h>', '#include <ArduinoJson.h>\n#include "JsonDocumentz.h"', 1)
        else:
            # insert after first include or at top
            lines = txt.splitlines()
            insert_at = 0
            for i,l in enumerate(lines[:20]):
                if l.strip().startswith('#include'):
                    insert_at = i+1
            lines.insert(insert_at, '#include "JsonDocumentz.h"')
            txt = '\n'.join(lines)
        f.write_text(txt, encoding='utf-8')
        updated.append(str(f))

if updated:
    print('Added include to:')
    for u in updated:
        print(u)
else:
    print('No changes')
