using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    [Serializable] public class ModelInfo { public string id, name, source, agent, model, billing, billingLabel, message, version, effort; public bool ready, hidden, free; }
    [Serializable] public class AgentStatus { public string id, name, status, message, billing, billingLabel; public float remaining; public long resetsAt; }
    [Serializable] public class AgentCatalog { public AgentStatus[] agents; public ModelInfo[] models; }
    [Serializable] public class ModelCatalog { public ModelInfo[] models; }
    [Serializable] public class ArenaInfo { public string id, title, description, mode; public int count; public bool needsJudge; }
    [Serializable] public class JobInfo { public string id, arena; }
    [Serializable] public class Catalog { public int version, gameVersion, nativeAgentsVersion; public ArenaInfo[] arenas; public string[] replays; public JobInfo running; public CompetitionSummary[] competitions; }
    // tier：开赛档位，"official"=正式档（可用 BYOK）/"free"=免费演示档；留空则后端沿用免费档默认。
    [Serializable] public class Launch { public string arena, judge, requestId, tier; public string[] models, draw; public int limit = 10; public bool demo; }
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
        public float Health = ArenaTuning.MaxHealth; // P4：默认 100，可由 ArenaTuning 资产覆盖
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
