(function defineSwipeNavigation(){
  'use strict';
  window.bindSwipeNavigation=function(surface,options){
    const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
    let gesture=null;
    let suppressClickUntil=0;
    function finish(cancelled){
      if(!gesture)return;
      const current=gesture;
      gesture=null;
      if(!current.locked)return;
      suppressClickUntil=Date.now()+400;
      const direction=current.dx<0?1:-1;
      const elapsed=Math.max(1,performance.now()-current.started);
      const committed=!cancelled && options.canMove(direction) &&
        (Math.abs(current.dx)>=64 || (Math.abs(current.dx)>=32 && Math.abs(current.dx)/elapsed>.45));
      const element=current.element;
      const from=element.style.transform;
      element.style.transform='';
      if(committed){options.move(direction);return;}
      if(!reduced.matches && element.isConnected && element.animate){
        element.animate([{transform:from},{transform:'translateX(0)'}],
          {duration:180,easing:'cubic-bezier(.2,.8,.2,1)'});
      }
    }
    // A new press is intentional; only suppress the click synthesized by the previous swipe.
    surface.addEventListener('pointerdown',()=>{suppressClickUntil=0;},{passive:true});
    surface.addEventListener('touchstart',event=>{
      if(gesture)finish(true);
      if(event.touches.length!==1 || !options.enabled())return;
      if(event.target.closest('input,textarea,select,a,.chips,.qty,.chart-plot,.trend-plot,.trend-control,.datejump,[contenteditable]'))return;
      const touch=event.touches[0];
      // Leave the device's edge-back gesture available.
      if(touch.clientX<24 || touch.clientX>innerWidth-24)return;
      gesture={x:touch.clientX,y:touch.clientY,dx:0,started:performance.now(),
        locked:false,element:surface.querySelector('main')};
    },{passive:true});
    surface.addEventListener('touchmove',event=>{
      if(!gesture)return;
      if(event.touches.length!==1 || !options.enabled()){finish(true);return;}
      const touch=event.touches[0];
      const dx=touch.clientX-gesture.x;
      const dy=touch.clientY-gesture.y;
      if(!gesture.locked){
        if(Math.abs(dy)>10 && Math.abs(dy)>=Math.abs(dx)){gesture=null;return;}
        if(Math.abs(dx)<12 || Math.abs(dx)<Math.abs(dy)*1.4)return;
        gesture.locked=true;
        gesture.element.getAnimations().forEach(animation=>animation.cancel());
      }
      if(event.cancelable)event.preventDefault();
      gesture.dx=dx;
      const resistance=options.canMove(dx<0?1:-1) ? .55 : .16;
      if(!reduced.matches)gesture.element.style.transform='translateX('+Math.max(-130,Math.min(130,dx*resistance))+'px)';
    },{passive:false});
    surface.addEventListener('touchend',()=>finish(false),{passive:true});
    surface.addEventListener('touchcancel',()=>finish(true),{passive:true});
    surface.addEventListener('click',event=>{
      if(Date.now()<suppressClickUntil){event.preventDefault();event.stopImmediatePropagation();}
    },true);
  };
})();
