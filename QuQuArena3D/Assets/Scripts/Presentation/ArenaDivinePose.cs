using System;
using UnityEngine;

namespace QuQu
{
    // Stationary, proportion-aware arm choreography. Imported avatars keep their own rig.
    public sealed class ArenaDivinePose : MonoBehaviour
    {
        Transform space, spine, head, left, leftElbow, leftHand, right, rightElbow, rightHand;
        Transform hips, leftLeg, leftKnee, leftFoot, rightLeg, rightKnee, rightFoot;
        Transform[] bones;
        Vector3[] positions;
        Quaternion[] rotations;
        ArenaFighter fighter;
        float height, phase, clock;
        Vector3 faceOffset, cheekOffset, palmOffset;
        Quaternion palmBasis;
        float stanceDrop, stanceBend;
        public float StandingFaceHeight { get; private set; }
        public float StanceFaceDepth { get; private set; }
        public ArenaFighter SlapTarget;
        public float SlapTime=-1, Flinch;
        public float FaceDepth { get; private set; }
        public Vector3 Face => head ? head.TransformPoint(faceOffset) : space.TransformPoint(new Vector3(0,height*.85f,.2f));
        public Vector3 Cheek => head ? head.TransformPoint(faceOffset-cheekOffset) : Face;
        public Vector3 Palm => rightHand ? rightHand.TransformPoint(palmOffset) : space.TransformPoint(new Vector3(.3f,1.7f,.6f));
        public float ContactError { get; private set; }
        public bool Ready => bones != null && head && right && rightElbow && rightHand;

        public void Initialize(ArenaFighter owner, Animator animator)
        {
            fighter = owner; space = owner.BodyRoot;
            var skin = animator.GetComponentInChildren<SkinnedMeshRenderer>();
            if (!skin || !skin.sharedMesh || skin.bones.Length != skin.sharedMesh.bindposes.Length) return;
            var rig = skin.bones; var bind = skin.sharedMesh.bindposes;
            // Prefabs were saved at a sampled animation frame. Recover the actual mesh bind pose.
            var world = new Matrix4x4[rig.Length];
            for (int i=0;i<rig.Length;i++) world[i] = skin.transform.localToWorldMatrix * bind[i].inverse;
            animator.enabled = false;
            var order=System.Linq.Enumerable.OrderBy(System.Linq.Enumerable.Range(0,rig.Length),i=>Depth(rig[i]));
            foreach (int i in order)
            {
                if(owner.Chibi){var scale=world[i].lossyScale;var parent=rig[i].parent.lossyScale;rig[i].localScale=new Vector3(scale.x/parent.x,scale.y/parent.y,scale.z/parent.z);}
                rig[i].position = world[i].GetColumn(3);
                rig[i].rotation = Quaternion.LookRotation(world[i].GetColumn(2),world[i].GetColumn(1));
            }
            bones = rig; positions = new Vector3[rig.Length]; rotations = new Quaternion[rig.Length];
            for (int i=0;i<rig.Length;i++) { positions[i]=rig[i].localPosition; rotations[i]=rig[i].localRotation; }
            Transform Find(string name) => Array.Find(rig,t=>t.name==name);
            spine=Find("Spine02"); head=Find("Head");
            left=Find("LeftArm"); leftElbow=Find("LeftForeArm"); leftHand=Find("LeftHand");
            right=Find("RightArm"); rightElbow=Find("RightForeArm"); rightHand=Find("RightHand");
            hips=Find("Hips");leftLeg=Find("LeftUpLeg");leftKnee=Find("LeftLeg");leftFoot=Find("LeftFoot");rightLeg=Find("RightUpLeg");rightKnee=Find("RightLeg");rightFoot=Find("RightFoot");
            height = owner.Chibi ? 1.8f : head ? space.InverseTransformPoint(head.position).y * 1.13f : 2.5f;
            phase = owner.Home.x;
            if(Ready)MeasureContact(skin);
        }
        void MeasureContact(SkinnedMeshRenderer skin)
        {
            var mesh=new Mesh();skin.BakeMesh(mesh);
            var h=space.InverseTransformPoint(head.position);float front=float.NegativeInfinity,faceY=h.y+.15f;
            foreach(var vertex in mesh.vertices)
            {
                var p=space.InverseTransformPoint(skin.transform.TransformPoint(vertex));
                if(Mathf.Abs(p.x)>(fighter.Chibi?.30f:.14f) || p.y<h.y+.02f || p.y>h.y+(fighter.Chibi?.4f:.25f))continue;
                if(p.z>front){front=p.z;faceY=p.y;}
            }
            if(float.IsNegativeInfinity(front))front=h.z+.18f;
            FaceDepth=front;faceOffset=head.InverseTransformPoint(space.TransformPoint(new Vector3(0,faceY-(fighter.Chibi?.06f:.10f),front-.015f)));
            cheekOffset=head.InverseTransformVector(space.right*(fighter.Chibi?.13f:.085f)*space.lossyScale.x);
            StandingFaceHeight=space.InverseTransformPoint(Face).y;
            var along=(rightHand.position-rightElbow.position).normalized;
            palmOffset=rightHand.InverseTransformVector(along*(fighter.Chibi?.095f:.075f)*space.lossyScale.x);
            palmBasis=Quaternion.Inverse(rightHand.rotation)*Quaternion.LookRotation(along,space.forward);
            if(Application.isPlaying)Destroy(mesh);else DestroyImmediate(mesh);
        }
        void LateUpdate()
        {
            if (!Ready) return;
            if (fighter.Motion > 0) clock += Time.deltaTime;
            ResetBones(); ApplyStance();
            float breath = Mathf.Sin(clock*1.15f+phase)*.35f * Mathf.Clamp01(fighter.Motion);
            if (spine) spine.rotation = Quaternion.AngleAxis(breath + (fighter.Defeated?(fighter.Chibi?5:13):0),space.right) * spine.rotation;
            if (head) head.rotation = Quaternion.AngleAxis(fighter.Defeated?(fighter.Chibi?4:12):0,space.right)*head.rotation;
            if(head && fighter.DuelStance)head.rotation=Quaternion.AngleAxis(fighter.StanceAngle,space.up)*head.rotation;
            if(Flinch>0)
            {
                if(spine)spine.rotation=Quaternion.AngleAxis(-8*Flinch,space.forward)*Quaternion.AngleAxis(-12*Flinch,space.up)*spine.rotation;
                if(head)head.rotation=Quaternion.AngleAxis(-28*Flinch,space.up)*Quaternion.AngleAxis(-7*Flinch,space.forward)*head.rotation;
            }
            if(fighter.Chibi){ChibiArm(left,leftElbow,leftHand);ChibiArm(right,rightElbow,rightHand);}
            else IdleArms();
            if(SlapTime>=0 && SlapTarget)SlapArm();
        }
        void ResetBones(){for(int i=0;i<bones.Length;i++){bones[i].localPosition=positions[i];bones[i].localRotation=rotations[i];}}
        public void FitStance(float otherFaceHeight)
        {
            if(!Ready)return;
            ResetBones();stanceDrop=stanceBend=0;
            if(hips && leftFoot && rightFoot)
            {
                float clearance=otherFaceHeight<StandingFaceHeight*space.lossyScale.x*.75f?.025f:.10f;
                float difference=StandingFaceHeight-otherFaceHeight/space.lossyScale.x-clearance;
                stanceDrop=Mathf.Clamp(difference,0,space.InverseTransformPoint(hips.position).y*.68f);
                if(difference>stanceDrop)
                {
                    // Bend the taller character at the hips, with both feet still planted.
                    float low=0,high=65;
                    for(int i=0;i<10;i++){stanceBend=(low+high)*.5f;ResetBones();ApplyStance();if(space.InverseTransformPoint(Face).y>otherFaceHeight/space.lossyScale.x+clearance)low=stanceBend;else high=stanceBend;}
                }
            }
            ResetBones();ApplyStance();if(head && fighter.DuelStance)head.rotation=Quaternion.AngleAxis(fighter.StanceAngle,space.up)*head.rotation;
            var p=fighter.transform.position;StanceFaceDepth=Vector3.Dot(Face-p,new Vector3(-p.x,0,-p.z).normalized);
        }
        void ApplyStance()
        {
            if(!hips || !leftFoot || !rightFoot || (stanceDrop<=0 && stanceBend<=0))return;
            var l=leftFoot.position;var r=rightFoot.position;var lr=leftFoot.rotation;var rr=rightFoot.rotation;
            hips.position-=space.up*stanceDrop*space.lossyScale.x;
            hips.rotation=Quaternion.AngleAxis(stanceBend,space.right)*hips.rotation;
            Solve(leftLeg,leftKnee,leftFoot,space.InverseTransformPoint(l),space.InverseTransformPoint(l+space.forward));
            Solve(rightLeg,rightKnee,rightFoot,space.InverseTransformPoint(r),space.InverseTransformPoint(r+space.forward));
            leftFoot.rotation=lr;rightFoot.rotation=rr;
        }
        void IdleArms()
        {
            var l = new Vector3(-.25f,.47f,.07f); var r = new Vector3(.25f,.47f,.07f);
            if (fighter.Celebrating) { l=new Vector3(-.34f,.59f,.17f); r=new Vector3(.34f,.59f,.17f); }
            Solve(left,leftElbow,leftHand,l*height,new Vector3(-.65f,.50f,-.35f)*height);
            Solve(right,rightElbow,rightHand,r*height,new Vector3(.65f,.50f,-.35f)*height);
        }
        void SlapArm()
        {
            float wind=Mathf.SmoothStep(0,1,Mathf.Clamp01(SlapTime/.32f));
            float swing=Mathf.SmoothStep(0,1,Mathf.Clamp01((SlapTime-.36f)/.12f));
            float follow=Mathf.SmoothStep(0,1,Mathf.Clamp01((SlapTime-.52f)/.12f));
            float recover=Mathf.SmoothStep(0,1,Mathf.Clamp01((SlapTime-.70f)/.40f));
            var idle=Palm;var contact=SlapTarget.SlapCheek;
            float reach=Vector3.Distance(right.position,rightElbow.position)+Vector3.Distance(rightElbow.position,rightHand.position);
            var wrist=contact-space.up*palmOffset.magnitude*space.lossyScale.x;
            float shortage=Mathf.Max(0,Vector3.Distance(right.position,wrist)-reach*.94f);
            float protract=Mathf.Min(shortage,(fighter.Chibi?.12f:.06f)*space.lossyScale.x)*wind*(1-recover);
            right.position+=space.forward*protract;
            // Transfer the upper body's weight from the waist; the feet stay planted.
            float lean=Mathf.Clamp((shortage-protract)*180,0,fighter.Chibi?22:30)*swing*(1-recover);
            float turn=-20*swing*(1-recover);
            if(spine)spine.rotation=Quaternion.AngleAxis(lean,space.right)*Quaternion.AngleAxis(turn,space.up)*spine.rotation;
            if(head)head.rotation=Quaternion.AngleAxis(-turn*.8f,space.up)*Quaternion.AngleAxis(-lean*.85f,space.right)*head.rotation;
            var raised=right.position+space.right*reach*.92f+space.up*reach*.5f;
            var goal=Vector3.Lerp(Vector3.Lerp(idle,raised,wind),contact,swing);
            goal+=(-space.right*.15f+space.forward*.04f)*follow*space.lossyScale.x;
            goal=Vector3.Lerp(goal,idle,recover);
            var acrossFace=-Vector3.Cross(Vector3.up,SlapTarget.transform.position-fighter.transform.position).normalized;
            var rotation=Quaternion.LookRotation(space.up,acrossFace)*Quaternion.Inverse(palmBasis);
            var offset=rotation*Vector3.Scale(palmOffset,rightHand.lossyScale);
            Solve(right,rightElbow,rightHand,space.InverseTransformPoint(goal-offset),space.InverseTransformPoint(right.position+space.right*reach+space.up*.06f));
            rightHand.rotation=rotation;
            ContactError=Vector3.Distance(Palm,contact);
        }
        static int Depth(Transform bone){int n=0;while(bone.parent){n++;bone=bone.parent;}return n;}
        void ChibiArm(Transform upper,Transform elbow,Transform hand)
        {
            if(!upper || !elbow || !hand)return;
            var start=space.InverseTransformPoint(upper.position);
            float side=Mathf.Sign(start.x),reach=(Vector3.Distance(upper.position,elbow.position)+Vector3.Distance(elbow.position,hand.position))/space.lossyScale.x;
            var direction=new Vector3(side*.55f,-.74f,.09f);
            if(fighter.Celebrating)direction=new Vector3(side*.92f,.14f,.10f);
            Solve(upper,elbow,hand,start+direction*reach,start+new Vector3(side*reach,-.2f,-.4f));
        }
        void Solve(Transform upper,Transform elbow,Transform hand,Vector3 target,Vector3 pole)
        {
            if (!upper || !elbow || !hand) return;
            var end=space.TransformPoint(target); var start=upper.position;
            float a=Vector3.Distance(start,elbow.position), b=Vector3.Distance(elbow.position,hand.position);
            float d=Mathf.Clamp(Vector3.Distance(start,end),Mathf.Abs(a-b)+.001f,a+b-.002f);
            var direction=(end-start).normalized; end=start+direction*d;
            var side=Vector3.ProjectOnPlane(space.TransformPoint(pole)-start,direction).normalized;
            float along=(a*a+d*d-b*b)/(2*d), across=Mathf.Sqrt(Mathf.Max(0,a*a-along*along));
            var bend=start+direction*along+side*across;
            upper.rotation=Quaternion.FromToRotation(elbow.position-start,bend-start)*upper.rotation;
            elbow.rotation=Quaternion.FromToRotation(hand.position-elbow.position,end-elbow.position)*elbow.rotation;
        }
    }
}
