using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    [Serializable]
    public sealed class StationGreenhouseState
    {
        public string id;
        public int stage, careCount;
    }

    // One repeatable plant-care station in the south public greenhouse.
    public sealed class StationGreenhouseCare : MonoBehaviour
    {
        public StationGrayboxWalker Walker;
        public Transform Foliage;
        public string StableId;
        public string PlaceLabel = "南侧温室";
        public int Stage { get; private set; }
        public int CareCount { get; private set; }
        public event Action StateChanged;

        Vector3 foliageScale;
        GUIStyle promptStyle;

        void Awake()
        {
            foliageScale = Foliage.localScale;
            ApplyVisual();
        }

        void Update()
        {
            if (Keyboard.current?.eKey.wasPressedThisFrame == true) Use();
        }

        public bool Use()
        {
            if (!isActiveAndEnabled || !Walker || !Walker.enabled || !Foliage || Walker.InputBlocked?.Invoke() == true ||
                Vector3.Distance(Walker.transform.position, transform.position) > 3.5f)
                return false;
            if (Stage == 0) Stage = 1;
            else if (Stage == 1) { Stage = 2; CareCount++; }
            else Stage = 0;
            ApplyVisual();
            StateChanged?.Invoke();
            return true;
        }

        public StationGreenhouseState CaptureState() => new StationGreenhouseState {
            id = StableId, stage = Stage, careCount = CareCount
        };

        public bool CanRestore(StationGreenhouseState state) => state != null &&
            state.id == StableId && state.stage >= 0 && state.stage <= 2 &&
            state.careCount >= 0 && state.careCount <= 100000 &&
            (state.stage != 2 || state.careCount > 0);

        public void RestoreState(StationGreenhouseState state)
        {
            if (!CanRestore(state)) throw new ArgumentException("Invalid greenhouse state");
            Stage = state.stage;
            CareCount = state.careCount;
            ApplyVisual();
        }

        void ApplyVisual()
        {
            var scale = foliageScale;
            scale.y *= CareCount > 0 ? 1f : .55f;
            Foliage.localScale = scale;
        }

        void OnGUI()
        {
            if (!Walker || !Walker.enabled || Walker.InputBlocked?.Invoke() == true ||
                Vector3.Distance(Walker.transform.position, transform.position) > 3.5f) return;
            if (promptStyle == null)
            {
                promptStyle = new GUIStyle(GUI.skin.box) { fontSize = 16,
                    alignment = TextAnchor.MiddleCenter };
                promptStyle.normal.textColor = Color.white;
            }
            var action = Stage == 0 ? "E 检查种植枕" : Stage == 1 ?
                "E 补水维护" : "维护完成 · E 开始下一轮巡检";
            var previous = GUI.backgroundColor;
            GUI.backgroundColor = Color.black;
            GUI.Box(new Rect(Screen.width * .5f - 185, Screen.height - 230, 370, 36),
                PlaceLabel + " · " + action, promptStyle);
            GUI.backgroundColor = previous;
        }
    }
}
