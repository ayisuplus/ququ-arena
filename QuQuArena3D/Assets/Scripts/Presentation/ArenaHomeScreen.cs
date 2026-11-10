using System.Linq;
using UnityEngine;

namespace QuQu
{
    /** 主菜单界面（P2 自 ArenaGame.ShowHome 逐行移出，行为保持一致）。 */
    public static class ArenaHomeScreen
    {
        public static void Show(IArenaShell shell)
        {
            if (shell.StopOffline()) shell.EndCombat();
            if (shell.IsSpectating) shell.ToggleSpectator();
            shell.UI.CloseModal();
            shell.Hud.gameObject.SetActive(false); shell.Reader.Close(); shell.Commentary.Close();
            shell.Stations.HomeView();
            var overlay = shell.UI.Box(shell.UI.transform, "Home", 0, 0, 1600, 900, new Color(.005f, .013f, .019f, .12f));
            shell.UI.OpenSurface("home", overlay, null, () => { shell.Hud.gameObject.SetActive(true); shell.Stations.LeaveHome(); });
            overlay.anchorMin = Vector2.zero; overlay.anchorMax = Vector2.one; overlay.offsetMin = overlay.offsetMax = Vector2.zero;
            overlay.GetComponent<UnityEngine.UI.Image>().raycastTarget = false;
            var page = shell.UI.Box(overlay, "Menu content", 0, 0, 1600, 900);
            page.anchorMin = page.anchorMax = new Vector2(.5f, .5f); page.anchoredPosition = new Vector2(-800, 450);
            shell.UI.Box(page, "Menu shade", 0, 0, 592, 900, new Color(.016f, .026f, .034f, .95f));
            shell.UI.Box(page, "Silver rule", 591, 0, 1, 900, new Color(.55f, .72f, .78f, .45f));
            shell.UI.Eyebrow(page, "QUQU   /   ORBITAL OBSERVATORY", 70, 89, 490);
            shell.UI.Box(page, "Identity rule", 70, 145, 42, 2, shell.UI.Accent);
            shell.UI.Label(page, "电子蛐蛐", 64, 187, 510, 88, 64);
            shell.UI.Eyebrow(page, "THE THINKING ARENA", 72, 281, 490);
            shell.UI.Label(page, "看大模型动脑。看小人动手。", 70, 342, 490, 50, 25);
            // P1 收编：宫格入口一律走导航路由（ArenaRoute），动态入口（最近赛事/重试连接/返回赛场）保持直调。
            shell.UI.Button(page, "开始比赛   →", 70, 415, 450, () => shell.UI.Nav.Go(ArenaRoute.Lobby), true);
            shell.UI.Button(page, "模型与 Agent", 70, 470, 450, () => shell.UI.Nav.Go(ArenaRoute.Agents));
            shell.UI.Button(page, "题库", 70, 525, 450, () => shell.UI.Nav.Go(ArenaRoute.Banks));
            shell.UI.Button(page, "历史与回放", 70, 580, 216, () => shell.UI.Nav.Go(ArenaRoute.History));
            shell.UI.Button(page, "排行榜", 302, 580, 218, () => shell.UI.Nav.Go(ArenaRoute.Rankings));
            shell.UI.Button(page, "设置", 70, 635, 216, () => shell.UI.Nav.Go(ArenaRoute.Settings));
            shell.UI.Button(page, "离线模拟体验", 302, 635, 218, () => shell.UI.Nav.Go(ArenaRoute.Demo));
            shell.UI.Button(page, "实验站 →", 70, 690, 216, () => shell.UI.Nav.Go(ArenaRoute.Lab));
            shell.UI.Button(page, "空中解说舱 →", 302, 690, 218, () => shell.UI.Nav.Go(ArenaRoute.Commentary));
            shell.UI.Button(page, "模型展馆 →", 70, 745, 216, () => shell.UI.Nav.Go(ArenaRoute.Gallery));
            shell.UI.Button(page, "任务中心", 302, 745, 218, () => shell.UI.Nav.Go(ArenaRoute.TaskCenter));
            shell.UI.Button(page, "退出", 70, 800, 450, () => shell.UI.Nav.Go(ArenaRoute.Exit));
            var connection = shell.UI.Label(page, "正在连接比赛服务…", 70, 854, 490, 35, 15, new Color(.65f, .73f, .78f));
            shell.UI.Eyebrow(page, "KEPLER STATION   /   LIVE ARENA", 1020, 40, 530);
            shell.UI.Label(page, "同轨道双站 · 黑洞科考设施", 990, 845, 560, 30, 17);
            shell.UI.Button(page, "返回赛场", 1260, 798, 250, shell.UI.CloseModal);
            shell.Run(shell.Link.Request<Catalog>("/api/shell/catalog", null, catalog =>
            {
                if (!page) return;
                connection.text = "比赛服务就绪  /  " + (catalog.arenas?.Length ?? 0) + " 个题库";
                var recent = catalog.competitions?.FirstOrDefault(c => c.status == "running" || c.status == "paused" || c.status == "waiting");
                if (recent != null) shell.UI.Button(page, "观看 / 继续最近赛事 →", 1030, 754, 450, () => { shell.UI.CloseModal(); shell.Link.WatchCompetition(recent.id); }, true);
            }, error => { if (page) { connection.text = "比赛服务未连接"; shell.UI.Button(page, "重试连接", 1030, 754, 450, () => { if (shell.Desktop.Owned) shell.Desktop.Boot(); else shell.ShowHome(); }); } }));
        }
    }
}
