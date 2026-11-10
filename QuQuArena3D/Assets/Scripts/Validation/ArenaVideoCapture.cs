using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Experimental.Rendering;
namespace QuQu
{
    // QA only: read the game's final framebuffer, never the desktop or other windows.
    public class ArenaVideoCapture : MonoBehaviour
    {
        [Serializable] public class Timing { public int width,height,frames;public double duration;public List<double> times=new List<double>(); }
        public bool Recording, Finished;
        public string Error;
        public Timing timing=new Timing();
        public IEnumerator Capture(string dir)
        {
            Directory.CreateDirectory(Path.Combine(dir,"frames"));timing.width=Screen.width;timing.height=Screen.height;
            var textures=new RenderTexture[3];var busy=new bool[3];var writes=new List<Task>();
            int visibleFrames=0;
            for(int i=0;i<3;i++){textures[i]=new RenderTexture(timing.width,timing.height,0,RenderTextureFormat.ARGB32);textures[i].Create();}
            double start=Time.realtimeSinceStartupAsDouble,next=start;Recording=true;
            while(Recording)
            {
                yield return new WaitForEndOfFrame();double now=Time.realtimeSinceStartupAsDouble;if(now<next)continue;
                int slot=Array.FindIndex(busy,b=>!b);if(slot<0)continue;
                int frame=timing.times.Count;timing.times.Add(now-start);next=start+timing.times.Count/30.0;busy[slot]=true;
                ScreenCapture.CaptureScreenshotIntoRenderTexture(textures[slot]);
                AsyncGPUReadback.Request(textures[slot],0,TextureFormat.RGBA32,request=>
                {
                    busy[slot]=false;if(request.hasError){Error="GPU capture failed";return;}
                    var data=request.GetData<byte>().ToArray();string file=Path.Combine(dir,"frames",frame.ToString("D5")+".jpg");
                    for(int pixel=0;pixel+2<data.Length;pixel+=4096)
                        if(data[pixel]+data[pixel+1]+data[pixel+2]>60){System.Threading.Interlocked.Increment(ref visibleFrames);break;}
                    writes.Add(Task.Run(()=>
                    {
                        var upright=new byte[data.Length];int rowBytes=timing.width*4;
                        for(int row=0;row<timing.height;row++)Buffer.BlockCopy(data,row*rowBytes,upright,(timing.height-1-row)*rowBytes,rowBytes);
                        File.WriteAllBytes(file,ImageConversion.EncodeArrayToJPG(upright,GraphicsFormat.R8G8B8A8_UNorm,(uint)timing.width,(uint)timing.height,0,92));
                    }));
                });
            }
            timing.duration=Time.realtimeSinceStartupAsDouble-start;AsyncGPUReadback.WaitAllRequests();
            while(writes.Any(w=>!w.IsCompleted))yield return null;
            foreach(var job in writes)if(job.IsFaulted)Error=job.Exception.ToString();
            if(visibleFrames==0)Error="Captured only black frames";
            foreach(var texture in textures){texture.Release();Destroy(texture);}
            timing.frames=timing.times.Count;File.WriteAllText(Path.Combine(dir,"frames.json"),JsonUtility.ToJson(timing,true));Finished=true;
        }
    }
}
