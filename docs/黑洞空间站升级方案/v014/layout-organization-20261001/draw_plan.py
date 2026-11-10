"""Draw a measured planning diagram, not a game screenshot or exterior design."""
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Rectangle, Circle
from matplotlib.font_manager import FontProperties

OUT = Path(__file__).resolve().parent
survey = json.loads((OUT / 'inventory.json').read_text(encoding='utf-8-sig'))
font = FontProperties(fname='C:/Windows/Fonts/msyh.ttc')
plt.rcParams['font.family'] = font.get_name()
plt.rcParams['axes.unicode_minus'] = False
colors = {'北': '#3d78a0', '东': '#996539', '南': '#397969', '西': '#776099'}
specs = [
    ('05', '阅览会客楼', '东', (166, 30)), ('06', '研修讨论楼', '西', (-166, -30)),
    ('07', '访客会客楼', '北', (66, 160)), ('08', '阅读活动楼', '南', (-60, -160)),
    ('09', '候舱阅览楼', '北', (-66, 160)), ('10', '共享工作楼', '南', (60, -160)),
    ('11', '东短住舱', '东', (168, -64)), ('12', '西短住舱', '西', (-168, 64)),
]
items = []
for number, label, zone, proposed in specs:
    row = next(r for r in survey['groups'] if r['name'].startswith(number + '  /'))
    current = [row['position'][0], row['position'][2]]
    bounds = [row['min'][0], row['min'][2], row['max'][0], row['max'][2]]
    dx, dz = proposed[0] - current[0], proposed[1] - current[1]
    items.append(dict(number=number, label=label, zone=zone, id=row['id'], path=row['path'],
                      current=current, proposed=list(proposed), yaw=row['yaw'], bounds=bounds,
                      proposed_bounds=[bounds[0]+dx, bounds[1]+dz, bounds[2]+dx, bounds[3]+dz]))

zones = {'北': [-90, 120, 90, 188], '东': [120, -80, 192, 55],
         '南': [-84, -184, 84, -120], '西': [-192, -55, -120, 80]}
main_names = [('北', 'V014 swept arrival roof'), ('东', 'Southeast public cafe and street stop'),
              ('南', 'V014 ecological garden structural candidate'), ('西', 'V014 folded research envelope')]
mains = []
for zone, name in main_names:
    r = next(r for r in survey['groups'] if r['name'] == name)
    mains.append(dict(zone=zone, name=name, id=r['id'],
                      bounds=[r['min'][0], r['min'][2], r['max'][0], r['max'][2]]))

def rect(ax, b, **kw):
    ax.add_patch(Rectangle((b[0], b[1]), b[2]-b[0], b[3]-b[1], **kw))

def base(ax, proposed):
    ax.set_aspect('equal'); ax.set_xlim(-354,354); ax.set_ylim(-354,354); ax.axis('off')
    ax.add_patch(Circle((0,0),336, facecolor='#f5f7f7', edgecolor='#819096', linewidth=1.2))
    ax.add_patch(Circle((0,0),330, fill=False, edgecolor='#c4cdcf', linewidth=3))
    for sx in (-1,1):
        for sz in (-1,1):
            ax.plot([sx*120,sx*233.35],[sz*120,sz*233.35],color='#c8d2d6',lw=6,zorder=1)
    rect(ax, [-120,-120,120,120],facecolor='#e4e9ec',edgecolor='#70828c',lw=1)
    ax.add_patch(Circle((0,0),36,facecolor='#b9c7cd',edgecolor='#70828c',lw=.8))
    ax.add_patch(Circle((0,0),25,facecolor='#314b5b'))
    ax.text(0,-58,'中央赛场与住处\n原位保留',ha='center',va='top',fontsize=10,color='#314b5b')
    rect(ax, [-20.225,185,20.225,322.9],facecolor='#dbe7ee',edgecolor=colors['北'],lw=.8)
    ax.text(0,247,'登船\n轴线',ha='center',va='center',fontsize=9,color='#314b5b')
    if proposed:
        for zone, b in zones.items():
            rect(ax,b,facecolor=colors[zone],alpha=.08,edgecolor='none',zorder=2)
            rect(ax,b,facecolor='none',edgecolor=colors[zone],ls=(0,(4,3)),lw=1,zorder=2)
        rect(ax,[-30,188,30,326],facecolor='none',edgecolor=colors['北'],ls=(0,(4,3)),lw=.8)
    for m in mains:
        rect(ax,m['bounds'],facecolor=colors[m['zone']],alpha=.65,edgecolor='none',zorder=3)
    ax.text(0,112,'北 · 抵达候舱',ha='center',va='top',fontsize=9,color=colors['北'])
    ax.text(0,-110,'南 · 生态活动',ha='center',va='bottom',fontsize=9,color=colors['南'])
    ax.text(235,0,'东\n咖啡生活',ha='center',va='center',fontsize=10,color=colors['东'])
    ax.text(-235,0,'西\n科研档案',ha='center',va='center',fontsize=10,color=colors['西'])
    ax.text(0,348,'北 N / +Z',ha='center',fontsize=9,color='#526671')
    ax.text(0,-289,'外环保持连续 · 组团之间留白',ha='center',fontsize=9,color='#526671')
    ax.plot([-270,-220],[-260,-260],color='#526671',lw=2)
    ax.text(-245,-275,'50 m',ha='center',fontsize=8,color='#526671')

fig, axes = plt.subplots(1,2,figsize=(16,9), facecolor='white')
fig.subplots_adjust(top=.83,bottom=.18,left=.025,right=.975,wspace=.07)
for ax, proposed, title in zip(axes,[False,True],['现状｜附楼散开，归属较弱','建议 01｜四个紧凑组团']):
    base(ax,proposed)
    for item in items:
        b = item['proposed_bounds'] if proposed else item['bounds']
        p = item['proposed'] if proposed else item['current']
        rect(ax,b,facecolor=colors[item['zone']],alpha=.85,edgecolor='none',zorder=4)
        ax.text(*p,item['number'],ha='center',va='center',color='white',fontsize=9,fontweight='bold',zorder=5)
        if proposed and item['current'] != item['proposed']:
            rect(ax,item['bounds'],facecolor='none',edgecolor=colors[item['zone']],lw=.8,alpha=.45,zorder=3)
            ax.annotate('',xy=p,xytext=item['current'],arrowprops=dict(arrowstyle='->',color=colors[item['zone']],lw=1),zorder=4)
    ax.set_title(title,fontsize=15,loc='left',pad=15,color='#263d49')
fig.text(.03,.955,'黑洞空间站 / 建筑位置与归属讨论稿 01',fontsize=22,color='#203c4b')
fig.text(.03,.91,'2026-10-01 · 基于当前 Unity 候选场景的只读调查 · 建议坐标尚未施工',fontsize=11,color='#526671')
fig.text(.03,.135,'北：07 访客会客 + 09 候舱阅览      东：05 阅览会客 + 11 短住舱',fontsize=11,color='#263d49')
fig.text(.03,.10,'南：08 阅读活动 + 10 共享工作      西：06 研修讨论 + 12 短住舱',fontsize=11,color='#263d49')
fig.text(.03,.06,'虚线为建议管理范围，并非新建围墙；浅色空框为原位置。四角主路仅画示意轴线。',fontsize=10,color='#526671')
fig.text(.03,.03,'图中仅显示主要功能设施与八栋附楼包围盒；连廊、框架、家具和全部交通接口须另做逐项归属审查。',fontsize=10,color='#526671')
fig.savefig(OUT/'layout-comparison.png',dpi=140,facecolor='white')
plt.close(fig)

def overlap(a,b):
    return min(a[2],b[2]) > max(a[0],b[0]) and min(a[3],b[3]) > max(a[1],b[1])
checks = []
for item in items:
    b,z=item['proposed_bounds'],zones[item['zone']]
    checks.append(dict(check='within proposed group',number=item['number'],passed=b[0]>=z[0] and b[1]>=z[1] and b[2]<=z[2] and b[3]<=z[3]))
    checks.append(dict(check='outside protected core',number=item['number'],passed=not overlap(b,[-120,-120,120,120])))
    for main in mains:
        checks.append(dict(check='no main survey footprint overlap',number=item['number'],main=main['name'],passed=not overlap(b,main['bounds'])))
for i,a in enumerate(items):
    for b in items[i+1:]:
        checks.append(dict(check='no annex overlap',numbers=[a['number'],b['number']],passed=not overlap(a['proposed_bounds'],b['proposed_bounds'])))
data=dict(status='discussion proposal; not installed; no route/collision clearance claim',
          source_scene=survey['scene'],coordinates='Unity world X,Z in metres; north is +Z',
          group_bounds=zones,north_boarding_extension=[-30,188,30,326],main_survey_footprints=mains,annexes=items)
(OUT/'proposal.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(OUT/'diagram-checks.json').write_text(json.dumps(dict(scope='2D diagram consistency only; excludes all other scene objects and pedestrian clearance',passed=all(c['passed'] for c in checks),checks=checks),ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
assert all(c['passed'] for c in checks), 'Review failed diagram checks'
print(f'Created layout-comparison.png; {len(items)} annexes; {len(checks)} diagram consistency checks passed.')
