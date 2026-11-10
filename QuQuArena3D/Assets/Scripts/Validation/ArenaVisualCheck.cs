using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace QuQu
{
    [ArenaHarness("--arena-visual-validation", false)]
    public static class ArenaVisualCheck
    {
        [Serializable] public class Result
        {
            public bool passed, nativeFullscreen, windowRestored, preferencesPreserved, longText, rosterChanged, cameraFocused;
            public string error, graphics;
            public int width, height, msaa;
            public float eightFighterFps;
        }
        public static IEnumerator Run(IArenaTestShell shell)
        {
            var args = Environment.GetCommandLineArgs(); int arg = Array.IndexOf(args,"--arena-qa-output");
            string dir = arg >= 0 && arg+1 < args.Length ? Path.GetFullPath(args[arg+1]) : Path.Combine(Application.persistentDataPath,"ValidationVisualV02");
            Directory.CreateDirectory(dir);
            var result = new Result { graphics = SystemInfo.graphicsDeviceName };
            var steps = Check(shell,dir,result);
            while (true)
            {
                bool more; object next;
                try { more = steps.MoveNext(); next = more ? steps.Current : null; }
                catch (Exception e) { result.error = e.ToString(); Debug.LogException(e); break; }
                if (!more) { result.passed = true; break; }
                yield return next;
            }
            (steps as IDisposable)?.Dispose();
            File.WriteAllText(Path.Combine(dir,"runtime.json"),JsonUtility.ToJson(result,true));
            if (!Application.isEditor) Application.Quit(result.passed ? 0 : 1);
        }
        static IEnumerator Check(IArenaTestShell shell, string dir, Result result)
        {
            yield return new WaitForSecondsRealtime(1);
            shell.Link.Disconnect(); shell.UI.CloseModal();
            shell.Preferences.answersVisible = false; shell.Preferences.mirrorPanels = true; shell.Preferences.uiScale = 1.2f; shell.ApplyPreferences();
            Screen.SetResolution(1920,1080,FullScreenMode.Windowed); yield return new WaitForSecondsRealtime(.5f);
            var roster = ArenaModelPresets.All.Select(p => new ModelInfo { id = "visual-qa/"+p.Id, name = p.Name }).ToArray();
            shell.Accept(new Frame { type="start",roster=roster,total=6,title="大屏与清晰度验证 · 模拟事件" });
            shell.Accept(new Frame { type="round",index=0,total=1,taskId="Q1",prompt="一个盒子里有 3 个红球和 2 个蓝球。不放回取两次，取到两个红球的概率是多少？" });
            shell.Accept(new Frame { type="model",modelId=roster[0].id,taskId="Q1",seq=1,status="generating",answer="先计算第一次取出红球的概率 3/5，再计算第二次的条件概率 2/4。两者相乘，结果为 3/10。" });
            yield return new WaitForSecondsRealtime(.4f);
            int width = Screen.width, height = Screen.height;
            string prefs = JsonUtility.ToJson(shell.Preferences);
            shell.ToggleSpectator(); yield return new WaitForSecondsRealtime(1);
            result.width=Screen.width; result.height=Screen.height;
            var native=Screen.currentResolution;
            result.nativeFullscreen=Application.isEditor || (Screen.fullScreen && Screen.width==native.width && Screen.height==native.height);
            result.msaa=((UniversalRenderPipelineAsset)QualitySettings.renderPipeline).msaaSampleCount;
            // v05→v06 产品变更后原断言过期，此处对齐：v05 时代观战隐藏 HUD（ArenaGame.ToggleSpectator 曾 SetActive(!enter)）；
            // v06 起有意保留（ArenaGame.cs:174 SetActive(true)，ArenaSpectator.cs:4 注释明说 F10 换显示时 same HUD stays in place）。
            // 深入大屏语义由 ArenaSpectatorCheck 承担。
            Require(result.nativeFullscreen && shell.UI.Root.gameObject.activeSelf && shell.IsSpectating,"Large screen did not occupy the native display with HUD retained");
            Require(result.msaa>=4,"MSAA not configured");
            ScreenCapture.CaptureScreenshot(Path.Combine(dir,"spectator-native.png")); yield return new WaitForSecondsRealtime(.3f);
            shell.FocusSelected(); yield return new WaitForSecondsRealtime(.3f);
            result.cameraFocused=shell.Stage.Focused && Vector3.Distance(shell.Stage.View.transform.position,shell.Stage.Focused.transform.position)<8;
            ScreenCapture.CaptureScreenshot(Path.Combine(dir,"character-closeup.png")); yield return new WaitForSecondsRealtime(.3f);
            foreach (var fighter in shell.Stage.Fighters)
            {
                shell.SelectFighter(fighter.State.Id); shell.FocusSelected(); yield return new WaitForSecondsRealtime(.25f);
                ScreenCapture.CaptureScreenshot(Path.Combine(dir,"focus-"+fighter.Look.presetId+".png")); yield return new WaitForSecondsRealtime(.15f);
            }
            shell.ToggleSpectator(); yield return new WaitForSecondsRealtime(.5f);
            result.windowRestored=Application.isEditor || (!Screen.fullScreen && Screen.width==width && Screen.height==height);
            result.preferencesPreserved=prefs==JsonUtility.ToJson(shell.Preferences) && shell.UI.Root.gameObject.activeSelf && !shell.UI.Right.gameObject.activeSelf && shell.UI.Left.anchoredPosition.x==1285;
            Require(result.windowRestored && result.preferencesPreserved,"Leaving spectator changed the window or customization");
            shell.Preferences.answersVisible=true; shell.Preferences.mirrorPanels=false; shell.Preferences.uiScale=1; shell.ApplyPreferences();
            ScreenCapture.CaptureScreenshot(Path.Combine(dir,"desk-1920.png")); yield return new WaitForSecondsRealtime(.3f);
            shell.ToggleSpectator(); yield return new WaitForSecondsRealtime(.4f);
            var eight=Enumerable.Range(0,8).Select(i => new ModelInfo {id="visual-qa/"+ArenaModelPresets.All[i%6].Id+"/"+i,name=ArenaModelPresets.All[i%6].Name+" "+i}).ToArray();
            shell.Accept(new Frame {type="start",roster=eight,total=8,title="八选手布局验证 · 模拟事件"});
            shell.UI.SetQuestion(string.Join("\n",Enumerable.Repeat("长题目应可滚动查看，不能遮住赛场和操作按钮。",40)));
            yield return new WaitForSecondsRealtime(.5f);
            // v06 大屏观战共用同一套 HUD（ArenaSpectator 成空壳挂载点，ArenaBootstrap "Large screen HUD" 仅作开关，
            // ArenaSpectator.cs:4 注释 same HUD stays in place）——「Spectator 独立 HUD」时代的两处查找过期（同①族）：
            // 题目文本现挂 UI.Question（ArenaAnswerDesk.SetQuestion 按内容撑高 sizeDelta，长文可滚动断言语义原样保留）；
            // 选手列表现挂 UI.Left「Contestants」面板（ArenaRosterPanel P2 收口，每行 "Fighter "+id，8 人上屏语义不变）。
            var question=shell.UI.Question;
            result.longText=question.text.Contains("长题目") && question.rectTransform.sizeDelta.y>500;
            result.rosterChanged=shell.UI.Left.GetComponentsInChildren<RectTransform>(true).Count(r=>r.name.StartsWith("Fighter "))==8;
            Require(result.longText && result.rosterChanged && !shell.Stage.Focused,"Roster or scroll layout failed");
            float start=Time.realtimeSinceStartup; int frames=0;
            while(Time.realtimeSinceStartup-start<3) { frames++; yield return null; }
            result.eightFighterFps=frames/(Time.realtimeSinceStartup-start);
            ScreenCapture.CaptureScreenshot(Path.Combine(dir,"eight-fighters.png")); yield return new WaitForSecondsRealtime(.3f);
            shell.ToggleSpectator();
            Screen.SetResolution(1280,720,FullScreenMode.Windowed); shell.Preferences.uiScale=1.2f; shell.ApplyPreferences();
            yield return new WaitForSecondsRealtime(.5f);
            shell.ShowSettings(0); yield return new WaitForSecondsRealtime(.5f);
            ScreenCapture.CaptureScreenshot(Path.Combine(dir,"customize-1280.png")); yield return new WaitForSecondsRealtime(.3f);
            Require(result.cameraFocused,"Selected fighter camera did not focus");
        }
        static void Require(bool value,string message) { if (!value) throw new Exception(message); }
    }
}
