using UnityEngine;
using UnityEngine.UI;

namespace QuQu
{
    // One mesh keeps the trim and surface together without extra raycast targets or canvases.
    public class ArenaPanel : Image
    {
        protected override void OnPopulateMesh(VertexHelper mesh)
        {
            mesh.Clear();
            var r = GetPixelAdjustedRect();
            float cut = Mathf.Min(8, r.height * .13f), edge = 1;
            Vector2[] Ring(float inset) => new[] {
                new Vector2(r.xMin + cut, r.yMax - inset), new Vector2(r.xMax - cut, r.yMax - inset),
                new Vector2(r.xMax - inset, r.yMax - cut), new Vector2(r.xMax - inset, r.yMin + cut),
                new Vector2(r.xMax - cut, r.yMin + inset), new Vector2(r.xMin + cut, r.yMin + inset),
                new Vector2(r.xMin + inset, r.yMin + cut), new Vector2(r.xMin + inset, r.yMax - cut) };
            var outer = Ring(0); var inner = Ring(edge);
            var trim = Color.Lerp(color, new Color(.64f, .76f, .82f, color.a), .32f);
            for (int i = 0; i < 8; i++) mesh.AddVert(outer[i], trim, Vector2.zero);
            for (int i = 0; i < 8; i++)
            {
                float top = Mathf.InverseLerp(r.yMin, r.yMax, inner[i].y);
                var surface = Color.Lerp(color, new Color(color.r + .023f, color.g + .026f, color.b + .028f, color.a), top);
                mesh.AddVert(inner[i], surface, Vector2.zero);
            }
            mesh.AddVert(r.center, color, Vector2.zero);
            for (int i = 0; i < 8; i++)
            {
                int next = (i + 1) % 8;
                mesh.AddTriangle(i, next, 8 + next); mesh.AddTriangle(i, 8 + next, 8 + i);
                mesh.AddTriangle(16, 8 + i, 8 + next);
            }
        }
    }
}
