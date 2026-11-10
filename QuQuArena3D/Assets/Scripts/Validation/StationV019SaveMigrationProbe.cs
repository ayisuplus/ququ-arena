using System;
using System.Collections;
using System.IO;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace QuQu
{
    /// <summary>
    /// v019 候选的旧存档迁移（--station-v019-save-migration-output / --station-v019-save-migration-case）。
    /// seed 阶段在 V019 里写一份真实存档并复制成 V016 目录下的旧档；migrate 阶段用全新目录启动，
    /// 断言 StationWorldSave 认到 "migrated-V016-primary" 且旧进度真的落回当前世界。
    /// </summary>
    public sealed class StationV019SaveMigrationProbe : MonoBehaviour
    {
        [Serializable]
        sealed class Result
        {
            public string testCase, scene, loadSource, error;
            public int careCount;
            public bool seededLegacySave;
        }

        const string Scene = "BlackHoleStationDistrictsV019";
        const string LegacyScene = "BlackHoleStationCreativeBuildingsV016";

        string output, testCase;

        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void StartIfRequested()
        {
            var args = Environment.GetCommandLineArgs();
            int outputAt = Array.IndexOf(args, "--station-v019-save-migration-output");
            int caseAt = Array.IndexOf(args, "--station-v019-save-migration-case");
            if (outputAt < 0 || outputAt + 1 >= args.Length ||
                caseAt < 0 || caseAt + 1 >= args.Length ||
                !Path.IsPathRooted(args[outputAt + 1])) return;
            // v019 候选把 StationWorldSave 设为禁用（美术候选不自动存档）；迁移验证需要在
            // 首帧之前打开它，让它按命令行目录完成读档与迁移链解析。
            var save = FindFirstObjectByType<StationWorldSave>();
            if (!save) throw new InvalidOperationException("V019 场景缺少 StationWorldSave");
            save.enabled = true;
            var probe = new GameObject("V019 save migration Player probe")
                .AddComponent<StationV019SaveMigrationProbe>();
            probe.output = args[outputAt + 1];
            probe.testCase = args[caseAt + 1];
        }

        IEnumerator Start()
        {
            yield return null;
            yield return null;
            Directory.CreateDirectory(output);
            var result = new Result { testCase = testCase, scene = SceneManager.GetActiveScene().name };
            var walker = FindFirstObjectByType<StationGrayboxWalker>();
            var save = FindFirstObjectByType<StationWorldSave>();
            var greenhouse = FindFirstObjectByType<StationGreenhouseCare>();
            try
            {
                if (result.scene != Scene || !walker || !save || !greenhouse)
                    throw new InvalidOperationException("V019 存档场景不完整 scene=" + result.scene +
                        " walker=" + (walker != null) + " save=" + (save != null) +
                        " saveEnabled=" + (save != null && save.enabled) +
                        " greenhouse=" + (greenhouse != null));
                if (testCase == "seed") Seed(result, save, greenhouse, walker);
                else if (testCase == "migrate") Migrate(result, save, greenhouse);
                else throw new InvalidOperationException("未知迁移用例 " + testCase);
            }
            catch (Exception error) { result.error = error.ToString(); }
            File.WriteAllText(Path.Combine(output, testCase + ".json"), JsonUtility.ToJson(result, true));
            Application.Quit(string.IsNullOrEmpty(result.error) ? 0 : 1);
        }

        void Seed(Result result, StationWorldSave save, StationGreenhouseCare greenhouse,
            StationGrayboxWalker walker)
        {
            if (save.LastLoadSource != "fresh")
                throw new InvalidOperationException("seed 需要全新目录，实际来源 " + save.LastLoadSource);
            // 走到苗床边照料两次，让旧档带上可辨认的进度（Stage 2 / CareCount 1）；
            // 随后回到原出生点再落盘：环随动存档按环内局部坐标记录，站错环会写出自相矛盾的旧档。
            var body = walker.GetComponent<CharacterController>();
            var spawn = walker.transform.position;
            walker.enabled = false;
            body.enabled = false;
            walker.transform.position = greenhouse.transform.position;
            body.enabled = true;
            walker.enabled = true;
            if (!greenhouse.Use() || !greenhouse.Use())
                throw new InvalidOperationException("苗床照料不可用");
            if (greenhouse.CareCount != 1) throw new InvalidOperationException("照料次数不对");
            walker.enabled = false;
            body.enabled = false;
            walker.transform.position = spawn;
            body.enabled = true;
            walker.enabled = true;
            Physics.SyncTransforms();
            walker.ResetGroundReference();
            if (!save.SaveNow()) throw new InvalidOperationException(
                "V019 存档写入失败 enabled=" + save.enabled + " source=" + save.LastLoadSource +
                " file=" + save.FilePath + " exists=" + File.Exists(save.FilePath));
            // 把这份真实存档改写成 V016 目录下的旧档：只改场景身份，其余内容原样。
            var legacy = File.ReadAllText(save.FilePath)
                .Replace("\"" + Scene + "\"", "\"" + LegacyScene + "\"");
            var legacyFile = Path.Combine(Path.GetDirectoryName(Path.GetDirectoryName(save.FilePath)),
                LegacyScene, "world-v1.json");
            Directory.CreateDirectory(Path.GetDirectoryName(legacyFile));
            File.WriteAllText(legacyFile, legacy);
            if (!File.Exists(legacyFile) || !File.ReadAllText(legacyFile).Contains("\"" + LegacyScene + "\""))
                throw new InvalidOperationException("旧档未落盘");
            result.careCount = greenhouse.CareCount;
            result.seededLegacySave = true;
        }

        void Migrate(Result result, StationWorldSave save, StationGreenhouseCare greenhouse)
        {
            result.loadSource = save.LastLoadSource;
            result.careCount = greenhouse.CareCount;
            if (save.LastLoadSource != "migrated-V016-primary")
                throw new InvalidOperationException("v019 未认到 V016 旧档，实际来源 " + save.LastLoadSource);
            if (greenhouse.CareCount != 1)
                throw new InvalidOperationException("迁移后照料进度未恢复：" + greenhouse.CareCount);
            if (!File.Exists(save.FilePath))
                throw new InvalidOperationException("迁移后未在 v019 目录写回存档");
            if (File.ReadAllText(save.FilePath).Contains("\"" + LegacyScene + "\""))
                throw new InvalidOperationException("v019 存档仍挂着 V016 场景身份");
        }
    }
}