using UnityEngine;

namespace QuQu
{
    [RequireComponent(typeof(Renderer))]
    public sealed class StationSingularityClock : MonoBehaviour
    {
        Renderer target;
        MaterialPropertyBlock properties;

        void Awake()
        {
            target = GetComponent<Renderer>();
            properties = new MaterialPropertyBlock();
            Shader.SetGlobalFloat("_ArenaStarBrightness", 2);
        }

        void Update()
        {
            properties ??= new MaterialPropertyBlock();
            target.GetPropertyBlock(properties);
            properties.SetFloat("_ShowTime", Time.time);
            target.SetPropertyBlock(properties);
        }
    }
}
