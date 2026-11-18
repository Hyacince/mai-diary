(function setupMotion(){
  'use strict';
  const preference=window.matchMedia('(prefers-reduced-motion: reduce)');
  preference.addEventListener('change',()=>{
    if(preference.matches)document.getAnimations().forEach(animation=>animation.cancel());
  });
  const easing='cubic-bezier(.2,.8,.2,1)';
  function animate(element,keyframes,options) {
    if(!element || preference.matches || typeof element.animate!=='function') return null;
    return element.animate(keyframes,Object.assign({duration:200,easing:easing},options));
  }
  function page(element,back) {
    animate(element,[
      {opacity:.4,transform:`translateX(${back?-40:40}px)`},
      {opacity:1,transform:'translateX(0)'}
    ]);
  }
  function changed(element) {
    animate(element,[
      {transform:'translateY(4px) scale(.92)',opacity:.3},
      {transform:'translateY(0) scale(1)',opacity:1}
    ],{duration:180});
  }
  function chart(element) {
    if(!element)return;
    animate(element.querySelector('.trend-plot'),[{opacity:0},{opacity:1}],{duration:320});
  }
  function dialog(element) {
    animate(element,[{opacity:0},{opacity:1}],{duration:160});
    animate(element.querySelector('.dialog,.period-sheet'),[
      {opacity:0,transform:'translateY(18px) scale(.97)'},
      {opacity:1,transform:'translateY(0) scale(1)'}
    ],{duration:220});
  }
  function dismiss(element,done) {
    const animation=animate(element,[{opacity:1},{opacity:0}],{duration:120});
    if(!animation){done();return;}
    animation.finished.then(done,done);
  }
  function toast(element) {
    animate(element,[
      {opacity:0,transform:'translate(-50%, 10px) scale(.96)'},
      {opacity:1,transform:'translate(-50%, 0) scale(1)'}
    ],{duration:220});
  }
  function selectionBox(node,group) {
    const r=node.getBoundingClientRect(),base=group.getBoundingClientRect();
    return {left:r.left-base.left-group.clientLeft+group.scrollLeft,top:r.top-base.top-group.clientTop+group.scrollTop,width:r.width,height:r.height};
  }
  function captureSelections(scope) {
    const result={};
    scope.querySelectorAll('[data-motion-group]').forEach(group=>{
      const node=group.querySelector('.selection-marker')||group.querySelector('button.active');
      if(node)result[group.dataset.motionGroup]=selectionBox(node,group);
      group.disposeSelection?.();
    });
    return result;
  }
  function restoreSelections(scope,previous) {
    scope.querySelectorAll('[data-motion-group]').forEach(group=>{
      const target=group.querySelector('button.active');if(!target)return;
      const box=selectionBox(target,group),style=getComputedStyle(target),marker=document.createElement('span');
      marker.className='selection-marker';marker.setAttribute('aria-hidden','true');
      Object.assign(marker.style,{background:style.backgroundColor,borderRadius:style.borderRadius,boxShadow:style.boxShadow});
      const place=b=>Object.assign(marker.style,{left:b.left+'px',top:b.top+'px',width:b.width+'px',height:b.height+'px'});
      place(box);group.prepend(marker);group.classList.add('selection-ready');
      const old=previous[group.dataset.motionGroup];
      if(old&&(Math.abs(old.left-box.left)>.1||Math.abs(old.top-box.top)>.1||Math.abs(old.width-box.width)>.1))
        animate(marker,[{transform:`translate(${old.left-box.left}px,${old.top-box.top}px) scale(${old.width/box.width},${old.height/box.height})`},{transform:'translate(0,0) scale(1,1)'}],{duration:280});
      const observer=new ResizeObserver(()=>place(selectionBox(target,group)));observer.observe(group);
      group.disposeSelection=()=>{observer.disconnect();marker.getAnimations().forEach(a=>a.cancel());};
    });
  }
  window.DiaryMotion={page,changed,chart,dialog,dismiss,toast,captureSelections,restoreSelections};
})();
