using System.Linq;
using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Threading.Tasks;
using UnityEngine;
using UnityEngine.Networking;

namespace QuQu
{
    public class ArenaMedia : MonoBehaviour
    {
        public AudioSource Music, Effects;
        AudioSource ambience; // 观众氛围底噪专用循环声轨（跟随音效音量）
        AudioClip builtIn, punch, block, victory, chime, buzz, tick, crowd;
        bool generatedMusic;
        int musicRevision;
        readonly Dictionary<ArenaFighter, int> avatarRevisions = new Dictionary<ArenaFighter, int>();
        readonly Dictionary<ArenaFighter, GLTFast.GltfImport> imports = new Dictionary<ArenaFighter, GLTFast.GltfImport>();
        public void Initialize()
        {
            Music = gameObject.AddComponent<AudioSource>(); Music.loop = true;
            Effects = gameObject.AddComponent<AudioSource>();
            const int rate = 22050; var data = new float[rate * 8];
            int[] notes = { 0, 7, 12, 7, 3, 10, 15, 10 };
            for (int i = 0; i < data.Length; i++)
            {
                double t = (double)i / rate, beat = t % .5, freq = 110 * Math.Pow(2, notes[(int)(t * 2) % notes.Length] / 12.0);
                data[i] = (float)(Math.Sin(t * freq * Math.PI * 2) * Math.Exp(-beat * 9) * .22 + Math.Sin(2 * Math.PI * (48 * beat + 6 * (1 - Math.Exp(-beat * 35)))) * Math.Exp(-beat * 20) * .28);
            }
            builtIn = AudioClip.Create("QuQu original synth loop", data.Length, 1, rate, false); builtIn.SetData(data, 0);
            var hit = new float[rate / 9]; var noise=new System.Random(23);float previous=0;
            for (int i = 0; i < hit.Length; i++)
            {
                float t=(float)i/rate,n=(float)noise.NextDouble()*2-1;
                hit[i]=((n-previous)*.28f*Mathf.Exp(-t*90)+Mathf.Sin(t*155*Mathf.PI*2)*.3f*Mathf.Exp(-t*48))*Mathf.Min(1,t*3500);previous=n;
            }
            punch = AudioClip.Create("QuQu palm slap", hit.Length, 1, rate, false); punch.SetData(hit, 0);
            block = Tone("QuQu shield", .18f, t => (Mathf.Sin(t*2*Mathf.PI*940) + Mathf.Sin(t*2*Mathf.PI*1420)*.4f)*Mathf.Exp(-t*30)*.23f);
            victory = Tone("QuQu victory", 1.1f, t => { float note = t < .18f ? 523.25f : t < .36f ? 659.25f : 783.99f; return Mathf.Sin(t*2*Mathf.PI*note)*Mathf.Exp(-(t%.18f)*9)*Mathf.Min(1,(1.1f-t)*3)*.18f; });
            // 答题判定音：对＝上行双音（呼应胜利主题），错＝下行低鸣；UI 点击＝极短高音。
            chime = Tone("QuQu answer chime", .34f, t => { float note = t < .11f ? 784f : 1046.5f; return Mathf.Sin(t*2*Mathf.PI*note)*Mathf.Exp(-(t%.11f)*13)*Mathf.Min(1,(.34f-t)*12)*.17f; });
            buzz = Tone("QuQu answer buzz", .32f, t => (Mathf.Sin(t*2*Mathf.PI*(196-56*t/.32f)) + Mathf.Sin(t*2*Mathf.PI*(392-112*t/.32f))*.25f)*Mathf.Exp(-t*8)*.17f);
            tick = Tone("QuQu ui tick", .05f, t => Mathf.Sin(t*2*Mathf.PI*2100)*Mathf.Exp(-t*140)*.12f);
            // 观众底噪＝低通噪声床（4 秒无缝循环，两端渐入渐出消接缝咔声）。
            float bed=0; var crowdNoise=new System.Random(7);
            crowd = Tone("QuQu crowd bed", 4f, t => { bed+=((float)crowdNoise.NextDouble()*2-1-bed)*.015f; float edge=Mathf.Min(1,Mathf.Min(t,4f-t)*3f); return bed*(.6f+.4f*Mathf.Sin(t*Mathf.PI))*edge*2.2f; });
            ambience = gameObject.AddComponent<AudioSource>(); ambience.loop = true; ambience.playOnAwake = false; ambience.volume = .35f; ambience.clip = crowd;
            var track = Resources.Load<AudioClip>("Audio/MoonlitCafe");
            if (track) { Destroy(builtIn); builtIn = track; generatedMusic = true; }
        }
        static AudioClip Tone(string name, float seconds, Func<float,float> sample)
        {
            const int rate = 22050; var data = new float[Mathf.CeilToInt(seconds*rate)];
            for (int i = 0; i < data.Length; i++) data[i] = sample((float)i/rate);
            var clip = AudioClip.Create(name,data.Length,1,rate,false); clip.SetData(data,0); return clip;
        }
        public void Hit(bool blocked = false) { if (Effects) { Effects.pitch = 1; Effects.PlayOneShot(blocked ? block : punch); } }
        public void Celebrate() { if (Effects) Effects.PlayOneShot(victory); }
        /** 答题判定提示音：对/错各一条（裁判弃权等无判定的答卷不出声，由调用方过滤）。 */
        public void Answer(bool correct) { if (Effects) Effects.PlayOneShot(correct ? chime : buzz); }
        /** UI 点击音（ArenaUI.Button 与自绘按钮统一收口）。 */
        public void Click() { if (Effects) Effects.PlayOneShot(tick); }
        /** 观众氛围底噪：赛事期间循环播放的低频人声床，幂等开关。 */
        public void Crowd(bool active)
        {
            if (!ambience) return;
            if (active) { if (!ambience.isPlaying) ambience.Play(); }
            else ambience.Stop();
        }
        public void Apply(ArenaPreferences prefs)
        {
            Music.volume = prefs.musicVolume; Effects.volume = prefs.soundVolume;
            if (ambience) ambience.volume = prefs.soundVolume * .35f;
        }
        public void LoadMusic(string path, Action<string> result)
        {
            musicRevision++;
            if (string.IsNullOrEmpty(path)) { var old = Music.clip; Music.clip = builtIn; Music.Play(); if (old && old != builtIn) Destroy(old); result?.Invoke("已切换内置音乐"); return; }
            StartCoroutine(LoadAudio(path, musicRevision, result));
        }
        IEnumerator LoadAudio(string path, int revision, Action<string> result)
        {
            if (!File.Exists(path)) { result?.Invoke("音乐文件不存在，保留当前音乐"); yield break; }
            var ext = Path.GetExtension(path).ToLowerInvariant(); var type = ext == ".mp3" ? AudioType.MPEG : ext == ".ogg" ? AudioType.OGGVORBIS : AudioType.WAV;
            using (var request = UnityWebRequestMultimedia.GetAudioClip(new Uri(path).AbsoluteUri, type))
            {
                yield return request.SendWebRequest();
                if (revision != musicRevision) yield break;
                if (request.result != UnityWebRequest.Result.Success) { result?.Invoke("音乐解码失败，保留当前音乐"); yield break; }
                var clip = DownloadHandlerAudioClip.GetContent(request); var old = Music.clip; Music.clip = clip; Music.Play();
                if (old && old != builtIn) Destroy(old); result?.Invoke("音乐已载入");
            }
        }
        public async Task<bool> LoadAvatar(ArenaFighter fighter, string path, Action<string> result)
        {
            int revision = avatarRevisions.TryGetValue(fighter, out var oldRevision) ? oldRevision + 1 : 1;
            avatarRevisions[fighter] = revision;
            GLTFast.GltfImport importer = null; GameObject holder = null;
            try
            {
                if (!File.Exists(path) || new FileInfo(path).Length > 64 * 1024 * 1024) throw new InvalidDataException("GLB 文件不存在或超过 64 MB");
                var bytes = File.ReadAllBytes(path);
                if (bytes.Length < 20 || BitConverter.ToUInt32(bytes, 0) != 0x46546C67) throw new InvalidDataException("不是有效的 GLB 文件");
                int jsonLength = BitConverter.ToInt32(bytes, 12);
                if (jsonLength < 0 || jsonLength > bytes.Length - 20) throw new InvalidDataException("GLB 数据不完整");
                var json = Encoding.UTF8.GetString(bytes, 20, jsonLength);
                // Imported avatars must be self-contained; they cannot fetch external files or URLs.
                var sources = JsonUtility.FromJson<GltfSources>(json);
                foreach (var source in (sources.buffers ?? Array.Empty<GltfUri>())) CheckUri(source);
                foreach (var source in (sources.images ?? Array.Empty<GltfUri>())) CheckUri(source);
                importer = new GLTFast.GltfImport();
                if (!await importer.Load(bytes)) throw new InvalidDataException("GLB 解析失败");
                if (!CurrentAvatar(fighter,revision)) { importer.Dispose(); return false; }
                holder = new GameObject("Imported avatar"); holder.transform.SetParent(fighter.BodyRoot, false);holder.SetActive(false);
                if (!await importer.InstantiateMainSceneAsync(holder.transform)) throw new InvalidDataException("GLB 场景创建失败");
                if (!CurrentAvatar(fighter,revision)) { Destroy(holder); importer.Dispose(); return false; }
                var renderers = holder.GetComponentsInChildren<Renderer>(true);
                if (renderers.Length == 0) throw new InvalidDataException("模型中没有可见网格");
                var bounds = renderers[0].bounds; foreach (var r in renderers) bounds.Encapsulate(r.bounds);
                float height = bounds.size.y / fighter.BodyRoot.lossyScale.y;
                if (height < .001f) throw new InvalidDataException("模型尺寸无效");
                var center = holder.transform.InverseTransformPoint(bounds.center); holder.transform.localScale = Vector3.one * (2.25f / height);
                holder.transform.localPosition = new Vector3(-center.x, -center.y + height / 2, -center.z) * (2.25f / height);
                while(CurrentAvatar(fighter,revision) && fighter.Busy)await Task.Delay(25);
                if(!CurrentAvatar(fighter,revision)){Destroy(holder);importer.Dispose();return false;}
                foreach (Transform child in fighter.BodyRoot) if (child != holder.transform)
                {
                    child.gameObject.SetActive(false);
                    if(child.name == "Imported avatar") Destroy(child.gameObject);
                }
                if (imports.TryGetValue(fighter, out var previous)) previous.Dispose(); imports[fighter] = importer;
                holder.SetActive(true);
                bool rigged=fighter.BindImportedAvatar(holder);
                var stage=fighter.GetComponentInParent<ArenaStage>();if(stage && stage.Fighters.Contains(fighter))stage.RefreshPlacementWhenIdle();
                result?.Invoke(rigged?"3D 形象已载入；使用骨架掌击动作":"3D 形象已载入；使用简化手部掌击动作"); return true;
            }
            catch (Exception e) { if (holder) Destroy(holder); importer?.Dispose(); if(CurrentAvatar(fighter,revision)) result?.Invoke(e.Message); return false; }
        }
        bool CurrentAvatar(ArenaFighter fighter,int revision) => fighter && !ArenaAvatarMode.Chibi && avatarRevisions.TryGetValue(fighter,out var active) && active==revision;
        public void InvalidateAvatar(ArenaFighter fighter) { avatarRevisions[fighter] = avatarRevisions.TryGetValue(fighter, out var revision) ? revision + 1 : 1; }
        public void ReleaseAvatar(ArenaFighter fighter, bool forget = false)
        {
            InvalidateAvatar(fighter);
            if (imports.TryGetValue(fighter,out var importer))
            { if(fighter.BodyRoot) fighter.BodyRoot.gameObject.SetActive(false); importer.Dispose(); imports.Remove(fighter); }
            if(forget) avatarRevisions.Remove(fighter);
        }
        [Serializable] class GltfSources { public GltfUri[] buffers, images; }
        [Serializable] class GltfUri { public string uri; }
        static void CheckUri(GltfUri source) { if (!string.IsNullOrEmpty(source.uri) && !source.uri.StartsWith("data:", StringComparison.Ordinal)) throw new InvalidDataException("请导出贴图内嵌的 GLB，不支持外部资源链接"); }
        public static Texture2D Texture(string path)
        {
            if (!File.Exists(path) || new FileInfo(path).Length > 16 * 1024 * 1024) throw new InvalidDataException("图片不存在或超过 16 MB");
            var texture = new Texture2D(2, 2); if (!texture.LoadImage(File.ReadAllBytes(path))) { Destroy(texture); throw new InvalidDataException("图片无法解码"); }
            if (texture.width > 8192 || texture.height > 8192) { Destroy(texture); throw new InvalidDataException("图片分辨率过大"); } return texture;
        }
        public static void Face(ArenaFighter fighter, string path)
        {
            var texture = Texture(path); var material = ArenaStage.Mat(Color.white); material.mainTexture = texture;
            fighter.OwnAsset(texture); fighter.OwnAsset(material);
            ArenaStage.Shape(fighter.BodyRoot, "Custom portrait", PrimitiveType.Quad, new Vector3(0, 1.78f, .405f), new Vector3(.7f, .45f, 1), material).transform.localRotation = Quaternion.Euler(0, 180, 0);
        }
        void OnDestroy()
        {
            musicRevision++; foreach (var importer in imports.Values) importer.Dispose();
            if (!generatedMusic && builtIn) Destroy(builtIn); if (punch) Destroy(punch); if (block) Destroy(block); if (victory) Destroy(victory); if (chime) Destroy(chime); if (buzz) Destroy(buzz); if (tick) Destroy(tick); if (crowd) Destroy(crowd);
        }
    }
    public static class LocalFilePicker
    {
        public static string Save(string title,string filter,string name)=>Show(title,filter,name,true);
        public static string Pick(string title,string filter)=>Show(title,filter,"",false);
        static string Show(string title,string filter,string name,bool save)
        {
            if(Application.platform!=RuntimePlatform.WindowsPlayer && Application.platform!=RuntimePlatform.WindowsEditor)return null;
            // Shell extensions run in the dialog helper, outside Unity's native shutdown.
            string root=Path.GetDirectoryName(Application.dataPath);
#if UNITY_EDITOR
            root=Path.Combine(root,"BuildNativeV18");
#endif
            string executable=Path.Combine(root,"NativeDialogs","QuQuFileDialog.exe");
            string arguments=string.Join(" ",new[]{save?"save":"open",title,filter.TrimEnd('\0').Replace('\0','|'),name}.Select(ArenaDesktopRuntime.Argument));
            var info=new System.Diagnostics.ProcessStartInfo(executable,arguments)
            {UseShellExecute=false,CreateNoWindow=true,WindowStyle=System.Diagnostics.ProcessWindowStyle.Hidden,RedirectStandardOutput=true,RedirectStandardError=true,StandardOutputEncoding=Encoding.UTF8};
            using(var process=System.Diagnostics.Process.Start(info))
            {
                var errors=process.StandardError.ReadToEndAsync();string result=process.StandardOutput.ReadToEnd();process.WaitForExit();
                if(process.ExitCode!=0)throw new InvalidOperationException("系统文件选择器未能打开："+errors.Result);
                return result.Length==0?null:result.TrimStart('\ufeff');
            }
        }
    }
}
