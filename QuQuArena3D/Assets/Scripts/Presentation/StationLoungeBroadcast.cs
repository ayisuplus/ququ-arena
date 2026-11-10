using TMPro;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace QuQu
{
    // Shows the live station arena; competition state still comes from ArenaStationLiveMatch.
    public sealed class StationLoungeBroadcast : MonoBehaviour
    {
        public Renderer Screen;

        Camera feed, viewer;
        RenderTexture texture;
        Material screenMaterial, originalMaterial;
        TMP_Text heading, footer;

        void Awake()
        {
            if (!Screen) throw new System.InvalidOperationException("Lounge broadcast screen is missing");
            originalMaterial = Screen.sharedMaterial;
            if (!originalMaterial) throw new System.InvalidOperationException("Lounge broadcast material is missing");

            texture = new RenderTexture(960, 540, 16, RenderTextureFormat.ARGB32);
            texture.Create();
            screenMaterial = new Material(originalMaterial.shader);
            screenMaterial.SetTexture("_BaseMap", texture);
            Screen.sharedMaterial = screenMaterial;

            feed = new GameObject("Lounge arena feed camera").AddComponent<Camera>();
            feed.transform.position = new Vector3(0, 16.5f, 16);
            feed.transform.LookAt(new Vector3(0, 13.2f, 0));
            feed.fieldOfView = 42;
            feed.nearClipPlane = .1f;
            feed.farClipPlane = 150;
            feed.clearFlags = CameraClearFlags.SolidColor;
            feed.backgroundColor = new Color(.018f, .028f, .052f);
            feed.allowHDR = false;
            feed.GetUniversalAdditionalCameraData().renderPostProcessing = false;
            feed.targetTexture = texture;
            feed.enabled = false;
            viewer = Camera.main;

            heading = Label("Lounge match phase", 6.9f, 4.8f, new Color(.58f, .9f, 1));
            footer = Label("Lounge contestants", 3.3f, 4.5f, Color.white);
            Show("等待赛事", "尚未选择赛事", 0);
        }

        TMP_Text Label(string name, float y, float size, Color color)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            go.transform.localPosition = new Vector3(0, y, -.15f);
            go.transform.localRotation = Quaternion.identity;
            var label = go.AddComponent<TextMeshPro>();
            label.font = Resources.Load<TMP_FontAsset>("ArenaFont");
            label.fontSize = size;
            label.color = color;
            label.alignment = TextAlignmentOptions.Center;
            label.rectTransform.sizeDelta = new Vector2(11.5f, .72f);
            label.overflowMode = TextOverflowModes.Ellipsis;
            label.richText = false;
            return label;
        }

        public void Show(string phase, string contestants, int round)
        {
            var title = string.IsNullOrEmpty(phase) ? "等待赛事" : phase;
            var detail = round > 0 ? contestants + " · 第 " + round + " 题" : contestants;
            if (heading.text != title) heading.text = title;
            if (footer.text != detail) footer.text = detail;
        }

        void LateUpdate()
        {
            if (!viewer) viewer = Camera.main;
            if (feed && viewer && (viewer.transform.position - transform.position).sqrMagnitude < 900)
                feed.Render();
        }

        void OnDestroy()
        {
            if (Screen && originalMaterial) Screen.sharedMaterial = originalMaterial;
            if (feed) Destroy(feed.gameObject);
            if (texture) { texture.Release(); Destroy(texture); }
            if (screenMaterial) Destroy(screenMaterial);
        }
    }
}
