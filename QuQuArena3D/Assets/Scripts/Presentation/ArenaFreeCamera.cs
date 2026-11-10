using UnityEngine;
using UnityEngine.InputSystem;
using UnityEngine.EventSystems;

namespace QuQu
{
    public class ArenaFreeCamera : MonoBehaviour
    {
        public bool Active { get; private set; }
        public float Speed { get; private set; } = 3;
        public System.Func<bool> InputBlocked;
        float yaw, pitch;
        bool looking;
        CursorLockMode previousLock;
        bool previousVisible;
        public void SetActive(bool value)
        {
            Active=value;ReleasePointer();
            var angles=transform.eulerAngles;yaw=angles.y;pitch=Mathf.DeltaAngle(0,angles.x);
            GetComponent<Camera>().nearClipPlane=value?.025f:.1f;
        }
        void ReleasePointer()
        {
            if(!looking)return;looking=false;Cursor.lockState=previousLock;Cursor.visible=previousVisible;
        }
        void OnDisable(){ReleasePointer();}
        void OnApplicationFocus(bool focused){if(!focused)ReleasePointer();}
        void Update()
        {
            if(!Active || !Application.isFocused || InputBlocked?.Invoke()==true){ReleasePointer();return;}
            var mouse=Mouse.current;var keyboard=Keyboard.current;if(mouse==null || keyboard==null)return;
            bool overUI=EventSystem.current && EventSystem.current.IsPointerOverGameObject();
            if(!looking && mouse.rightButton.wasPressedThisFrame && !overUI)
            {previousLock=Cursor.lockState;previousVisible=Cursor.visible;looking=true;Cursor.lockState=CursorLockMode.Locked;Cursor.visible=false;}
            if(!mouse.rightButton.isPressed)ReleasePointer();
            if(overUI && !looking)return;
            float scroll=mouse.scroll.ReadValue().y;
            if(scroll!=0)Speed=Mathf.Clamp(Speed*Mathf.Pow(1.2f,scroll/120f),.1f,20);
            var move=new Vector3((keyboard.dKey.isPressed?1:0)-(keyboard.aKey.isPressed?1:0),(keyboard.eKey.isPressed?1:0)-(keyboard.qKey.isPressed?1:0),(keyboard.wKey.isPressed?1:0)-(keyboard.sKey.isPressed?1:0));
            float boost=keyboard.leftShiftKey.isPressed||keyboard.rightShiftKey.isPressed?4:keyboard.leftCtrlKey.isPressed||keyboard.rightCtrlKey.isPressed?.15f:1;
            Move(move,looking?mouse.delta.ReadValue():Vector2.zero,Time.unscaledDeltaTime,boost);
        }
        // Used by both input and the opt-in runtime acceptance check.
        public void Move(Vector3 local,Vector2 look,float seconds,float multiplier=1)
        {
            if(!Active)return;
            yaw+=look.x*.15f;pitch=Mathf.Clamp(pitch-look.y*.15f,-89,89);
            transform.rotation=Quaternion.Euler(pitch,yaw,0);
            var direction=transform.right*local.x+Vector3.up*local.y+transform.forward*local.z;
            transform.position+=Vector3.ClampMagnitude(direction,1)*Speed*multiplier*seconds;
        }
    }
}
