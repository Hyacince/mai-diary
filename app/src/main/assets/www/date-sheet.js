(function(root){
  'use strict';
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const easing='cubic-bezier(.22,1,.36,1)';
  const selected='.calendar-week.selected,.period-grid .selected,.calendar-day.single-selected';
  let suppressUntil=0;
  function markerBox(target,sheet){
    const r=target.getBoundingClientRect(),base=sheet.getBoundingClientRect();
    const circle=target.matches('.single-selected,.period-grid .selected');
    const width=circle?Math.min(r.width,r.height):r.width,height=circle?Math.min(r.width,r.height):r.height;
    return {left:r.left-base.left+(r.width-width)/2,top:r.top-base.top+sheet.scrollTop+(r.height-height)/2,width,height,
      radius:circle?'50%':getComputedStyle(target).borderRadius};
  }
  function animate(node,frames,duration=300){
    return !reduced.matches&&node.animate?node.animate(frames,{duration,easing,fill:'backwards'}):null;
  }
  function capture(overlay){
    const sheet=overlay?.querySelector('.period-sheet');
    const node=sheet?.querySelector('.calendar-highlight')||sheet?.querySelector(selected);
    if(!node)return null;
    const r=node.getBoundingClientRect(),base=sheet.getBoundingClientRect();
    return {left:r.left-base.left,top:r.top-base.top+sheet.scrollTop,width:r.width,height:r.height};
  }
  function highlight(overlay,before){
    const sheet=overlay.querySelector('.period-sheet'),target=sheet.querySelector(selected);
    if(!target)return;
    const r=markerBox(target,sheet),{left,top}=r;
    const marker=document.createElement('div');marker.className='calendar-highlight';marker.setAttribute('aria-hidden','true');
    Object.assign(marker.style,{left:left+'px',top:top+'px',width:r.width+'px',height:r.height+'px',borderRadius:r.radius});
    sheet.prepend(marker);sheet.classList.add('highlight-ready');
    if(before)animate(marker,[{transform:`translate(${before.left-left}px,${before.top-top}px) scale(${before.width/r.width},${before.height/r.height})`},{transform:'translate(0,0) scale(1,1)'}],280);
  }
  function hide(overlay,done){
    const sheet=overlay.querySelector('.period-sheet');
    const from=getComputedStyle(sheet).transform;
    sheet.getAnimations().forEach(a=>a.cancel());
    overlay.dataset.closing='true';
    animate(overlay,[{backgroundColor:getComputedStyle(overlay).backgroundColor},{backgroundColor:'transparent'}],260);
    const animation=animate(sheet,[{transform:from==='none'?'translateY(0)':from},{transform:'translateY(100%)'}],260);
    if(animation)animation.finished.then(done,done);else done();
  }
  function attach(overlay,close,before,opening,changePage){
    const sheet=overlay.querySelector('.period-sheet');
    highlight(overlay,before);
    if(opening){
      animate(overlay,[{backgroundColor:'transparent'},{backgroundColor:'rgba(35,23,11,.4)'}],320);
      animate(sheet,[{transform:'translateY(100%)'},{transform:'translateY(0)'}],360);
    }
    let drag=null,horizontal=null;
    overlay.addEventListener('pointerdown',()=>{suppressUntil=0;},{passive:true});
    sheet.addEventListener('touchstart',e=>{
      horizontal=null;
      if(overlay.dataset.closing||e.touches.length!==1||!e.target.closest('.calendar-days,.period-grid,.calendar-weekdays,.period-heading'))return;
      const t=e.touches[0];horizontal={x:t.clientX,y:t.clientY,dx:0,locked:false,start:performance.now()};
    },{passive:true});
    sheet.addEventListener('touchmove',e=>{
      if(!horizontal)return;
      if(e.touches.length!==1){horizontal=null;return;}
      const t=e.touches[0],dx=t.clientX-horizontal.x,dy=t.clientY-horizontal.y;
      if(!horizontal.locked){
        if(Math.abs(dy)>10&&Math.abs(dy)>=Math.abs(dx)){horizontal=null;return;}
        if(Math.abs(dx)<12||Math.abs(dx)<Math.abs(dy)*1.4)return;
        horizontal.locked=true;
      }
      horizontal.dx=dx;if(e.cancelable)e.preventDefault();
    },{passive:false});
    sheet.addEventListener('touchend',()=>{
      const swipe=horizontal;horizontal=null;
      if(!swipe?.locked)return;
      suppressUntil=performance.now()+450;
      const distance=Math.abs(swipe.dx),speed=distance/Math.max(1,performance.now()-swipe.start);
      if(distance>=56||(distance>=32&&speed>.45))changePage(swipe.dx<0?1:-1);
    },{passive:true});
    sheet.addEventListener('touchcancel',()=>{horizontal=null;},{passive:true});
    overlay.addEventListener('click',e=>{
      if(performance.now()<suppressUntil){e.preventDefault();e.stopImmediatePropagation();return;}
      if(e.target===overlay){e.stopPropagation();close();}
    },true);
    sheet.addEventListener('pointerdown',e=>{
      if(drag||overlay.dataset.closing||!e.isPrimary||e.button!==0||!e.target.closest('.sheet-drag-zone'))return;
      sheet.getAnimations().forEach(a=>a.finish());
      drag={id:e.pointerId,y:e.clientY,start:performance.now(),dy:0};
      sheet.setPointerCapture(e.pointerId);
    });
    sheet.addEventListener('pointermove',e=>{
      if(!drag||e.pointerId!==drag.id)return;
      drag.dy=Math.max(0,e.clientY-drag.y);
      sheet.style.transform=`translateY(${drag.dy}px)`;
      overlay.style.backgroundColor=`rgba(35,23,11,${.4*Math.max(0,1-drag.dy/sheet.offsetHeight)})`;
    });
    function finish(e,cancelled){
      if(!drag||e.pointerId!==drag.id)return;
      const current=drag;drag=null;
      if(sheet.hasPointerCapture(current.id))sheet.releasePointerCapture(current.id);
      if(current.dy>6)suppressUntil=performance.now()+450;
      const speed=current.dy/Math.max(1,performance.now()-current.start);
      if(!cancelled&&current.dy<=6){suppressUntil=performance.now()+450;close();return;}
      if(!cancelled&&(current.dy>Math.min(120,sheet.offsetHeight*.2)||(current.dy>36&&speed>.5))){close();return;}
      const from=sheet.style.transform,shade=overlay.style.backgroundColor;
      sheet.style.transform='';overlay.style.backgroundColor='';
      if(current.dy){animate(sheet,[{transform:from},{transform:'translateY(0)'}]);animate(overlay,[{backgroundColor:shade},{backgroundColor:'rgba(35,23,11,.4)'}]);}
    }
    sheet.addEventListener('pointerup',e=>finish(e,false));
    sheet.addEventListener('pointercancel',e=>finish(e,true));
    sheet.addEventListener('lostpointercapture',e=>finish(e,true));
    // Keep the marker aligned after a viewport or accessibility text-size change.
    const observer=new ResizeObserver(()=>{
      const target=sheet.querySelector(selected),marker=sheet.querySelector('.calendar-highlight');
      if(!target||!marker)return;
      const r=markerBox(target,sheet);
      Object.assign(marker.style,{left:r.left+'px',top:r.top+'px',width:r.width+'px',height:r.height+'px',borderRadius:r.radius});
    });
    observer.observe(sheet);
    overlay.dispose=()=>{observer.disconnect();overlay.getAnimations({subtree:true}).forEach(a=>a.cancel());};
  }
  root.DiaryDateSheet={attach,capture,hide};
})(window);
