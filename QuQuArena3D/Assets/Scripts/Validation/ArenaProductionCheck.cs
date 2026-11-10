using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Opt-in Player verification; it does not save test preferences or use a real model.
    [ArenaHarness("--arena-art-validation", false)]
    public static class ArenaProductionCheck
    {
        [Serializable] public class RosterCheck { public int fighters, impacts, skinRenderers; public float fps; public bool pendingDidNotAttack, errorDidNotAttack, duplicateDidNotAttack, skeletonMoved; }
        [Serializable] public class Result { public bool passed, longText, preview, customGlb, cancelledImport; public string error, graphics, report, music; public int backendFrames, materialGrowthAfter20Rebuilds, emojiGlyphs; public List<string> importedAudio = new List<string>(); public List<RosterCheck> rosters = new List<RosterCheck>(); }
        public static IEnumerator Run(IArenaTestShell shell)
        {
            string dir = Path.Combine(Application.persistentDataPath,"ValidationProduction"); Directory.CreateDirectory(dir);
            var result = new Result { graphics = SystemInfo.graphicsDeviceName };
            var steps = Check(shell, dir, result);
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
        }
        static IEnumerator Check(IArenaTestShell shell, string dir, Result result)
        {
            yield return new WaitForSecondsRealtime(2);
            Require(shell.Link.BaseUrl.EndsWith(":8187"),"Validation must use the isolated backend on 8187");
            shell.Link.Disconnect(); shell.UI.CloseModal();
            var original = shell.Preferences;
            var profile = JsonUtility.FromJson<ArenaPreferences>(JsonUtility.ToJson(original));
            foreach (var look in profile.avatars) { look.style = 0; look.modelPath = look.facePath = look.presetId = ""; }
            shell.Preferences = profile;
            float oldMotion=shell.Stage.Motion; shell.Stage.Motion=1; shell.Media.LoadMusic("",null);
            int impacts = 0; Action<bool> impact = _ => impacts++; shell.Stage.OnImpact += impact;
            try
            {
                foreach (int count in new[] {2,4,8})
                {
                    var roster = Enumerable.Range(0,count).Select(i=>new ModelInfo {id="qa:"+i,name="验证拳手 "+(i+1)}).ToArray();
                    foreach (var model in roster) profile.Avatar(model.id,Array.IndexOf(roster,model)).style=0;
                    shell.Accept(new Frame {type="start",roster=roster,total=count,title="资产与表现验证（非比赛成绩）"});
                    yield return new WaitForSecondsRealtime(.2f);
                    var row = new RosterCheck {fighters=count}; result.rosters.Add(row);
                    row.skinRenderers=shell.Stage.Fighters.Sum(f=>f.GetComponentsInChildren<SkinnedMeshRenderer>().Length);
                    Require(row.skinRenderers==count,"All test fighters must have the authored skin");
                    var animator=shell.Stage.Fighters[0].GetComponentInChildren<Animator>();
                    foreach (var name in new[]{"Idle","Jab","Hit","Block","Victory","Defeat"}) Require(animator.HasState(0,Animator.StringToHash(name)),"Missing state "+name);
                    var arm=animator.GetComponentsInChildren<Transform>().First(t=>t.name=="LeftForeArm"); var before=arm.localRotation;
                    int beforeImpacts=impacts;
                    shell.Accept(new Frame{type="model",modelId=roster[0].id,taskId="qa",seq=1,status="generating"});
                    yield return new WaitForSecondsRealtime(.3f);
                    shell.Accept(new Frame{type="model",modelId=roster[0].id,taskId="qa",seq=2,status="judging",answer="Waiting for the judge"});
                    yield return new WaitForSecondsRealtime(.3f);
                    row.pendingDidNotAttack=impacts==beforeImpacts && !shell.Stage.Fighters[0].Busy;
                    shell.Accept(new Frame{type="model",modelId=roster[0].id,taskId="qa",seq=3,status="error",error="fixture"});
                    yield return new WaitForSecondsRealtime(.2f); row.errorDidNotAttack=impacts==beforeImpacts;
                    var answer=new Frame{type="model",modelId=roster[0].id,taskId="qa",seq=4,status="done",hasScore=true,score=.9f,answer="Validated answer"};
                    shell.Accept(answer); yield return new WaitForSecondsRealtime(.45f);
                    row.skeletonMoved=Quaternion.Angle(before,arm.localRotation)>1;
                    ScreenCapture.CaptureScreenshot(Path.Combine(dir,"combat-"+count+".png"));
                    float start=Time.realtimeSinceStartup; int frames=0;
                    while(Time.realtimeSinceStartup-start<2) {frames++; yield return null;}
                    row.fps=frames/(Time.realtimeSinceStartup-start);
                    float contactDeadline=Time.realtimeSinceStartup+12;
                    while(impacts==beforeImpacts && Time.realtimeSinceStartup<contactDeadline) yield return null;
                    row.impacts=impacts-beforeImpacts;
                    shell.Accept(answer); yield return new WaitForSecondsRealtime(.2f); row.duplicateDidNotAttack=impacts==beforeImpacts+1;
                    Require(row.pendingDidNotAttack && row.errorDidNotAttack && row.duplicateDidNotAttack && row.skeletonMoved && row.impacts==1,"Presentation boundary failed at "+count+" fighters");
                }
                int beforeMaterials=Resources.FindObjectsOfTypeAll<Material>().Length;
                var rebuilt=shell.Stage.Fighters[0];
                for(int i=0;i<20;i++) { rebuilt.ApplyLook(rebuilt.Look); yield return null; }
                yield return new WaitForSecondsRealtime(.2f);
                result.materialGrowthAfter20Rebuilds=Resources.FindObjectsOfTypeAll<Material>().Length-beforeMaterials;
                Require(result.materialGrowthAfter20Rebuilds<=2,"Changing appearance leaked materials");
                shell.AcceptedFrames=0; shell.Demo(); yield return new WaitForSecondsRealtime(5);
                ScreenCapture.CaptureScreenshot(Path.Combine(dir,"backend-live.png"));
                float deadline=Time.realtimeSinceStartup+90;
                while(!shell.Finished && Time.realtimeSinceStartup<deadline) yield return new WaitForSecondsRealtime(.25f);
                Require(shell.Finished && !string.IsNullOrEmpty(shell.ReportPath),"Backend match did not complete");
                result.backendFrames=shell.AcceptedFrames; result.report=shell.ReportPath;
                result.music=shell.Media.Music.clip ? shell.Media.Music.clip.name : "";
                Require(result.music=="MoonlitCafe","Generated soundtrack missing");
                yield return new WaitForSecondsRealtime(2);
                ScreenCapture.CaptureScreenshot(Path.Combine(dir,"backend-result.png"));
                yield return null;
                var emoji = Resources.Load<TMPro.TMP_FontAsset>("ArenaEmoji");
                result.emojiGlyphs = emoji.characterTable.Count;
                Require(new uint[]{0x1F399,0x2694,0x1F6E1,0x26A1}.All(c=>emoji.characterLookupTable.ContainsKey(c)),"Emoji fallback incomplete");
                profile.uiScale=1.2f;
                shell.UI.SetQuestion(string.Join("\n",Enumerable.Repeat("长题目验证：逐条阅读这些条件，再给出答案。🎙⚔🛡⚡",50)));
                shell.UI.Answer.text=string.Join("\n",Enumerable.Repeat("长回答验证：这段内容应完整保留，并可向下滚动。",100));
                shell.UI.Apply(profile);
                result.longText=shell.UI.Question.rectTransform.sizeDelta.y>1000 && shell.UI.Answer.rectTransform.sizeDelta.y>2000;
                Require(result.longText,"Long text scroll extent did not follow font size");
                Screen.SetResolution(1280,720,false); yield return new WaitForSecondsRealtime(.5f);
                ScreenCapture.CaptureScreenshot(Path.Combine(dir,"long-text-1280.png")); yield return null;
                shell.ShowSettings(0); yield return new WaitForSecondsRealtime(.5f);
                var preview=UnityEngine.Object.FindFirstObjectByType<ArenaAvatarPreview>();
                result.preview=preview && preview.GetComponent<UnityEngine.UI.RawImage>().texture;
                Require(result.preview,"Avatar preview missing");
                var title=shell.UI.Modal.GetComponentsInChildren<TMPro.TMP_Text>().First(t=>t.text.Contains("CUSTOMIZE"));
                Require(Mathf.Abs(title.fontSize-32.4f)<.01f,"New dialogs ignored saved font size");
                preview.OnDrag(new UnityEngine.EventSystems.PointerEventData(UnityEngine.EventSystems.EventSystem.current){delta=new Vector2(80,0)});
                yield return new WaitForSecondsRealtime(.3f);
                ScreenCapture.CaptureScreenshot(Path.Combine(dir,"customize-1280.png")); yield return null;
                var args=Environment.GetCommandLineArgs(); int avatarArg=Array.IndexOf(args,"--arena-validation-avatar");
                if(avatarArg>=0 && avatarArg+1<args.Length)
                {
                    var fighter=shell.Stage.Fighters[0];
                    var load=shell.Media.LoadAvatar(fighter,args[avatarArg+1],null);
                    while(!load.IsCompleted) yield return null;
                    Require(!load.IsFaulted && load.Result,"Custom GLB failed in Player");
                    result.customGlb=true; yield return new WaitForSecondsRealtime(.5f);
                    Screen.SetResolution(1920,1080,false); yield return new WaitForSecondsRealtime(.5f);
                    ScreenCapture.CaptureScreenshot(Path.Combine(dir,"custom-glb-1920.png")); yield return null;
                    shell.UI.CloseModal();
                    var replacement=shell.Media.LoadAvatar(fighter,args[avatarArg+1],null);
                    while(!replacement.IsCompleted) yield return null;
                    Require(!replacement.IsFaulted && replacement.Result,"Replacing an imported avatar failed");
                    yield return null;
                    Require(fighter.BodyRoot.Cast<Transform>().Count(t=>t.name=="Imported avatar")==1,"Replacing avatars retained the previous imported object");
                    var cancelled=shell.Media.LoadAvatar(fighter,args[avatarArg+1],null);
                    shell.Media.ReleaseAvatar(fighter); fighter.ApplyLook(fighter.Look);
                    while(!cancelled.IsCompleted) yield return null;
                    result.cancelledImport=!cancelled.IsFaulted && !cancelled.Result && fighter.BodyRoot.gameObject.activeSelf;
                    Require(result.cancelledImport,"Late avatar load replaced the current appearance");
                }
                int mediaArg=Array.IndexOf(args,"--arena-validation-media");
                if(mediaArg>=0 && mediaArg+1<args.Length)
                    foreach(string extension in new[]{"wav","mp3","ogg"})
                    {
                        string message=null;
                        shell.Media.LoadMusic(Path.Combine(args[mediaArg+1],"test."+extension),m=>message=m);
                        float until=Time.realtimeSinceStartup+15;
                        while(message==null && Time.realtimeSinceStartup<until) yield return null;
                        Require(message=="音乐已载入" && shell.Media.Music.clip.length>1,"Audio import failed: "+extension);
                        result.importedAudio.Add(extension);
                    }
                shell.UI.CloseModal(); shell.UI.Apply(original); Screen.SetResolution(1600,900,false);
            }
            finally {shell.UI.CloseModal(); shell.Preferences=original; shell.Stage.Motion=oldMotion; shell.Stage.OnImpact-=impact; shell.Media.LoadMusic(original.musicPath,null);}
        }
        static void Require(bool condition,string message) {if(!condition)throw new Exception(message);}
    }
}
