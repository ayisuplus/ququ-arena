var scene=UnityEngine.SceneManagement.SceneManager.GetActiveScene();
if(scene.name!="BlackHoleStationDistrictsV019"||scene.isDirty||UnityEditor.EditorApplication.isPlaying)throw new System.Exception("Saved v019 Edit required");
const string output="../docs/validation/station-v019-retreat-20261004/lot-trials-v001.json";
if(System.IO.File.Exists(output))throw new System.Exception("Preserve trial evidence");System.IO.Directory.CreateDirectory(System.IO.Path.GetDirectoryName(output));
var root=UnityEngine.GameObject.Find("V019 research court architecture").transform;var original=root.localPosition;var ring=root.GetComponentInParent<QuQu.StationRotatingRing>();
var boxes=root.GetComponentsInChildren<UnityEngine.BoxCollider>();var results=new System.Collections.Generic.List<object>();
try{foreach(float z in new[]{0f,-8f,-12f,-16f,-20f,-24f,-28f}){
 root.localPosition=original+new UnityEngine.Vector3(0,0,z);UnityEngine.Physics.SyncTransforms();var hits=new System.Collections.Generic.List<object>();
 foreach(var box in boxes){var center=box.transform.TransformPoint(box.center);var half=UnityEngine.Vector3.Scale(box.size,box.transform.lossyScale)/2;
  foreach(var other in UnityEngine.Physics.OverlapBox(center,half,box.transform.rotation,~0,UnityEngine.QueryTriggerInteraction.Ignore)){
   if(other.transform.IsChildOf(root)||other.bounds.max.y<=.1f||other.GetComponentInParent<QuQu.StationGrayboxWalker>())continue;
   UnityEngine.Vector3 direction;float distance;
   if(UnityEngine.Physics.ComputePenetration(box,box.transform.position,box.transform.rotation,other,other.transform.position,other.transform.rotation,out direction,out distance)&&distance>.01f)hits.Add(new{part=box.name,other=other.name,distance});
  }
 }
 var radii=new System.Collections.Generic.List<float>();foreach(var box in boxes){var half=box.size/2;foreach(int x in new[]{-1,1})foreach(int zz in new[]{-1,1}){var p=ring.transform.InverseTransformPoint(box.transform.TransformPoint(box.center+new UnityEngine.Vector3(x*half.x,0,zz*half.z)));radii.Add(new UnityEngine.Vector2(p.x,p.z).magnitude);}}
 results.Add(new{offsetZ=z,hits,minRadius=radii.Min(),maxRadius=radii.Max(),promenadesClear=radii.Min()>100&&radii.Max()<168});
}}finally{root.localPosition=original;UnityEngine.Physics.SyncTransforms();}
System.IO.File.WriteAllText(output,Newtonsoft.Json.JsonConvert.SerializeObject(new{results,scene.isDirty},Newtonsoft.Json.Formatting.Indented));return Newtonsoft.Json.JsonConvert.SerializeObject(results.Select(r=>r));
