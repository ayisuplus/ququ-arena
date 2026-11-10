using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    // Temporary P2 walking control for the separate station graybox scene.
    [RequireComponent(typeof(CharacterController))]
    public sealed class StationGrayboxWalker : MonoBehaviour
    {
        public System.Func<bool> InputBlocked;
        public Camera View;
        public float WalkSpeed = 6;
        public float SprintSpeed = 9;
        public bool ThirdPersonMode;
        public bool CanToggleView;
        public bool MovementLocked;
        public float FollowDistance = 4;
        public GameObject VisibleAvatar;
        CharacterController controller;
        float pitch;
        float fallSpeed;
        StationRotatingRing groundRing;
        Vector3 groundLocalPosition, lastGroundPosition;
        Quaternion groundRotation;
        int carriedFrame = -1;
        readonly RaycastHit[] groundHits = new RaycastHit[16];

        public StationRotatingRing GroundRing => groundRing;

        void Awake()
        {
            controller = GetComponent<CharacterController>();
            // Slow ring displacement can be below the controller's default 1mm cutoff.
            controller.minMoveDistance = 0;
            if (ThirdPersonMode) pitch = 12;
        }

        void Update()
        {
            ApplyGroundMotion();
            if (InputBlocked?.Invoke() == true) return;
            var keyboard = Keyboard.current;
            var mouse = Mouse.current;
            if (keyboard == null) return;
            if (keyboard.escapeKey.wasPressedThisFrame) Cursor.lockState = CursorLockMode.None;
            if (CanToggleView && keyboard.vKey.wasPressedThisFrame)
                ThirdPersonMode = !ThirdPersonMode;
            if (mouse != null && mouse.leftButton.wasPressedThisFrame) Cursor.lockState = CursorLockMode.Locked;
            if (Cursor.lockState == CursorLockMode.Locked && mouse != null && View)
            {
                var delta = mouse.delta.ReadValue();
                transform.Rotate(Vector3.up, delta.x * .12f);
                pitch = Mathf.Clamp(pitch - delta.y * .12f, -80, 80);
                View.transform.localRotation = Quaternion.Euler(pitch, 0, 0);
            }

            if (MovementLocked) return;

            var move = Vector3.zero;
            if (keyboard.wKey.isPressed) move += transform.forward;
            if (keyboard.sKey.isPressed) move -= transform.forward;
            if (keyboard.dKey.isPressed) move += transform.right;
            if (keyboard.aKey.isPressed) move -= transform.right;
            move.y = 0;
            if (move.sqrMagnitude > 1) move.Normalize();
            var speed = keyboard.leftShiftKey.isPressed ? SprintSpeed : WalkSpeed;
            MoveOnGround(move * speed, Time.deltaTime);
        }

        // Also used by runtime route probes, so validation exercises the player movement path.
        public void MoveOnGround(Vector3 velocity, float deltaTime)
        {
            ApplyGroundMotion();
            var anchorRing = groundRing;
            var anchorLocal = groundLocalPosition;
            var anchorWorld = transform.position;
            Physics.SyncTransforms();
            bool wasGrounded = controller.isGrounded || groundRing;
            fallSpeed = controller.isGrounded ? -1 : fallSpeed - 20 * deltaTime;
            controller.Move((velocity + Vector3.up * fallSpeed) * deltaTime);
            // Follow a descending tread within the same step reach used for climbing.
            // A larger drop remains a fall; never snap from an already airborne state.
            if (wasGrounded && fallSpeed <= 0 && !controller.isGrounded)
            {
                var origin = transform.position + Vector3.up * .25f;
                float reach = .25f + controller.stepOffset + controller.skinWidth;
                int count = Physics.RaycastNonAlloc(origin, Vector3.down, groundHits, reach,
                    ~0, QueryTriggerInteraction.Ignore);
                float closest = float.MaxValue;
                for (int i = 0; i < count; i++)
                {
                    var hit = groundHits[i];
                    if (hit.collider != controller && hit.normal.y > .65f && hit.distance < closest)
                        closest = hit.distance;
                }
                if (closest > .25f && closest < float.MaxValue)
                {
                    controller.Move(Vector3.down * (closest - .25f + controller.skinWidth));
                    if (controller.isGrounded) fallSpeed = -1;
                }
            }
            RefreshGroundReference(anchorRing, anchorLocal, anchorWorld);
        }

        public void ResetGroundReference()
        {
            groundRing = null;
            fallSpeed = 0;
            carriedFrame = Time.frameCount;
            RefreshGroundReference();
        }

        void ApplyGroundMotion()
        {
            if (carriedFrame == Time.frameCount || !controller || !controller.enabled) return;
            carriedFrame = Time.frameCount;
            if (!groundRing) return;
            // Interaction or save restoration may teleport the walker between frames.
            if ((transform.position - lastGroundPosition).sqrMagnitude > .01f)
            {
                RefreshGroundReference();
                return;
            }
            Physics.SyncTransforms();
            var target = groundRing.transform.TransformPoint(groundLocalPosition);
            controller.Move(target - transform.position);
            transform.rotation = groundRing.transform.rotation * Quaternion.Inverse(groundRotation) *
                transform.rotation;
            RefreshGroundReference(groundRing, groundLocalPosition, target);
        }

        void RefreshGroundReference(StationRotatingRing anchorRing = null,
            Vector3 anchorLocal = default, Vector3 anchorWorld = default)
        {
            // The capsule may rest on the adjacent higher tread while its centre is over the next one.
            float reach = controller.isGrounded || groundRing
                ? .25f + Mathf.Max(.25f, controller.stepOffset + controller.skinWidth) : .5f;
            groundRing = null;
            var origin = transform.position + Vector3.up * .25f;
            int count = Physics.RaycastNonAlloc(origin, Vector3.down, groundHits, reach,
                ~0, QueryTriggerInteraction.Ignore);
            var hits = groundHits;
            if (count == groundHits.Length)
            {
                hits = Physics.RaycastAll(origin, Vector3.down, reach, ~0, QueryTriggerInteraction.Ignore);
                count = hits.Length;
            }
            // A beveled floor edge can be the first hit, above the actual walkable deck.
            float closest = float.MaxValue;
            for (int i = 0; i < count; i++)
            {
                var hit = hits[i];
                if (hit.collider == controller || hit.normal.y <= .65f || hit.distance >= closest) continue;
                closest = hit.distance;
                groundRing = hit.collider.GetComponentInParent<StationRotatingRing>();
            }
            // The capsule can rest on a ramp/platform corner while its centre ray misses.
            // Keep a valid centre hit (including fixed ground) authoritative at ring seams.
            if (closest == float.MaxValue)
            {
                float radius = Mathf.Max(.01f, controller.radius - controller.skinWidth);
                origin = transform.position + Vector3.up * radius;
                float distance = .25f + controller.skinWidth;
                count = Physics.SphereCastNonAlloc(origin, radius, Vector3.down, groundHits,
                    distance, ~0, QueryTriggerInteraction.Ignore);
                hits = groundHits;
                if (count == groundHits.Length)
                {
                    hits = Physics.SphereCastAll(origin, radius, Vector3.down, distance,
                        ~0, QueryTriggerInteraction.Ignore);
                    count = hits.Length;
                }
                for (int i = 0; i < count; i++)
                {
                    var hit = hits[i];
                    if (hit.collider == controller || hit.normal.y <= .65f || hit.distance >= closest) continue;
                    closest = hit.distance;
                    groundRing = hit.collider.GetComponentInParent<StationRotatingRing>();
                }
            }
            if (!groundRing) return;
            // Preserve the local anchor while carried; repeated world/local round trips
            // otherwise accumulate radial drift at high frame rates. Retain collision residuals.
            groundLocalPosition = groundRing == anchorRing
                ? anchorLocal + groundRing.transform.InverseTransformVector(transform.position - anchorWorld)
                : groundRing.transform.InverseTransformPoint(transform.position);
            lastGroundPosition = transform.position;
            groundRotation = groundRing.transform.rotation;
        }

        void LateUpdate()
        {
            if (!View) return;
            if (VisibleAvatar && VisibleAvatar.activeSelf != ThirdPersonMode)
                VisibleAvatar.SetActive(ThirdPersonMode);
            if (!ThirdPersonMode)
            {
                View.transform.localPosition = new Vector3(0, 1.63f, 0);
                return;
            }
            var pivot = transform.position + Vector3.up * 1.55f;
            var offset = transform.TransformDirection(new Vector3(0, .45f, -FollowDistance));
            var length = offset.magnitude;
            var distance = length;
            foreach (var hit in Physics.SphereCastAll(pivot, .18f, offset.normalized, length,
                         ~0, QueryTriggerInteraction.Ignore))
                if (hit.collider != controller && !hit.collider.transform.IsChildOf(transform))
                    distance = Mathf.Min(distance, Mathf.Max(.55f, hit.distance - .15f));
            View.transform.position = pivot + offset.normalized * distance;
            View.transform.rotation = transform.rotation * Quaternion.Euler(pitch, 0, 0);
        }

        public void Face(Vector3 target)
        {
            if (!View) return;
            var direction = target - View.transform.position;
            var planar = Vector3.ProjectOnPlane(direction, Vector3.up);
            if (planar.sqrMagnitude < .001f) return;
            transform.rotation = Quaternion.LookRotation(planar);
            pitch = Mathf.Clamp(-Mathf.Atan2(direction.y, planar.magnitude) * Mathf.Rad2Deg, -80, 80);
            View.transform.localRotation = Quaternion.Euler(pitch, 0, 0);
        }

        void OnDisable() => Cursor.lockState = CursorLockMode.None;
    }
}
