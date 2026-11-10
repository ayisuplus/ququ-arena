using TMPro;
using UnityEngine;
namespace QuQu
{
    public class ArenaDuelHUD : MonoBehaviour
    {
        ArenaGame game;
        TMP_Text phase, question;
        TMP_Text[] names = new TMP_Text[2], answers = new TMP_Text[2];
        RectTransform questionContent;
        RectTransform[] contents = new RectTransform[2], bars = new RectTransform[2], panels = new RectTransform[2];
        bool large;
        public void Create(ArenaGame g, Transform parent, bool big)
        {
            game = g; large = big; transform.SetParent(parent, false);
            var root = (RectTransform)transform; root.anchorMin = root.anchorMax = new Vector2(0,1); root.pivot = new Vector2(0,1); root.sizeDelta = new Vector2(1600,900);
            var ui = game.UI; var bg = new Color(.025f,.045f,.067f,.88f);
            var top = ui.Box(root,"Question",250,big?84:108,1100,146,bg);
            phase = ui.Label(top,"准备 · 1V1 对决",20,8,1060,32,18,ui.Accent);
            questionContent = ui.Scroll(top,20,46,1060,90); question = ui.Label(questionContent,"双方回答同一道题。判分齐全后统一交锋。",0,0,1037,90,21);
            for (int i=0;i<2;i++)
            {
                int slot=i; float x=i==0?30:825;
                var head=ui.Box(root,"Health "+i,x,big?247:265,745,64,bg);
                names[i]=ui.Label(head,"",16,3,713,36,21);
                ui.Button(root,"选中 / 特写",x,big?318:336,145,()=> { if(game.Stage.Fighters.Count==2) { var f=game.Stage.Fighters[game.Preferences.mirrorPanels?1-slot:slot]; game.SelectFighter(f.State.Id); game.FocusSelected(); } });
                bars[i]=ui.Box(head,"HP",16,47,713,7,ui.Accent);
                panels[i]=ui.Box(root,"Answer "+i,x,big?616:578,745,big?257:166,bg);
                contents[i]=ui.Scroll(panels[i],16,12,713,big?232:142); answers[i]=ui.Label(contents[i],"等待作答…",0,0,690,big?232:142,19);
            }
        }
        void LateUpdate()
        {
            if (!game || !game.Duel) return;
            var d=game.Duel;
            phase.text=d.Phase + "    ·    " + (d.Round == null ? "100 HP · 每次失分最多承受 20 点伤害" : (d.Round.overtime?"加赛":"常规")+" 第 "+d.Round.index+" 题") + (d.Replaying?"    /  存档回放":"");
            Sync(question,questionContent,d.Round?.question?.task?.input ?? "双方同时作答 · 判分齐全后统一交锋",1037,90);
            for(int i=0;i<2;i++)
            {
                int index=game.Preferences.mirrorPanels?1-i:i;
                if(game.Stage.Fighters.Count<=index) continue;
                var f=game.Stage.Fighters[index]; var s=f.State;
                names[i].text=s.Name+"    "+s.Health.ToString("0.#")+" / 100    · "+ArenaUI.StateName(s.Status);
                names[i].color=f.Tint; bars[i].GetComponent<UnityEngine.UI.Image>().color=f.Tint;
                bars[i].sizeDelta=new Vector2(713*Mathf.Clamp01(s.Health/100),7);
                panels[i].gameObject.SetActive(game.Preferences.answersVisible);
                var color=panels[i].GetComponent<UnityEngine.UI.Image>().color; color.a=game.Preferences.opacity; panels[i].GetComponent<UnityEngine.UI.Image>().color=color;
                string value=(game.ShowReasoning?s.Reasoning:s.Answer);
                Sync(answers[i],contents[i],s.Name+" · "+(game.ShowReasoning?"公开推理":"答卷")+"\n"+(string.IsNullOrEmpty(value)?"等待模型返回…":value)+(string.IsNullOrEmpty(s.Note)?"":"\n"+s.Note),690,large?232:142);
            }
        }
        static void Sync(TMP_Text label,RectTransform content,string value,float width,float min)
        {
            if(label.text==value) return; label.text=value;
            float height=Mathf.Max(min,label.GetPreferredValues(value,width,0).y+10);
            label.rectTransform.sizeDelta=new Vector2(width,height); content.sizeDelta=new Vector2(width+13,height);
        }
    }
}
