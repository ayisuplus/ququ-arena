namespace QuQu
{
    /** 顶部导航条（P2 UI 构建收口）：品牌区 + 四个全局入口。
     *  入口一律走导航路由（ArenaRoute），不再各持跳转闭包（P1 收编）。 */
    public static class ArenaHeaderBar
    {
        public static void Build(ArenaUI ui)
        {
            var header = ui.Box(ui.Root, "Header", 0, 0, ArenaLayout.CanvasW, ArenaLayout.HeaderH, ArenaLayout.Panel);
            ui.Label(header, "QUQU / ARENA", 30, 20, 310, 25, 18, ui.Accent);
            ui.Label(header, "AI 斗兽场 · 3D", 30, 49, 350, 34, 27);
            ui.Label(header, "看它们思考。看它们交手。", 420, 31, 530, 42, 29);
            ui.Button(header, "首页", 980, 30, 75, () => ui.Nav.Go(ArenaRoute.Home));
            ui.Button(header, "开赛 / 回放", 1070, 30, 155, () => ui.Nav.Go(ArenaRoute.Lobby), true);
            ui.Button(header, "自定义", 1240, 30, 130, () => ui.Nav.Go(ArenaRoute.Settings));
            ui.Button(header, "实验站", 1385, 30, 185, () => ui.Nav.Go(ArenaRoute.Lab));
            header.gameObject.SetActive(false); // 与旧实现一致：默认隐藏，由流程按需显隐
        }
    }
}
