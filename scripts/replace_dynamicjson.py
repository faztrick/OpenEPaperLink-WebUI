#!/usr/bin/env python3
"""
Replacement stub for replace_dynamicjson.ps1
Performs a safe recursive replace of the symbol across .cpp and .h files.
"""
import re
from pathlib import Path


def main():
    root = Path(__file__).resolve().parent.parent
    for p in root.rglob('*'):
        if p.suffix.lower() in ('.cpp', '.h'):
            text = p.read_text(encoding='utf-8')
            new = re.sub(r'\bDynamicJsonDocument\b', 'JsonDocument', text)
            if new != text:
                p.write_text(new, encoding='utf-8')
                print(f'Updated: {p}')

if __name__ == '__main__':
    main()
