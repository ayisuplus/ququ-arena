using System;
using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    [Serializable]
    public sealed class StationResidentState
    {
        public string id;
        public int version;
        public float segmentFraction;
        public Vector3 position;
        public int targetIndex, visits, returns;
        public bool outbound, inLounge;
        public float waitRemaining;
    }

    // Station residents follow authored routes from their rooms.
    [RequireComponent(typeof(CharacterController))]
    public sealed class StationResidentRoutine : MonoBehaviour
    {
        public string ResidentId;
        public string PresetId;
        public StationRoomIdentity Room;
        public StationGrayboxWalker Walker;
        public ArenaStationLiveMatch Match;
        public Vector3[] Route;
        public StationResidentPath MovingPath;
        public string DestinationName;
        public string DestinationAction, DestinationActivity = "休息";
        public float InitialWait;
        public float WalkSpeed = 1.3f;
        public RuntimeAnimatorController RestController, ChibiRestController;
        public StationCafeMoment Cafe;
        public float DestinationFacing = 270, DestinationPause = 18;
        public bool InLounge { get; private set; }
        public int LoungeVisits { get; private set; }
        public int HomeReturns { get; private set; }
        public int SpokenCount { get; private set; }
        public bool Visible => visual && visual.activeSelf;

        CharacterController body;
        GameObject visual;
        Animator animator;
        int targetIndex;
        bool outbound = true;
        float waitRemaining, talkUntil;
        GUIStyle promptStyle;
        StationResidentState pendingRestore;
        string restAnimation;
        float sitDownLength, standUpLength;
        float passingRemaining;
        readonly RaycastHit[] peopleAhead = new RaycastHit[8];

        int RouteLength => MovingPath ? MovingPath.Points.Length : Route.Length;
        Vector3 Point(int index) => MovingPath ? MovingPath.Point(index) : Route[index];
        Quaternion DestinationRotation => MovingPath ? MovingPath.Facing(DestinationFacing) : Quaternion.Euler(0, DestinationFacing, 0);

        IEnumerator Start()
        {
            yield return null; // The match selects the saved avatar mode in Start.
            if (MovingPath) MovingPath.Initialize();
            if (!Room || Room.ResidentId != ResidentId ||
                Room.RoomId != "room/" + ResidentId ||
                ResidentId != "resident/" + PresetId || !Walker || !Match ||
                ArenaModelPresets.Find(PresetId) == null ||
                Route == null || Route.Length < 2 ||
                Vector3.Distance(transform.position, Point(0)) > .3f)
                throw new InvalidOperationException("Station resident route or identity is missing");
            var prefab = ArenaAvatarMode.Chibi ? ArenaAvatarMode.GalleryPrefab(PresetId)
                : Resources.Load<GameObject>("Art/GalleryV21/Avatars/" + PresetId);
            var controller = ArenaAvatarMode.Chibi ? ArenaAvatarMode.GalleryController(PresetId)
                : Resources.Load<RuntimeAnimatorController>("Art/GalleryV21/" + PresetId);
            var restController = ArenaAvatarMode.Chibi ? ChibiRestController : RestController;
            if (restController) controller = restController;
            if (!prefab || !controller)
                throw new InvalidOperationException("Station resident avatar is missing: " + PresetId);
            visual = Instantiate(prefab, transform, false);
            visual.name = PresetId + " station resident avatar";
            animator = visual.GetComponent<Animator>();
            if (!animator) throw new InvalidOperationException("Station resident animator is missing");
            animator.runtimeAnimatorController = controller;
            animator.applyRootMotion = false;
            if (restController)
                foreach (var clip in controller.animationClips)
                {
                    if (clip.name == "SeatDown") sitDownLength = clip.length;
                    if (clip.name == "StandUp") standUpLength = clip.length;
                }
            var combat = visual.GetComponent<ArenaCombatMotion>();
            if (combat) { combat.enabled = false; Destroy(combat); }
            animator.Play("Idle", 0, 0);
            body = GetComponent<CharacterController>();
            if (Cafe) Cafe.SeatAvailable = SeatAvailable;
            targetIndex = 1;
            waitRemaining = InitialWait;
            if (pendingRestore != null)
            {
                ApplyState(pendingRestore);
                pendingRestore = null;
            }
            Advance(0);
        }

        public StationResidentState CaptureState() => pendingRestore ?? new StationResidentState {
            id = ResidentId, version = MovingPath ? 1 : 0, position = transform.position, targetIndex = visual ? targetIndex : 1,
            segmentFraction = MovingPath ? MovingPath.Fraction(visual ? targetIndex : 1, outbound, transform.position) : 0,
            outbound = outbound, inLounge = InLounge, waitRemaining = visual ? waitRemaining : InitialWait,
            visits = LoungeVisits, returns = HomeReturns
        };

        public bool CanRestore(StationResidentState state)
        {
            if (state == null || state.id != ResidentId || Route == null || Route.Length < 2 ||
                state.targetIndex < (state.outbound ? 1 : 0) ||
                state.targetIndex > (state.outbound ? (state.version == 1 ? RouteLength : Route.Length) - 1 : (state.version == 1 ? RouteLength : Route.Length) - 2) ||
                state.visits < 0 || state.returns < 0 ||
                float.IsNaN(state.waitRemaining) || state.waitRemaining < 0 || state.waitRemaining > 120)
                return false;
            if (state.version == 1) return MovingPath && state.targetIndex < RouteLength &&
                (state.outbound || state.targetIndex < RouteLength - 1) &&
                !float.IsNaN(state.segmentFraction) && state.segmentFraction >= 0 && state.segmentFraction <= 1;
            return state.version == 0 && RestoreTargetIndex(state) >= 0;
        }

        int RestoreTargetIndex(StationResidentState state)
        {
            if (OnSegment(state.position, state.targetIndex, state.outbound)) return state.targetIndex;
            // Older saves wrote 1 while walking the last inbound segment towards waypoint 0.
            if (!state.outbound && state.targetIndex == 1 && OnSegment(state.position, 0, false)) return 0;
            return -1;
        }

        bool OnSegment(Vector3 position, int index, bool goingOut)
        {
            var start = Route[index + (goingOut ? -1 : 1)];
            var end = Route[index];
            var segment = end - start;
            var fraction = Mathf.Clamp01(Vector3.Dot(position - start, segment) /
                Mathf.Max(segment.sqrMagnitude, .001f));
            return Vector3.Distance(position, start + segment * fraction) < .65f;
        }

        public void RestoreState(StationResidentState state)
        {
            if (!CanRestore(state)) throw new ArgumentException("Invalid resident state");
            if (!visual) { pendingRestore = state; return; }
            ApplyState(state);
        }

        void ApplyState(StationResidentState state)
        {
            body.enabled = false;
            int restoredIndex = state.version == 1 ? state.targetIndex : RestoreTargetIndex(state);
            float fraction = state.segmentFraction;
            if (MovingPath && state.version == 0)
            {
                float total = 0, traveled = 0;
                for (int i = 1; i < Route.Length; i++)
                {
                    float length = Vector3.Distance(Route[i - 1], Route[i]);
                    total += length;
                    if (i <= (state.outbound ? restoredIndex - 1 : restoredIndex)) traveled += length;
                }
                int edge = state.outbound ? restoredIndex : restoredIndex + 1;
                traveled += Mathf.Clamp(Vector3.Dot(state.position - Route[edge - 1], (Route[edge] - Route[edge - 1]).normalized), 0, Vector3.Distance(Route[edge - 1], Route[edge]));
                MovingPath.MapJourney(traveled / Mathf.Max(total, .001f), state.outbound, out restoredIndex, out fraction);
            }
            transform.position = MovingPath ? MovingPath.Position(restoredIndex, state.outbound, fraction) : state.position;
            body.enabled = true;
            targetIndex = restoredIndex;
            if (MovingPath) { Physics.SyncTransforms(); MovingPath.RefreshGround(); }
            outbound = state.outbound;
            InLounge = state.inLounge && targetIndex == RouteLength - 2 &&
                Vector3.Distance(transform.position, Point(RouteLength - 1)) < .4f;
            waitRemaining = state.waitRemaining;
            LoungeVisits = state.visits;
            HomeReturns = state.returns;
            restAnimation = null;
            passingRemaining = 0;
        }

        void Update()
        {
            if (Keyboard.current?.fKey.wasPressedThisFrame == true) Talk();
            Advance(Time.deltaTime);
        }

        bool SeatAvailable(int index) => !Visible ||
            Vector3.Distance(Cafe.Seats[index].position, transform.position) > 1.3f;

        void OnDestroy()
        {
            if (Cafe && Cafe.SeatAvailable == SeatAvailable) Cafe.SeatAvailable = null;
        }

        public void Advance(float seconds)
        {
            if (!visual) return;
            if (MovingPath) MovingPath.Carry();
            var onStage = Match.HasVisibleFighterPreset(PresetId);
            if (visual.activeSelf == onStage) visual.SetActive(!onStage);
            if (body.enabled == onStage) body.enabled = !onStage;
            if (onStage) return;
            if (outbound && targetIndex == RouteLength - 1 && Cafe &&
                Cafe.SeatedSeatIndex >= 0 && Vector3.Distance(Cafe.Seats[Cafe.SeatedSeatIndex].position,
                    Point(RouteLength - 1)) < 1.3f)
            {
                animator.SetFloat("Speed", 0);
                return;
            }
            if (talkUntil > Time.unscaledTime || waitRemaining > 0)
            {
                waitRemaining = Mathf.Max(0, waitRemaining - seconds);
                animator.SetFloat("Speed", 0);
                if (!outbound && targetIndex == RouteLength - 2 &&
                    Vector3.Distance(transform.position, Point(RouteLength - 1)) < .4f)
                {
                    transform.rotation = DestinationRotation;
                    if (sitDownLength > 0 && standUpLength > 0)
                    {
                        float elapsed = DestinationPause - waitRemaining;
                        string state = elapsed < sitDownLength ? "SeatDown" :
                            waitRemaining <= standUpLength ? "StandUp" : "Seated";
                        if (restAnimation != state)
                        {
                            float time = state == "SeatDown" ? Mathf.Max(0, elapsed) :
                                state == "StandUp" ? standUpLength - waitRemaining : 0;
                            animator.CrossFadeInFixedTime(state, .2f, 0, time);
                            restAnimation = state;
                        }
                    }
                    else if (!string.IsNullOrEmpty(DestinationAction) && restAnimation != DestinationAction)
                    {
                        animator.CrossFadeInFixedTime(DestinationAction, .4f, 0,
                            Mathf.Max(0, DestinationPause - waitRemaining));
                        restAnimation = DestinationAction;
                    }
                }
                return;
            }
            if (restAnimation != null)
            {
                animator.CrossFadeInFixedTime("Idle", .2f);
                restAnimation = null;
            }
            if (!outbound) InLounge = false;
            var target = Point(targetIndex);
            var steering = MovingPath ? MovingPath.Steering(targetIndex, outbound) : target;
            var remaining = steering - transform.position;
            remaining.y = 0;
            passingRemaining = Mathf.Max(0, passingRemaining - seconds);
            var direction = MovingPath && MovingPath.Radius(targetIndex, outbound) > 0 ? remaining : target - Point(targetIndex + (outbound ? -1 : 1));
            direction.y = 0;
            direction.Normalize();
            int nearby = Physics.SphereCastNonAlloc(transform.position + Vector3.up * .9f,
                .38f, direction, peopleAhead, 1.2f, ~0, QueryTriggerInteraction.Ignore);
            for (int i = 0; i < nearby; i++)
                if (peopleAhead[i].collider is CharacterController && peopleAhead[i].collider != body)
                    passingRemaining = 3;
            // Keep both colliders and step to each person's right before returning to the route.
            if (passingRemaining > 0 && remaining.magnitude > 1)
            {
                var right = Vector3.Cross(Vector3.up, direction);
                var basePoint = Point(targetIndex + (outbound ? -1 : 1));
                if (MovingPath && MovingPath.Radius(targetIndex, outbound) > 0)
                {
                    basePoint = transform.position; basePoint.y = 0;
                    basePoint = basePoint.normalized * MovingPath.Radius(targetIndex, outbound);
                }
                float offset = Vector3.Dot(transform.position - basePoint, right);
                remaining = direction * 1.2f + right * (.55f - offset);
            }
            var step = WalkSpeed * Mathf.Min(seconds, .05f);
            var motion = remaining.magnitude <= step + .03f ? remaining : remaining.normalized * step;
            if (motion.sqrMagnitude > .00000001f)
            {
                body.Move(motion + Vector3.down * .05f);
                if (MovingPath) MovingPath.RefreshGround();
                transform.rotation = Quaternion.RotateTowards(transform.rotation,
                    Quaternion.LookRotation(motion), 140 * seconds);
                animator.SetFloat("Speed", .8f);
                animator.SetFloat("WalkRate", 1);
            }
            if (Vector2.Distance(new Vector2(transform.position.x, transform.position.z),
                    new Vector2(target.x, target.z)) > .09f) return;
            if (outbound && targetIndex == RouteLength - 1)
            {
                InLounge = true;
                LoungeVisits++;
                transform.rotation = DestinationRotation;
                outbound = false;
                targetIndex--;
                waitRemaining = DestinationPause;
            }
            else if (!outbound && targetIndex == 0)
            {
                InLounge = false;
                HomeReturns++;
                var forward = Point(1) - Point(0); forward.y = 0;
                transform.rotation = Quaternion.LookRotation(MovingPath ? forward : Vector3.right);
                outbound = true;
                targetIndex++;
                waitRemaining = 18;
            }
            else targetIndex += outbound ? 1 : -1;
        }

        public bool Talk()
        {
            if (!isActiveAndEnabled || !Visible || !Walker || !Walker.enabled || Walker.InputBlocked?.Invoke() == true ||
                Vector3.Distance(Walker.transform.position, transform.position) > 2.7f) return false;
            SpokenCount++;
            talkUntil = Time.unscaledTime + 8;
            return true;
        }

        public string PublicDialogue()
        {
            var name = ArenaModelPresets.Find(PresetId)?.Name ?? PresetId;
            var destination = string.IsNullOrWhiteSpace(DestinationName) ? "公共区" : DestinationName;
            var activity = InLounge ? "在" + destination + DestinationActivity :
                outbound ? "前往" + destination : "正在返回住处";
            if (!Match || !Match.TryGetPublicAnswer(PresetId, out var round, out var record))
                return name + " · " + activity +
                    "\n暂无该模型已结算的公开答卷。\n赛事：" +
                    (Match ? Match.Status : "未连接");
            var excerpt = string.IsNullOrWhiteSpace(record.answer) ? "本题没有公开答卷" :
                record.answer.Replace('\r', ' ').Replace('\n', ' ').Trim();
            if (excerpt.Length > 80) excerpt = excerpt.Substring(0, 80) + "…";
            return name + " · " + activity + "\n已结算第 " + round + " 题 · " +
                record.score.ToString("0.##") + " 分\n公开答卷摘录：" + excerpt;
        }

        void OnGUI()
        {
            if (!isActiveAndEnabled || !Visible || !Walker || !Walker.enabled || Walker.InputBlocked?.Invoke() == true ||
                Vector3.Distance(Walker.transform.position, transform.position) > 2.7f) return;
            if (promptStyle == null)
            {
                promptStyle = new GUIStyle(GUI.skin.box) { fontSize = 16,
                    alignment = TextAnchor.MiddleCenter, wordWrap = true };
                promptStyle.normal.textColor = Color.white;
            }
            var message = talkUntil > Time.unscaledTime
                ? PublicDialogue()
                : "F 与 " + (ArenaModelPresets.Find(PresetId)?.Name ?? PresetId) + " 交谈";
            var talking = talkUntil > Time.unscaledTime;
            var height = talking ? 126 : 36;
            var width = talking ? 600 : 420;
            var previous = GUI.backgroundColor;
            GUI.backgroundColor = Color.black;
            GUI.Box(new Rect(Screen.width * .5f - width * .5f,
                    Screen.height - 360 - (talking ? 90 : 0), width, height),
                message, promptStyle);
            GUI.backgroundColor = previous;
        }
    }
}
