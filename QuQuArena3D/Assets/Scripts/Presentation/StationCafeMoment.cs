using System;
using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    [Serializable]
    public sealed class StationCafeState
    {
        public string id;
        public int served, drunk;
        public bool holding;
    }

    // A counter and seats form one short daily stop.
    public sealed class StationCafeMoment : MonoBehaviour
    {
        public StationGrayboxWalker Walker;
        public Transform Counter;
        public Transform[] Seats;
        public string StableId;
        public Transform SeatedViewTarget;
        public bool UseSeatFacing;
        public string PlaceLabel;
        public bool HoldingDrink { get; private set; }
        public int ServedCount { get; private set; }
        public int DrunkCount { get; private set; }
        public int SeatedSeatIndex { get; private set; } = -1;
        public event Action StateChanged;
        public Func<int, bool> SeatAvailable;

        StationSpectatorCamera cameraModes;
        bool cameraModesWasEnabled, avatarWasActive;
        Vector3 standingViewLocalPosition;
        Quaternion standingViewLocalRotation;
        GUIStyle promptStyle;

        void Update()
        {
            if (Keyboard.current?.eKey.wasPressedThisFrame == true) Use();
        }

        void LateUpdate()
        {
            if (SeatedSeatIndex < 0 || !Walker || !Walker.View) return;
            Walker.MoveOnGround(Vector3.zero, Time.deltaTime);
            UpdateSeatedView();
        }

        void UpdateSeatedView()
        {
            var seat = Seats[SeatedSeatIndex];
            Walker.View.transform.position = seat.position + Vector3.up * 1.25f;
            Walker.View.transform.LookAt(UseSeatFacing ? seat.position +
                seat.forward * 5f + Vector3.up * 1.25f : SeatedViewTarget ? SeatedViewTarget.position :
                new Vector3(80, 1.2f, 49));
        }

        public bool Use()
        {
            if (!isActiveAndEnabled || !Walker || !Counter || Seats == null ||
                Walker.InputBlocked?.Invoke() == true) return false;
            if (SeatedSeatIndex >= 0)
            {
                if (HoldingDrink)
                {
                    HoldingDrink = false;
                    DrunkCount++;
                    StateChanged?.Invoke();
                    return true;
                }
                return Stand();
            }
            if (!Walker.enabled) return false;
            if (!HoldingDrink && Vector3.Distance(Walker.transform.position, Counter.position) < 3.5f)
            {
                HoldingDrink = true;
                ServedCount++;
                StateChanged?.Invoke();
                return true;
            }
            var nearest = -1;
            var distance = 2.1f;
            for (var i = 0; i < Seats.Length; i++)
            {
                if (!Seats[i] || SeatAvailable?.Invoke(i) == false) continue;
                var gap = Vector3.Distance(Walker.transform.position, Seats[i].position);
                if (gap >= distance) continue;
                nearest = i;
                distance = gap;
            }
            if (nearest < 0 || !Walker.View) return false;
            cameraModes = Walker.View.GetComponent<StationSpectatorCamera>();
            if (cameraModes && (cameraModes.CloseUp || cameraModes.Flying)) return false;
            cameraModesWasEnabled = cameraModes && cameraModes.enabled;
            avatarWasActive = Walker.VisibleAvatar && Walker.VisibleAvatar.activeSelf;
            standingViewLocalPosition = Walker.View.transform.localPosition;
            standingViewLocalRotation = Walker.View.transform.localRotation;
            SeatedSeatIndex = nearest;
            if (cameraModes) cameraModes.enabled = false;
            Walker.ResetGroundReference();
            Walker.enabled = false;
            if (Walker.VisibleAvatar) Walker.VisibleAvatar.SetActive(false);
            UpdateSeatedView();
            return true;
        }

        public bool Stand()
        {
            if (SeatedSeatIndex < 0 || !Walker) return false;
            if (Walker.gameObject.activeInHierarchy && Walker.GetComponent<CharacterController>().enabled)
            {
                Walker.MoveOnGround(Vector3.zero, 0);
                Walker.ResetGroundReference();
            }
            SeatedSeatIndex = -1;
            if (Walker.VisibleAvatar) Walker.VisibleAvatar.SetActive(avatarWasActive);
            Walker.enabled = true;
            if (cameraModes) cameraModes.enabled = cameraModesWasEnabled;
            if (Walker.View)
            {
                Walker.View.transform.localPosition = standingViewLocalPosition;
                Walker.View.transform.localRotation = standingViewLocalRotation;
            }
            return true;
        }

        public StationCafeState CaptureState() => new StationCafeState {
            id = StableId, served = ServedCount, drunk = DrunkCount, holding = HoldingDrink
        };

        public bool CanRestore(StationCafeState state) => state != null &&
            state.id == StableId && state.drunk >= 0 && state.served >= state.drunk &&
            state.served <= 100000 && state.served - state.drunk == (state.holding ? 1 : 0);

        public void RestoreState(StationCafeState state)
        {
            if (!CanRestore(state)) throw new ArgumentException("Invalid cafe state");
            ServedCount = state.served;
            DrunkCount = state.drunk;
            HoldingDrink = state.holding;
        }

        void OnDisable() { if (SeatedSeatIndex >= 0) Stand(); }

        void OnGUI()
        {
            if (!Walker || !Counter || Seats == null || Walker.InputBlocked?.Invoke() == true) return;
            var place = string.IsNullOrWhiteSpace(PlaceLabel) ? "东侧客厅" : PlaceLabel;
            string prompt = null;
            if (SeatedSeatIndex >= 0)
                prompt = HoldingDrink ? place + " · E 饮用热饮" : place + " · E 离座";
            else if (Vector3.Distance(Walker.transform.position, Counter.position) < 3.5f)
                prompt = HoldingDrink ? "饮品已取 · 可去共享桌入座" : place + " · E 取一杯热饮";
            else
                for (int i = 0; i < Seats.Length; i++)
                    if (Seats[i] && SeatAvailable?.Invoke(i) != false &&
                        Vector3.Distance(Walker.transform.position, Seats[i].position) < 2.1f)
                    { prompt = place + " · E 入座观景"; break; }
            if (prompt == null) return;
            if (promptStyle == null)
            {
                promptStyle = new GUIStyle(GUI.skin.box) { fontSize = 16,
                    alignment = TextAnchor.MiddleCenter };
                promptStyle.normal.textColor = Color.white;
            }
            var previous = GUI.backgroundColor;
            GUI.backgroundColor = Color.black;
            GUI.Box(new Rect(Screen.width * .5f - 185, Screen.height - 275, 370, 36),
                prompt, promptStyle);
            GUI.backgroundColor = previous;
        }
    }
}
