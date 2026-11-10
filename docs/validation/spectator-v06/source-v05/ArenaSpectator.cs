using UnityEngine;
namespace QuQu
{
    public class ArenaSpectator : MonoBehaviour
    {
        public void Create(ArenaGame game)
        {
            var root=(RectTransform)transform; root.SetParent(game.UI.transform,false);
            root.anchorMin=root.anchorMax=new Vector2(.5f,.5f);root.pivot=new Vector2(0,1);
            root.sizeDelta=new Vector2(1600,900);root.anchoredPosition=new Vector2(-800,450);
            new GameObject("Dual answer HUD",typeof(RectTransform)).AddComponent<ArenaDuelHUD>().Create(game,root,true);
            var ui=game.UI;
            ui.Label(root,"QUQU / 1V1",30,22,290,42,27,ui.Accent);
            ui.Button(root,"全场",360,24,130,game.Stage.ResetCamera);
            ui.Button(root,"答卷 / 推理",505,24,165,game.ToggleReasoning);
            ui.Button(root,"暂停",685,24,120,()=>game.Connection.Control("pause"));
            ui.Button(root,"继续",820,24,120,()=>game.Connection.Control("resume"));
            ui.Button(root,"对阵 / 续赛",955,24,175,()=>game.Duel.ShowBracket());
            ui.Button(root,"自定义",1145,24,155,()=>game.ShowSettings(0));
            ui.Button(root,"退出大屏 / Esc",1315,24,255,game.ToggleSpectator);
            gameObject.SetActive(false);
        }
    }
}
