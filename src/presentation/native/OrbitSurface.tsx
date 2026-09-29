import type { ReactNode } from 'react';
import type { useViewport } from './useViewport';
export function OrbitSurface({view,className,label,children,onClick}: {view:ReturnType<typeof useViewport>;className:string;label:string;children?:ReactNode;onClick?:(x:number,y:number)=>void}){
    return <div ref={view.host} className={className} aria-label={label} onContextMenu={e=>e.preventDefault()}
        onPointerDown={e=>{if(e.target!==e.currentTarget)return;view.drag.current={x:e.clientX,y:e.clientY,button:e.button,distance:0};e.currentTarget.setPointerCapture(e.pointerId);}}
        onPointerMove={e=>{const d=view.drag.current;if(!d)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;d.distance+=Math.hypot(dx,dy);d.x=e.clientX;d.y=e.clientY;view.orbit(dx,dy);}}
        onPointerUp={e=>{const d=view.drag.current;view.drag.current=undefined;if(e.currentTarget.hasPointerCapture(e.pointerId))e.currentTarget.releasePointerCapture(e.pointerId);if(d&&d.distance<5&&d.button===0)onClick?.(e.clientX,e.clientY);}}
        onPointerCancel={()=>{view.drag.current=undefined;}}>
        {view.error&&<p className="native-error" role="alert">{view.error}</p>}{children}
    </div>;
}
