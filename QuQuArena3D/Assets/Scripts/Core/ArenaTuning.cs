using UnityEngine;

namespace QuQu
{
    /** 调参资产（解耦方案 Phase 4-1）：把散落在各系统里的表现数值收进一个可编辑资产，
     *  改数值不用改代码、不用重编译。
     *  用法：Project 右键 Create ▸ QuQu ▸ Arena Tuning，放到任一 Resources 目录下命名 ArenaTuning 即生效；
     *  **没有该资产时全部回退到内置默认值，行为与改造前完全一致**（所以本次改动零行为变化）。
     *  取值一律走静态只读属性（Current 为空时用默认值），避免调用点到处判空。 */
    [CreateAssetMenu(menuName = "QuQu/Arena Tuning", fileName = "ArenaTuning")]
    public class ArenaTuning : ScriptableObject
    {
        [Header("对决")]
        [Tooltip("选手初始耐久（ArenaProtocol.FighterState.Health）")]
        public float maxHealth = 100;
        [Tooltip("扣血数字在 HUD 上的淡出时长（秒）")]
        public float damageFadeSeconds = 1;

        [Header("轨道站")]
        [Tooltip("短程接驳总时长（秒）")]
        public float transportShortHop = 2.45f;
        [Tooltip("长程接驳总时长（秒）")]
        public float transportLongHop = 4.35f;
        [Tooltip("接驳舱转向速度（每秒插值系数）")]
        public float transportTurnSpeed = 3;
        [Tooltip("站点高亮呼吸速度（每秒插值系数）")]
        public float pulseSpeed = 3;

        [Header("门面")]
        [Tooltip("偏好改动后延迟落盘的秒数（防抖）")]
        public float saveDebounceSeconds = .5f;

        const string ResourceName = "ArenaTuning";
        static ArenaTuning cached;
        static bool looked;
        static ArenaTuning Current
        {
            get
            {
                if (!looked) { looked = true; cached = Resources.Load<ArenaTuning>(ResourceName); }
                return cached; // 资产被删/改名时 cached 为 null，各属性回退默认值
            }
        }

        public static float MaxHealth => Current ? Current.maxHealth : 100;
        public static float DamageFadeSeconds => Current ? Current.damageFadeSeconds : 1;
        public static float TransportShortHop => Current ? Current.transportShortHop : 2.45f;
        public static float TransportLongHop => Current ? Current.transportLongHop : 4.35f;
        public static float TransportTurnSpeed => Current ? Current.transportTurnSpeed : 3;
        public static float PulseSpeed => Current ? Current.pulseSpeed : 3;
        public static float SaveDebounceSeconds => Current ? Current.saveDebounceSeconds : .5f;

        /** 编辑器里改完资产后清缓存（下次取值重新 Load），运行时无需调用。 */
        public static void Invalidate() { looked = false; cached = null; }
    }
}

