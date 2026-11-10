using UnityEngine;
using UnityEngine.Rendering;

namespace QuQu
{
    // The finite lens and disk sit below the station; distant stars remain in the skybox.
    public class ArenaSingularity : MonoBehaviour
    {
        ArenaStage stage;
        Material material;
        public float Clock => material ? material.GetFloat("_ShowTime") : 0;
        // 0 = resolve from the device; anything above that pins the integration step count.
        public static int StepBudgetOverride = 0;
        public static int ResolveStepBudget()
        {
            if (StepBudgetOverride >= 16) return StepBudgetOverride;
            int memory = SystemInfo.graphicsMemorySize;
            long pixels = (long)Mathf.Max(Screen.width, 1) * Mathf.Max(Screen.height, 1);
            if (memory > 0 && memory < 4096) return 48;      // small VRAM: half the marching
            if (pixels > 4000000L) return 72;                // 4K-class output: trim first
            return 112;                                      // unchanged default for desktop GPUs
        }
        public void Create(ArenaStage owner)
        {
            stage=owner;
            transform.localPosition=new Vector3(0,-85,175);
            material=new Material(Shader.Find("QuQu/Spatial Singularity"));
            material.SetFloat("_Radius",18);
            material.SetFloat("_StepBudget",ResolveStepBudget());
            var volume=ArenaStage.Shape(transform,"World-space lens and plasma volume",PrimitiveType.Cube,Vector3.zero,Vector3.one*468,material);
            var renderer=volume.GetComponent<Renderer>();
            renderer.shadowCastingMode=ShadowCastingMode.Off;renderer.receiveShadows=false;
        }
        void LateUpdate(){if(stage && stage.LightShow)material.SetFloat("_ShowTime",stage.LightShow.Clock);}
        void OnDestroy(){if(material)Destroy(material);}
    }
}
