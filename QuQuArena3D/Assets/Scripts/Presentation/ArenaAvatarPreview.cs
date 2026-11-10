using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.Rendering.Universal;

namespace QuQu
{
    public class ArenaAvatarPreview : MonoBehaviour, IDragHandler
    {
        ArenaFighter fighter;
        Transform studio, model, source;
        RenderTexture texture;
        Camera previewCamera;
        float yaw;
        int signature;
        public void Initialize(ArenaFighter target, Camera arenaCamera)
        {
            fighter = target;
            const int layer = 30;
            arenaCamera.cullingMask &= ~(1 << layer);
            studio = new GameObject("Avatar preview studio").transform;
            studio.position = new Vector3(0,-1000,0);
            var camera = new GameObject("Preview camera").AddComponent<Camera>(); previewCamera = camera;
            camera.transform.SetParent(studio,false);
            camera.transform.localPosition = new Vector3(0,1.65f,6.3f);
            camera.transform.LookAt(studio.position + Vector3.up * 1.65f);
            camera.fieldOfView = 38; camera.nearClipPlane = .1f; camera.farClipPlane = 20;
            camera.cullingMask = 1 << layer; camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = new Color(.035f,.06f,.078f);
            camera.GetUniversalAdditionalCameraData().renderPostProcessing = false;
            camera.allowMSAA = true;
            texture = new RenderTexture(1000,1200,24) { antiAliasing = 4 }; texture.Create(); camera.targetTexture = texture;
            GetComponent<UnityEngine.UI.RawImage>().texture = texture;
            var fill = new GameObject("Preview fill").AddComponent<Light>(); fill.transform.SetParent(studio,false);
            fill.transform.localPosition = new Vector3(2,3,3); fill.type=LightType.Point;
            fill.intensity=35; fill.range=10; fill.cullingMask=1 << layer;
            RefreshModel();
        }
        int Signature()
        {
            int value = fighter.BodyRoot.childCount;
            foreach (Transform child in fighter.BodyRoot) value = unchecked(value * 31 + child.GetInstanceID() + (child.gameObject.activeSelf ? 1 : 0));
            return value;
        }
        void RefreshModel()
        {
            if(model) { model.gameObject.SetActive(false); Destroy(model.gameObject); }
            source = fighter.BodyRoot; signature = Signature();
            model = Instantiate(source,studio,false); model.localPosition = Vector3.zero;
            foreach (var item in model.GetComponentsInChildren<Transform>(true)) item.gameObject.layer = 30;
            foreach (var camera in model.GetComponentsInChildren<Camera>(true)) camera.enabled = false;
            var animator = model.GetComponentInChildren<Animator>();
            if(animator && animator.HasState(0,Animator.StringToHash("Idle"))) animator.Play("Idle");
        }
        void LateUpdate()
        {
            if(!fighter || !fighter.BodyRoot) return;
            if(source != fighter.BodyRoot || signature != Signature()) RefreshModel();
            model.localScale = fighter.BodyRoot.localScale;
            model.localRotation = Quaternion.Euler(0,yaw,0);
            float scale = fighter.BodyRoot.localScale.y;
            previewCamera.transform.localPosition = new Vector3(0,1.25f*scale,4.6f*scale);
            previewCamera.transform.LookAt(studio.position + Vector3.up * (1.25f*scale));
        }
        public void OnDrag(PointerEventData data) { yaw -= data.delta.x * .5f; }
        void OnDestroy()
        {
            if(studio) { studio.gameObject.SetActive(false); Destroy(studio.gameObject); }
            if(texture) { texture.Release(); Destroy(texture); }
        }
    }
}
