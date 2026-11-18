(function(root){
'use strict';
const DAY=86400000;
const stamp=s=>Date.parse(s+'T00:00:00Z');
const dayAt=(s,n)=>new Date(stamp(s)+n*DAY).toISOString().slice(0,10);
function series(data){
 const totals=new Map();
 data.meals.forEach(m=>totals.set(m.date,(totals.get(m.date)||0)+m.amountCents));
 const days=Math.round((stamp(data.end)-stamp(data.start))/DAY);
 const dates=new Set([data.start,data.end]);
 if(days<=740)for(let i=0;i<=days;i++)dates.add(dayAt(data.start,i));
 else for(const value of totals.keys())for(const delta of [-1,0,1]){
  const d=dayAt(value,delta);if(d>=data.start&&d<=data.end)dates.add(d);
 }
 return [...dates].sort().map(date=>({date,amount:totals.get(date)||0}));
}
function geometry(data){
 const points=series(data),duration=stamp(data.end)-stamp(data.start);
 const max=points.reduce((peak,p)=>Math.max(peak,p.amount),100);
 const ceiling=Math.ceil(max/100)*100;
 const x=d=>duration?12+(stamp(d)-stamp(data.start))/duration*292:158;
 const y=v=>158-v/ceiling*140;
 return {points:points.map(p=>({...p,x:x(p.date),y:y(p.amount)})),ceiling,x,y};
}
// Monotone cubic Hermite interpolation passes through every value without overshooting extrema.
function path(points){
 if(!points.length)return '';
 const slopes=points.slice(1).map((p,i)=>(p.y-points[i].y)/(p.x-points[i].x));
 const tangents=points.map((p,i)=>{
  if(!i)return slopes[0]||0;
  if(i===points.length-1)return slopes[i-1]||0;
  const a=slopes[i-1],b=slopes[i];
  if(a*b<=0)return 0;
  const h0=p.x-points[i-1].x,h1=points[i+1].x-p.x;
  return 3*(h0+h1)/((2*h1+h0)/a+(h1+2*h0)/b);
 });
 let d=`M ${points[0].x} ${points[0].y}`;
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],h=(b.x-a.x)/3;
  d+=` C ${a.x+h} ${a.y+h*tangents[i-1]} ${b.x-h} ${b.y-h*tangents[i]} ${b.x} ${b.y}`;
 }
 return d;
}
function selected(data,state){
 return state.bucket&&state.bucket>=data.start&&state.bucket<=data.end?state.bucket:data.end;
}
function render(state,data,ui){
 const g=geometry(data),curve=path(g.points),current=selected(data,state);
 const amount=data.meals.filter(m=>m.date===current).reduce((sum,m)=>sum+m.amountCents,0);
 const grid=[0,.5,1].map(part=>`<line x1="12" x2="304" y1="${g.y(g.ceiling*part)}" y2="${g.y(g.ceiling*part)}" stroke="#e8dfd4" stroke-dasharray="4 5"/><text x="313" y="${g.y(g.ceiling*part)+4}" fill="#84786a" font-size="10">${ui.n(g.ceiling*part/100)}</text>`).join('');
 const dots=g.points.filter(p=>p.amount>0||g.points.length===1).map(p=>`<circle cx="${p.x}" cy="${p.y}" r="2.2" fill="#da291c"/>`).join('');
 const span=Math.round((stamp(data.end)-stamp(data.start))/DAY);
 return `<section class="section trend-section"><div class="section-head"><h2>支出趋势</h2><small>每日实付 · 元</small></div><div class="card chart">
 <div class="stats-chart-head"><span data-trend-date>${ui.esc(current)}</span><strong class="num" data-trend-amount>¥${ui.money(amount)}</strong></div>
 <svg class="trend-plot" viewBox="0 0 360 185" role="img" aria-label="选定日期范围内的每日支出曲线">
 <defs><linearGradient id="expense-fill" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#ffc72c" stop-opacity=".36"/><stop offset="1" stop-color="#ffc72c" stop-opacity=".02"/></linearGradient></defs>
 ${grid}<path d="${curve} L ${g.points[g.points.length-1].x} 158 L ${g.points[0].x} 158 Z" fill="url(#expense-fill)"/>
 <path class="expense-line" d="${curve}" fill="none" stroke="#da291c" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>${dots}
 <line data-trend-guide x1="${g.x(current)}" x2="${g.x(current)}" y1="10" y2="158" stroke="#a99679" stroke-width="1"/>
 <circle data-trend-dot cx="${g.x(current)}" cy="${g.y(amount)}" r="5" fill="#da291c" stroke="white" stroke-width="2"/>
 <text x="${span?12:158}" y="180" text-anchor="${span?'start':'middle'}" fill="#84786a" font-size="10">${data.start.slice(5).replace('-','/')}</text>${span?`<text x="304" y="180" text-anchor="end" fill="#84786a" font-size="10">${data.end.slice(5).replace('-','/')}</text>`:''}</svg>
 <label class="trend-control"><span>拖动查看日期</span><input class="trend-range" type="range" min="0" max="${span}" step="1" value="${Math.round((stamp(current)-stamp(data.start))/DAY)}" data-field="stats-point" aria-label="查看每日支出" ${span===0?'disabled':''}></label>
 <p class="note">按日期等距绘制，每个点为当天总支出。</p></div></section>`;
}
function update(value,state,data,element,ui){
 const span=Math.round((stamp(data.end)-stamp(data.start))/DAY);
 const offset=Math.max(0,Math.min(span,Number(value)));
 if(!Number.isInteger(offset))return;
 const current=dayAt(data.start,offset),g=geometry(data);
 state.bucket=current;
 const amount=data.meals.filter(m=>m.date===current).reduce((sum,m)=>sum+m.amountCents,0);
 element.querySelector('[data-trend-date]').textContent=current;
 element.querySelector('[data-trend-amount]').textContent='¥'+ui.money(amount);
 const guide=element.querySelector('[data-trend-guide]'),dot=element.querySelector('[data-trend-dot]');
 guide.setAttribute('x1',g.x(current));guide.setAttribute('x2',g.x(current));
 dot.setAttribute('cx',g.x(current));dot.setAttribute('cy',g.y(amount));
}
root.StatsTrend={render,update,series,path};
})(window);
