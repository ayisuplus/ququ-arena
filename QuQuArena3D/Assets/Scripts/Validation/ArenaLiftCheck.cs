using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace QuQu
{
    [ArenaHarness("--arena-lift-validation", true)]
    public static class ArenaLiftCheck
    {
        static void Require(bool ok,string why){if(!ok)throw new Exception(why);}
        static IEnumerator Until(Func<bool> done){float end=Time.unscaledTime+90;while(!done()){Require(Time.unscaledTime<end,"Timed out");yield return null;}}
        static IEnumerator Photo(string dir,string name){yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,name+".png"));}
        static IEnumerator Visit(ArenaGame g,ArenaOrbitalNetwork.Place place,bool skip=true)
        {g.Stations.Visit(place);if(skip)g.Stations.Skip();yield return Until(()=>!g.Stations.Moving);yield return new WaitForSecondsRealtime(.3f);}
        public static IEnumerator Run(ArenaGame g)
        {
            foreach(var device in UnityEngine.InputSystem.InputSystem.devices)UnityEngine.InputSystem.InputSystem.DisableDevice(device);
            var args=Environment.GetCommandLineArgs();string dir=args[Array.IndexOf(args,"--arena-qa-output")+1];Directory.CreateDirectory(dir);
            var report=new JObject{["evidence"]="Actual Windows framebuffer, isolated backend, saved mock duel replay; no model calls",["gpu"]=SystemInfo.graphicsDeviceName};
            var errors=new List<string>();Application.LogCallback log=(m,t,k)=>{if(k==LogType.Error || k==LogType.Exception)errors.Add(m);};Application.logMessageReceived+=log;
            var stack=new Stack<IEnumerator>();stack.Push(Check(g,dir,report));
            while(stack.Count>0)
            {
                bool more;object item=null;
                try{more=stack.Peek().MoveNext();if(more)item=stack.Peek().Current;}catch(Exception e){report["error"]=e.ToString();break;}
                if(!more){(stack.Pop() as IDisposable)?.Dispose();continue;}if(item is IEnumerator child)stack.Push(child);else yield return item;
            }
            while(stack.Count>0)(stack.Pop() as IDisposable)?.Dispose();
            foreach(var video in g.GetComponents<ArenaVideoCapture>())video.Recording=false;
            Application.logMessageReceived-=log;report["runtimeErrors"]=JArray.FromObject(errors);report["backendPid"]=g.Desktop.ProcessId;
            report["passed"]=report["error"]==null && errors.Count==0;File.WriteAllText(Path.Combine(dir,"lift.json"),report.ToString());
            g.UI.ClearGuard();g.ShowHome();Application.Quit((bool)report["passed"]?0:1);
        }
        static IEnumerator Check(ArenaGame g,string dir,JObject report)
        {
            yield return Until(()=>g.Desktop.Ready && !g.Desktop.Starting);g.Connection.Disconnect();g.UI.CloseModal();g.Stage.ResetCamera();
            var transport=g.Stations.Transport;var lift=transport.SkyLift;var departure=g.Stage.CaptureView();
            var observer=g.gameObject.AddComponent<ArenaLiftObserver>();observer.View=g.Stage.View;observer.enabled=false;
            var video=g.gameObject.AddComponent<ArenaVideoCapture>();g.StartCoroutine(video.Capture(Path.Combine(dir,"lift-video")));
            var trips=new JArray();int movingFrames=0;
            foreach(bool external in new[]{false,true})
            {
                observer.enabled=external;
                foreach(var place in new[]{ArenaOrbitalNetwork.Place.Commentary,ArenaOrbitalNetwork.Place.Arena})
                {
                    float start=Time.unscaledTime,last=lift.Height;bool up=place==ArenaOrbitalNetwork.Place.Commentary;int seen=0;
                    g.Stations.Visit(place);
                    while(g.Stations.Moving)
                    {
                        Require(!transport.CapsuleVisible,"Auxiliary capsule appeared on the commentary lift route");
                        if(lift.Height>.1f && lift.Height<13.9f)
                        {
                            Require(lift.Riding && !transport.CapsuleVisible,"Second capsule appeared on the moving deck");
                            Require(lift.GateOpening<.01f && !lift.LandingOpen(false) && !lift.LandingOpen(true),"Gate open during ascent/descent");
                            Require(up?lift.Height>=last-.001f:lift.Height<=last+.001f,"Platform reversed during a one-way trip");
                            if(!external)Require(Mathf.Abs(g.Stage.View.transform.position.y-lift.Height-1.62f)<.02f,"Camera detached from platform");
                            seen++;movingFrames++;
                        }
                        last=lift.Height;yield return null;
                    }
                    Require(seen>50,"Lift travel did not animate");
                    Require(Mathf.Abs(lift.Height-(up?14:0))<.001f && lift.LandingOpen(up) && !lift.LandingOpen(!up),"Wrong floor or landing gate after arrival");
                    Require(!transport.CabinActive && !lift.Riding,"Transport stayed active after arrival");
                    trips.Add(new JObject{["to"]=place.ToString(),["exterior"]=external,["seconds"]=Time.unscaledTime-start,["movingFrames"]=seen});
                    yield return new WaitForSecondsRealtime(.4f);
                    if(external)yield return Photo(dir,up?"platform-upper":"platform-lower");
                    if(!external && !up)Require(Vector3.Distance(departure.position,g.Stage.View.transform.position)<.03f && Quaternion.Angle(departure.rotation,g.Stage.View.transform.rotation)<.1f,"Return changed arena camera");
                }
            }
            observer.enabled=false;video.Recording=false;yield return Until(()=>video.Finished);Require(video.Error==null,video.Error);
            g.Stage.ResetCamera();report["trips"]=trips;report["movingFrames"]=movingFrames;
            g.Stations.Visit(ArenaOrbitalNetwork.Place.Commentary);yield return Until(()=>lift.Height>3 && lift.Height<11);g.Escape();yield return Until(()=>!g.Stations.Moving);
            Require(lift.LandingOpen(true) && !transport.CabinActive,"Esc skip left deck midshaft");
            g.Stations.Visit(ArenaOrbitalNetwork.Place.Arena);yield return Until(()=>lift.Height>3 && lift.Height<11);g.Stations.Visit(ArenaOrbitalNetwork.Place.Arena);yield return Until(()=>!g.Stations.Moving);
            Require(lift.LandingOpen(false),"Second click did not park at destination");
            g.Stations.Visit(ArenaOrbitalNetwork.Place.Commentary);yield return Until(()=>lift.Height>3 && lift.Height<11);g.ShowHome();yield return new WaitForSecondsRealtime(.4f);
            Require(!g.Stations.Moving && !lift.Riding && (lift.LandingOpen(false)||lift.LandingOpen(true)),"Home left a moving platform suspended");
            g.UI.CloseModal();g.Preferences.motion=0;g.ApplyPreferences();float cut=Time.unscaledTime;yield return Visit(g,ArenaOrbitalNetwork.Place.Commentary,false);
            Require(Time.unscaledTime-cut<1.2f && lift.LandingOpen(true),"Motion off still rode the shaft");
            yield return Visit(g,ArenaOrbitalNetwork.Place.Arena);g.Preferences.motion=1;g.ApplyPreferences();
            foreach(var place in new[]{ArenaOrbitalNetwork.Place.Lab,ArenaOrbitalNetwork.Place.Referee,ArenaOrbitalNetwork.Place.Gallery,ArenaOrbitalNetwork.Place.Commentary,ArenaOrbitalNetwork.Place.Arena})
                yield return Visit(g,place,false);
            report["skipClickEscHomeStaticCrossStation"]=true;
            // A real presentation queue keeps advancing during the elevator journey.
            var packet=ArenaSpectatorCapture.Packet();ArenaSpectatorCapture.Feed(g,packet,6);yield return Until(()=>g.Duel.Idle);
            ArenaSpectatorCapture.Feed(g,packet,packet.seq);yield return Visit(g,ArenaOrbitalNetwork.Place.Commentary,false);
            yield return Until(()=>g.Duel.Idle && g.Finished);int hits=g.Duel.AppliedHits;Require(hits>0,"Duel did not progress during travel");
            g.Duel.Receive(packet,false);g.Duel.Receive(packet,true);yield return new WaitForSecondsRealtime(.4f);Require(g.Duel.AppliedHits==hits,"Travel caused duplicate settlement");
            report["duelReplayHits"]=hits;
            var performance=new JArray();
            foreach(int width in new[]{1920,2560,3840})
            {
                Screen.SetResolution(width,width*9/16,FullScreenMode.FullScreenWindow);yield return new WaitForSecondsRealtime(1);Require(Screen.width==width,"Resolution mismatch");
                observer.enabled=true;yield return new WaitForSecondsRealtime(.3f);yield return Photo(dir,"shaft-"+width);
                yield return new WaitForSecondsRealtime(.3f);var samples=new List<float>();float end=Time.unscaledTime+2;
                while(Time.unscaledTime<end){yield return null;samples.Add(Time.unscaledDeltaTime*1000);}
                samples.Sort();performance.Add(new JObject{["width"]=width,["fps"]=1000/samples.Average(),["p95ms"]=samples[(int)(samples.Count*.95f)]});
                observer.enabled=false;g.ShowHome();yield return new WaitForSecondsRealtime(.4f);yield return Photo(dir,"home-"+width);
                g.UI.CloseModal();g.Stage.ResetCamera();yield return new WaitForSecondsRealtime(.3f);yield return Photo(dir,"arena-"+width);
                yield return Visit(g,ArenaOrbitalNetwork.Place.Commentary);yield return Photo(dir,"commentary-"+width);
            }
            report["performance"]=performance;UnityEngine.Object.Destroy(observer);
        }
    }
    // Only instantiated by the explicit validation mode, to film the actual mechanism externally.
    public sealed class ArenaLiftObserver : MonoBehaviour
    {
        public Camera View;
        void LateUpdate(){View.transform.position=new Vector3(23,22,42);View.transform.LookAt(new Vector3(0,8,19));View.fieldOfView=40;}
    }
}
