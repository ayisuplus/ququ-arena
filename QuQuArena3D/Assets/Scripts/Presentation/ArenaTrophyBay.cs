using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace QuQu
{
    // V29: the championship trophy no longer erupts between the fighters — it waits on a
    // floating bay outside the venue, facing the arena centre, and drifts down to the
    // winner once the duel is decided. EndCombat sends it home.
    //
    // Parented to the stage scenery and never to ArenaVenue: ArenaVenueCheck counts the
    // venue's own MeshFilters as its draw budget, so the bay must stay outside it.
    public class ArenaTrophyBay : MonoBehaviour
    {
        public const string BayName = "Trophy bay";
        public const string TrophyName = "Championship trophy";
        // Straight out along +Z from the arena centre: past the gallery hall's far wall
        // (z 9.6) and above its roof (y ~6.2), so the bay floats in open sky rather than
        // inside the building.
        //
        // The binding constraint is the galaxy display, which stands between the camera
        // and the bay. A same-camera on/off pair put the display's effective silhouette
        // top near y 8.9 (screen 7.75 plus its signage frame), so everything the bay
        // shows below that line — its whole keel, thrusters and skirt — was swallowed.
        // Casting that edge onto z 15.5 puts the cut at y 5.1, so the bay's lowest point
        // (6.1 here) clears it. Pushing further out also drops the cut: the camera looks
        // down, so the display's shadow falls away with distance.
        static readonly Vector3 BayPosition = new Vector3(0, 7.4f, 15.5f);
        // Framing extents handed to ArenaStage.Refit: without them the bay rides the
        // very top of the default shot and is half cropped.
        public static readonly Bounds FramingBounds = new Bounds(BayPosition + Vector3.up * .2f, new Vector3(4.6f, 4.2f, 4.6f));
        // Local +Z faces the arena centre (build_pod.py convention), so the bay looks
        // back along -Z to face the ring.
        const float BayYaw = 180f;
        // Dais top face; matches build_pod.py dock_height.
        static readonly Vector3 DockOffset = new Vector3(0, .09f, 0);
        const float FlightSeconds = 3f;
        const float LampHeight = .95f;
        const float LampDocked = 5f, LampPresented = 4.5f;
        enum Phase { Docked, Outbound, Presented, Returning }
        readonly List<Object> owned = new List<Object>();
        Material alloy, titanium, trim, beacon;
        Transform pod, trophy;
        Light lamp;
        Phase phase = Phase.Docked;
        float flight;
        Vector3 from, to, control;
        // The instantiated bay itself. Exposed because name lookup cannot find it: the
        // component node below is named "Trophy bay station" and the pod "Trophy bay",
        // and callers that searched by name used to land on the component node (at the
        // scene origin) instead of the pod 13.5 m out — which framed the arena floor.
        public Transform Bay => pod;
        // Where the cup waits between matches; also the flight home target.
        public Vector3 DockPoint => pod ? pod.TransformPoint(DockOffset) : BayPosition + DockOffset;

        public void Create(Transform parent)
        {
            alloy = Material("Bay brushed alloy", new Color(.82f, .85f, .88f), .78f, .45f);
            titanium = Material("Bay titanium", new Color(.72f, .76f, .79f), .90f, .35f);
            trim = Material("Bay cyan trim", new Color(.16f, .55f, .68f), .10f, .30f, .18f);
            beacon = Material("Bay beacon", new Color(.30f, .60f, .85f), .10f, .30f, .8f);
            pod = Instantiate(Load("Art/PropsV29/TrophyPod"), parent, false).transform;
            pod.name = BayName;
            pod.localPosition = BayPosition;
            pod.localRotation = Quaternion.Euler(0, BayYaw, 0);
            Grade(pod);
            trophy = Instantiate(Load("Art/PropsV29/Trophy"), parent, false).transform;
            trophy.name = TrophyName;
            var lampRoot = new GameObject("Trophy bay lamp"); lampRoot.transform.SetParent(parent, false);
            lamp = lampRoot.AddComponent<Light>();
            lamp.type = LightType.Point; lamp.color = new Color(1f, .96f, .89f);
            lamp.range = 5f; lamp.shadows = LightShadows.None;
            Dock();
        }
        // Blender's Prop* placeholders select the graded material, so the grading table
        // lives here and nowhere else — same discipline as ArenaVenue's seating.
        void Grade(Transform root)
        {
            foreach (var renderer in root.GetComponentsInChildren<Renderer>(true))
            {
                string name = renderer.sharedMaterial ? renderer.sharedMaterial.name : "";
                if (name.Contains("Titanium")) renderer.sharedMaterial = titanium;
                else if (name.Contains("Alloy")) renderer.sharedMaterial = alloy;
                else if (name.Contains("Trim")) renderer.sharedMaterial = trim;
                else if (name.Contains("Light")) renderer.sharedMaterial = beacon;
                else throw new System.InvalidOperationException("Unmapped V29 bay material: " + name);
                renderer.shadowCastingMode = ShadowCastingMode.On;
                renderer.receiveShadows = true;
            }
        }
        void Dock()
        {
            phase = Phase.Docked; flight = 0;
            trophy.position = DockPoint;
            trophy.rotation = Quaternion.Euler(0, BayYaw, 0);
            lamp.transform.position = trophy.position + Vector3.up * LampHeight;
            lamp.intensity = LampDocked;
        }
        // Award: the cup leaves the bay and settles beside the winner, floating at about
        // chest height so it reads as presented rather than dropped.
        public void Present(ArenaFighter fighter, float motion)
        {
            if (!fighter || !trophy) return;
            var target = fighter.transform.position + new Vector3(fighter.Home.x<0?-1.8f:1.8f,0,-.55f);
            target.y = fighter.transform.position.y + 1.15f * fighter.Look.scale;
            lamp.intensity = LampPresented;
            // Quiet mode (Motion 0) has no presentation: show it delivered, do not animate.
            if (motion <= 0)
            {
                phase = Phase.Presented; flight = 0;
                trophy.position = target;
                trophy.rotation = Quaternion.Euler(0, fighter.transform.eulerAngles.y, 0);
                lamp.transform.position = target + Vector3.up * LampHeight;
                return;
            }
            Launch(target);
            phase = Phase.Outbound;
        }
        public void Recall(float motion)
        {
            if (!trophy) return;
            if (phase == Phase.Docked) return;
            lamp.intensity = LampDocked;
            if (motion <= 0) { Dock(); return; }
            Launch(DockPoint);
            phase = Phase.Returning;
        }
        // Shared arc: control point sits a quarter of the way out and lifted, so the cup
        // leaves the deck almost level and only commits to its descent late — a glide,
        // not a drop. Longer hops lift proportionally so the arc keeps its shape.
        void Launch(Vector3 target)
        {
            from = trophy.position; to = target; flight = 0;
            control = Vector3.Lerp(from, to, .28f) + Vector3.up * (1f + Vector3.Distance(from, to) * .05f);
        }
        public void Tick(float motion)
        {
            if (!trophy) return;
            if (phase == Phase.Outbound || phase == Phase.Returning)
            {
                flight = Mathf.MoveTowards(flight, 1, Time.deltaTime / FlightSeconds);
                float ease = 1 - Mathf.Pow(1 - flight, 3);
                trophy.position = Arc(ease);
                lamp.transform.position = trophy.position + Vector3.up * LampHeight;
                if (flight >= 1) phase = phase == Phase.Outbound ? Phase.Presented : Phase.Docked;
            }
            if (motion > 0) trophy.Rotate(0, Time.deltaTime * 26f, 0);
        }
        Vector3 Arc(float t)
        {
            float u = 1 - t;
            return u * u * from + 2 * u * t * control + t * t * to;
        }
        Material Material(string name, Color color, float metal, float smooth, float emission = 0)
        {
            var m = ArenaStage.Mat(color, metal, smooth, emission); m.name = name; owned.Add(m); return m;
        }
        static GameObject Load(string path)
        {
            var prefab = Resources.Load<GameObject>(path);
            if (!prefab) throw new System.InvalidOperationException("Missing V29 prefab " + path + "; run ArenaPropsBuildV29.Build first");
            return prefab;
        }
        void OnDestroy() { foreach (var asset in owned) if (asset) Destroy(asset); }
    }
}
