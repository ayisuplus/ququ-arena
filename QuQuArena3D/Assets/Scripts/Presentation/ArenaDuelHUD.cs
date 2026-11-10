using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
namespace QuQu
{
    public class ArenaDuelHUD : MonoBehaviour
    {
        IHudContext ctx; // P3-D：HUD 只认界面命令 + 周边组件两个切片的并集，不认门面类型
        TMP_Text phase, prompt, notice;
        readonly TMP_Text[] names=new TMP_Text[2], hp=new TMP_Text[2], answers=new TMP_Text[2], damage=new TMP_Text[2];
        readonly RectTransform[] bars=new RectTransform[2], panels=new RectTransform[2];
        readonly float[] damageUntil=new float[2];
        readonly List<Image> backdrops=new List<Image>();
        CanvasGroup excerpts;
        RectTransform menu;
        float noticeUntil;
        TMP_Text fullscreen, pause, flight;
        public bool MenuOpen => menu && menu.gameObject.activeSelf;
        public float ExcerptAlpha => excerpts.alpha;
        // Explicitly opened drawers / menus are excluded from the permanent spectator HUD.
        public float PanelArea => (48000+19200+23840+33120+(excerpts.alpha>.01f?(ctx.Preferences.answersVisible?70400:0):0))/(1600f*900);
        public TMP_Text[] ExcerptLabels => new[]{answers[0],answers[1]};
        public void Create(IHudContext owner, Transform parent, bool big)
        {
            ctx=owner;transform.SetParent(parent,false);
            var root=(RectTransform)transform;root.anchorMin=root.anchorMax=new Vector2(0,1);root.pivot=new Vector2(0,1);root.sizeDelta=new Vector2(1600,900);
            var ui=ctx.UI;var bg=new Color(.018f,.032f,.049f,.76f);
            var phasePanel=ui.Box(root,"Phase",570,22,460,68,bg);
            var phaseCaption=ui.Eyebrow(phasePanel,"LIVE   /   MATCH STATUS",12,8,436);phaseCaption.alignment=TextAlignmentOptions.Center;
            phase=ui.Label(phasePanel,"等待开赛",12,29,436,32,19);phase.alignment=TextAlignmentOptions.Midline;OneLine(phase);
            var questionCard=ui.Box(root,"Current question",570,194,460,72,bg);
            prompt=ui.Label(questionCard,"",10,6,440,60,18);prompt.alignment=TextAlignmentOptions.TopLeft;TwoLines(prompt);
            var group=ui.Box(root,"Question and excerpts",0,0,1600,900);excerpts=group.gameObject.AddComponent<CanvasGroup>();excerpts.blocksRaycasts=false;
            for(int i=0;i<2;i++)
            {
                int slot=i;float x=i==0?28:1172;
                var head=ui.Box(root,"Health "+i,x,22,400,76,bg);
                ui.Eyebrow(head,i==0?"CONTENDER   /   01":"CONTENDER   /   02",12,6,268);
                names[i]=ui.Label(head,"",12,27,268,32,21);OneLine(names[i]);
                hp[i]=ui.Label(head,"100",292,29,96,30,18);hp[i].alignment=TextAlignmentOptions.TopRight;OneLine(hp[i]);
                ui.Box(head,"HP track",12,64,376,4,new Color(.13f,.17f,.2f));bars[i]=ui.Box(head,"HP",12,64,376,4,ui.Accent);
                head.GetComponent<Image>().raycastTarget=true;var select=head.gameObject.AddComponent<Button>();select.targetGraphic=head.GetComponent<Image>();
                select.onClick.AddListener(()=>{if(ctx.Stage.Fighters.Count==2){var f=ctx.Stage.Fighters[ctx.Preferences.mirrorPanels?1-slot:slot];ctx.SelectFighter(f.State.Id);ctx.FocusSelected();}});
                panels[i]=ui.Box(group,"Answer excerpt "+i,i==0?28:1172,740,400,88,bg);
                ui.Box(panels[i],"Accent",0,0,3,88,ui.Accent);
                answers[i]=ui.Label(panels[i],"等待模型返回…",14,5,372,78,20);TwoLines(answers[i]);
                damage[i]=ui.Label(root,"",i==0?410:1030,395,160,65,34);damage[i].alignment=TextAlignmentOptions.Center;
            }
            var toolbar=ui.Box(root,"Spectator tools",458,846,684,40);
            ui.Button(toolbar,"查看答卷",0,0,126,()=>ctx.Reader.Open());
            pause=ui.Button(toolbar,"暂停",132,0,82,()=>ctx.Link.Control(ctx.Duel.Snapshot?.status=="paused"?"resume":"pause")).GetComponentInChildren<TMP_Text>();
            ui.Button(toolbar,"全场",220,0,84,ctx.Stage.RestoreOverview);
            flight=ui.Button(toolbar,"自由镜头",310,0,102,ctx.ToggleFreeCamera).GetComponentInChildren<TMP_Text>();
            ui.Button(toolbar,"菜单",418,0,72,ToggleMenu);
            fullscreen=ui.Button(toolbar,"大屏",496,0,100,ctx.ToggleSpectator).GetComponentInChildren<TMP_Text>();
            ui.Button(toolbar,"解说",602,0,82,()=>{if(ctx.Commentary.IsOpen)ctx.Commentary.Close();else ctx.Commentary.Open();});
            menu=ui.Box(root,"Spectator menu",576,276,448,552,new Color(.018f,.032f,.049f,.97f));
            ui.Label(menu,"观战控制",18,12,370,32,22,ui.Accent);
            ui.Button(menu,"对阵 / 续赛",18,60,180,()=>Do(()=>ctx.Duel.ShowBracket()));
            ui.Button(menu,"开赛 / 回放",210,60,180,()=>Do(ctx.ShowLobby));
            ui.Button(menu,"形象 / 音乐 / 界面",18,110,372,()=>Do(()=>ctx.ShowSettings(0)));
            ui.Button(menu,"回答显示 / 隐藏",18,160,180,()=>{ctx.Preferences.answersVisible=!ctx.Preferences.answersVisible;ctx.Preferences.NotifyChanged();});
            ui.Button(menu,"左右交换",210,160,180,()=>{ctx.Preferences.mirrorPanels=!ctx.Preferences.mirrorPanels;ctx.Preferences.NotifyChanged();});
            ui.Button(menu,"裁判特写",18,210,180,()=>Do(()=>ctx.Stations.Visit(ArenaOrbitalNetwork.Place.Referee)));
            ui.Button(menu,"结束赛事",210,210,180,()=>ui.Confirm("终止赛事？","终止后不能续赛，也不会产生未决比赛的冠军。退出游戏请使用保存并退出。",()=>Do(()=>ctx.Link.Control("stop")),"终止赛事"));
            ui.Button(menu,"首页",18,260,180,()=>Do(ctx.ShowHome));
            ui.Button(menu,"关闭菜单",210,260,180,CloseMenu);
            ui.Button(menu,"自动环绕 开 / 关",18,310,180,()=>{if(ctx.Stage.Flight.Active)ctx.Stage.ResetCamera();ctx.Stage.Orbit=!ctx.Stage.Orbit;});
            ui.Button(menu,"隐藏界面 · H",210,310,180,()=>Do(()=>{if(!ctx.Stage.Flight.Active)ctx.ToggleFreeCamera();ctx.ToggleCameraHud();}));
            ui.Button(menu,"保存并退出",18,368,372,()=>Application.Quit());
            ui.Label(menu,"Esc 关闭菜单 · 比赛仍在运行\nF8 自由镜头 · R 恢复全场\nF10 大屏 · F11 全屏",18,436,412,95,17);
            menu.gameObject.SetActive(false);
            notice=ui.Label(root,"",450,793,700,40,18,ui.Accent);notice.alignment=TextAlignmentOptions.Center;OneLine(notice);
            foreach(var img in root.GetComponentsInChildren<Image>())
                if(img.name=="Phase" || img.name.StartsWith("Health ") || img.name=="Question excerpt")backdrops.Add(img);
            ctx.Duel.RoundHit+=Hit;
        }
        void Do(System.Action action){CloseMenu();ctx.Reader.Close();action();}
        public void CloseMenu(){if(menu)menu.gameObject.SetActive(false);}
        public void OpenMenu(){if(menu){ctx.Reader.Close();ctx.Commentary.Close();menu.gameObject.SetActive(true);menu.SetAsLastSibling();}}
        public void ToggleMenu(){if(MenuOpen)CloseMenu();else OpenMenu();}
        public void ShowNotice(string value){notice.text=value;noticeUntil=Time.unscaledTime+5;}
        static void OneLine(TMP_Text text){text.maxVisibleLines=1;text.textWrappingMode=TextWrappingModes.NoWrap;text.overflowMode=TextOverflowModes.Ellipsis;}
        static void TwoLines(TMP_Text text){text.maxVisibleLines=2;text.overflowMode=TextOverflowModes.Ellipsis;}
        void Hit(CompetitionRound round)
        {
            for(int i=0;i<2;i++)
            {
                int index=ctx.Preferences.mirrorPanels?1-i:i;float loss=(float)(round.before[index]-round.after[index]);
                damage[i].text=loss>0?"−"+loss.ToString("0.#"):"";damageUntil[i]=Time.unscaledTime+ArenaTuning.DamageFadeSeconds;
            }
        }
        void OnDestroy(){if(ctx!=null && ctx.Duel!=null)ctx.Duel.RoundHit-=Hit;}
        void LateUpdate()
        {
            if(ctx==null || ctx.Duel==null)return;var d=ctx.Duel;
            foreach(var img in backdrops){var c=img.color;c.a=ctx.Preferences.opacity*.82f;img.color=c;}
            bool reading=d.PresentedPhase=="solving" || d.PresentedPhase=="judging" || d.PresentedPhase=="ready" || d.PresentedPhase=="waiting";
            excerpts.alpha=Mathf.MoveTowards(excerpts.alpha,reading?1:0,Time.unscaledDeltaTime/ .18f);
            string label=d.PresentedPhase switch {"solving"=>"作答", "judging"=>"判分", "clash"=>"交锋", "result"=>"本题结果", "intermission"=>"场间休息", "completed"=>d.Phase, "waiting"=>d.Phase, _=>"等待开赛"};
            phase.text=(d.Round!=null && d.PresentedPhase!="completed"?(d.Round.overtime?"加赛 ":"第 ")+d.Round.index+" 题  ·  ":"")+label;
            prompt.text=d.Round!=null && d.PresentedPhase!="completed"?d.Round.question?.task?.input ?? "":"";
            for(int i=0;i<2;i++)
            {
                int index=ctx.Preferences.mirrorPanels?1-i:i;if(ctx.Stage.Fighters.Count<=index)continue;
                var f=ctx.Stage.Fighters[index];names[i].text=f.State.Name;names[i].color=f.Tint;hp[i].text=f.State.Health.ToString("0.#")+" HP";
                bars[i].GetComponent<Image>().color=f.Tint;bars[i].sizeDelta=new Vector2(376*Mathf.Clamp01(f.State.Health/100),4);
                panels[i].gameObject.SetActive(ctx.Preferences.answersVisible);var color=panels[i].GetComponent<Image>().color;color.a=ctx.Preferences.opacity*.82f;panels[i].GetComponent<Image>().color=color;
                panels[i].GetChild(0).GetComponent<Image>().color=f.Tint;
                answers[i].text=string.IsNullOrEmpty(f.State.Answer)?ArenaUI.StateName(f.State.Status)+"…":f.State.Answer;
                damage[i].color=new Color(f.Tint.r,f.Tint.g,f.Tint.b,Mathf.Clamp01((damageUntil[i]-Time.unscaledTime)*3));
            }
            pause.text=d.Snapshot?.status=="paused"?"继续":"暂停";fullscreen.text=ctx.IsSpectating?"窗口":"大屏";
            if(d.Snapshot?.status=="paused")phase.text=d.Snapshot.pauseState=="pausing"?"正在等待本题处理完成 · 已请求暂停":"比赛已暂停 · 点击继续";
            flight.text=ctx.Stage.Flight.Active?"退出飞行":"自由镜头";
            notice.gameObject.SetActive(Time.unscaledTime<noticeUntil && !d.Presenting);
        }
    }
}
