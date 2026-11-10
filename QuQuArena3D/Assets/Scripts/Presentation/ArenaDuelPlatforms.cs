using System;
using System.Collections;
using UnityEngine;

namespace QuQu
{
    // Geometry and movement only. The competition server remains the source of the winner ID.
    public sealed class ArenaDuelPlatforms : MonoBehaviour
    {
        const float CenterX = 1.6f; // 3m boards leave a visible 0.2m seam at the duel position.
        public Transform Ring;
        public Transform MovementFrame;
        public StationArenaSafety Safety;
        public float LiftX = 28;
        public float BoardDockX = 24.5f;
        public Transform Trophy;
        public Transform[] Lifts = new Transform[2];
        public GameObject[] Boards = new GameObject[2];
        public string Phase { get; private set; } = "docked";
        public int Removals { get; private set; }
        readonly ArenaFighter[] fighters = new ArenaFighter[2];
        int winnerSide = -1;

        public void Bind(ArenaFighter left, ArenaFighter right)
        {
            if (!left || !right || left.State.Id == right.State.Id || !Ring ||
                Lifts.Length != 2 || Boards.Length != 2 || !Lifts[0] || !Lifts[1] || !Boards[0] || !Boards[1])
                throw new InvalidOperationException("Two distinct fighters, lifts, boards and one ring are required");
            fighters[0] = left;
            fighters[1] = right;
            if (MovementFrame) foreach (var fighter in fighters) fighter.transform.SetParent(MovementFrame, true);
            winnerSide = -1;
            Removals = 0;
            Phase = "docked";
        }

        static float Side(int index) => index == 0 ? -1 : 1;
        static float Ease(float t) => t * t * (3 - 2 * t);
        public Vector3 WorldPosition(Vector3 local) => MovementFrame ? MovementFrame.TransformPoint(local) : local;
        Vector3 LocalPosition(Transform target) => MovementFrame ? MovementFrame.InverseTransformPoint(target.position) : target.position;
        void SetPosition(Transform target, Vector3 local) => target.position = WorldPosition(local);
        IEnumerator Move(float seconds, Action<float> step)
        {
            float elapsed = 0;
            while (true)
            {
                if (Safety)
                {
                    Safety.Refresh();
                    if (Safety.MotionBlocked) { yield return null; continue; }
                }
                step(Ease(elapsed / seconds));
                if (Safety) Safety.Refresh();
                if (elapsed >= seconds) yield break;
                yield return null;
                elapsed = Mathf.Min(seconds, elapsed + Time.deltaTime);
            }
        }
        void Pose(int index, float x, float y)
        {
            var fighter = fighters[index];
            if (fighter && fighter.gameObject.activeSelf)
                fighter.EntrancePose(WorldPosition(new Vector3(x, y + .09f, 0)),
                    (MovementFrame ? MovementFrame.rotation : Quaternion.identity) * Quaternion.Euler(0, index == 0 ? 90 : -90, 0), 1.2f);
        }

        public IEnumerator Enter()
        {
            if (Phase != "docked") throw new InvalidOperationException("Entrance requires both boards docked");
            Phase = "lift";
            for (int i = 0; i < 2; i++)
            {
                SetPosition(Lifts[i], new Vector3(Side(i) * LiftX, -12.125f, 0));
                SetPosition(Boards[i].transform, new Vector3(Side(i) * BoardDockX, -.06f, 0));
                Boards[i].SetActive(true);
                fighters[i].BeginEntrance();
            }
            yield return Move(2.8f, t =>
            {
                for (int i = 0; i < 2; i++)
                {
                    float y = Mathf.Lerp(-12, 0, t);
                    SetPosition(Lifts[i], new Vector3(Side(i) * LiftX, y - .125f, 0));
                    Pose(i, Side(i) * LiftX, y);
                }
            });
            Phase = "boarding";
            yield return Move(1.8f, t =>
            {
                for (int i = 0; i < 2; i++) Pose(i, Side(i) * Mathf.Lerp(LiftX, BoardDockX, t), 0);
            });
            Phase = "transport";
            yield return Move(3.2f, t =>
            {
                for (int i = 0; i < 2; i++)
                {
                    float x = Side(i) * Mathf.Lerp(BoardDockX, CenterX, t);
                    SetPosition(Boards[i].transform, new Vector3(x, -.06f, 0));
                    Pose(i, x, 0);
                }
            });
            Phase = "raising";
            yield return Move(2.4f, t =>
            {
                float height = Mathf.Lerp(0, 12, t);
                SetPosition(Ring, new Vector3(0, height, 0));
                for (int i = 0; i < 2; i++)
                {
                    SetPosition(Boards[i].transform, new Vector3(Side(i) * CenterX, height - .06f, 0));
                    Pose(i, Side(i) * CenterX, height);
                }
            });
            for (int i = 0; i < 2; i++)
            {
                fighters[i].SetHome(WorldPosition(new Vector3(Side(i) * CenterX, 12.09f, 0)), true, MovementFrame);
                fighters[i].EndEntrance();
            }
            Phase = "combat";
        }

        // Call only for the authoritative competition champion, after settlement.
        public IEnumerator RemoveLoserForChampionship(string winnerId)
        {
            if (winnerSide >= 0 && fighters[winnerSide].State.Id == winnerId &&
                (Phase == "falling" || Phase == "award" || Phase == "champion-awarded" || Phase == "returning" || Phase == "exited"))
                yield break;
            if (Phase != "combat") throw new InvalidOperationException("Championship drop requires a settled final");
            winnerSide = fighters[0].State.Id == winnerId ? 0 : fighters[1].State.Id == winnerId ? 1 : -1;
            if (winnerSide < 0) throw new InvalidOperationException("Winner does not belong to the bound duel");
            int loser = 1 - winnerSide;
            Phase = "falling";
            fighters[loser].BeginEntrance();
            Boards[loser].SetActive(false); // Renderer and support collider disappear together.
            Removals++;
            yield return Move(3.2f, t => Pose(loser, Side(loser) * CenterX, Mathf.Lerp(12, -35, t)));
            fighters[loser].gameObject.SetActive(false);
            fighters[loser].EndEntrance();
            Phase = "award";
        }

        public IEnumerator ChampionAward()
        {
            if (Phase != "award" || !Trophy) throw new InvalidOperationException("Champion drop and trophy are required");
            int i = winnerSide;
            fighters[i].BeginEntrance();
            SetPosition(Trophy, new Vector3(Side(i) * CenterX, 30, 0));
            Trophy.gameObject.SetActive(true);
            Phase = "champion-trophy";
            yield return Move(2.8f, t =>
            {
                float platformY = Mathf.Lerp(12, 18, t);
                SetPosition(Boards[i].transform, new Vector3(Side(i) * CenterX, platformY - .06f, 0));
                Pose(i, Side(i) * CenterX, platformY);
                SetPosition(Trophy, new Vector3(Side(i) * CenterX, Mathf.Lerp(30, 19.5f, t), 0));
            });
            fighters[i].SetHome(WorldPosition(new Vector3(Side(i) * CenterX, 18.09f, 0)), true, MovementFrame);
            fighters[i].EndEntrance();
            Phase = "champion-awarded";
        }

        public IEnumerator ReturnBoth()
        {
            if (Phase != "combat") throw new InvalidOperationException("Ordinary return requires a finished duel");
            return ReturnToLifts(true, true);
        }

        public IEnumerator ReturnWinner()
        {
            if (Phase != "champion-awarded") throw new InvalidOperationException("Champion award must complete before return");
            return ReturnToLifts(winnerSide == 0, winnerSide == 1);
        }

        IEnumerator ReturnToLifts(bool left, bool right)
        {
            var riding = new[] { left, right };
            var boardStartY = new[] { LocalPosition(Boards[0].transform).y, LocalPosition(Boards[1].transform).y };
            float ringStartY = LocalPosition(Ring).y;
            for (int side = 0; side < 2; side++) if (riding[side]) fighters[side].BeginEntrance();
            Phase = "returning";
            yield return Move(2.4f, t =>
            {
                SetPosition(Ring, new Vector3(0, Mathf.Lerp(ringStartY, 0, t), 0));
                for (int side = 0; side < 2; side++) if (riding[side])
                {
                    float y = Mathf.Lerp(boardStartY[side] + .06f, 0, t);
                    SetPosition(Boards[side].transform, new Vector3(Side(side) * CenterX, y - .06f, 0));
                    Pose(side, Side(side) * CenterX, y);
                    if (Trophy && Trophy.gameObject.activeSelf && side == winnerSide)
                        SetPosition(Trophy, new Vector3(Side(side) * CenterX, y + 1.5f, 0));
                }
            });
            yield return Move(3.2f, t =>
            {
                for (int side = 0; side < 2; side++) if (riding[side])
                {
                    float x = Side(side) * Mathf.Lerp(CenterX, BoardDockX, t);
                    SetPosition(Boards[side].transform, new Vector3(x, -.06f, 0));
                    Pose(side, x, 0);
                    if (Trophy && Trophy.gameObject.activeSelf && side == winnerSide)
                        SetPosition(Trophy, new Vector3(x, 1.5f, 0));
                }
            });
            yield return Move(1.8f, t =>
            {
                for (int side = 0; side < 2; side++) if (riding[side])
                    Pose(side, Side(side) * Mathf.Lerp(BoardDockX, LiftX, t), 0);
            });
            yield return Move(2.8f, t =>
            {
                for (int side = 0; side < 2; side++) if (riding[side])
                {
                    float y = Mathf.Lerp(0, -12, t);
                    SetPosition(Lifts[side], new Vector3(Side(side) * LiftX, y - .125f, 0));
                    Pose(side, Side(side) * LiftX, y);
                }
            });
            for (int side = 0; side < 2; side++) if (riding[side])
            {
                fighters[side].gameObject.SetActive(false);
                fighters[side].EndEntrance();
            }
            if (Trophy) Trophy.gameObject.SetActive(false);
            Phase = "exited";
        }

        public void ResetAfterExit()
        {
            if (Phase != "exited" || fighters[0].gameObject.activeSelf || fighters[1].gameObject.activeSelf)
                throw new InvalidOperationException("Reset requires both contestants to have exited");
            SetPosition(Ring, Vector3.zero);
            for (int i = 0; i < 2; i++)
            {
                SetPosition(Lifts[i], new Vector3(Side(i) * LiftX, -12.125f, 0));
                SetPosition(Boards[i].transform, new Vector3(Side(i) * BoardDockX, -.06f, 0));
                Boards[i].SetActive(true);
            }
            if (Trophy) Trophy.gameObject.SetActive(false);
            winnerSide = -1;
            Phase = "docked";
        }

        // Reconnects restore a stable picture without replaying an already settled drop.
        public void RestoreSnapshot(ArenaFighter left, ArenaFighter right, bool combat)
        {
            for (int i = 0; i < 2; i++) if (fighters[i])
            {
                fighters[i].EndEntrance();
                fighters[i].gameObject.SetActive(false);
            }
            SetPosition(Ring, combat ? new Vector3(0, 12, 0) : Vector3.zero);
            for (int i = 0; i < 2; i++)
            {
                SetPosition(Lifts[i], new Vector3(Side(i) * LiftX, -.125f, 0));
                Boards[i].SetActive(true);
                SetPosition(Boards[i].transform, combat
                    ? new Vector3(Side(i) * CenterX, 11.94f, 0)
                    : new Vector3(Side(i) * BoardDockX, -.06f, 0));
            }
            if (Trophy) Trophy.gameObject.SetActive(false);
            winnerSide = -1;
            Removals = 0;
            Phase = "docked";
            if (!combat) return;
            Bind(left, right);
            for (int i = 0; i < 2; i++)
            {
                fighters[i].gameObject.SetActive(true);
                fighters[i].SetHome(WorldPosition(new Vector3(Side(i) * CenterX, 12.09f, 0)), true, MovementFrame);
            }
            Phase = "combat";
        }
    }
}
