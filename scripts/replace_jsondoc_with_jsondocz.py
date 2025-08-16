#!/usr/bin/env python3
import re
from pathlib import Path

root = Path(__file__).resolve().parent.parent / 'ESP32_AP-Flasher'
src = root / 'src'

pattern = re.compile(r"\bJsonDocument\s+([A-Za-z_]\w*)\s*\(\s*([A-Za-z0-9_]+)\s*\)")
include_arn = re.compile(r"#include\s*<ArduinoJson.h>")
include_z = ''

updated_files = []
for path in src.rglob('*.cpp'):
    text = path.read_text(encoding='utf-8')
    new_text = text
    # Add include after ArduinoJson.h if needed
    if include_arn.search(new_text) and include_z not in new_text:
        # insert include on the line after the ArduinoJson include
        new_text = re.sub(r"(#include\s*<ArduinoJson.h>\s*)", r"\1" + include_z + "\n", new_text, count=1)
    # Replace JsonDocument var declarations with capacity argument
    new_text = pattern.sub(r'JsonDocumentz \1(\2)', new_text)

    if new_text != text:
        path.write_text(new_text, encoding='utf-8')
        updated_files.append(str(path))

# Also process header files where local declarations may exist
for path in src.rglob('*.h'):
    text = path.read_text(encoding='utf-8')
    new_text = text
    if include_arn.search(new_text) and include_z not in new_text:
        new_text = re.sub(r"(#include\s*<ArduinoJson.h>\s*)", r"\1" + include_z + "\n", new_text, count=1)
    new_text = pattern.sub(r'JsonDocumentz \1(\2)', new_text)
    if new_text != text:
        path.write_text(new_text, encoding='utf-8')
        updated_files.append(str(path))

# Print results
if updated_files:
    print('Updated files:')
    for f in updated_files:
        print(f)
else:
    print('No files updated')
