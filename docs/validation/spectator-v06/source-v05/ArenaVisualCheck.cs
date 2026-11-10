using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace QuQu
{
    public static class ArenaVisualCheck
    {
        [Serializable] public class Result
        {
            public bool passed, nativeFullscreen, windowRestored, preferencesPreserved, longText, rosterChanged, cameraFocused;
            public string error, graphics;
            public int width, height, msaa;
            public float eightFighterFps;
        }
        public static IEnumerator Run(ArenaGame game)
        {
            var args = Environment.GetCommandLineArgs(); int arg = Array.IndexOf(args,"--arena-qa-output");
            string dir = arg >= 0 && arg+1 < args.Length ? Path.GetFullPath(args[arg+1]) : Path.Combine(Application.persistentDataPath,"ValidationVisualV02");
            Directory.CreateDirectory(dir);
            var result = new Result { graphics = SystemInfo.graphicsDeviceName };
            var steps = Check(game,dir,result);
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
        static IEnumerator Check(ArenaGame game, string dir, Result result)
        {
            yield return new WaitForSecondsRealtime(1);
            game.Connection.Disconnect(); game.UI.CloseModal();
            game.Preferences.answersVisible = false; game.Preferences.mirrorPanels = true; game.Preferences.uiScale = 1.2f; game.ApplyPreferences();
            Screen.SetResolution(1920,1080,FullScreenMode.Windowed); yield return new WaitForSecondsRealtime(.5f);
            var roster = ArenaModelPresets.All.Select(p => new ModelInfo { id = "visual-qa/"+p.Id, name = p.Name }).ToArray();
            game.Accept(new Frame { type="start",roster=roster,total=6,title="大屏与清晰度验证 · 模拟事件" });
            game.Accept(new Frame { type="round",index=0,total=1,taskId="Q1",prompt="一个盒子里有 3 个红球和 2 个蓝球。不放回取两次，取到两个红球的概率是多少？" });
            game.Accept(new Frame { type="model",modelId=roster[0].id,taskId="Q1",seq=1,status="generating",answer="先计算第一次取出红球的概率 3/5，再计算第二次的条件概率 2/4。两者相乘，结果为 3/10。" });
            yield return new WaitForSecondsRealtime(.4f);
            int width = Screen.width, height = Screen.height;
            string prefs = JsonUtility.ToJson(game.Preferences);
            game.ToggleSpectator(); yield return new WaitForSecondsRealtime(1);
            result.width=Screen.width; result.height=Screen.height;
            var native=Screen.currentResolution;
            result.nativeFullscreen=Application.isEditor || (Screen.fullScreen && Screen.width==native.width && Screen.height==native.height);
            result.msaa=((UniversalRenderPipelineAsset)QualitySettings.renderPipeline).msaaSampleCount;
            Require(result.nativeFullscreen && !game.UI.Root.gameObject.activeSelf && game.IsSpectating,"Large screen did not occupy the native display");
            Require(result.msaa>=4,"MSAA not configured");
            ScreenCapture.CaptureScreenshot(Path.Combine(dir,"spectator-native.png")); yield return new WaitForSecondsRealtime(.3f);
            game.FocusSelected(); yield return new WaitForSecondsRealtime(.3f);
            result.cameraFocused=game.Stage.Focused && Vector3.Distance(game.Stage.View.transform.position,game.Stage.Focused.transform.position)<8;
            ScreenCapture.CaptureScreenshot(Path.Combine(dir,"character-closeup.png")); yield return new WaitForSecondsRealtime(.3f);
            foreach (var fighter in game.Stage.Fighters)
            {
                game.SelectFighter(fighter.State.Id); game.FocusSelected(); yield return new WaitForSecondsRealtime(.25f);
                ScreenCapture.CaptureScreenshot(Path.Combine(dir,"focus-"+fighter.Look.presetId+".png")); yield return new WaitForSecondsRealtime(.15f);
            }
            game.ToggleSpectator(); yield return new WaitForSecondsRealtime(.5f);
            result.windowRestored=Application.isEditor || (!Screen.fullScreen && Screen.width==width && Screen.height==height);
            result.preferencesPreserved=prefs==JsonUtility.ToJson(game.Preferences) && game.UI.Root.gameObject.activeSelf && !game.UI.Right.gameObject.activeSelf && game.UI.Left.anchoredPosition.x==1285;
            Require(result.windowRestored && result.preferencesPreserved,"Leaving spectator changed the window or customization");
            game.Preferences.answersVisible=true; game.Preferences.mirrorPanels=false; game.Preferences.uiScale=1; game.ApplyPreferences();
            ScreenCapture.CaptureScreenshot(Path.Combine(dir,"desk-1920.png")); yield return new WaitForSecondsRealtime(.3f);
            game.ToggleSpectator(); yield return new WaitForSecondsRealtime(.4f);
            var eight=Enumerable.Range(0,8).Select(i => new ModelInfo {id="visual-qa/"+ArenaModelPresets.All[i%6].Id+"/"+i,name=ArenaModelPresets.All[i%6].Name+" "+i}).ToArray();
            game.Accept(new Frame {type="start",roster=eight,total=8,title="八选手布局验证 · 模拟事件"});
            game.UI.SetQuestion(string.Join("\n",Enumerable.Repeat("长题目应可滚动查看，不能遮住赛场和操作按钮。",40)));
            yield return new WaitForSecondsRealtime(.5f);
            var labels=game.Spectator.GetComponentsInChildren<TMPro.TMP_Text>();
            result.longText=labels.Any(t=>t.text.Contains("长题目") && t.rectTransform.sizeDelta.y>500);
            result.rosterChanged=game.Spectator.transform.Find("Live contestants").childCount==8;
            Require(result.longText && result.rosterChanged && !game.Stage.Focused,"Roster or scroll layout failed");
            float start=Time.realtimeSinceStartup; int frames=0;
            while(Time.realtimeSinceStartup-start<3) { frames++; yield return null; }
            result.eightFighterFps=frames/(Time.realtimeSinceStartup-start);
            ScreenCapture.CaptureScreenshot(Path.Combine(dir,"eight-fighters.png")); yield return new WaitForSecondsRealtime(.3f);
            game.ToggleSpectator();
            Screen.SetResolution(1280,720,FullScreenMode.Windowed); game.Preferences.uiScale=1.2f; game.ApplyPreferences();
            yield return new WaitForSecondsRealtime(.5f);
            game.ShowSettings(0); yield return new WaitForSecondsRealtime(.5f);
            ScreenCapture.CaptureScreenshot(Path.Combine(dir,"customize-1280.png")); yield return new WaitForSecondsRealtime(.3f);
            Require(result.cameraFocused,"Selected fighter camera did not focus");
        }
        static void Require(bool value,string message) { if (!value) throw new Exception(message); }
    }
}
