using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    // Resolve nearby reading panels before the other E-key activities.
    [DefaultExecutionOrder(-100)]
    public abstract class StationReadingPanel : MonoBehaviour
    {
        public StationGrayboxWalker Walker;
        public bool IsOpen { get; private set; }
        protected virtual bool CanRead => true;
        static readonly List<StationReadingPanel> panels = new List<StationReadingPanel>();
        static int inputFrame = -1;
        bool previousMovementLocked, previousHudEnabled, previousCursorVisible;
        CursorLockMode previousCursorLock;
        StationMatchHUD hud;
        System.Func<bool> previousInput, blocker;
        int releaseFrame = -1;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.SubsystemRegistration)]
        static void ResetInput() { inputFrame = -1; }

        protected void OnEnable() { if (!panels.Contains(this)) panels.Add(this); }

        protected bool InReach() => isActiveAndEnabled && Walker && Walker.isActiveAndEnabled &&
            Vector3.Distance(Walker.transform.position, transform.position) <= 3.5f;

        bool Nearest()
        {
            if (!InReach() || !CanRead) return false;
            float distance = (Walker.transform.position - transform.position).sqrMagnitude;
            foreach (var other in panels)
            {
                if (!other || other == this || other.Walker != Walker || !other.CanRead || !other.InReach()) continue;
                float candidate = (Walker.transform.position - other.transform.position).sqrMagnitude;
                if (candidate < distance || (candidate == distance &&
                    string.CompareOrdinal(other.name, name) < 0)) return false;
            }
            return true;
        }

        protected bool ShowPanel => InReach() && (IsOpen ||
            (Walker.InputBlocked?.Invoke() != true && Nearest()));

        protected void Update()
        {
            if (IsOpen && !InReach()) Close();
            if (IsOpen && Keyboard.current?.escapeKey.wasPressedThisFrame == true) Close();
            else if (inputFrame != Time.frameCount && Keyboard.current?.eKey.wasPressedThisFrame == true &&
                (IsOpen || Nearest()) && Use()) inputFrame = Time.frameCount;
        }

        public bool Use()
        {
            if (!InReach() || !CanRead) return false;
            if (IsOpen) { Close(); return true; }
            if (Walker.InputBlocked?.Invoke() == true) return false;
            previousMovementLocked = Walker.MovementLocked;
            previousInput = Walker.InputBlocked;
            var inheritedInput = previousInput;
            blocker = () => IsOpen || Time.frameCount == releaseFrame || inheritedInput?.Invoke() == true;
            Walker.InputBlocked = blocker;
            Walker.MovementLocked = true;
            hud = FindFirstObjectByType<StationMatchHUD>();
            if (hud) { previousHudEnabled = hud.enabled; hud.enabled = false; }
            previousCursorLock = Cursor.lockState;
            previousCursorVisible = Cursor.visible;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            IsOpen = true;
            OnOpened();
            return true;
        }

        protected virtual void OnOpened() { }
        protected virtual void OnClosed() { }

        void Close()
        {
            IsOpen = false;
            OnClosed();
            releaseFrame = Time.frameCount;
            inputFrame = Time.frameCount;
            if (Walker)
            {
                Walker.MovementLocked = previousMovementLocked;
                // Keep this E/Esc consumed through every other Update, including on disable.
                if (Walker.gameObject.activeInHierarchy)
                    Walker.StartCoroutine(ReleaseInput(Walker, blocker, previousInput));
                else if (Walker.InputBlocked == blocker) Walker.InputBlocked = previousInput;
            }
            if (hud) hud.enabled = previousHudEnabled;
            Cursor.lockState = previousCursorLock;
            Cursor.visible = previousCursorVisible;
        }

        static IEnumerator ReleaseInput(StationGrayboxWalker walker, System.Func<bool> owned, System.Func<bool> prior)
        {
            yield return new WaitForEndOfFrame();
            if (walker && walker.InputBlocked == owned) walker.InputBlocked = prior;
        }

        protected void OnDisable() { if (IsOpen) Close(); panels.Remove(this); }
    }
}
