using System;
using System.Collections;
using System.IO;
using UnityEngine;

namespace QuQu
{
    // Opt-in rendered acceptance evidence, invoked by ArenaGalaxyCheck only.
    public static class ArenaSingularityCapture
    {
        public static IEnumerator Run(IArenaShell shell, string dir)
        {
            Directory.CreateDirectory(dir);
            var stage=shell.Stage;stage.ResetCamera();
            yield return new WaitForSecondsRealtime(.5f);
            yield return new WaitForEndOfFrame();ArenaSpectatorCapture.Save(Path.Combine(dir,"default.png"));
            var camera=stage.View.transform;
            var initialPosition=camera.position;var initialRotation=camera.rotation;
            stage.Flight.SetActive(true);stage.Flight.enabled=false;
            var video=shell.AddComponent<ArenaVideoCapture>();
            shell.Run(video.Capture(Path.Combine(dir,"orbit-video")));
            // Translation at the original orientation exposes finite-distance parallax.
            camera.position=initialPosition+Vector3.right*9;
            yield return new WaitForSecondsRealtime(.5f);yield return new WaitForEndOfFrame();
            ArenaSpectatorCapture.Save(Path.Combine(dir,"translated.png"));
            var start=camera.position;
            for(float t=0;t<16;t+=Time.unscaledDeltaTime)
            {
                float phase=Mathf.SmoothStep(0,1,t/16);
                float angle=Mathf.Sin(phase*Mathf.PI*2)*13;
                var destination=new Vector3(angle,14,-58);
                camera.position=Vector3.Lerp(start,destination,Mathf.SmoothStep(0,1,t/4));
                camera.rotation=Quaternion.Slerp(initialRotation,Quaternion.LookRotation(new Vector3(0,-26,95)-camera.position),Mathf.SmoothStep(0,1,t/4));
                yield return null;
            }
            camera.position=new Vector3(0,14,-58);camera.LookAt(new Vector3(0,-26,95));
            yield return new WaitForSecondsRealtime(.8f);yield return new WaitForEndOfFrame();
            ArenaSpectatorCapture.Save(Path.Combine(dir,"observatory-above-disk.png"));
            video.Recording=false;
            while(!video.Finished)yield return null;
            if(!string.IsNullOrEmpty(video.Error))throw new Exception(video.Error);
            stage.Flight.enabled=true;stage.ResetCamera();
        }
    }
}
