using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // Explicit local rendering regression; never loads personal settings or calls a model.
    [ArenaHarness("--arena-hair-validation", false)]
    public static class ArenaHairCheck
    {
        [Serializable] class Mask { public int vertexCount, fixedVertexCount; public int[] coreIndices, originalCoreIndices; }
        [Serializable] class Result { public bool passed, expectFixed; public int casts, hits, samples; public float maximumHairDrift; public string error; }
        public static IEnumerator Run(ArenaGame g, string output = null, bool requireFixed = true)
        {
            var args=Environment.GetCommandLineArgs();int at=Array.IndexOf(args,"--arena-qa-output");
            string dir=output ?? (at>=0?args[at+1]:"E:/projects/AI斗兽场/docs/validation/claude-hair-v06b/player");
            Directory.CreateDirectory(dir);var result=new Result {expectFixed=requireFixed};var steps=Check(g,dir,result);
            Application.LogCallback log=(message,stack,type)=>{if(type==LogType.Error||type==LogType.Exception||type==LogType.Assert)result.error=message;};
            Application.logMessageReceived+=log;
            while(true)
            {
                bool more;object next;
                try {more=steps.MoveNext();next=more?steps.Current:null;}
                catch(Exception e){result.error=e.ToString();break;}
                if(!more)break;yield return next;
            }
            Application.logMessageReceived-=log;
            result.passed=string.IsNullOrEmpty(result.error)&&result.casts==3&&result.hits==3&&(!requireFixed||result.maximumHairDrift<.002f);
            File.WriteAllText(Path.Combine(dir,"runtime.json"),JsonUtility.ToJson(result,true));
            if(!Application.isEditor)Application.Quit(result.passed?0:1);
        }
        static IEnumerator Check(ArenaGame g,string dir,Result r)
        {
            g.Connection.Disconnect();g.UI.CloseModal();Screen.SetResolution(1920,1080,FullScreenMode.Windowed);
            var packet=ArenaSpectatorCapture.Packet();var ids=packet.snapshot.duels[0].players;
            g.Preferences.Avatar(ids[0],0).presetId="chatgpt";g.Preferences.Avatar(ids[1],1).presetId="claude";
            ArenaSpectatorCapture.Feed(g,packet,6);yield return new WaitForSecondsRealtime(1);
            var f=g.Stage.Fighters.Single(x=>x.Look.presetId=="claude");var target=g.Stage.Fighters.First(x=>x!=f);
            g.UI.Root.gameObject.SetActive(false);
            g.Stage.Focus(f);typeof(ArenaStage).GetField("yaw",System.Reflection.BindingFlags.NonPublic|System.Reflection.BindingFlags.Instance).SetValue(g.Stage,0f);
            g.Stage.View.fieldOfView=27;yield return new WaitForSecondsRealtime(.2f);
            var skin=f.GetComponentInChildren<SkinnedMeshRenderer>();var head=skin.bones.Single(b=>b.name=="Head");
#if UNITY_EDITOR
            if(!r.expectFixed)
            {
                skin.sharedMesh=UnityEditor.AssetDatabase.LoadAssetAtPath<GameObject>("Assets/Art/ModelPresets/claude/claude-v02.fbx").GetComponentInChildren<SkinnedMeshRenderer>().sharedMesh;
                f.GetComponentInChildren<ArenaDivinePose>().Initialize(f,f.GetComponentInChildren<Animator>());
            }
#endif
            var mask=JsonUtility.FromJson<Mask>(File.ReadAllText("E:/projects/AI斗兽场/docs/validation/claude-hair-v06b/weight-mask.json"));
            if(skin.sharedMesh.vertexCount!=mask.vertexCount&&skin.sharedMesh.vertexCount!=mask.fixedVertexCount)throw new Exception("Hair test mesh topology changed");
            var indices=skin.sharedMesh.vertexCount==mask.vertexCount?mask.originalCoreIndices:mask.coreIndices;
            var baked=new Mesh();skin.BakeMesh(baked);var baseline=baked.vertices.Select(v=>head.InverseTransformPoint(skin.transform.TransformPoint(v))).ToArray();
            Action sample=()=>{
                skin.BakeMesh(baked);var current=baked.vertices;
                foreach(int i in indices)r.maximumHairDrift=Mathf.Max(r.maximumHairDrift,Vector3.Distance(baseline[i],head.InverseTransformPoint(skin.transform.TransformPoint(current[i]))));
                r.samples++;
            };
            yield return new WaitForEndOfFrame();sample();ArenaSpectatorCapture.Save(Path.Combine(dir,"idle.png"));
            for(int variant=0;variant<3;variant++)
            {
                f.Strike(target,1,1,(p,c,b)=>r.hits++);r.casts++;float begin=Time.time;bool charge=false,release=false;
                while(f.Busy)
                {
                    yield return new WaitForEndOfFrame();sample();float elapsed=Time.time-begin;
                    if(!charge&&elapsed>=.95f){charge=true;ArenaSpectatorCapture.Save(Path.Combine(dir,"cast-"+variant+"-charge.png"));}
                    if(!release&&elapsed>=1.4f){release=true;ArenaSpectatorCapture.Save(Path.Combine(dir,"cast-"+variant+"-release.png"));}
                    if(elapsed>5)throw new Exception("Cast failed to settle");
                }
                yield return new WaitForSecondsRealtime(.2f);
            }
            target.Strike(f,1,1,(p,c,b)=>{});yield return new WaitForSecondsRealtime(1.6f);
            yield return new WaitForEndOfFrame();sample();ArenaSpectatorCapture.Save(Path.Combine(dir,"hit.png"));
            while(target.Busy)yield return null;
            f.Celebrating=true;yield return new WaitForSecondsRealtime(.25f);yield return new WaitForEndOfFrame();sample();ArenaSpectatorCapture.Save(Path.Combine(dir,"victory.png"));
            f.Celebrating=false;f.Defeated=true;yield return new WaitForSecondsRealtime(.25f);yield return new WaitForEndOfFrame();sample();ArenaSpectatorCapture.Save(Path.Combine(dir,"defeat.png"));
            f.Defeated=false;f.Motion=0;yield return new WaitForEndOfFrame();sample();ArenaSpectatorCapture.Save(Path.Combine(dir,"motion-off.png"));
            UnityEngine.Object.Destroy(baked);
        }
    }
}
