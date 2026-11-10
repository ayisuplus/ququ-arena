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
        public Color Tint;
        public AvatarPreference Look;
        public Transform BodyRoot;
        public Vector3 Home;
        Transform leftArm, rightArm, head, torso;
        Animator skeletalAnimator;
        ArenaDivinePose divinePose;
        int attackIndex;
        float animationSpeed = 1;
        Quaternion homeRotation;
        Transform neck, labelAnchor;
        TMPro.TextMeshPro nameplate;
        LineRenderer aura;
        Material shell, glow;
        bool striking;
        float stagger;
        string pose = "";
        float reactionUntil;
        float braceUntil;
        readonly System.Collections.Generic.List<Object> ownedAssets = new System.Collections.Generic.List<Object>();
        public void OwnAsset(Object asset) { ownedAssets.Add(asset); }
        Material OwnMaterial(Color color, float emission = 0) { var material = ArenaStage.Mat(color,emission); OwnAsset(material); return material; }
        void ReleaseAssets() { foreach (var asset in ownedAssets) if (asset) Destroy(asset); ownedAssets.Clear(); }
        void OnDestroy() { ReleaseAssets(); }
        public bool Busy => striking || Time.time < reactionUntil || Time.time < braceUntil;
        public void SetHome(Vector3 home) { Home=home; homeRotation=Quaternion.LookRotation(-new Vector3(home.x,0,home.z)); transform.position=home; if(!Busy) transform.rotation=homeRotation; }
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
            Look = preference; ColorUtility.TryParseHtmlString(preference.color, out Tint);
            StopAllCoroutines(); CancelInvoke(); striking = false; reactionUntil = braceUntil = 0; pose = "";
            leftArm = rightArm = head = torso = neck = labelAnchor = null; skeletalAnimator = null; divinePose = null;
            animationSpeed = 1; attackIndex = 0; transform.position = Home; transform.rotation = homeRotation;
            if (BodyRoot) { BodyRoot.gameObject.SetActive(false); Destroy(BodyRoot.gameObject); }
            ReleaseAssets();
            BodyRoot = new GameObject("Avatar").transform; BodyRoot.SetParent(transform, false);
            BodyRoot.localScale = Vector3.one * Mathf.Clamp(preference.scale, .65f, 1.45f);
            var preset = ArenaModelPresets.Find(preference.presetId);
            var champion = preset?.Prefab;
            if (!champion && preference.style == 0) champion = Resources.Load<GameObject>("Art/JadeChampion");
            if (champion)
            {
                var view = Instantiate(champion, BodyRoot, false);
                skeletalAnimator = view.GetComponent<Animator>();
                if (skeletalAnimator) { divinePose = view.AddComponent<ArenaDivinePose>(); divinePose.Initialize(this,skeletalAnimator); }
                neck = System.Array.Find(view.GetComponentsInChildren<Transform>(), t => t.name == "neck");
                labelAnchor = System.Array.Find(view.GetComponentsInChildren<Transform>(), t => t.name == "Head");
                foreach (var renderer in view.GetComponentsInChildren<SkinnedMeshRenderer>())
                    foreach (var material in renderer.materials) { OwnAsset(material); material.color = preset == null ? Color.Lerp(Color.white, Tint, .18f) : Color.white; }
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
                var arm = new GameObject("Shoulder").transform; arm.SetParent(BodyRoot, false); arm.localPosition = new Vector3(side * .5f, 1.32f, 0);
                ArenaStage.Shape(arm, "Upper arm", PrimitiveType.Capsule, new Vector3(0, -.16f, 0), new Vector3(.22f, .23f, .22f), white);
                ArenaStage.Shape(arm, "Fist", PrimitiveType.Sphere, new Vector3(0, -.38f, .13f), new Vector3(.39f, .39f, .4f), shell);
                if (side < 0) leftArm = arm; else rightArm = arm;
                if (preference.style == 2) Part("Cricket antenna", PrimitiveType.Capsule, new Vector3(side * .3f, 2.32f, 0), new Vector3(.05f, .3f, .05f), glow).localRotation = Quaternion.Euler(0, 0, -side * 22);
            }
            if (preference.style != 2) { Part("Antenna", PrimitiveType.Cylinder, new Vector3(0, 2.27f, 0), new Vector3(.05f, .18f, .05f), dark); Part("Antenna light", PrimitiveType.Sphere, new Vector3(0, 2.46f, 0), Vector3.one * .15f, glow); }
            }
            if (aura) Destroy(aura.gameObject);
            aura = ArenaStage.Ring(transform, "Thinking halo", .72f, .045f, Tint, .035f, 48);
            OwnAsset(aura.sharedMaterial);
        }
        Transform Part(string name, PrimitiveType type, Vector3 pos, Vector3 scale, Material mat) => ArenaStage.Shape(BodyRoot, name, type, pos, scale, mat).transform;
        public void Strike(ArenaFighter target, float score, float motion, System.Action<Vector3, Color, bool> impact)
        { if (target && target != this && motion > 0 && !Busy && !Celebrating && !Defeated) StartCoroutine(InvokeDivinity(target, score, motion, impact)); }
        public void CastResolved(ArenaFighter target, float damage, System.Action<Vector3, Color, bool> impact)
        { if (target && target != this && Motion > 0) StartCoroutine(InvokeDivinity(target, damage / 20f, Motion, impact)); }
        bool Animated => skeletalAnimator && skeletalAnimator.isActiveAndEnabled;
        bool CanAttack(ArenaFighter target) => target && Motion > 0 && !Celebrating && !Defeated && !target.Celebrating && !target.Defeated;
        IEnumerator InvokeDivinity(ArenaFighter target, float score, float motion, System.Action<Vector3, Color, bool> impact)
        {
            striking = true;
            bool blocked = score <= 0, impacted = false;
            int variant = attackIndex++;
            if (divinePose) divinePose.Variant = variant;
            var effect = ArenaDivineEffect.Create(this,variant);
            const float chargeTime = 1.05f, flightTime = .48f, settleTime = .85f;
            float elapsed = 0;
            while (CanAttack(target) && elapsed < chargeTime + flightTime + settleTime)
            {
                elapsed += Time.deltaTime;
                Face(target.transform.position); target.Face(transform.position);
                target.braceUntil = Time.time + .15f;
                float charge = Mathf.SmoothStep(0,1,Mathf.Clamp01(elapsed/chargeTime));
                float flight = Mathf.Clamp01((elapsed-chargeTime)/flightTime);
                float fade = Mathf.Clamp01((elapsed-chargeTime-flightTime)/settleTime);
                float release = Mathf.SmoothStep(0,1,Mathf.Clamp01((elapsed-chargeTime+.12f)/.25f));
                if(divinePose) { divinePose.Charge=charge*(1-fade); divinePose.Release=release*(1-fade); }
                if(target.divinePose && !target.striking) target.divinePose.Guard = Mathf.MoveTowards(target.divinePose.Guard,blocked?.9f:.38f,Time.deltaTime*3);
                if(rightArm) rightArm.localRotation=Quaternion.Euler(-65*charge*(1-fade),0,10);
                if(leftArm) leftArm.localRotation=Quaternion.Euler(-35*charge*(1-fade),0,-12);
                Vector3 from = divinePose && divinePose.Ready ? divinePose.Hand : transform.position + transform.forward*.5f + Vector3.up*1.6f*BodyRoot.localScale.x;
                Vector3 point = target.transform.position + Vector3.up*1.4f*target.BodyRoot.localScale.x;
                effect.Show(from,point,charge,flight,fade,blocked);
                if(!impacted && flight >= 1)
                {
                    impacted=true; target.ReceiveImpact(.23f*Mathf.Clamp01(score)*motion,blocked);
                    impact?.Invoke(point,Tint,blocked);
                }
                yield return null;
            }
            if(effect) Destroy(effect.gameObject);
            if(divinePose) divinePose.Charge=divinePose.Release=0;
            if(target && target.divinePose) target.divinePose.Guard=0;
            transform.position=Home; striking=false; ReturnToIdle();
        }
        void Face(Vector3 point)
        {
            var direction = point - transform.position; direction.y = 0;
            if (direction.sqrMagnitude > .001f) transform.rotation = Quaternion.RotateTowards(transform.rotation,Quaternion.LookRotation(direction),Time.deltaTime * 540);
        }
        void PlayPose(string next, bool restart = false)
        {
            if (pose == next && !restart) return; pose = next;
            if (Animated && skeletalAnimator.HasState(0,Animator.StringToHash(next)))
            { skeletalAnimator.speed = animationSpeed; skeletalAnimator.CrossFadeInFixedTime(next,.08f,0,0); }
        }
        void ReturnToIdle() { PlayPose(Celebrating ? "Victory" : Defeated ? "Defeat" : "Idle"); }
        void ReceiveImpact(float strength, bool blocked)
        {
            if (Celebrating || Defeated) return;
            stagger = strength; animationSpeed = 1;
            if(divinePose) { divinePose.Recoil=blocked?.15f:1; divinePose.Guard=blocked?1:.4f; }
            reactionUntil=Time.time+.65f;
        }
        void Update()
        {
            if (!BodyRoot) return;
            if (Animated) skeletalAnimator.speed = Motion <= 0 ? 0 : animationSpeed;
            bool thinking = State.Status == "generating" || State.Status == "judging";
            var t = Time.time + Home.x;
            if (!striking)
            {
                if (Time.time >= reactionUntil) ReturnToIdle();
                transform.position = Home;
                if (!Busy) transform.rotation = Quaternion.RotateTowards(transform.rotation,homeRotation,Time.deltaTime * 160);
                if (leftArm) leftArm.localRotation = Quaternion.Euler(-8, 0, -8);
                if (rightArm) rightArm.localRotation = Quaternion.Euler(-8, 0, 8);
                if (Celebrating && leftArm && rightArm) { leftArm.localRotation = Quaternion.Euler(0, 0, -145); rightArm.localRotation = Quaternion.Euler(0, 0, 145); }
            }
            stagger = Mathf.MoveTowards(stagger, 0, Time.deltaTime);
            BodyRoot.localRotation = Quaternion.identity;
            if(divinePose && Motion>0) { divinePose.Recoil=Mathf.MoveTowards(divinePose.Recoil,0,Time.deltaTime*2); if(Time.time>=braceUntil) divinePose.Guard=Mathf.MoveTowards(divinePose.Guard,0,Time.deltaTime*2); }
            aura.transform.localScale = Vector3.one * (1 + (thinking ? Mathf.Sin(t * 1.2f) * .025f * Motion : 0));
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
            if (nameplate) nameplate.transform.position = labelAnchor ? labelAnchor.position + Vector3.up * .65f : transform.position + Vector3.up * (2.6f * Look.scale + .25f);

        }
    }
}
