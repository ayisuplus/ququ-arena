using UnityEngine;
using UnityEngine.Rendering;

namespace QuQu
{
    // 室内反射探针：盒式、按需渲染一次即冻结，让金属/高光材质映出舱内自身而不是星空天幕。
    // 零烘焙，符合「世界由代码拼装」的架构；每个室内首次激活时只渲一帧。
    public sealed class ArenaInteriorProbe : MonoBehaviour
    {
        ReflectionProbe probe;
        bool rendered;
        public static ArenaInteriorProbe Attach(Transform parent, Vector3 center, Vector3 size)
        {
            var go = new GameObject("Interior reflection probe");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = center;
            var reflection = go.AddComponent<ReflectionProbe>();
            reflection.mode = ReflectionProbeMode.Realtime;
            reflection.refreshMode = ReflectionProbeRefreshMode.ViaScripting;
            reflection.timeSlicingMode = ReflectionProbeTimeSlicingMode.NoTimeSlicing;
            reflection.boxProjection = true;
            reflection.size = size;
            reflection.resolution = 128;
            var self = go.AddComponent<ArenaInteriorProbe>();
            self.probe = reflection;
            return self;
        }
        void LateUpdate()
        {
            // 等同帧所有灯/道具激活完毕后再渲，避免抓到半初始化的舱内
            if (rendered || !probe) return;
            rendered = true;
            probe.RenderProbe();
        }
    }
}
