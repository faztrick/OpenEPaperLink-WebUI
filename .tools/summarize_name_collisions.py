#!/usr/bin/env python3
import json
from collections import Counter
j=json.load(open('ESP32_AP-Flasher/name_groups.json','r',encoding='utf-8'))
groups=j['groups']
ctrl=set(['if','for','while','switch','else','do'])
coll=[(name,len(v)) for name,v in groups.items() if name not in ctrl and len(v)>1]
coll_sorted=sorted(coll,key=lambda x:-x[1])
print('Top collisions:')
for name,count in coll_sorted[:15]:
    print(name,count)
json.dump({ 'top': coll_sorted[:500], 'total_collision_names': len(coll_sorted)}, open('ESP32_AP-Flasher/name_collisions.json','w',encoding='utf-8'))
