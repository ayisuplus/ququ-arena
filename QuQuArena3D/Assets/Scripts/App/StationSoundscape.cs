using System;
using System.Collections;
using UnityEngine;
using UnityEngine.InputSystem;

namespace QuQu
{
    // Scene-local audio; public match presentation remains the only event authority.
    public sealed class StationSoundscape : MonoBehaviour
    {
        [Serializable]
        public sealed class Zone
        {
            public AudioSource Source;
            public Vector3 Size;
            public float FadeDistance = 8, Level = .3f;
            public bool Music;
        }

        public Transform Listener;
        public Zone[] Zones;
        public AudioSource Notice, Interaction;
        public ArenaStationLiveMatch Match;
        public StationCafeMoment Cafe;
        public StationGreenhouseCare Greenhouse;
        public StationResearchDesk Research;
        public StationDockCargoService[] Cargo;
        public float MusicVolume { get; private set; }
        public float SoundVolume { get; private set; }
        public int NoticeCount { get; private set; }
        public int InteractionCount { get; private set; }
        public bool SettingsOpen { get; private set; }

        StationMatchHUD hud;
        Action[] cargoCallbacks;
        bool levelsChanged;
        string heardCompetition;
        long lastSequence;

        IEnumerator Start()
        {
            var prefs = ArenaPreferences.Load();
            SetLevels(prefs.musicVolume, prefs.soundVolume);
            Match.PresentedEvent += OnPresented;
            Cafe.StateChanged += OnCafe;
            Greenhouse.StateChanged += OnGreenhouse;
            Research.Opened += OnResearch;
            cargoCallbacks = new Action[Cargo.Length];
            for (int i = 0; i < Cargo.Length; i++)
            {
                var service = Cargo[i];
                cargoCallbacks[i] = () => Confirm(service.transform.position);
                service.StateChanged += cargoCallbacks[i];
            }
            yield return null; // The match creates its HUD and input delegates in Start.
            hud = FindFirstObjectByType<StationMatchHUD>();
            hud.AdditionalInputBlocked = BlocksInput;
        }

        bool BlocksInput()
        {
            if (!isActiveAndEnabled) return false;
            if (SettingsOpen) return true;
            var mouse = Mouse.current;
            if (mouse == null) return false;
            var point = mouse.position.ReadValue() * (900f / Screen.height);
            point.y = 900 - point.y;
            return new Rect(Screen.width * 900f / Screen.height - 110, 850, 94, 32).Contains(point);
        }
        void OnCafe() => Confirm(Cafe.Counter.position);
        void OnGreenhouse() => Confirm(Greenhouse.transform.position);
        void OnResearch() => Confirm(Research.transform.position);

        void Confirm(Vector3 point)
        {
            if (!isActiveAndEnabled || SoundVolume <= 0 || Vector3.Distance(Listener.position, point) > 12) return;
            Interaction.transform.position = point;
            Interaction.Stop();
            Interaction.Play();
            InteractionCount++;
        }

        void OnPresented(CompetitionEvent item)
        {
            if (heardCompetition != Match.CompetitionId)
            { heardCompetition = Match.CompetitionId; lastSequence = 0; }
            if (item.seq <= lastSequence) return;
            lastSequence = item.seq;
            if (!isActiveAndEnabled || SoundVolume <= 0 ||
                (item.type != "duel-start" && item.type != "competition-end" &&
                 !(item.type == "round-resolved" && item.round?.settled == true))) return;
            Notice.Stop();
            Notice.Play();
            NoticeCount++;
        }

        public void SetLevels(float music, float sound)
        {
            MusicVolume = Mathf.Clamp01(music);
            SoundVolume = Mathf.Clamp01(sound);
            Notice.volume = SoundVolume * .4f;
            Interaction.volume = SoundVolume * .5f;
            if (SoundVolume <= 0) { Notice.Stop(); Interaction.Stop(); }
            foreach (var zone in Zones)
                if ((zone.Music ? MusicVolume : SoundVolume) <= 0)
                { zone.Source.volume = 0; zone.Source.Pause(); }
        }

        void Update()
        {
            if (SettingsOpen && Keyboard.current?.escapeKey.wasPressedThisFrame == true) CloseSettings();
            foreach (var zone in Zones)
            {
                float distance = Mathf.Sqrt(new Bounds(zone.Source.transform.position, zone.Size).SqrDistance(Listener.position));
                float inside = 1 - Mathf.SmoothStep(0, 1, Mathf.Clamp01(distance / zone.FadeDistance));
                float maximum = zone.Level * (zone.Music ? MusicVolume : SoundVolume);
                var source = zone.Source;
                source.volume = Mathf.MoveTowards(source.volume, maximum * inside,
                    Mathf.Max(maximum, .01f) * Time.unscaledDeltaTime / 2);
                if (source.volume > .0001f)
                { if (!source.isPlaying) source.UnPause(); if (!source.isPlaying) source.Play(); }
                else if (source.isPlaying) source.Pause();
            }
        }

        public void OpenSettings()
        {
            SettingsOpen = true;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
        }
        public void CloseSettings()
        {
            SettingsOpen = false;
            if (!levelsChanged) return;
            var prefs = ArenaPreferences.Load(); // Preserve unrelated preferences edited elsewhere.
            prefs.musicVolume = MusicVolume; prefs.soundVolume = SoundVolume;
            prefs.Save(); levelsChanged = false;
        }

        void OnDisable()
        {
            CloseSettings();
            foreach (var zone in Zones) if (zone.Source) { zone.Source.volume = 0; zone.Source.Pause(); }
            if (Notice) Notice.Stop(); if (Interaction) Interaction.Stop();
        }

        void OnDestroy()
        {
            if (Match) Match.PresentedEvent -= OnPresented;
            if (Cafe) Cafe.StateChanged -= OnCafe;
            if (Greenhouse) Greenhouse.StateChanged -= OnGreenhouse;
            if (Research) Research.Opened -= OnResearch;
            if (cargoCallbacks != null)
                for (int i = 0; i < Cargo.Length; i++) if (Cargo[i]) Cargo[i].StateChanged -= cargoCallbacks[i];
            if (hud && hud.AdditionalInputBlocked == BlocksInput) hud.AdditionalInputBlocked = null;
        }

        void OnGUI()
        {
            var previous = GUI.matrix;
            float scale = Screen.height / 900f, width = Screen.width / scale;
            GUI.matrix = Matrix4x4.Scale(new Vector3(scale, scale, 1));
            if (GUI.Button(new Rect(width - 110, 850, 94, 32), SettingsOpen ? "收起声音" : "声音"))
            { if (SettingsOpen) CloseSettings(); else OpenSettings(); }
            if (SettingsOpen)
            {
                GUI.Box(new Rect(width - 300, 650, 284, 186), "声音");
                GUI.Label(new Rect(width - 280, 685, 245, 24), "音乐  " + Mathf.RoundToInt(MusicVolume * 100) + "%");
                float music = GUI.HorizontalSlider(new Rect(width - 280, 715, 245, 20), MusicVolume, 0, 1);
                GUI.Label(new Rect(width - 280, 745, 245, 24), "环境与提示  " + Mathf.RoundToInt(SoundVolume * 100) + "%");
                float sound = GUI.HorizontalSlider(new Rect(width - 280, 775, 245, 20), SoundVolume, 0, 1);
                GUI.Label(new Rect(width - 280, 804, 245, 22), "Esc 关闭并保存");
                if (!Mathf.Approximately(music, MusicVolume) || !Mathf.Approximately(sound, SoundVolume))
                { SetLevels(music, sound); levelsChanged = true; }
            }
            GUI.matrix = previous;
        }
    }
}
