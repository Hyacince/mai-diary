(function(root){
'use strict';
const day=86400000,date=s=>new Date(s+'T00:00:00Z'),iso=d=>d.toISOString().slice(0,10);
const shift=(s,n)=>iso(new Date(date(s).getTime()+n*day));
const valid=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(date(s).getTime())&&iso(date(s))===s;
let lunarFormatter;
try{
 const formatter=new Intl.DateTimeFormat('zh-CN-u-ca-chinese',{month:'long',day:'numeric',timeZone:'Asia/Shanghai'});
 if(formatter.resolvedOptions().calendar==='chinese')lunarFormatter=formatter;
}catch(_){ /* Older WebViews retain a useful weekday subtitle. */ }
const lunarCache=new Map(),digits=['','一','二','三','四','五','六','七','八','九','十'];
function lunarLabel(value){
 if(lunarCache.has(value))return lunarCache.get(value);
 let label='周'+['日','一','二','三','四','五','六'][date(value).getUTCDay()];
 if(lunarFormatter){
  const parts=lunarFormatter.formatToParts(date(value)),d=Number(parts.find(p=>p.type==='day')?.value);
  if(d===1)label=parts.find(p=>p.type==='month').value;
  else if(d<=10)label='初'+digits[d];
  else if(d<20)label='十'+digits[d-10];
  else if(d===20)label='二十';
  else if(d<30)label='廿'+digits[d-20];
  else if(d===30)label='三十';
 }
 if(lunarCache.size>=512)lunarCache.clear();
 lunarCache.set(value,label);return label;
}
function open(state,data){state.picker={view:(state.period==='week'&&state.anchor?state.anchor:data.start).slice(0,7)+'-01',start:data.start,end:data.end,waiting:false};}
function render(db,state,ui){
 const p=state.picker;if(!p)return '';
 const {esc,icon}=ui,year=Number(p.view.slice(0,4)),month=Number(p.view.slice(5,7)),mode=state.period;
 const titles={day:'选择用餐日期',week:'选择周',month:'选择月份',year:'选择年份',custom:'选择日期范围'};
 const spending=new Map();
 db.meals().forEach(m=>spending.set(m.date,(spending.get(m.date)||0)+m.amountCents));
 const button=(act,val,label,cls='')=>`<button type="button" class="${cls}" data-act="${act}" data-val="${esc(val)}">${label}</button>`;
 const chosen=mode==='day'?p.start.split('-').join('/'):mode==='month'?p.start.slice(0,7).replace('-','年')+'月':mode==='year'?p.start.slice(0,4)+'年':`${p.start.split('-').join('/')} — ${p.end?p.end.split('-').join('/'):'请选择结束日期'}`;
 let grid='';
 if(mode==='month'||mode==='year'){
  const start=mode==='year'?Math.floor((year-1)/12)*12+1:1;
  grid='<div class="period-grid">'+Array.from({length:12},(_,i)=>{
   const val=mode==='month'?`${year}-${String(i+1).padStart(2,'0')}-01`:`${String(start+i).padStart(4,'0')}-01-01`;
   if(!valid(val))return '<span></span>';
   const prefix=val.slice(0,mode==='month'?7:4);
   const has=Array.from(spending.keys()).some(s=>s.startsWith(prefix));
   return button('stats-pick-value',val,`${mode==='month'?i+1+'月':start+i+'年'}${has?'<i></i>':''}`,p.start.startsWith(prefix)?'selected':'');
  }).join('')+'</div>';
 }else{
  const first=shift(p.view,-((date(p.view).getUTCDay()+6)%7)),rows=[];
  for(let row=0;row<6;row++){
   const start=shift(first,row*7);
   const cells=Array.from({length:7},(_,i)=>{
    const value=shift(start,i),amount=spending.get(value),inside=p.end&&value>=p.start&&value<=p.end,edge=value===p.start||value===p.end;
    const cls=['calendar-day',value.slice(0,7)!==p.view.slice(0,7)?'outside':'',inside?'in-range':'',edge?'endpoint':'',mode==='day'&&value===p.start?'single-selected':'',
      mode==='custom'?'range-day':'',mode==='custom'&&p.end&&p.start!==p.end?(value===p.start?'range-start':value===p.end?'range-end':''):''].join(' ');
    const label=`<span>${value===root.Ledger.today()?'今':Number(value.slice(8))}</span><small>${esc(amount===undefined?lunarLabel(value):ui.money(amount))}</small>`;
    return mode==='week'?`<span class="${cls}">${label}</span>`:button('stats-pick-day',value,label,cls);
   }).join('');
   rows.push(mode==='week'?button('stats-pick-week',start,cells,'calendar-week '+(start===p.start?'selected':'')):`<div class="calendar-week">${cells}</div>`);
  }
  grid='<div class="calendar-weekdays">'+['一','二','三','四','五','六','日'].map(w=>`<span>${w}</span>`).join('')+'</div><div class="calendar-days">'+rows.join('')+'</div>';
 }
 const heading=mode==='year'?`${Math.floor((year-1)/12)*12+1} — ${Math.min(9999,Math.floor((year-1)/12)*12+12)}`:mode==='month'?year+'年':`${year}年${month}月`;
 return `<div class="period-overlay" role="dialog" aria-modal="true" aria-label="${titles[mode]}"><section class="period-sheet">
 <button class="sheet-drag-zone" data-act="stats-picker-close" aria-label="下拉或点击收起日期选择"><span class="sheet-handle"></span></button>
 <div class="spread"><h2>${titles[mode]}</h2>${button('stats-picker-close','','取消','linkbtn')}</div><p class="period-chosen">${chosen}</p>
 <div class="spread period-heading">${button('stats-picker-move','-1',icon('left'),'iconbtn')}<strong>${heading}</strong>${button('stats-picker-move','1',icon('right'),'iconbtn')}</div>
 ${grid}<p class="note">${mode==='custom'?'先选开始日期，再选结束日期，可翻月跨年选择。':mode==='week'?'周一至周日为一周。':''}</p>
 <button class="btn primary full" data-act="stats-picker-apply" ${!p.end?'disabled':''}>确定</button></section></div>`;
}
function action(name,value,state){
 const p=state.picker;if(!p)return false;
 switch(name){
 case 'stats-picker-close':delete state.picker;return true;
 case 'stats-picker-move':{
  if(!['-1','1'].includes(value))return false;
  const d=date(p.view);
  d.setUTCMonth(d.getUTCMonth()+Number(value)*(state.period==='year'?144:state.period==='month'?12:1));
  if(d.getUTCFullYear()>=1&&d.getUTCFullYear()<=9998)p.view=iso(d);
  return true;
 }
 case 'stats-pick-value':
  if(!valid(value))return false;
  p.start=value;
  {const d=date(value);if(state.period==='year')d.setUTCFullYear(d.getUTCFullYear()+1);else d.setUTCMonth(d.getUTCMonth()+1);p.end=shift(iso(d),-1);}
  return true;
 case 'stats-pick-week':
  if(!valid(value))return false;
  p.start=value;p.end=shift(value,6);return true;
 case 'stats-pick-day':
  if(!valid(value))return false;
  if(state.period==='day'){p.start=value;p.end=value;return true;}
  if(!p.waiting){p.start=value;p.end='';p.waiting=true;}
  else{p.end=value;if(p.end<p.start)[p.start,p.end]=[p.end,p.start];p.waiting=false;}
  return true;
 case 'stats-picker-apply':
  if(!p.end)return false;
  state.anchor=p.start;
  if(state.period==='custom'){state.rangeStart=p.start;state.rangeEnd=p.end;}
  delete state.bucket;delete state.detailsOpen;delete state.picker;
  return true;
 default:return false;
 }
}
root.StatsCalendar={open,render,action,lunarLabel};
})(window);
