using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;

namespace QuQu
{
    // The identical saved, mock-only duel drives both visual baselines.
    public static class ArenaSpectatorCapture
    {
        public const string Fixture = "E:/projects/AI斗兽场/docs/validation/duel-v05/fixture.json";
        public static CompetitionPacket Packet() => JsonUtility.FromJson<CompetitionPacket>(File.ReadAllText(Fixture));
        public static void Feed(IArenaTestShell shell, CompetitionPacket p, long seq)
        {
            shell.Duel.Receive(new CompetitionPacket { id=p.id, seq=seq, snapshot=p.snapshot, events=p.events.Where(e=>e.seq<=seq).ToArray() },false);
        }
        public static void Save(string path)
        {
            var texture=ScreenCapture.CaptureScreenshotAsTexture();
            File.WriteAllBytes(path,texture.EncodeToPNG()); UnityEngine.Object.Destroy(texture);
        }
        public static IEnumerator Run(IArenaTestShell shell,string dir)
        {
            Directory.CreateDirectory(dir);shell.Link.Disconnect();shell.UI.CloseModal();
            var p=Packet();var ids=p.snapshot.duels[0].players;
            shell.Preferences.Avatar(ids[0],0).presetId="chatgpt";shell.Preferences.Avatar(ids[1],1).presetId="claude";
            Feed(shell,p,6);while(shell.Duel.Round?.index!=1 || shell.Duel.Presenting)yield return null;yield return new WaitForSecondsRealtime(.2f);yield return new WaitForEndOfFrame();Save(Path.Combine(dir,"solving.png"));
            Feed(shell,p,9);yield return new WaitForSecondsRealtime(1);yield return new WaitForEndOfFrame();Save(Path.Combine(dir,"judging.png"));
            Feed(shell,p,10);while(!shell.Stage.Fighters.Any(f=>f.Slapping))yield return null;yield return new WaitForSecondsRealtime(.53f);yield return new WaitForEndOfFrame();Save(Path.Combine(dir,"single-attack.png"));
            yield return new WaitForSecondsRealtime(2);Feed(shell,p,26);
            while(shell.Duel.Round?.index!=3 || !shell.Duel.Presenting)yield return null;
            yield return new WaitForSecondsRealtime(1.3f);yield return new WaitForEndOfFrame();Save(Path.Combine(dir,"mutual-attack.png"));
            Feed(shell,p,p.seq);while(!shell.Finished)yield return null;
            yield return new WaitForSecondsRealtime(3.2f);yield return new WaitForEndOfFrame();Save(Path.Combine(dir,"winner.png"));
            File.WriteAllText(Path.Combine(dir,"capture.json"),"{\"width\":"+Screen.width+",\"height\":"+Screen.height+",\"hits\":"+shell.Duel.AppliedHits+",\"editor\":"+(Application.isEditor?"true":"false")+"}");
        }
    }
}
