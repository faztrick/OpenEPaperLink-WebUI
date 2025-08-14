#!/usr/bin/env python3
import os, re, json, argparse

SIG_RE = re.compile(r'^\s*([\w:\<\>\~\*\&\s,]+?)\s+([\w:~]+)\s*\(([^;{}]*)\)')

def scan(root):
    files = []
    for dirpath, dirnames, filenames in os.walk(root):
        if '.pio' in dirpath:
            continue
        for fn in filenames:
            if fn.endswith(('.cpp', '.c', '.h', '.hpp', '.cc')):
                files.append(os.path.join(dirpath, fn))
    groups = {}
    for fp in files:
        with open(fp,'r',encoding='utf-8',errors='ignore') as f:
            for i, line in enumerate(f, start=1):
                m = SIG_RE.match(line)
                if m:
                    ret = m.group(1).strip()
                    name = m.group(2).strip()
                    params = m.group(3).strip()
                    groups.setdefault(name, []).append({'file': fp, 'line': i, 'ret': ret, 'params': params})
    return {'root': os.path.abspath(root), 'groups': groups}

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('-r','--root', default='ESP32_AP-Flasher/src')
    parser.add_argument('-o','--out', default='ESP32_AP-Flasher/name_groups.json')
    args = parser.parse_args()
    report = scan(args.root)
    with open(args.out,'w',encoding='utf-8') as f:
        json.dump(report,f,indent=2)
    print('Wrote', args.out)
