#!/usr/bin/env python3
import os, re, json, argparse
from difflib import SequenceMatcher

SIG_RE = re.compile(r'^\s*([\w:\<\>\~\*\&\s,]+?)\s+([\w:~]+)\s*\(([^;{}]*)\)\s*(const)?\s*\{')

# reuse name_groups.json if present

def load_name_groups(path='ESP32_AP-Flasher/name_groups.json'):
    if not os.path.exists(path):
        return None
    return json.load(open(path,'r',encoding='utf-8'))['groups']


def extract_function_body(file, start_line, end_line):
    try:
        with open(file,'r',encoding='utf-8',errors='ignore') as f:
            lines=f.readlines()
            # lines are 1-indexed in our earlier tools
            return ''.join(lines[start_line-1:end_line])
    except Exception as e:
        return ''


def normalize(s):
    s = re.sub(r'/\*.*?\*/', '', s, flags=re.S)
    s = re.sub(r'//.*', '', s)
    s = re.sub(r'\s+', ' ', s)
    return s.strip()


def similarity(a,b):
    a_norm = normalize(a)
    b_norm = normalize(b)
    if not a_norm or not b_norm:
        return 0.0
    return SequenceMatcher(None,a_norm,b_norm).ratio()


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('-r','--root',default='ESP32_AP-Flasher/src')
    parser.add_argument('-n','--name_groups',default='ESP32_AP-Flasher/name_groups.json')
    parser.add_argument('-o','--out',default='ESP32_AP-Flasher/fuzzy_report.json')
    parser.add_argument('--min_occ',type=int,default=2)
    parser.add_argument('--min_sim',type=float,default=0.75)
    args=parser.parse_args()

    groups = load_name_groups(args.name_groups)
    if groups is None:
        print('name_groups.json not found; run group_by_name.py first')
        return

    candidates = []
    for name,occ in groups.items():
        if len(occ) < args.min_occ:
            continue
        # build bodies list by attempting to get a body using nearby lines
        bodies = []
        for o in occ:
            file=o['file']
            line=o['line']
            # heuristically find function end by scanning braces after signature
            try:
                with open(file,'r',encoding='utf-8',errors='ignore') as f:
                    all_lines=f.readlines()
                # start from signature line
                i=line-1
                # if signature spans multiple lines, include them
                # find first '{' from the signature line onward
                brace_count=0
                started=False
                body_lines=[]
                # find the opening brace
                while i < len(all_lines):
                    if '{' in all_lines[i]:
                        started=True
                        brace_count += all_lines[i].count('{') - all_lines[i].count('}')
                        body_lines.append(all_lines[i])
                        i += 1
                        break
                    i += 1
                while started and i < len(all_lines) and brace_count>0:
                    body_lines.append(all_lines[i])
                    brace_count += all_lines[i].count('{') - all_lines[i].count('}')
                    i += 1
                bodies.append({'file':file,'line':line,'body': ''.join(body_lines)})
            except Exception as e:
                bodies.append({'file':file,'line':line,'body':''})
        # compare pairwise
        similar_pairs=[]
        for i in range(len(bodies)):
            for j in range(i+1,len(bodies)):
                sim = similarity(bodies[i]['body'], bodies[j]['body'])
                if sim >= args.min_sim:
                    similar_pairs.append({'a':bodies[i],'b':bodies[j],'sim':sim})
        if similar_pairs:
            candidates.append({'name':name,'count':len(occ),'pairs':sorted(similar_pairs,key=lambda x:-x['sim'])})

    # sort candidates by max similarity and count
    candidates.sort(key=lambda c: (-max(p['sim'] for p in c['pairs']), -c['count']))
    out={'root':os.path.abspath(args.root),'candidates':candidates}
    with open(args.out,'w',encoding='utf-8') as f:
        json.dump(out,f,indent=2)
    print('Wrote',args.out,'with',len(candidates),'candidates')

if __name__=='__main__':
    main()
