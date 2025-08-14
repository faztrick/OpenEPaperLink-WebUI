#!/usr/bin/env python3
import os
import re
import json
import argparse

# Improved duplicate detector with logging and safer file writes
CONTROL_KEYWORDS = set(["if","for","while","switch","else","do","case","return","catch","try","sizeof"])

def remove_comments(code):
    code = re.sub(r'/\*.*?\*/', '', code, flags=re.S)
    code = re.sub(r'//.*', '', code)
    return code

def collapse_whitespace(s):
    return re.sub(r'\s+', ' ', s).strip()

FUNC_PATTERN = re.compile(r'^\s*([\w:\<\>\~\*\&\s,]+?)\s+([\w:~]+)\s*\(([^;{}]*)\)\s*(const)?\s*\{')

def find_functions_in_file(path):
    try:
        with open(path, 'r', encoding='utf-8', errors='ignore') as f:
            text = f.read()
    except Exception as e:
        print(f"Failed reading {path}: {e}")
        return []
    lines = text.splitlines()
    functions = []
    i = 0
    while i < len(lines):
        line = lines[i]
        try:
            next_line = lines[i+1] if i+1 < len(lines) else ''
        except Exception:
            next_line = ''
        # quick filter: must contain '(' and a following '{' within the same or next line
        if '(' in line and ('{' in line or '{' in next_line):
            m = FUNC_PATTERN.match(line)
            if m:
                sig = m.group(0).rstrip('{').strip()
                first_word = sig.strip().split()[0] if sig.strip().split() else ''
                if first_word in CONTROL_KEYWORDS:
                    i += 1
                    continue
                # capture body by brace matching
                brace_count = line.count('{') - line.count('}')
                body_lines = []
                j = i+1
                while brace_count > 0 and j < len(lines):
                    body_lines.append(lines[j])
                    brace_count += lines[j].count('{') - lines[j].count('}')
                    j += 1
                body = '\n'.join(body_lines)
                functions.append({
                    'signature': sig,
                    'body': body,
                    'start_line': i+1,
                    'end_line': j,
                    'file': path
                })
                i = j
                continue
        i += 1
    return functions

def normalize_body(body):
    body_no_comments = remove_comments(body)
    return collapse_whitespace(body_no_comments)

def scan_root(root):
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        # skip common vendor/build dirs
        if '.pio' in dirpath or 'lib' in dirpath and dirpath.endswith('lib'):
            continue
        # skip binary or build folders
        if any(p in dirpath for p in ['.github', 'build', 'out', 'node_modules']):
            continue
        for fn in filenames:
            if fn.endswith(('.cpp', '.c', '.h', '.hpp', '.cc')):
                files.append(os.path.join(dirpath, fn))
    all_funcs = []
    for fp in files:
        funcs = find_functions_in_file(fp)
        for f in funcs:
            f['normalized_body'] = normalize_body(f['body'])
            all_funcs.append(f)
    groups = {}
    for f in all_funcs:
        key = (f['signature'], f['normalized_body'])
        groups.setdefault(key, []).append({'file': f['file'], 'start': f['start_line'], 'end': f['end_line']})
    duplicates = []
    for (sig, body), occ in groups.items():
        if len(occ) > 1:
            duplicates.append({'signature': sig, 'occurrences': occ})
    report = {
        'root': os.path.abspath(root),
        'scanned_files_count': len(files),
        'functions_found': len(all_funcs),
        'duplicates': duplicates
    }
    return report


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('-r','--root', default='ESP32_AP-Flasher/src', help='root folder to scan')
    parser.add_argument('-o','--out', default='ESP32_AP-Flasher/duplicate_report.json', help='output json file')
    args = parser.parse_args()

    report = scan_root(args.root)
    try:
        with open(args.out, 'w', encoding='utf-8') as outf:
            json.dump(report, outf, indent=2)
        print(f"Wrote report to {args.out}")
    except Exception as e:
        print(f"Failed to write report to {args.out}: {e}")
    print(f"Scanned {report['scanned_files_count']} files, found {report['functions_found']} functions, {len(report['duplicates'])} duplicate groups")

if __name__ == '__main__':
    main()
