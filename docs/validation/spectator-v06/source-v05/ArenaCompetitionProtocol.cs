using System;
namespace QuQu
{
    [Serializable] public class CompetitionSummary { public string id, title, status, winner, createdAt; }
    [Serializable] public class CompetitionConfig { public string arena, judge, requestId; public string[] models, draw; public int limit = 10; public bool demo; }
    [Serializable] public class CompetitionTask { public string id, input; }
    [Serializable] public class CompetitionQuestion { public string key; public CompetitionTask task; }
    [Serializable] public class CompetitionAnswer { public string model, answer, reasoning, error, note; public double score; }
    [Serializable] public class CompetitionLive { public string modelId, status, answer, reasoning, error; public int attempt; }
    [Serializable] public class CompetitionAttack { public string attacker, target; public double damage; }
    [Serializable] public class CompetitionRound
    {
        public string id, phase; public int index; public bool overtime, settled;
        public CompetitionQuestion question; public CompetitionAnswer[] records; public CompetitionLive[] live;
        public double[] before, after; public CompetitionAttack[] attacks;
    }
    [Serializable] public class CompetitionDuel
    {
        public string id, status, reason, winner; public int stage, regularLimit, overtimeUsed;
        public bool overtime; public string[] sources, players; public double[] hp; public CompetitionRound[] rounds;
    }
    [Serializable] public class CompetitionSnapshot
    {
        public string id, status, activeDuelId, winner, reason; public long seq;
        public CompetitionConfig config; public ModelInfo[] entrants; public CompetitionDuel[] duels;
    }
    [Serializable] public class CompetitionEvent
    {
        public long seq, at; public string type, competitionId, duelId, message, winner;
        public CompetitionRound round; public CompetitionDuel duel;
    }
    [Serializable] public class CompetitionPacket { public string id; public long seq; public CompetitionSnapshot snapshot; public CompetitionEvent[] events; }
    [Serializable] public class ContinueCompetition { public string duelId, arena; }
}
