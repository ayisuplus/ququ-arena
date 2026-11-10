using System;
using System.Linq;
using UnityEngine;
using UnityEngine.AI;

namespace QuQu
{
    // Exhibition instances never join Stage.Fighters or receive competition packets.
    public sealed class ArenaGalleryActor : MonoBehaviour
    {
        public ArenaModelPreset Preset { get; private set; }
        public NavMeshAgent Agent { get; private set; }
        public bool Walking { get; private set; }
        public bool Selected { get; private set; }
        public int Destination = -1;
        public int Arrivals { get; private set; }
        public int Recoveries { get; private set; }
        public float DistanceTravelled { get; private set; }
        public float RestRemaining { get; private set; }
        public float Height { get; private set; }
        public float Clock { get; private set; }
        public Vector3 FaceFocus => ArenaAvatarMode.Chibi ? transform.position+Vector3.up*1.23f : head?head.position+Vector3.up*.04f:transform.position+Vector3.up*Height*.9f;
        public string Activity => Selected?"近距离观察":Walking?"馆内漫游":Destination<4 && Destination>=0?"眺望窗外":Destination<8 && Destination>=0?"观察终端":"自由休息";
        Animator animator;
        GameObject visual;
        int residentIndex;
        Transform head;
        Vector3 lastPosition;
        Quaternion restingFacing;
        float stuck,remaining,walkSpeed,strideSpeed,inspectBrake;
        System.Random random;
        public void Initialize(ArenaModelPreset preset,int index)
        {
            Preset=preset;residentIndex=index;random=new System.Random(unchecked(Environment.TickCount+index*997));
            RefreshAvatar();
            var collider=gameObject.AddComponent<CapsuleCollider>();collider.radius=.56f;collider.height=Height;collider.center=Vector3.up*Height*.5f;collider.isTrigger=true;
            Agent=gameObject.AddComponent<NavMeshAgent>();Agent.radius=.65f;Agent.height=Height;Agent.speed=walkSpeed;
            Agent.acceleration=1.8f;Agent.angularSpeed=140;Agent.stoppingDistance=.12f;Agent.autoBraking=true;Agent.updateRotation=false;
            Agent.obstacleAvoidanceType=ObstacleAvoidanceType.HighQualityObstacleAvoidance;Agent.avoidancePriority=35+index*5;
            lastPosition=transform.position;restingFacing=transform.rotation;RestRemaining=2+index*2.7f;
        }
        public void RefreshAvatar()
        {
            if(visual){visual.SetActive(false);Destroy(visual);}
            var galleryPrefab=ArenaAvatarMode.Chibi?ArenaAvatarMode.GalleryPrefab(Preset.Id):Resources.Load<GameObject>("Art/GalleryV21/Avatars/"+Preset.Id);
            visual=Instantiate(galleryPrefab?galleryPrefab:Preset.Prefab,transform,false);visual.name=Preset.Name+" exhibition avatar";
            animator=visual.GetComponent<Animator>();
            animator.runtimeAnimatorController=ArenaAvatarMode.Chibi?ArenaAvatarMode.GalleryController(Preset.Id):Resources.Load<RuntimeAnimatorController>("Art/GalleryV21/"+Preset.Id);
            animator.applyRootMotion=false;animator.cullingMode=AnimatorCullingMode.AlwaysAnimate;animator.enabled=true;
            var source=visual.GetComponent<ArenaCombatMotion>();
            if(source)Destroy(source);
            animator.Play("Idle",0,residentIndex/6f);animator.Update(0);
            head=visual.GetComponentsInChildren<Transform>().FirstOrDefault(t=>t.name=="Head");
            var skins=visual.GetComponentsInChildren<SkinnedMeshRenderer>();var bounds=skins[0].bounds;
            // 实拍对照（ta-ab-2026-09-25 face-*）：.48 平光把阴影侧抬到 ~.7，明暗比压到 2:1，正脸无塑形、侧脸下颌顶白。
            // 降到 .28：阴影侧 ≈.48（SH 底 .25 + 填充 .23），塑形交还 6 盏点光软阴影（ArenaGallery.Initialize）。
            var properties=new MaterialPropertyBlock();properties.SetFloat("_GalleryFill",.28f);properties.SetColor("_BaseColor",Color.white);
            foreach(var skin in skins){bounds.Encapsulate(skin.bounds);skin.updateWhenOffscreen=true;skin.SetPropertyBlock(properties);}
            Height=ArenaAvatarMode.Chibi?1.8f:Mathf.Clamp(head?transform.InverseTransformPoint(head.position).y*1.13f:bounds.size.y,1.8f,3.2f);
            strideSpeed=Mathf.Max(.1f,animator.GetFloat("StrideSpeed"));
            walkSpeed=ArenaAvatarMode.Chibi?Mathf.Clamp(strideSpeed*.85f,.3f,.8f):1.2f+residentIndex*.025f;
            if(Agent){Agent.height=Height;Agent.speed=Selected?0:walkSpeed;}
            var collider=GetComponent<CapsuleCollider>();if(collider){collider.height=Height;collider.center=Vector3.up*Height*.5f;}
        }
        public bool Go(Vector3 point,Quaternion facing)
        {
            if(Selected || !Agent.isOnNavMesh)return false;
            var path=new NavMeshPath();
            if(!Agent.CalculatePath(point,path) || path.status!=NavMeshPathStatus.PathComplete)return false;
            restingFacing=facing;Agent.isStopped=false;Agent.speed=walkSpeed;
            if(!Agent.SetPath(path))return false;
            Walking=true;stuck=0;remaining=float.PositiveInfinity;return true;
        }
        public void Inspect(bool selected)
        {
            Selected=selected;inspectBrake=0;
            if(selected && Walking){Agent.speed=0;}
            if(!selected){Stop(false);RestRemaining=8+(float)random.NextDouble()*12;}
        }
        public void FaceObserver(float yaw){restingFacing=Quaternion.Euler(0,yaw,0);}
        void Stop(bool arrived)
        {
            Walking=false;
            if(Agent.isOnNavMesh){Agent.ResetPath();Agent.isStopped=true;}
            if(Selected){Agent.updatePosition=false;Agent.velocity=Vector3.zero;Agent.nextPosition=transform.position;}
            RestRemaining=8+(float)random.NextDouble()*12;stuck=0;
            if(arrived)Arrivals++;
        }
        public void Tick(float motion,float dt)
        {
            if(!Agent.isOnNavMesh)return;
            bool moving=motion>0;
            animator.speed=moving?1:0;Agent.isStopped=!moving || !Walking;
            // isStopped alone still permits avoidance corrections by the navigation system.
            if(!moving){Agent.updatePosition=false;Agent.velocity=Vector3.zero;Agent.nextPosition=transform.position;lastPosition=transform.position;return;}
            if(Selected && !Walking){Agent.updatePosition=false;Agent.velocity=Vector3.zero;Agent.nextPosition=transform.position;}
            else if(!Agent.updatePosition){Agent.nextPosition=transform.position;Agent.updatePosition=true;}
            Clock+=dt;
            float travelled=Vector3.Distance(lastPosition,transform.position);DistanceTravelled+=travelled;lastPosition=transform.position;
            float speed=Agent.velocity.magnitude;
            animator.SetFloat("Speed",speed,.1f,dt);animator.SetFloat("WalkRate",Mathf.Clamp(speed/strideSpeed,.08f,1.2f));
            if(Walking)
            {
                if(Selected){inspectBrake+=dt;if(speed<.035f || inspectBrake>.9f){Stop(false);return;}}
                if(!Selected && !Agent.pathPending && Agent.remainingDistance<=.2f){Stop(true);return;}
                if(!Selected && (Agent.isPathStale || (!Agent.pathPending && Agent.pathStatus!=NavMeshPathStatus.PathComplete))){Recoveries++;Stop(false);Destination=-1;return;}
                if(!Selected)
                {
                    if(Agent.remainingDistance<remaining-.08f){stuck=0;remaining=Agent.remainingDistance;}else stuck+=dt;
                    if(stuck>5){Recoveries++;Stop(false);Destination=-1;return;}
                }
                Vector3 direction=Agent.velocity;
                if(direction.sqrMagnitude>.0025f)transform.rotation=Quaternion.RotateTowards(transform.rotation,Quaternion.LookRotation(direction),140*dt);
            }
            else
            {
                if(!Selected)RestRemaining-=dt;
                transform.rotation=Quaternion.RotateTowards(transform.rotation,restingFacing,65*dt);
            }
        }
    }
}
