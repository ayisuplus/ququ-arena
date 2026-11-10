using System;
using UnityEngine;

namespace QuQu
{
    // Stationary, proportion-aware arm choreography. Imported avatars keep their own rig.
    public sealed class ArenaDivinePose : MonoBehaviour
    {
        Transform space, spine, head, left, leftElbow, leftHand, right, rightElbow, rightHand;
        Transform[] bones;
        Vector3[] positions;
        Quaternion[] rotations;
        ArenaFighter fighter;
        float height, phase, clock;
        public float Charge, Release, Guard, Recoil;
        public int Variant;
        public Vector3 Hand => rightHand ? rightHand.position : space.TransformPoint(new Vector3(.3f,1.7f,.6f));
        public bool Ready => bones != null;

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
            for (int i=0;i<rig.Length;i++)
            {
                rig[i].position = world[i].GetColumn(3);
                rig[i].rotation = Quaternion.LookRotation(world[i].GetColumn(2),world[i].GetColumn(1));
            }
            bones = rig; positions = new Vector3[rig.Length]; rotations = new Quaternion[rig.Length];
            for (int i=0;i<rig.Length;i++) { positions[i]=rig[i].localPosition; rotations[i]=rig[i].localRotation; }
            Transform Find(string name) => Array.Find(rig,t=>t.name==name);
            spine=Find("Spine02"); head=Find("Head");
            left=Find("LeftArm"); leftElbow=Find("LeftForeArm"); leftHand=Find("LeftHand");
            right=Find("RightArm"); rightElbow=Find("RightForeArm"); rightHand=Find("RightHand");
            height = head ? space.InverseTransformPoint(head.position).y * 1.13f : 2.5f;
            phase = owner.Home.x;
        }
        void LateUpdate()
        {
            if (!Ready) return;
            if (fighter.Motion > 0) clock += Time.deltaTime;
            for (int i=0;i<bones.Length;i++) { bones[i].localPosition=positions[i]; bones[i].localRotation=rotations[i]; }
            float breath = Mathf.Sin(clock*1.15f+phase)*.35f * Mathf.Clamp01(fighter.Motion);
            if (spine) spine.rotation = Quaternion.AngleAxis(breath-Recoil*7 + (fighter.Defeated?13:0),space.right) * spine.rotation;
            if (head) head.rotation = Quaternion.AngleAxis(-Charge*4+(fighter.Defeated?12:0),space.right)*head.rotation;
            var l = new Vector3(-.25f,.47f,.07f); var r = new Vector3(.25f,.47f,.07f);
            var raised = Variant%3==1 ? new Vector3(.26f,.95f,.13f) : new Vector3(.24f,.73f,.31f);
            r=Vector3.Lerp(r,raised,Charge);
            r=Vector3.Lerp(r,new Vector3(.10f,.69f,.55f),Release);
            l=Vector3.Lerp(l,new Vector3(-.23f,Variant%3==2?.76f:.58f,.26f),Charge);
            l=Vector3.Lerp(l,new Vector3(-.28f,.66f,.37f),Release*.6f);
            r=Vector3.Lerp(r,new Vector3(.19f,.73f,.35f),Guard);
            l=Vector3.Lerp(l,new Vector3(-.19f,.73f,.35f),Guard);
            if (fighter.Celebrating) { l=new Vector3(-.34f,.59f,.17f); r=new Vector3(.34f,.59f,.17f); }
            Solve(left,leftElbow,leftHand,l*height,new Vector3(-.65f,.50f,-.35f)*height);
            Solve(right,rightElbow,rightHand,r*height,new Vector3(.65f,.50f,-.35f)*height);
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
