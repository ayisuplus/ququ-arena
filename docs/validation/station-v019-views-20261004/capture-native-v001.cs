var scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene();
if(scene.name!="BlackHoleStationDistrictsV019"||scene.isDirty||UnityEditor.EditorApplication.isPlaying)throw new System.Exception("Saved v019 Edit required");
const string output="../docs/validation/station-v019-views-20261004/native-v001/";
if(System.IO.Directory.Exists(output))throw new System.Exception("Preserve existing capture");System.IO.Directory.CreateDirectory(output);
var sweep=Newtonsoft.Json.Linq.JObject.Parse(System.IO.File.ReadAllText("../docs/validation/station-v019-views-20261004/sweep-v001.json"));
var lots=Newtonsoft.Json.Linq.JObject.Parse(System.IO.File.ReadAllText("../production/black-hole-station/v019/district-lots.json"));
var rings=UnityEngine.Object.FindObjectsByType<QuQu.StationRotatingRing>(UnityEngine.FindObjectsSortMode.None).ToDictionary(r=>r.RingId);
var rotations=rings.ToDictionary(p=>p.Key,p=>p.Value.transform.localRotation);
var research=UnityEngine.GameObject.Find("V019 research court architecture");var researchActive=research.activeSelf;
var temporary=new System.Collections.Generic.List<UnityEngine.GameObject>();var records=new System.Collections.Generic.List<object>();
var player=UnityEngine.Object.FindFirstObjectByType<QuQu.StationGrayboxWalker>().View;
var white=UnityEditor.AssetDatabase.LoadAssetAtPath<UnityEngine.Material>("Assets/Station/Materials/DistrictsV019/Research porcelain.mat");
var cameraObject=new UnityEngine.GameObject("Temporary v019 phase camera"){hideFlags=UnityEngine.HideFlags.HideAndDontSave};
var cam=cameraObject.AddComponent<UnityEngine.Camera>();cam.CopyFrom(player);cam.enabled=false;
UnityEditor.EditorUtility.CopySerialized(player.GetComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>(),cameraObject.AddComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>());
cam.fieldOfView=65;cam.farClipPlane=1800;
float[] V(UnityEngine.Vector3 p)=>new[]{p.x,p.y,p.z};
void Capture(string id){
 var rt=new UnityEngine.RenderTexture(1600,1000,24);var prior=UnityEngine.RenderTexture.active;UnityEngine.Texture2D pixels=null;cam.targetTexture=rt;
 try{cam.Render();UnityEngine.RenderTexture.active=rt;pixels=new UnityEngine.Texture2D(1600,1000,UnityEngine.TextureFormat.RGB24,false);pixels.ReadPixels(new UnityEngine.Rect(0,0,1600,1000),0,0);pixels.Apply();System.IO.File.WriteAllBytes(output+id+".png",pixels.EncodeToPNG());}
 finally{cam.targetTexture=null;UnityEngine.RenderTexture.active=prior;rt.Release();UnityEngine.Object.DestroyImmediate(rt);if(pixels)UnityEngine.Object.DestroyImmediate(pixels);}
}
try{
 cam.transform.position=new UnityEngine.Vector3(0,3,0);cam.transform.rotation=UnityEngine.Quaternion.LookRotation(new UnityEngine.Vector3(1,.375f,0));var mask=cam.cullingMask;cam.cullingMask=0;Capture("sky-calibration");cam.cullingMask=mask;
 foreach(var lot in lots["lots"]){var frame=UnityEngine.GameObject.Find((string)lot["root"]).transform;
  foreach(var tier in lot["tiers"]){var v=tier.ToObject<float[]>();var g=UnityEngine.GameObject.CreatePrimitive(UnityEngine.PrimitiveType.Cube);g.name="Temporary v019 phase massing "+(string)lot["id"];g.hideFlags=UnityEngine.HideFlags.HideAndDontSave;temporary.Add(g);g.transform.SetParent(frame,false);g.transform.localPosition=new UnityEngine.Vector3((v[0]+v[1])/2,(v[2]+v[3])/2,(v[4]+v[5])/2);g.transform.localScale=new UnityEngine.Vector3(v[1]-v[0],v[3]-v[2],v[5]-v[4]);g.GetComponent<UnityEngine.Renderer>().sharedMaterial=white;UnityEngine.Object.DestroyImmediate(g.GetComponent<UnityEngine.Collider>());}
 }
 foreach(var record in sweep["records"]){var view=record["view"];var frame=UnityEngine.GameObject.Find((string)view["frame"]).transform;
  foreach(var worst in record["worst"].Where(w=>(int)w["blockedRays"]>0)){
   rings["v015-r2"].transform.localRotation=UnityEngine.Quaternion.Euler(0,(float)worst["r2"],0);rings["v015-r3"].transform.localRotation=UnityEngine.Quaternion.Euler(0,(float)worst["r3"],0);
   var a=view["eye"].ToObject<float[]>();var eye=frame.TransformPoint(new UnityEngine.Vector3(a[0],a[1],a[2]));var radial=new UnityEngine.Vector3(eye.x,0,eye.z).normalized;
   var target=(string)worst["target"]=="sky"?eye+new UnityEngine.Vector3(1,.375f,0).normalized*1000:radial*60+UnityEngine.Vector3.up*22;
   cam.transform.position=eye;cam.transform.LookAt(target);var id=(string)view["id"]+"-"+(string)worst["target"];
   foreach(var candidate in new[]{false,true}){research.SetActive(candidate);foreach(var g in temporary)g.SetActive(candidate);Capture(id+(candidate?"-candidate":"-baseline"));}
   records.Add(new{id,worst,eye=V(eye),target=V(target),fov=cam.fieldOfView});
  }
 }
}finally{research.SetActive(researchActive);foreach(var pair in rotations)rings[pair.Key].transform.localRotation=pair.Value;foreach(var g in temporary)if(g)UnityEngine.Object.DestroyImmediate(g);UnityEngine.Object.DestroyImmediate(cameraObject);}
var result=new{scene=scene.path,scene.isDirty,temporaryRemaining=temporary.Count(g=>g),records,skyDirection=new[]{1f,.375f,0f},width=1600,height=1000,urp=UnityEditor.EditorJsonUtility.ToJson(player.GetComponent<UnityEngine.Rendering.Universal.UniversalAdditionalCameraData>()),note="Baseline hides new research architecture and temporary lot solids; original material substitutions remain in both images. Candidate solid lots are not built architecture. Independent phase combinations, not a timed trajectory."};
System.IO.File.WriteAllText(output+"cameras.json",Newtonsoft.Json.JsonConvert.SerializeObject(result,Newtonsoft.Json.Formatting.Indented));return Newtonsoft.Json.JsonConvert.SerializeObject(new{pairs=records.Count,scene.isDirty,result.temporaryRemaining});
