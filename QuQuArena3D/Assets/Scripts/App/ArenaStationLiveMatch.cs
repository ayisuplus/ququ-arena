using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;
using UnityEngine;

namespace QuQu
{
    // Station graybox client for the existing competition API. It reads settled events;
    // scoring and winner selection stay in BattleEngine/GameCompetitions.
    [RequireComponent(typeof(ArenaConnection))]
    public sealed class ArenaStationLiveMatch : MonoBehaviour
    {
        public ArenaDuelPlatforms Rig;
        public StationQuestionBoard Board;
        public StationLoungeBroadcast LoungeBroadcast;
        public string CompetitionId;
        public bool CompactHudOnExploreStart;
        public string Status { get; private set; } = "等待赛事";
        public int OrdinaryReturns { get; private set; }
        public int ChampionshipAwards { get; private set; }
        public int ResolvedRounds { get; private set; }
        public int SlapContacts { get; private set; }
        public string ConnectionStatus { get; private set; } = "未连接";
        public CompetitionDuel CurrentDuel { get; private set; }
        public CompetitionRound CurrentRound { get; private set; }
        public string WinningModel { get; private set; }
        public event Action<CompetitionEvent> PresentedEvent;

        public bool HasVisibleFighterPreset(string presetId) =>
            Array.Exists(fighters, fighter => fighter && fighter.gameObject.activeInHierarchy &&
                (fighter.Look.presetId == presetId ||
                 ArenaModelPresets.Match(fighter.State?.Id, fighter.State?.Name)?.Id == presetId));

        public string DisplayName(string modelId) => Name(modelId);

        public bool TryGetPublicAnswer(string presetId, out int roundNumber,
            out CompetitionAnswer answer)
        {
            roundNumber = 0;
            answer = null;
            if (string.IsNullOrEmpty(presetId) || snapshot?.duels == null) return false;
            for (var duelIndex = snapshot.duels.Length - 1; duelIndex >= 0; duelIndex--)
            {
                var rounds = snapshot.duels[duelIndex]?.rounds;
                if (rounds == null) continue;
                for (var roundIndex = rounds.Length - 1; roundIndex >= 0; roundIndex--)
                {
                    var round = rounds[roundIndex];
                    if (round == null || !round.settled || round.records == null) continue;
                    foreach (var record in round.records)
                        if (record != null &&
                            ArenaModelPresets.Match(record.model)?.Id == presetId)
                        {
                            roundNumber = round.index;
                            answer = record;
                            return true;
                        }
                }
            }
            return false;
        }

        ArenaConnection link;
        GameObject ownedTrophy;
        ArenaMedia media;
        ArenaPreferences preferences;
        StationMatchHUD hud;
        CompetitionSnapshot snapshot;
        readonly Queue<CompetitionEvent> events = new Queue<CompetitionEvent>();
        readonly ArenaFighter[] fighters = new ArenaFighter[2];
        readonly Task[] avatarLoads = new Task[2];
        Coroutine presenter;
        CompetitionEvent pendingFinal;
        string confirmedChampion;
        bool backendReady;
        long cursor;
        string watchedId;

        void Start()
        {
            if (!Rig) throw new InvalidOperationException("Station duel platforms are missing");
            link = GetComponent<ArenaConnection>();
            media = gameObject.AddComponent<ArenaMedia>();
            preferences = ArenaPreferences.Load();
            ArenaAvatarMode.Set(preferences.avatarMode);
            link.OnCompetition = Receive;
            link.OnStatus = message => ConnectionStatus = message;
            var args = Environment.GetCommandLineArgs();
            var backend = Array.IndexOf(args, "--arena-backend");
            var address = preferences.endpoint;
            if (backend >= 0) address = backend + 1 < args.Length ? args[backend + 1] : "";
            backendReady = link.SetEndpoint(address);
            if (backendReady) Debug.Log("Station backend endpoint: " + link.BaseUrl);
            hud = new GameObject("Station spectator HUD").AddComponent<StationMatchHUD>();
            hud.transform.SetParent(transform, false);
            hud.SetCompact(CompactHudOnExploreStart);
            hud.WatchRequested = Watch;
            hud.RefreshRequested = RefreshCompetitions;
            hud.CameraModes = FindFirstObjectByType<StationSpectatorCamera>();
            if (hud.CameraModes)
            {
                hud.CameraModes.InputBlocked = hud.BlocksInput;
                if (hud.CameraModes.Walker) hud.CameraModes.Walker.InputBlocked = hud.BlocksInput;
                if (hud.CameraModes.Seat) hud.CameraModes.Seat.InputBlocked = hud.BlocksInput;
            }
            var trophyAsset = Resources.Load<GameObject>("Art/PropsV29/Trophy");
            if (!trophyAsset) throw new InvalidOperationException("Existing trophy asset is missing");
            var trophy = Instantiate(trophyAsset, Rig.MovementFrame ? Rig.MovementFrame : transform);
            ownedTrophy = trophy;
            trophy.name = "Station championship trophy";
            foreach (var collider in trophy.GetComponentsInChildren<Collider>()) Destroy(collider);
            trophy.SetActive(false);
            Rig.Trophy = trophy.transform;
            if (!string.IsNullOrWhiteSpace(CompetitionId)) Watch(CompetitionId);
        }

        public void Watch(string id)
        {
            if (!backendReady || string.IsNullOrWhiteSpace(id)) return;
            CompetitionId = id.Trim();
            Status = "同步赛事 " + CompetitionId;
            ConnectionStatus = "连接中";
            link.WatchCompetition(CompetitionId);
        }

        void RefreshCompetitions()
        {
            if (!backendReady)
            {
                hud.ShowCompetitions(null, "比赛服务地址无效，请检查本机配置");
                return;
            }
            StartCoroutine(link.Request<Catalog>("/api/game/catalog", null,
                catalog => { if (hud) hud.ShowCompetitions(catalog.competitions); },
                error => { if (hud) hud.ShowCompetitions(null, "暂时无法读取赛事，请确认比赛服务已启动后重试"); }));
        }

        void Receive(CompetitionPacket packet, bool reset)
        {
            if (packet?.snapshot == null) return;
            ConnectionStatus = "已同步本机赛事 · 序号 " + packet.seq;
            if (packet.id != CompetitionId)
            {
                if (link.Competition != packet.id) return;
                CompetitionId = packet.id;
            }
            snapshot = packet.snapshot;
            if (watchedId != packet.id)
            {
                watchedId = packet.id;
                cursor = 0;
                events.Clear();
                pendingFinal = null;
                confirmedChampion = null;
                CurrentDuel = null;
                CurrentRound = null;
                WinningModel = null;
                ResolvedRounds = 0;
                if (presenter != null) StopCoroutine(presenter);
                presenter = null;
                Rig.RestoreSnapshot(null, null, false);
                ClearFighters();
            }
            if (reset)
            {
                cursor = packet.seq;
                events.Clear();
                pendingFinal = null;
                confirmedChampion = null;
                if (presenter != null) StopCoroutine(presenter);
                presenter = null;
                Restore(packet.snapshot);
                return;
            }
            foreach (var item in packet.events ?? Array.Empty<CompetitionEvent>())
                if (item.seq > cursor) { cursor = item.seq; events.Enqueue(item); }
            if (presenter == null && events.Count > 0) presenter = StartCoroutine(Present());
        }

        void Restore(CompetitionSnapshot state)
        {
            var duel = state.duels?.FirstOrDefault(d => d.id == state.activeDuelId);
            bool combat = duel?.players?.Length == 2 && duel.status == "running";
            CurrentDuel = duel ?? state.duels?.LastOrDefault();
            CurrentRound = CurrentDuel?.rounds?.LastOrDefault();
            WinningModel = state.winner;
            ResolvedRounds = state.duels?.Sum(item =>
                item.rounds?.Count(round => round.settled) ?? 0) ?? 0;
            Rig.RestoreSnapshot(null, null, false);
            ClearFighters();
            if (combat)
            {
                CreateFighters(duel);
                if (duel.hp?.Length == 2)
                    for (int i = 0; i < 2; i++) fighters[i].State.Health = (float)duel.hp[i];
                Rig.RestoreSnapshot(fighters[0], fighters[1], true);
            }
            Status = state.status == "completed" ? "赛事已结算 · 冠军 " + Name(state.winner)
                : state.status == "waiting" ? "赛事待续 · " +
                    (string.IsNullOrEmpty(state.reason) ? "等待继续" : state.reason)
                : combat ? "已同步进行中的对局 " + duel.id : "等待下一场赛事";
        }

        void CreateFighters(CompetitionDuel duel)
        {
            ClearFighters();
            for (int i = 0; i < 2; i++)
            {
                var id = duel.players[i];
                var model = snapshot.entrants?.FirstOrDefault(x => x.id == id) ?? new ModelInfo { id = id, name = id };
                var actor = new GameObject("Station contestant " + id).AddComponent<ArenaFighter>();
                actor.transform.SetParent(transform);
                actor.Create(model, preferences.Avatar(id, i, model.name), Rig.WorldPosition(new Vector3((i == 0 ? -1 : 1) * Rig.LiftX, -11.91f, 0)));
                fighters[i] = actor;
                avatarLoads[i] = RestoreAvatar(actor);
            }
        }

        async Task RestoreAvatar(ArenaFighter fighter)
        {
            if (ArenaAvatarMode.Chibi) return;
            if (!string.IsNullOrEmpty(fighter.Look.modelPath))
                await media.LoadAvatar(fighter, fighter.Look.modelPath, message => Debug.Log("Station avatar: " + message));
            else if (!string.IsNullOrEmpty(fighter.Look.facePath))
            {
                try { ArenaMedia.Face(fighter, fighter.Look.facePath); }
                catch (Exception error) { Debug.LogWarning("Station avatar: " + error.Message); }
            }
        }

        void ClearFighters()
        {
            for (int i = 0; i < 2; i++)
            {
                avatarLoads[i] = null;
                if (fighters[i])
                {
                    if (media) media.ReleaseAvatar(fighters[i], true);
                    Destroy(fighters[i].gameObject);
                }
                fighters[i] = null;
            }
        }

        IEnumerator Present()
        {
            yield return null;
            while (events.Count > 0)
            {
                var item = events.Dequeue();
                switch (item.type)
                {
                    case "duel-start":
                        if (item.duel?.players?.Length != 2) break;
                        CurrentDuel = item.duel;
                        CurrentRound = null;
                        WinningModel = null;
                        pendingFinal = null;
                        confirmedChampion = null;
                        CreateFighters(item.duel);
                        while (avatarLoads.Any(load => load != null && !load.IsCompleted)) yield return null;
                        Rig.Bind(fighters[0], fighters[1]);
                        Status = "左右选手入场 · " + item.duel.id;
                        yield return Rig.Enter();
                        Status = "对局中 · " + item.duel.id;
                        break;
                    case "round-start":
                    case "model":
                        CurrentRound = item.round;
                        break;
                    case "round-resolved":
                        CurrentRound = item.round;
                        if (Rig.Phase != "combat" || item.round?.attacks == null) break;
                        foreach (var attack in item.round.attacks)
                        {
                            if (attack.damage <= 0) continue;
                            var from = Array.Find(fighters, f => f && f.State.Id == attack.attacker);
                            var to = Array.Find(fighters, f => f && f.State.Id == attack.target);
                            if (from && to) yield return from.SlapResolved(to, (_, __, ___) => { SlapContacts++; });
                        }
                        if (item.round.after?.Length == 2)
                            for (int i = 0; i < 2; i++) fighters[i].State.Health = (float)item.round.after[i];
                        ResolvedRounds++;
                        break;
                    case "duel-end":
                        WinningModel = item.winner;
                        if (Rig.Phase != "combat" || string.IsNullOrEmpty(item.winner)) break;
                        if (snapshot.duels?.LastOrDefault()?.id == item.duelId)
                        {
                            pendingFinal = item;
                            Status = "决赛已结算 · 等待冠军确认";
                            if (confirmedChampion == item.winner) yield return PresentChampion();
                        }
                        else
                        {
                            Status = "普通对局结算 · 双方返航";
                            yield return Rig.ReturnBoth();
                            Rig.ResetAfterExit();
                            OrdinaryReturns++;
                        }
                        break;
                    case "competition-end":
                        WinningModel = item.winner;
                        confirmedChampion = item.winner;
                        if (Rig.Phase == "combat" && pendingFinal != null &&
                            !string.IsNullOrEmpty(item.winner) && item.winner == pendingFinal.winner)
                            yield return PresentChampion();
                        else if (Rig.Phase == "combat" && string.IsNullOrEmpty(item.winner))
                        {
                            Status = "赛事终止 · 双方安全返航";
                            yield return Rig.ReturnBoth();
                            Rig.ResetAfterExit();
                        }
                        break;
                    case "pending":
                        Status = "赛事待续 · " +
                            (string.IsNullOrEmpty(item.message) ? "等待继续" : item.message);
                        if (Rig.Phase == "combat")
                        {
                            yield return Rig.ReturnBoth();
                            Rig.ResetAfterExit();
                        }
                        pendingFinal = null;
                        confirmedChampion = null;
                        break;
                }
                PresentedEvent?.Invoke(item);
            }
            presenter = null;
        }

        IEnumerator PresentChampion()
        {
            if (pendingFinal == null || Rig.Phase != "combat") yield break;
            var winner = pendingFinal.winner;
            pendingFinal = null;
            confirmedChampion = null;
            Status = "冠军决赛 · 败者坠落";
            yield return Rig.RemoveLoserForChampionship(winner);
            yield return Rig.ChampionAward();
            ChampionshipAwards++;
            Status = "冠军接杯 · 返航";
            yield return Rig.ReturnWinner();
            Rig.ResetAfterExit();
            Status = "冠军演出完成 · 双方已离场";
        }

        void OnDestroy()
        {
            if (link) { link.OnCompetition = null; link.OnStatus = null; }
            ClearFighters();
            if (ownedTrophy) Destroy(ownedTrophy);
        }

        void LateUpdate()
        {
            var players = CurrentDuel?.players;
            var left = players?.Length == 2 ? Name(players[0]) : "等待选手";
            var right = players?.Length == 2 ? Name(players[1]) : "等待选手";
            if (Board) Board.Show(CurrentDuel?.id, CurrentRound?.id, CurrentRound?.index ?? 0,
                CurrentRound?.question?.task?.input,
                players?.Length == 2 ? left + "  " + Health(0) + " HP" : left,
                players?.Length == 2 ? right + "  " + Health(1) + " HP" : right,
                Status);
            if (LoungeBroadcast) LoungeBroadcast.Show(Status,
                players?.Length == 2 ? left + "  VS  " + right : "尚未选择赛事",
                CurrentRound?.index ?? 0);
            if (hud) hud.Show(snapshot, CurrentDuel, CurrentRound, Status, ConnectionStatus,
                left, right, HealthValue(0), HealthValue(1), CompetitionId);
        }

        string Name(string id) => snapshot?.entrants?.FirstOrDefault(x => x.id == id)?.name ?? id ?? "待定";

        string Health(int side)
        {
            var value = HealthValue(side);
            return value < 0 ? "?" : value.ToString("0.#");
        }

        float HealthValue(int side)
        {
            if (fighters[side]) return fighters[side].State.Health;
            return CurrentDuel?.hp?.Length == 2 ? (float)CurrentDuel.hp[side] : -1;
        }
    }
}
