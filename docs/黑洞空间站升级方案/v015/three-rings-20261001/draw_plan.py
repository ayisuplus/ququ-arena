"""Conceptual topology only; not a construction plan or a physical simulation."""
from pathlib import Path
import math
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.font_manager import FontProperties
from matplotlib.patches import Wedge, Circle, Rectangle

OUT = Path(__file__).resolve().parent
plt.rcParams['font.family'] = FontProperties(fname='C:/Windows/Fonts/msyh.ttc').get_name()
plt.rcParams['axes.unicode_minus'] = False
ink, secondary = '#213e4e', '#536b75'
colors = ['#4e86af', '#a77646', '#458675']
pales = ['#e0edf5', '#f4e9de', '#e0eee9']
fig = plt.figure(figsize=(16,10),facecolor='white')
ax = fig.add_axes([.035,.18,.55,.66])
ax.set_aspect('equal'); ax.set_xlim(-258,258); ax.set_ylim(-244,266); ax.axis('off')

def point(r,a):
    a=math.radians(a)
    return r*math.cos(a),r*math.sin(a)

def annulus(inner,outer,color):
    ax.add_patch(Wedge((0,0),outer,0,360,width=outer-inner,facecolor=color,edgecolor='none'))

for inner,outer in [(72,80),(142,150)]:
    ax.add_patch(Wedge((0,0),outer,0,360,width=outer-inner,facecolor='#eff1f0',edgecolor='#7d8d92',hatch='////',linewidth=.6))

ring_specs=[(25,72,0),(80,142,30),(150,222,60)]
for i,(inner,outer,offset) in enumerate(ring_specs):
    annulus(inner,outer,pales[i])
    for angle in [0,90,180,270]:
        a,b=point(inner+2,angle+offset),point(outer-2,angle+offset)
        ax.plot([a[0],b[0]],[a[1],b[1]],color='white',lw=8,zorder=2)
        ax.plot([a[0],b[0]],[a[1],b[1]],color=colors[i],lw=.6,zorder=3)
    for r in [inner+5,outer-5]:
        ax.add_patch(Circle((0,0),r,fill=False,edgecolor=colors[i],lw=.8,alpha=.55))
    clockwise=i!=1
    start,end=(325,300) if clockwise else (300,325)
    path=[point(outer-10,start+(end-start)*j/30) for j in range(31)]
    ax.plot([p[0] for p in path],[p[1] for p in path],color=colors[i],lw=1.8)
    ax.annotate('',xy=path[-1],xytext=path[-3],arrowprops=dict(arrowstyle='-|>',lw=1.8,color=colors[i]))

# Buildings are schematic sectors; the white transverse streets turn with each ring.
labels=[
    (0,48,45,'赛事厅'),(0,48,135,'看台'),(0,48,225,'看台'),
    (1,111,74,'咖啡\n会客'),(1,111,160,'科研\n工作'),(1,111,248,'阅读\n活动'),
    (2,184,16,'玻璃\n生态园'),(2,184,105,'短住'),(2,184,193,'常住'),(2,184,283,'观景'),
]
for i,r,a,label in labels:
    width=[20,28,28][i]
    ax.add_patch(Wedge((0,0),r+width/2,a-17,a+17,width=width,facecolor=colors[i],alpha=.65,edgecolor='none',zorder=4))
    ax.text(*point(r,a),label,ha='center',va='center',fontsize=10,color=ink,zorder=5)
ax.add_patch(Circle((0,0),25,facecolor=ink))
ax.text(0,0,'赛场\n开口',ha='center',va='center',color='white',fontsize=9)

# Stationary arrival building sits outside the sweep of the outer ring.
ax.add_patch(Rectangle((-29,224),58,23,facecolor='#edf0f1',edgecolor=secondary,lw=1))
ax.text(0,235.5,'固定抵达厅',ha='center',va='center',fontsize=9,color=ink)
ax.annotate('',xy=(0,214),xytext=(0,224),arrowprops=dict(arrowstyle='->',color=ink,lw=1.2))
ax.text(0,261,'船坞与抵达设施保持固定',ha='center',fontsize=10,color=secondary)

for r,a,label,xy in [(76,185,'固定换乘带 A',(-243,-48)),(146,335,'固定换乘带 B',(150,-191))]:
    ax.annotate(label,xy=point(r,a),xytext=xy,fontsize=10,color=secondary,
                arrowprops=dict(arrowstyle='-',color=secondary,lw=.8),ha='center',va='center')
ax.text(0,-238,'环内街巷随环转动；相邻街巷不必对齐',ha='center',fontsize=11,color=ink)

fig.text(.04,.94,'三环空间 / 功能分工与步行流转',fontsize=23,color=ink)
fig.text(.04,.90,'讨论稿 01 · 概念比例示意 · 尚未施工，接缝需原型验证',fontsize=12,color=secondary)
fig.text(.64,.82,'每圈各有一个清楚的角色',fontsize=16,color=ink)
rows=[('内环 · 赛事核心','赛场、看台、赛事大厅','最紧凑 · 极慢顺时针',colors[0]),
      ('中环 · 公共生活','咖啡会客、科研工作、阅读活动','公共街道 · 慢速逆时针',colors[1]),
      ('外环 · 居住与生态','常住、短住、玻璃生态园、观景','安静低层 · 更慢顺时针',colors[2])]
for j,(title,content,motion,color) in enumerate(rows):
    y=.75-j*.105
    fig.text(.64,y,title,fontsize=14,color=color)
    fig.text(.64,y-.031,content,fontsize=11,color=ink)
    fig.text(.64,y-.057,motion,fontsize=10,color=secondary)

flow=fig.add_axes([.635,.235,.335,.20]); flow.axis('off'); flow.set_xlim(0,100); flow.set_ylim(0,60)
flow.text(0,56,'跨环：全程步行，不等两边门对齐',fontsize=13,color=ink)
for x,w,color,label,motion in [(0,32,pales[0],'旋转环 A','↑ 慢移'),(32,36,'#eff1f0','固定换乘带','静止'),(68,32,pales[1],'旋转环 B','↓ 慢移')]:
    flow.add_patch(Rectangle((x,16),w,24,facecolor=color,edgecolor='none'))
    flow.text(x+w/2,32,label,ha='center',va='center',fontsize=10,color=ink)
    flow.text(x+w/2,21,motion,ha='center',va='center',fontsize=9,color=secondary)
for x in [32,68]:
    flow.plot([x,x],[16,40],color=secondary,lw=.8)
flow.annotate('',xy=(98,8),xytext=(2,8),arrowprops=dict(arrowstyle='->',color=ink,lw=1.5))
flow.text(50,0,'平齐接缝 → 固定地面 → 平齐接缝',ha='center',fontsize=9,color=secondary)
fig.text(.64,.19,'主通行面同高；楼顶可以高低错落',fontsize=11,color=ink)

fig.text(.04,.11,'日常路线：外环住处 → 换乘带 B → 中环咖啡街 → 换乘带 A → 内环看台',fontsize=12,color=ink)
fig.text(.04,.065,'细纹窄带为固定交通设施；图中的建筑扇区与街巷数量仅用于说明关系，不是实际尺寸或最终外形。',fontsize=10,color=secondary)
fig.text(.04,.035,'保留房间内容与稳定身份；旋转交界、角色带随、导航与存档需要独立验证。',fontsize=10,color=secondary)
fig.savefig(OUT/'three-ring-plan.png',dpi=150,facecolor='white')
plt.close(fig)
print(OUT/'three-ring-plan.png')
