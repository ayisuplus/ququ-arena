using System;
using System.Text;
using System.IO;
using System.Windows.Forms;

// Separate process: third-party shell extensions must not delay Unity's shutdown.
static class QuQuFileDialog
{
    [STAThread]
    static int Main(string[] args)
    {
        try
        {
            if (args.Length == 2 && args[0] == "exit-guard")
            {
                // Started only after Unity confirms its settings and backend save/detach.
                try
                {
                    using (var player = System.Diagnostics.Process.GetProcessById(int.Parse(args[1])))
                        if (player.ProcessName == "QuQuArena3D" && !player.WaitForExit(8000)) player.Kill();
                }
                catch (ArgumentException) { } // The player already exited before the helper started.
                catch (InvalidOperationException) { } // It exited between the wait and cleanup.
                return 0;
            }
            if (args.Length != 4) throw new ArgumentException("Expected mode, title, filter and filename");
            Application.EnableVisualStyles();
            using (FileDialog dialog = args[0] == "save" ? (FileDialog)new SaveFileDialog() : new OpenFileDialog())
            using (var owner = new Form())
            {
                owner.Text = "电子蛐蛐 · 文件选择";
                owner.Width = 420; owner.Height = 130; owner.StartPosition = FormStartPosition.CenterScreen;
                owner.FormBorderStyle = FormBorderStyle.FixedDialog; owner.MaximizeBox = false; owner.MinimizeBox = false;
                owner.Controls.Add(new Label { Text = "完成文件选择后返回游戏。", Dock = DockStyle.Fill, TextAlign = System.Drawing.ContentAlignment.MiddleCenter });
                dialog.Title = args[1]; dialog.Filter = args[2]; dialog.FileName = args[3];
                dialog.InitialDirectory = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
                dialog.RestoreDirectory = true;
                owner.Shown += delegate {
                    if (dialog.ShowDialog(owner) == DialogResult.OK)
                        using (var output = new StreamWriter(Console.OpenStandardOutput(), new UTF8Encoding(false)))
                            output.Write(dialog.FileName);
                    owner.Close();
                };
                Application.Run(owner);
            }
            return 0;
        }
        catch (Exception error)
        {
            using (var output = new StreamWriter(Console.OpenStandardError(), new UTF8Encoding(false)))
                output.Write(error.Message);
            return 1;
        }
    }
}
