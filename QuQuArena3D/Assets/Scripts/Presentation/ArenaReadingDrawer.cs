using System.Linq;
using System.Text;
using TMPro;
using UnityEngine;
namespace QuQu
{
    public class ArenaReadingDrawer : MonoBehaviour
    {
        IStationContext ctx; // P3-D：抽屉只认周边组件切片，不认门面类型
        RectTransform panel,content;
        TMP_Text title,body;
        public string PinnedKey {get;private set;}
        public string FullText => body.text;
        public bool IsOpen => panel.gameObject.activeSelf;
        /** P3 Esc 统一：打开序号（与界面层/另一抽屉比较，最后打开的先收）。 */
        public int OpenedAt { get; private set; }
        public void Create(IStationContext owner)
        {
            ctx=owner;transform.SetParent(ctx.UI.Root,false);var root=(RectTransform)transform;root.anchorMin=root.anchorMax=new Vector2(0,1);root.pivot=new Vector2(0,1);root.sizeDelta=new Vector2(1600,900);
            var ui=ctx.UI;panel=ui.Box(root,"Reading drawer",934,90,642,740,new Color(.02f,.035f,.053f,.97f));panel.GetComponent<UnityEngine.UI.Image>().raycastTarget=true;
            ui.Eyebrow(panel,"ANSWER ARCHIVE   /   完整答卷",22,17,480);
            title=ui.Label(panel,"完整答卷",22,44,460,42,28);
            ui.Button(panel,"关闭",532,31,88,Close);
            ui.Button(panel,"切到当前题",22,101,176,Current);
            ui.Label(panel,"已固定此题 · 比赛继续进行",214,108,405,30,16);
            ui.Box(panel,"Divider",22,158,598,1,new Color(.4f,.53f,.59f,.35f));
            content=ui.Scroll(panel,22,178,598,536);body=ui.Label(content,"",0,0,576,536,20);
            panel.gameObject.SetActive(false);ctx.Duel.RoundUpdated+=UpdatePinned;
        }
        public void Open(){panel.gameObject.SetActive(true);transform.SetAsLastSibling();OpenedAt=ctx.UI.NextSurfaceSeq();if(PinnedKey==null)Current();}
        public void Close(){panel.gameObject.SetActive(false);}
        public void Current()
        {
            PinnedKey=Key(ctx.Duel.Round);Render(ctx.Duel.Round);content.anchoredPosition=Vector2.zero;
        }
        string Key(CompetitionRound r)=>r==null?null:ctx.Duel.Snapshot?.id+"/"+ctx.Duel.DuelId+"/"+r.id;
        void UpdatePinned(CompetitionRound r){if(PinnedKey!=null && Key(r)==PinnedKey)Render(r);}
        void Render(CompetitionRound round)
        {
            title.text=round==null?"完整答卷":(round.overtime?"加赛":"常规")+" · 第 "+round.index+" 题";
            var text=new StringBuilder(round?.question?.task?.input ?? "尚未开始答题");
            foreach(var f in ctx.Stage.Fighters)
            {
                var live=round?.live?.FirstOrDefault(a=>a.modelId==f.State.Id);var rec=round?.records?.FirstOrDefault(a=>a!=null && a.model==f.State.Id);
                text.Append("\n\n—— ").Append(f.State.Name).Append(" ——\n回答\n").Append(live?.answer ?? rec?.answer ?? "等待作答…");
                text.Append("\n\n公开推理\n").Append(string.IsNullOrEmpty(live?.reasoning ?? rec?.reasoning)?"未提供公开推理":live?.reasoning ?? rec?.reasoning);
                if(!string.IsNullOrEmpty(live?.error ?? rec?.error))text.Append("\n异常：").Append(live?.error ?? rec?.error);
                else if(rec!=null)text.Append("\n得分：").Append((rec.score*100).ToString("0.#")).Append("%");
            }
            body.text=text.ToString();Resize();
        }
        public void Resize(){float h=Mathf.Max(536,body.GetPreferredValues(body.text,576,0).y+24);body.rectTransform.sizeDelta=new Vector2(576,h);content.sizeDelta=new Vector2(588,h);}
        void LateUpdate(){var image=panel.GetComponent<UnityEngine.UI.Image>();var c=image.color;c.a=ctx.Preferences.opacity;image.color=c;}
        void OnDestroy(){if(ctx!=null && ctx.Duel!=null)ctx.Duel.RoundUpdated-=UpdatePinned;}
    }
}
