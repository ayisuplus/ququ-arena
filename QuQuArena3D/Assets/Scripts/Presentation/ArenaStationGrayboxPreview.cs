using System.Collections;
using UnityEngine;

namespace QuQu
{
    // Movement-only fixture for the separate P1 scene; it never decides a real match.
    public sealed class ArenaStationGrayboxPreview : MonoBehaviour
    {
        public ArenaDuelPlatforms Rig;
        public string Phase => Rig ? Rig.Phase : "missing rig";
        public string Act { get; private set; } = "ordinary";
        public bool OrdinaryReturnedSafely { get; private set; }
        public bool ChampionshipAwardCompleted { get; private set; }

        IEnumerator Start()
        {
            if (!Rig) yield break;
            var fighters = new ArenaFighter[2];
            for (int i = 0; i < 2; i++)
            {
                var go = new GameObject(i == 0 ? "P1 left movement fixture" : "P1 right movement fixture");
                go.transform.SetParent(transform);
                fighters[i] = go.AddComponent<ArenaFighter>();
                fighters[i].Create(
                    new ModelInfo { id = i == 0 ? "p1:left" : "p1:right", name = i == 0 ? "左选手" : "右选手" },
                    new AvatarPreference { style = 0, color = i == 0 ? "#70CFED" : "#EFAB77", scale = 1 },
                    new Vector3(i == 0 ? -28 : 28, -11.91f, 0));
            }
            var trophyPrefab = Resources.Load<GameObject>("Art/PropsV29/Trophy");
            if (!trophyPrefab) throw new System.InvalidOperationException("Existing championship trophy asset is missing");
            var trophy = Instantiate(trophyPrefab, transform);
            trophy.name = "P1 existing championship trophy preview";
            foreach (var collider in trophy.GetComponentsInChildren<Collider>()) Destroy(collider);
            trophy.SetActive(false);
            Rig.Trophy = trophy.transform;

            Rig.Bind(fighters[0], fighters[1]);
            yield return Rig.Enter();
            yield return new WaitForSeconds(1);
            yield return Rig.ReturnBoth();
            OrdinaryReturnedSafely = Rig.Removals == 0 && Rig.Boards[0].activeSelf && Rig.Boards[1].activeSelf;
            if (!OrdinaryReturnedSafely) throw new System.InvalidOperationException("Ordinary duel removed a platform");
            Rig.ResetAfterExit();

            Act = "championship";
            for (int i = 0; i < 2; i++)
            {
                fighters[i].gameObject.SetActive(true);
                fighters[i].SetHome(new Vector3(i == 0 ? -28 : 28, -11.91f, 0));
            }
            Rig.Bind(fighters[0], fighters[1]);
            yield return Rig.Enter();
            yield return new WaitForSeconds(1);
            yield return Rig.RemoveLoserForChampionship(fighters[0].State.Id);
            Physics.SyncTransforms();
            if (Rig.Removals != 1 || !Rig.Boards[0].activeSelf || Rig.Boards[1].activeSelf ||
                Physics.RaycastAll(new Vector3(1.6f, 16, 0), Vector3.down, 40).Length != 0)
                throw new System.InvalidOperationException("Champion drop is blocked or removed the wrong platform");
            yield return Rig.ChampionAward();
            ChampionshipAwardCompleted = Rig.Trophy.gameObject.activeSelf &&
                Mathf.Abs(Rig.Boards[0].transform.position.y - 17.94f) < .05f &&
                Mathf.Abs(Rig.Trophy.position.y - 19.5f) < .05f;
            if (!ChampionshipAwardCompleted) throw new System.InvalidOperationException("Champion did not rise to meet the falling trophy");
            yield return new WaitForSeconds(1);
            yield return Rig.ReturnWinner();
            Rig.ResetAfterExit();
            Act = "finished";
        }
    }
}
