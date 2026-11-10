using System.Collections;
using UnityEngine;

namespace QuQu
{
    public class ArenaFighter : MonoBehaviour
    {
        public FighterState State;
        public float Motion = 1;
        public bool Celebrating, Defeated;
        public bool ShowNameplate = true;
        public bool Chibi { get; private set; }
        public bool DuelStance { get; private set; }
        public float StanceAngle => DuelStance?(Chibi?35:25):0;
        public Color Tint;
        public AvatarPreference Look;
        public Transform BodyRoot;
        public Vector3 Home;
        Transform leftArm, rightArm, rightPalm, rightUpper, head, torso;
        Animator skeletalAnimator;
        ArenaDivinePose divinePose;
        int slapRevision;
        Quaternion homeRotation;
        Transform homeFrame;
        Vector3 frameHome;
        Quaternion frameHomeRotation, previousFrameRotation;
        Transform neck, labelAnchor;
        TMPro.TextMeshPro nameplate;
        LineRenderer aura;
        Material shell, glow;
        bool striking;
        bool entering, entranceAnimatorEnabled;
        RuntimeAnimatorController entrancePreviousController;
        public float EntranceSpeed { get; private set; } = 1.2f;
        float stagger;
        string pose = "";
        float reactionUntil;
        float braceUntil;
        ArenaFighter slapReceiver;
        public bool Slapping => striking;
        public float SlapContactError => divinePose && divinePose.Ready ? divinePose.ContactError : 0;
        public Vector3 SlapPalm => divinePose && divinePose.Ready ? divinePose.Palm : rightPalm ? rightPalm.position : transform.position+Vector3.up*1.6f;
        public Vector3 SlapCheek => divinePose && divinePose.Ready ? divinePose.Cheek : transform.TransformPoint(new Vector3(-.1f,1.8f,.39f)*Look.scale);
        public float FaceSideOffset => divinePose && divinePose.Ready ? divinePose.Face.z-transform.position.z : 0;
        public float FaceDepth => (divinePose && divinePose.Ready ? divinePose.FaceDepth : .39f)*Look.scale;
        public float StandingFaceHeight => (divinePose && divinePose.Ready ? divinePose.StandingFaceHeight : 1.8f)*Look.scale;
        public float FitDuelStance(ArenaFighter other)
        {if(!divinePose || !divinePose.Ready)return FaceDepth;divinePose.FitStance(other.StandingFaceHeight);return divinePose.StanceFaceDepth;}
        readonly System.Collections.Generic.List<Object> ownedAssets = new System.Collections.Generic.List<Object>();
        public void OwnAsset(Object asset) { ownedAssets.Add(asset); }
        Material OwnMaterial(Color color, float emission = 0) { var material = ArenaStage.Mat(color,emission); OwnAsset(material); return material; }
        void ReleaseAssets() { foreach (var asset in ownedAssets) if (asset) Destroy(asset); ownedAssets.Clear(); }
        void OnDestroy() { ReleaseAssets(); }
        public bool Busy => entering || striking || Time.time < reactionUntil || Time.time < braceUntil;
        public void BeginEntrance()
        {
            entering=true;EntranceSpeed=1.2f;
            if(!skeletalAnimator)return;
            entrancePreviousController=skeletalAnimator.runtimeAnimatorController;entranceAnimatorEnabled=skeletalAnimator.enabled;
            string id=ArenaModelPresets.Find(Look.presetId)?.Id;
            if(Chibi && (string.IsNullOrEmpty(id) || !string.IsNullOrEmpty(Look.modelPath) || !string.IsNullOrEmpty(Look.facePath)))id="generic";
            var controller=Chibi?ArenaAvatarMode.GalleryController(id):Resources.Load<RuntimeAnimatorController>("Art/GalleryV21/"+id);
            if(!controller)return;
            if(divinePose)divinePose.enabled=false;
            skeletalAnimator.runtimeAnimatorController=controller;skeletalAnimator.applyRootMotion=false;skeletalAnimator.enabled=true;
            skeletalAnimator.Play("Idle",0,0);skeletalAnimator.Update(0);
            EntranceSpeed=Chibi?Mathf.Clamp(skeletalAnimator.GetFloat("StrideSpeed")*.7f,.3f,.7f):1.2f;
        }
        public void EntrancePose(Vector3 position,Quaternion facing,float speed)
        {
            transform.position=position;transform.rotation=Quaternion.RotateTowards(transform.rotation,facing,150*Time.unscaledDeltaTime);
            if(nameplate){nameplate.text=State.Name+"\n入场";if(Camera.main)nameplate.transform.rotation=Camera.main.transform.rotation;}
            if(skeletalAnimator && skeletalAnimator.enabled && skeletalAnimator.runtimeAnimatorController!=entrancePreviousController)
            {
                skeletalAnimator.speed=1;float stride=Mathf.Max(.1f,skeletalAnimator.GetFloat("StrideSpeed"))*Look.scale;
                skeletalAnimator.SetFloat("Speed",speed/Look.scale,.1f,Time.unscaledDeltaTime);
                skeletalAnimator.SetFloat("WalkRate",Mathf.Clamp(speed/stride,.08f,2.5f));
            }
        }
        public void EndEntrance()
        {
            if(!entering)return;entering=false;transform.position=Home;transform.rotation=homeRotation;
            if(skeletalAnimator){skeletalAnimator.runtimeAnimatorController=entrancePreviousController;skeletalAnimator.enabled=entranceAnimatorEnabled;}
            if(divinePose)divinePose.enabled=true;
            pose="";
        }
        public void SetHome(Vector3 home, bool duelStance=false, Transform referenceFrame=null)
        {
            Home=home;DuelStance=duelStance;homeFrame=referenceFrame;
            frameHome=homeFrame?homeFrame.InverseTransformPoint(home):home;
            frameHomeRotation=Quaternion.LookRotation(-new Vector3(frameHome.x,0,duelStance?0:frameHome.z))*Quaternion.Euler(0,-StanceAngle,0);
            previousFrameRotation=homeFrame?homeFrame.rotation:Quaternion.identity;
            homeRotation=previousFrameRotation*frameHomeRotation;transform.position=home;
            if(!Busy)transform.rotation=homeRotation;
            if(aura)aura.transform.localScale=Vector3.one*(duelStance?.46f*Look.scale:1);
        }
        public void FaceAwardCamera()
        {
            homeRotation=Quaternion.LookRotation(Vector3.back)*Quaternion.Euler(0,-StanceAngle,0);
            frameHomeRotation=(homeFrame?Quaternion.Inverse(homeFrame.rotation):Quaternion.identity)*homeRotation;
        }
        void RefreshHomeFrame()
        {
            if(!homeFrame)return;
            var next=homeFrame.TransformPoint(frameHome);
            Home=next;homeRotation=homeFrame.rotation*frameHomeRotation;
            // Fighters are parented to the frame by the station rig, including while an entrance is paused.
            if(!entering && !transform.IsChildOf(homeFrame))
                transform.rotation=homeFrame.rotation*Quaternion.Inverse(previousFrameRotation)*transform.rotation;
            previousFrameRotation=homeFrame.rotation;
            if(!entering)transform.position=Home;
        }
        public void Create(ModelInfo model, AvatarPreference preference, Vector3 home)
        {
            State = new FighterState { Id = model.id, Name = model.name }; Home = home; transform.position = Home;
            homeRotation = Quaternion.LookRotation(-new Vector3(home.x, 0, home.z)); transform.rotation = homeRotation; ApplyLook(preference);
            var label = new GameObject("Fighter label"); label.transform.SetParent(transform, false);
            label.transform.localPosition = new Vector3(0, 2.85f, 0);
            nameplate = label.AddComponent<TMPro.TextMeshPro>(); nameplate.font = Resources.Load<TMPro.TMP_FontAsset>("ArenaFont");
            nameplate.fontSize = 2.2f; nameplate.alignment = TMPro.TextAlignmentOptions.Center;
            nameplate.rectTransform.sizeDelta = new Vector2(4, 1); nameplate.richText = false;
            nameplate.outlineWidth = .22f; nameplate.outlineColor = new Color32(5,12,18,255);
        }
        public void ApplyLook(AvatarPreference preference)
        {
            CancelSlap();
            Look = preference; ColorUtility.TryParseHtmlString(preference.color, out Tint);
            Chibi = ArenaAvatarMode.Chibi;
            StopAllCoroutines(); CancelInvoke(); striking = false; reactionUntil = braceUntil = 0; pose = "";
            leftArm = rightArm = rightPalm = rightUpper = head = torso = neck = labelAnchor = null; skeletalAnimator = null; divinePose = null;
            transform.position = Home; transform.rotation = homeRotation;
            if (BodyRoot) { BodyRoot.gameObject.SetActive(false); Destroy(BodyRoot.gameObject); }
            ReleaseAssets();
            BodyRoot = new GameObject("Avatar").transform; BodyRoot.SetParent(transform, false);
            BodyRoot.localScale = Vector3.one * Mathf.Clamp(preference.scale, .65f, 1.45f);
            var preset = ArenaModelPresets.Find(preference.presetId);
            var champion = Chibi ? ArenaAvatarMode.Prefab(preference) : preset?.Prefab;
            if (!champion && preference.style == 0) champion = Resources.Load<GameObject>("Art/JadeChampion");
            if (champion)
            {
                var view = Instantiate(champion, BodyRoot, false);
                skeletalAnimator = view.GetComponent<Animator>();
                if (skeletalAnimator) { divinePose = view.AddComponent<ArenaDivinePose>(); divinePose.Initialize(this,skeletalAnimator); }
                neck = System.Array.Find(view.GetComponentsInChildren<Transform>(), t => t.name == "neck");
                labelAnchor = System.Array.Find(view.GetComponentsInChildren<Transform>(), t => t.name == "Head");
                foreach (var renderer in view.GetComponentsInChildren<SkinnedMeshRenderer>())
                    foreach (var material in renderer.materials) { OwnAsset(material); material.color = preset == null || (Chibi && (!string.IsNullOrEmpty(preference.modelPath) || !string.IsNullOrEmpty(preference.facePath))) ? Color.Lerp(Color.white, Tint, .18f) : Color.white; }
            }
            else
            {
            shell = OwnMaterial(Tint); glow = OwnMaterial(Tint, 2);
            var dark = OwnMaterial(new Color(.025f, .035f, .055f)); var white = OwnMaterial(new Color(.85f, .94f, 1));
            var primitive = preference.style == 1 ? PrimitiveType.Sphere : PrimitiveType.Cube;
            torso = Part("Chest", primitive, new Vector3(0, 1.04f, 0), new Vector3(.75f, .75f, .45f), shell);
            Part("Chest core", PrimitiveType.Sphere, new Vector3(0, 1.12f, .25f), Vector3.one * .2f, glow);
            head = Part("Head", primitive, new Vector3(0, 1.77f, .02f), new Vector3(.86f, .7f, .67f), shell);
            Part("Face visor", PrimitiveType.Cube, new Vector3(0, 1.78f, .37f), new Vector3(.7f, .34f, .045f), dark);
            for (int side = -1; side <= 1; side += 2)
            {
                Part("Bright eye", PrimitiveType.Cube, new Vector3(side * .19f, 1.82f, .4f), new Vector3(.13f, .065f, .03f), OwnMaterial(Color.white, 3));
                Part("Boot", PrimitiveType.Cube, new Vector3(side * .23f, .2f, .08f), new Vector3(.32f, .27f, .53f), dark);
                Part("Leg", PrimitiveType.Capsule, new Vector3(side * .22f, .5f, 0), new Vector3(.23f, .26f, .24f), white);
                CreateSlapArm(side,shell,white);
                if (preference.style == 2) Part("Cricket antenna", PrimitiveType.Capsule, new Vector3(side * .3f, 2.32f, 0), new Vector3(.05f, .3f, .05f), glow).localRotation = Quaternion.Euler(0, 0, -side * 22);
            }
            if (preference.style != 2) { Part("Antenna", PrimitiveType.Cylinder, new Vector3(0, 2.27f, 0), new Vector3(.05f, .18f, .05f), dark); Part("Antenna light", PrimitiveType.Sphere, new Vector3(0, 2.46f, 0), Vector3.one * .15f, glow); }
            }
            if((!divinePose || !divinePose.Ready) && !rightPalm)CreateFallbackArms();
            if (aura) Destroy(aura.gameObject);
            aura = ArenaStage.Ring(transform, "Thinking halo", .72f, .045f, Tint, .035f, 48);
            aura.transform.localScale=Vector3.one*(DuelStance?.46f*Look.scale:1);
            OwnAsset(aura.sharedMaterial);
        }
        Transform Part(string name, PrimitiveType type, Vector3 pos, Vector3 scale, Material mat) => ArenaStage.Shape(BodyRoot, name, type, pos, scale, mat).transform;
        void CreateSlapArm(int side,Material handMaterial,Material sleeve)
        {
            var arm=new GameObject("Shoulder").transform;arm.SetParent(BodyRoot,false);arm.localPosition=new Vector3(side*.5f,1.32f,0);
            var upper=ArenaStage.Shape(arm,"Upper arm",PrimitiveType.Capsule,new Vector3(0,-.16f,0),new Vector3(.22f,.23f,.22f),sleeve).transform;
            var palm=new GameObject("Open palm").transform;palm.SetParent(arm,false);palm.localPosition=new Vector3(0,-.38f,.13f);
            ArenaStage.Shape(palm,"Palm",PrimitiveType.Cube,Vector3.zero,new Vector3(.25f,.23f,.075f),handMaterial);
            for(int finger=0;finger<4;finger++)ArenaStage.Shape(palm,"Finger",PrimitiveType.Capsule,new Vector3((finger-1.5f)*.058f,.18f,0),new Vector3(.05f,.09f,.055f),handMaterial);
            ArenaStage.Shape(palm,"Thumb",PrimitiveType.Capsule,new Vector3(side*.145f,.015f,0),new Vector3(.065f,.08f,.065f),handMaterial).transform.localRotation=Quaternion.Euler(0,0,-side*30);
            if(side<0)leftArm=arm;else{rightArm=arm;rightPalm=palm;rightUpper=upper;}
        }
        void CreateFallbackArms()
        {var handMaterial=OwnMaterial(Color.Lerp(Tint,Color.white,.65f));var sleeve=OwnMaterial(new Color(.65f,.72f,.77f));CreateSlapArm(-1,handMaterial,sleeve);CreateSlapArm(1,handMaterial,sleeve);}
        public bool BindImportedAvatar(GameObject view)
        {
            divinePose=null;skeletalAnimator=null;labelAnchor=null;head=torso=null;
            var skin=view.GetComponentInChildren<SkinnedMeshRenderer>();
            if(skin && System.Array.Exists(skin.bones,b=>b && b.name=="RightArm"))
            {
                skeletalAnimator=view.GetComponent<Animator>()??view.AddComponent<Animator>();divinePose=view.AddComponent<ArenaDivinePose>();divinePose.Initialize(this,skeletalAnimator);
                if(divinePose.Ready){labelAnchor=System.Array.Find(skin.bones,b=>b.name=="Head");return true;}
            }
            divinePose=null;if(!rightPalm)CreateFallbackArms();else{rightArm.gameObject.SetActive(true);leftArm.gameObject.SetActive(true);}return false;
        }
        void SlapPrimitive(ArenaFighter target,float time)
        {
            float wind=Mathf.SmoothStep(0,1,Mathf.Clamp01(time/.30f)),swing=Mathf.SmoothStep(0,1,Mathf.Clamp01((time-.30f)/.18f)),recover=Mathf.SmoothStep(0,1,Mathf.Clamp01((time-.76f)/.38f));
            rightArm.localRotation=Quaternion.identity;
            var rest=rightArm.TransformPoint(new Vector3(0,-.38f,.13f));var raised=rightArm.position+(transform.right*.3f+Vector3.up*.48f)*Look.scale;
            var goal=Vector3.Lerp(Vector3.Lerp(Vector3.Lerp(rest,raised,wind),target.SlapCheek,swing),rest,recover);
            rightPalm.position=goal;rightPalm.rotation=Quaternion.LookRotation(transform.forward,transform.up);
            var direction=goal-rightArm.position;rightUpper.position=rightArm.position+direction*.5f;rightUpper.rotation=Quaternion.FromToRotation(Vector3.up,direction);
            rightUpper.localScale=new Vector3(.22f,direction.magnitude/(Look.scale*2),.22f);
        }
        public void Strike(ArenaFighter target, float score, float motion, System.Action<Vector3, Color, bool> impact)
        { if (target && target != this && motion > 0 && !Busy && !Celebrating && !Defeated && score>0) StartCoroutine(SlapResolved(target,impact)); }
        public void CastResolved(ArenaFighter target, float damage, System.Action<Vector3, Color, bool> impact)
        { if (target && target != this && Motion > 0 && damage>0 && !Busy) StartCoroutine(SlapResolved(target,impact)); }
        bool Animated => skeletalAnimator && skeletalAnimator.isActiveAndEnabled;
        bool CanAttack(ArenaFighter target) => target && Motion > 0 && !Celebrating && !Defeated && !target.Celebrating && !target.Defeated;
        public void CancelSlap()
        {
            slapRevision++;striking=false;stagger=0;reactionUntil=braceUntil=0;
            if(divinePose){divinePose.SlapTarget=null;divinePose.SlapTime=-1;divinePose.Flinch=0;}
            if(slapReceiver){slapReceiver.braceUntil=0;if(slapReceiver.divinePose)slapReceiver.divinePose.Flinch=0;slapReceiver=null;}
        }
        public IEnumerator SlapResolved(ArenaFighter target,System.Action<Vector3,Color,bool> impact)
        {
            if(!target || target==this || !CanAttack(target))yield break;
            int revision=++slapRevision;striking=true;slapReceiver=target;bool impacted=false;
            try
            {
                for(float elapsed=0;elapsed<1.16f && revision==slapRevision && CanAttack(target);elapsed+=Time.unscaledDeltaTime)
                {
                    Face(target.transform.position);target.Face(transform.position);target.braceUntil=Time.time+.15f;
                    // Hold the exact contact pose for one rendered frame before settling this slap.
                    float poseTime=!impacted && elapsed>=.48f?.48f:elapsed;
                    if(divinePose){divinePose.SlapTarget=target;divinePose.SlapTime=poseTime;}
                    if(rightPalm)SlapPrimitive(target,poseTime);
                    yield return new WaitForEndOfFrame();
                    if(!impacted && elapsed>=.48f && revision==slapRevision && Motion>0)
                    {impacted=true;target.ReceiveImpact(.22f);impact?.Invoke(target.SlapCheek,Tint,false);}
                    if(target.divinePose && impacted)target.divinePose.Flinch=Mathf.Clamp01(1-(elapsed-.48f)/.6f);
                }
            }
            finally{if(revision==slapRevision){CancelSlap();ReturnToIdle();}}
        }
        void Face(Vector3 point)
        {
            if(DuelStance){transform.rotation=homeRotation;return;}
            var direction = point - transform.position; direction.y = 0;
            if (direction.sqrMagnitude > .001f) transform.rotation = Quaternion.RotateTowards(transform.rotation,Quaternion.LookRotation(direction)*Quaternion.Euler(0,-StanceAngle,0),Time.deltaTime * 540);
        }
        void PlayPose(string next, bool restart = false)
        {
            if (pose == next && !restart) return; pose = next;
            if (Animated && skeletalAnimator.HasState(0,Animator.StringToHash(next)))
            { skeletalAnimator.speed = 1; skeletalAnimator.CrossFadeInFixedTime(next,.08f,0,0); }
        }
        void ReturnToIdle() { PlayPose(Celebrating ? "Victory" : Defeated ? "Defeat" : "Idle"); }
        void ReceiveImpact(float strength)
        {
            if (Celebrating || Defeated) return;
            stagger = strength;
            if(divinePose)divinePose.Flinch=1;
            reactionUntil=Time.time+.65f;
        }
        void Update()
        {
            RefreshHomeFrame();
            if (!BodyRoot || entering) return;
            if (Animated) skeletalAnimator.speed = Motion <= 0 ? 0 : 1;
            bool thinking = State.Status == "generating" || State.Status == "judging";
            var t = Time.time + Home.x;
            if (!striking)
            {
                if (Time.time >= reactionUntil) ReturnToIdle();
                transform.position = Home;
                if (!Busy) transform.rotation = Quaternion.RotateTowards(transform.rotation,homeRotation,Time.deltaTime * 160);
                if (leftArm) leftArm.localRotation = Quaternion.Euler(-8, 0, -8);
                if (rightArm) rightArm.localRotation = Quaternion.Euler(-8, 0, 8);
                if(rightPalm){rightPalm.localPosition=new Vector3(0,-.38f,.13f);rightPalm.localRotation=Quaternion.identity;rightUpper.localPosition=new Vector3(0,-.16f,0);rightUpper.localRotation=Quaternion.identity;rightUpper.localScale=new Vector3(.22f,.23f,.22f);}
                if (Celebrating && leftArm && rightArm) { leftArm.localRotation = Quaternion.Euler(0, 0, -145); rightArm.localRotation = Quaternion.Euler(0, 0, 145); }
            }
            stagger = Motion>0 ? Mathf.MoveTowards(stagger, 0, Time.deltaTime) : 0;
            if(head)head.localRotation=Quaternion.Euler(0,-stagger*120,-stagger*30);
            BodyRoot.localRotation = Quaternion.identity;
            aura.transform.localScale = Vector3.one * (DuelStance?.46f*Look.scale:1) * (1 + (thinking ? Mathf.Sin(t * 1.2f) * .025f * Motion : 0));
            if (nameplate)
            {
                nameplate.gameObject.SetActive(ShowNameplate);
                string status = Celebrating ? "胜者" : Defeated ? "本场结束" : State.Status == "generating" ? "解题中" : State.Status == "judging" ? "等待判分" : State.Status == "error" ? "调用异常" : State.Status == "withdrawn" ? "已退赛" : "就绪";
                nameplate.text = State.Name + "\n" + status; nameplate.color = Tint;
                if (Camera.main) nameplate.transform.rotation = Camera.main.transform.rotation;
            }
        }
        void LateUpdate()
        {
            if (nameplate) nameplate.transform.position = Chibi ? transform.position + Vector3.up * (1.85f * Look.scale + .3f) : labelAnchor ? labelAnchor.position + Vector3.up * .65f : transform.position + Vector3.up * (2.6f * Look.scale + .25f);

        }
    }
}
