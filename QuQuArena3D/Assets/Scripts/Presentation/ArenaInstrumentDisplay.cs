using UnityEngine;

namespace QuQu
{
    // Decorative orbital diagrams share the presentation clock, including the motion-off setting.
    public sealed class ArenaInstrumentDisplay : MonoBehaviour
    {
        ArenaLightShow source;
        Renderer surface;
        MaterialPropertyBlock values;
        void OnEnable()
        {
            source=FindFirstObjectByType<ArenaLightShow>();surface=GetComponent<Renderer>();
            values ??= new MaterialPropertyBlock();
        }
        void LateUpdate()
        {
            if(!source || !surface)return;
            values.SetFloat("_Clock",source.Clock);surface.SetPropertyBlock(values);
        }
    }
}
