using UnityEngine;
namespace QuQu
{
    // F10 changes the display, while the same HUD and reading drawer stay in place.
    public class ArenaSpectator : MonoBehaviour
    {
        // P3：只依赖挂载点，不依赖 ArenaGame（组合根传入 UI 根）。
        public void Create(Transform parent){transform.SetParent(parent,false);gameObject.SetActive(false);}
    }
}
