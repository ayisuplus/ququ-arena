namespace QuQu
{
    /** 底部比赛控制条（P2 UI 构建收口）：暂停/继续/结束、镜头、面板与观战入口。
     *  代码自 ArenaUI.Create 逐行移出，坐标与文案不变。 */
    public static class ArenaControlsBar
    {
        public static void Build(ArenaUI ui, IArenaCommands commands, ArenaPreferences preferences)
        {
            var controls = ui.Box(ui.Root, "Match controls", ArenaLayout.ControlsX, ArenaLayout.ControlsY, ArenaLayout.ControlsW, ArenaLayout.ControlsH, ArenaLayout.Panel);
            ui.Button(controls, "暂停", 15, 14, 100, () => commands.Control("pause"));
            ui.Button(controls, "继续", 125, 14, 100, () => commands.Control("resume"));
            ui.Button(controls, "结束本场", 235, 14, 125, () => commands.Control("stop"));
            ui.Button(controls, "镜头环绕", 455, 14, 130, () => commands.CameraOrbit = !commands.CameraOrbit);
            ui.Button(controls, "复位镜头", 595, 14, 130, commands.ResetCamera);
            ui.Button(controls, "答题面板", 735, 14, 130, () => { preferences.answersVisible = !preferences.answersVisible; commands.ApplyPreferences(); });
            ui.Button(controls, "大屏观战 F10", 880, 14, 175, commands.ToggleSpectator, true);
            ui.Button(controls, "选手特写", 1068, 14, 140, commands.FocusSelected);
            ui.Button(controls, "对阵 / 续赛", 1380, 14, 145, () => commands.ShowBracket());
            ui.Button(controls, "答卷 / 推理", 1220, 14, 145, commands.ToggleReasoning);
            controls.gameObject.SetActive(false); // 与旧实现一致：默认隐藏，由流程按需显隐
        }
    }
}
