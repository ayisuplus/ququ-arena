using System;
using UnityEngine;

namespace QuQu
{
    // Clip measurements come from the exact character rig during import.
    public sealed class ArenaCombatMotion : MonoBehaviour
    {
        [Serializable] public class Attack
        {
            public string state, limb;
            public float duration, contact, reach, height;
        }
        public Attack[] attacks;
        public bool ranged;
        public float strideSpeed = 1.8f;
    }
}
