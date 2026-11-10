using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    [Serializable] public class ModelInfo { public string id, name, source; public bool ready, hidden; }
    [Serializable] public class ModelCatalog { public ModelInfo[] models; }
    [Serializable] public class ArenaInfo { public string id, title, description, mode; public int count; public bool needsJudge; }
    [Serializable] public class JobInfo { public string id, arena; }
    [Serializable] public class Catalog { public int version, gameVersion; public ArenaInfo[] arenas; public string[] replays; public JobInfo running; public CompetitionSummary[] competitions; }
    [Serializable] public class Launch { public string arena, judge, requestId; public string[] models, draw; public int limit = 10; public bool demo; }
    [Serializable] public class Reply { public string battle, id, error; }
    [Serializable] public class ControlRequest { public string action; }
    [Serializable] public class ReplayRequest { public string file; }
    [Serializable] public class Frames { public string battle; public long seq; public Frame[] frames; }
    [Serializable] public class SettlementRow { public string modelId, name; public float avg; public int answered, errors; }
    [Serializable] public class Settlement { public string outcome, reason; public string[] leaderIds, warnings; public SettlementRow[] rows; }
    [Serializable] public class Scoring { public string summary, aggregation, errorPolicy; }
    [Serializable] public class Comment { public string text, status; }
    [Serializable] public class Withdrawal { public string modelId, message; }
    [Serializable] public class Frame
    {
        public string type, battle, title, taskId, modelId, status, answer, reasoning, prompt, note, error, message, state, roundId, reportFile, text;
        public int attempt, index, total, roundIndex;
        public long seq;
        public float score, ms;
        public bool hasScore, stopped, replay;
        public ModelInfo[] roster;
        public Settlement settlement;
        public Scoring scoring;
        public Comment entry;
        public Withdrawal withdrawal;
    }

    public class FighterState
    {
        public string Id, Name, Status = "waiting", Answer = "", Reasoning = "", TaskId = "", Note = "";
        public float Health = 100;
        public readonly Dictionary<string, Frame> Calls = new Dictionary<string, Frame>();
        public bool Accept(Frame f, int plannedQuestions)
        {
            var key = f.taskId + "/" + f.roundId;
            if (Calls.TryGetValue(key, out var old) && (old.attempt > f.attempt || old.seq >= f.seq)) return false;
            Calls[key] = f;
            TaskId = f.taskId; Status = f.status ?? "waiting"; Answer = f.answer ?? ""; Reasoning = f.reasoning ?? ""; Note = f.error ?? f.note ?? "";
            // Health is set only by authoritative competition settlements/snapshots.
            return true;
        }
    }
}
