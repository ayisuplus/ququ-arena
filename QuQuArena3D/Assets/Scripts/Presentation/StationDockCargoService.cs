using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    [Serializable]
    public sealed class StationDockCargoState
    {
        public string id;
        public int version;
        public float progress;
        public float z;
        public bool atInspection, moving, towardInspection, inspected, completed;
    }

    // A local dock work order; cargo inventory is later work.
    public sealed class StationDockCargoService : MonoBehaviour
    {
        public StationGrayboxWalker Walker;
        public Transform Cargo;
        public string StableId;
        public string BayLabel;
        public float InspectionZ = 190;
        // Translation from the previous authored dock; used only for legacy world-Z saves.
        public float LegacyZOffset;
        public float Speed = 4;
        public event Action StateChanged;

        public bool AtInspection { get; private set; }
        public bool Moving { get; private set; }
        public bool Blocked { get; private set; }
        public bool Inspected { get; private set; }
        public bool Completed { get; private set; }

        float parkedZ;
        bool towardInspection;
        Collider cargoCollider;
        GUIStyle promptStyle;

        void Awake()
        {
            parkedZ = Cargo.position.z;
            cargoCollider = Cargo.GetComponent<Collider>();
        }

        void Update()
        {
            if (Moving)
            {
                var target = Cargo.position;
                target.z = towardInspection ? InspectionZ : parkedZ;
                var next = Vector3.MoveTowards(Cargo.position, target, Speed * Time.deltaTime);
                var player = Walker.transform.position;
                Blocked = Mathf.Abs(player.x - next.x) < 3 &&
                    Mathf.Abs(player.z - next.z) < 3 && Mathf.Abs(player.y) < 3;
                if (Blocked) return;
                Cargo.position = next;
                if (Mathf.Abs(Cargo.position.z - target.z) < .01f)
                {
                    Cargo.position = target;
                    AtInspection = towardInspection;
                    Moving = false;
                    Blocked = false;
                    if (!AtInspection) Completed = Inspected;
                    StateChanged?.Invoke();
                }
            }
            if (Keyboard.current?.eKey.wasPressedThisFrame == true)
            {
                if (AtInspection && !Inspected && NearCargo()) Inspect();
                else Use();
            }
        }

        public bool Use()
        {
            if (!isActiveAndEnabled || !Walker || !Walker.enabled || !Cargo || Moving || (AtInspection && !Inspected) ||
                Walker.InputBlocked?.Invoke() == true ||
                Vector3.Distance(Walker.transform.position, transform.position) > 3.5f)
                return false;
            if (!AtInspection)
            {
                Inspected = false;
                Completed = false;
            }
            towardInspection = !AtInspection;
            Moving = true;
            StateChanged?.Invoke();
            return true;
        }

        public bool Inspect()
        {
            if (!isActiveAndEnabled || !Walker || !Walker.enabled || !AtInspection || Moving || Inspected || !NearCargo() ||
                Walker.InputBlocked?.Invoke() == true) return false;
            Inspected = true;
            StateChanged?.Invoke();
            return true;
        }

        public StationDockCargoState CaptureState() => new StationDockCargoState {
            id = StableId, version = 1, progress = Mathf.InverseLerp(parkedZ, InspectionZ, Cargo.position.z),
            z = Cargo.position.z, atInspection = AtInspection,
            moving = Moving, towardInspection = towardInspection,
            inspected = Inspected, completed = Completed
        };

        public bool IsInTravelLane(Vector3 position) => Cargo &&
            Mathf.Abs(position.x - Cargo.position.x) < 3 && Mathf.Abs(position.y) < 3 &&
            position.z > Mathf.Min(parkedZ, InspectionZ) - 2 &&
            position.z < Mathf.Max(parkedZ, InspectionZ) + 2;

        public bool CanRestore(StationDockCargoState state)
        {
            if (state == null || state.id != StableId || (state.version != 0 && state.version != 1) ||
                float.IsNaN(state.z) || float.IsInfinity(state.z)) return false;
            if (state.version == 1 && (float.IsNaN(state.progress) || float.IsInfinity(state.progress) ||
                state.progress < 0 || state.progress > 1)) return false;
            float z = SavedZ(state);
            if (z < Mathf.Min(parkedZ, InspectionZ) - .01f ||
                z > Mathf.Max(parkedZ, InspectionZ) + .01f) return false;
            if (state.moving)
                return !state.completed && (state.towardInspection
                    ? !state.atInspection && !state.inspected
                    : state.atInspection && state.inspected);
            if (state.atInspection)
                return state.towardInspection && !state.completed &&
                    Mathf.Abs(z - InspectionZ) < .01f;
            return !state.towardInspection && !state.moving &&
                state.completed == state.inspected && Mathf.Abs(z - parkedZ) < .01f;
        }

        float SavedZ(StationDockCargoState state) => state.version == 0 ? state.z + LegacyZOffset :
            Mathf.Lerp(parkedZ, InspectionZ, state.progress);

        public void RestoreState(StationDockCargoState state)
        {
            if (!CanRestore(state)) throw new ArgumentException("Invalid dock cargo state");
            var position = Cargo.position;
            position.z = SavedZ(state);
            Cargo.position = position;
            AtInspection = state.atInspection;
            Moving = state.moving;
            towardInspection = state.towardInspection;
            Inspected = state.inspected;
            Completed = state.completed;
            Blocked = false;
        }

        bool NearCargo()
        {
            if (!Walker || !cargoCollider) return false;
            var eye = Walker.transform.position + Vector3.up * 1.5f;
            return Vector3.Distance(eye, cargoCollider.ClosestPoint(eye)) < 2.5f;
        }

        void OnGUI()
        {
            if (!Walker || Walker.InputBlocked?.Invoke() == true) return;
            if (AtInspection && NearCargo())
            {
                DrawPrompt(BayLabel + "货台 · " + (Inspected ? "检查完成，请回控制台" :
                    "E 检查货箱固定状态"));
                return;
            }
            if (Vector3.Distance(Walker.transform.position, transform.position) > 3.5f) return;
            var action = Blocked ? "通道占用，货台暂停" :
                Moving ? "货台运行中" : AtInspection ?
                (Inspected ? "E 送回泊位" : "请到货箱旁检查") :
                Completed ? "检修工单完成 · E 开始新工单" : "E 开始检修工单";
            DrawPrompt(BayLabel + "货台 · " + action);
        }

        void DrawPrompt(string message)
        {
            if (promptStyle == null)
            {
                promptStyle = new GUIStyle(GUI.skin.box) { fontSize = 16,
                    alignment = TextAnchor.MiddleCenter };
                promptStyle.normal.textColor = Color.white;
            }
            var previous = GUI.backgroundColor;
            GUI.backgroundColor = Color.black;
            GUI.Box(new Rect(Screen.width * .5f - 185, Screen.height - 185, 370, 36),
                message, promptStyle);
            GUI.backgroundColor = previous;
        }
    }
}
