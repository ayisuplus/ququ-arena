using System;
using System.Collections;
using System.Linq;
using System.Reflection;

namespace QuQu
{
    /** 验证 harness 自注册标记（解耦方案 Phase 5-1）：新增一个 harness 只要给类打上标记并实现
     *  `public static IEnumerator Run(ArenaGame g, ...)`，不必再回来改组合根 ArenaBootstrap 的表。
     *  boot=true 表示这个 harness 需要先把本地后端拉起来（原表里的 boot 列）。 */
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
    public sealed class ArenaHarnessAttribute : Attribute
    {
        public string Flag { get; }
        public bool Boot { get; }
        public ArenaHarnessAttribute(string flag, bool boot = false) { Flag = flag; Boot = boot; }
    }

    /** harness 注册表（P5）：反射发现带标记的类并按 flag 索引。
     *  ⚠️ 只在命令行命中任一 flag 时才反射（见 ArenaBootstrap），正常启动零开销。
     *  多个 flag 同时出现时按 flag 名字排序取第一个——与原静态表的"实际互斥"假设一致。 */
    public static class ArenaHarnesses
    {
        public sealed class Entry
        {
            public string Flag;
            public bool Boot;
            public MethodInfo Run;
        }

        static Entry[] all;

        public static Entry[] All => all ?? (all = Discover());

        static Entry[] Discover()
        {
            var list = new System.Collections.Generic.List<Entry>();
            // P5 asmdef：Check 类全在 QuQu.Validation，注册表在 QuQu.App —— 单程序集时代
            // typeof(ArenaHarnesses).Assembly.GetTypes() 拆分后扫不到任何 harness（实证：门 8 分钟
            // 超时 exit 3、runtime.json 零产出）。改为扫描全部已加载程序集（反射仅命令行命中 flag 时发生）。
            foreach (var assembly in AppDomain.CurrentDomain.GetAssemblies())
            {
                Type[] types;
                try { types = assembly.GetTypes(); }
                catch (ReflectionTypeLoadException e) { types = e.Types.Where(t => t != null).ToArray(); }
                catch { continue; }
                foreach (var type in types)
                {
                    var attribute = type.GetCustomAttribute<ArenaHarnessAttribute>();
                    if (attribute == null) continue;
                    var run = type.GetMethod("Run", BindingFlags.Public | BindingFlags.Static);
                    if (run == null || !typeof(IEnumerator).IsAssignableFrom(run.ReturnType)) continue;
                    list.Add(new Entry { Flag = attribute.Flag, Boot = attribute.Boot, Run = run });
                }
            }
            return list.OrderBy(e => e.Flag, StringComparer.Ordinal).ToArray();
        }

        public static Entry Find(string[] args)
            => All.FirstOrDefault(e => Array.IndexOf(args, e.Flag) >= 0);

        /** 按形参个数补齐实参：第二位固定给 qa-output 目录，其余取形参默认值。
         *  （原 Bootstrap 里 ArenaSlapCheck 单独走 `args[index+1]`，这里统一处理。） */
        public static IEnumerator Invoke(Entry entry, ArenaGame game, string qaOutput)
        {
            var parameters = entry.Run.GetParameters();
            var arguments = new object[parameters.Length];
            for (int i = 0; i < parameters.Length; i++)
            {
                if (i == 0) { arguments[i] = game; continue; }
                var p = parameters[i];
                if (p.ParameterType == typeof(string)) { arguments[i] = qaOutput ?? ""; continue; }
                arguments[i] = p.HasDefaultValue ? p.DefaultValue : (p.ParameterType == typeof(bool) ? (object)false : null);
            }
            return (IEnumerator)entry.Run.Invoke(null, arguments);
        }
    }
}
