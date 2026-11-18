(function startDiary() {
  'use strict';
  const {brandMark,esc,icon,n,money,when,offset,attr,btn,ibtn,foodIcon,energy,kcalText,mealIcon,ticket,empty}=window.DiaryUI;
  const app=document.getElementById('app');
  app.innerHTML='<div id="header-host"><div class="header-inner"></div></div><div id="screen"></div><div id="nav-host"></div>';
  const headerHost=document.getElementById('header-host');
  const screen=document.getElementById('screen');
  const navHost=document.getElementById('nav-host');
  const mainTabs=['home','stats','library'];
  const motion=window.DiaryMotion;
  let db;
  try {db=Ledger.open(window.BUILTIN_MENU);} catch(e) {app.innerHTML=`<main class="wrap"><h1>麦记手账</h1><p class="err">${esc(e.message)}</p></main>`;return;}
  const today=Ledger.today();
  const kinds={builtin:'常驻',limited:'已下载',custom:'自定义'};
  const s={page:'home',tab:'home',day:today,homeCalendar:{period:'day',anchor:today},stats:{period:'month',anchor:today,rankCategory:'全部'},query:'',cat:'全部',kind:'all',draft:null,dirty:false,productId:'',mealId:'',detailFrom:'home',editFrom:'home',productFrom:'library',customFrom:'library',syncing:false,syncMessage:''};
  let toastTimer, confirmation=null, dialogClosing=false, dateClosing=false;
  const hasPicker=()=>Boolean(s.homeCalendar.picker||s.stats.picker);
  const pickerState=()=>s.homeCalendar.picker?s.homeCalendar:s.stats;
  function focusPicker(act,value) {
    const buttons=Array.from(app.querySelectorAll('.period-overlay [data-act]'));
    (buttons.find(el=>el.dataset.act===act&&el.dataset.val===value)||app.querySelector('.period-overlay .linkbtn'))?.focus({preventScroll:true});
  }
  function closePicker(apply=false) {
    if(dateClosing||!hasPicker())return;
    const state=pickerState(),home=state===s.homeCalendar;
    if(apply&&!state.picker.end)return;
    dateClosing=true;
    DiaryDateSheet.hide(app.querySelector('.period-overlay'),()=>{
      StatsCalendar.action(apply?'stats-picker-apply':'stats-picker-close','',state);
      if(apply&&home)s.day=state.anchor;
      dateClosing=false;render();
      app.querySelector(home?'[data-act="home-picker-open"]':'[data-act="stats-picker-open"]')?.focus({preventScroll:true});
      if(apply&&!home)motion.chart(app);
    });
  }
  function toast(msg) {
    const node=document.getElementById('toast');
    node.textContent=msg;
    clearTimeout(toastTimer);
    motion.toast(node);
    toastTimer=setTimeout(()=>{node.textContent='';},2800);
  }
  function err(msg) {const el=document.getElementById('error');if(el){el.textContent=msg;el.scrollIntoView({block:'nearest'});}else toast(msg);}
  function product(id) {return db.products().find(p=>p.id===id);}
  function currentMeal() {return db.meals().find(m=>m.id===s.mealId);}
  function go(page,top=true,back=false) {
    const changed=page!==s.page;
    s.page=page;
    render();
    if(top)screen.scrollTop=0;
    if(changed) motion.page(app.querySelector('main'),back);
    if(changed && page==='stats') motion.chart(app);
  }
  function clearFilter() {s.query='';s.cat='全部';s.kind='all';}
  function tab(name) {
    const back=mainTabs.indexOf(name)<mainTabs.indexOf(s.tab);
    s.tab=name;clearFilter();go(name,true,back);
  }
  function header(title,withBack=true,extra='') {return `<header class="pagehead"><div class="leading">${withBack?ibtn('back','返回','back'):brandMark}<h1>${esc(title)}</h1></div>${extra}</header>`;}
  function nav() {return `<nav class="nav" aria-label="主导航"><div class="nav-inner">${[['home','book','手账'],['stats','chart','统计'],['library','grid','商品库']].map(([id,i,text])=>`<button ${attr('tab',id)} ${id===s.tab?'class="active" aria-current="page"':''}><span class="nav-ico">${icon(i)}</span>${text}</button>`).join('')}</div></nav>`;}
  function home() {
    const month=db.summary('month',s.day), week=db.summary('week',s.day);
    if(s.historyMonth!==month.start){s.historyMonth=month.start;s.historyLimit=20;}
    const days=['一','二','三','四','五','六','日'];
    const meals=week.meals.filter(m=>m.date===s.day);
    const datesWithMeals=new Set(week.meals.map(m=>m.date));
    return `<header class="brandbar"><h1 class="brand">${brandMark}麦记手账</h1><button class="today" ${attr('today')} aria-label="回到今天">${icon('calendar')}${when(Ledger.today())} · 今天</button></header>
      <section class="hero ${month.amountCents>=10000000?'big-money':''}"><img class="hero-art" src="meal.webp" alt=""><button class="hero-link" ${attr('month-stats')}>${Number(s.day.slice(5,7))} 月用餐支出 ${icon('right')}</button>
      <div class="money"><span class="unit">¥</span>${money(month.amountCents)}</div><div class="hero-details"><span>${icon('fork')}${n(month.mealCount)} 餐</span><span>${icon('flame')}${month.estimatedQuantity?'约 ':month.unknownQuantity?'已计 ':''}${n(month.knownKcal)} 大卡</span>${month.estimatedQuantity?`<span class="hero-pending">${n(month.estimatedQuantity)} 份估算</span>`:''}${month.unknownQuantity?`<span class="hero-pending">${n(month.unknownQuantity)} 份待补</span>`:''}</div></section>
      <div class="home-cols"><section class="section calendar-section"><div class="section-head"><h2>用餐日历</h2><div class="date-controls">${ibtn('week-shift','上一周','left','-1')}<button class="datejump" data-act="home-picker-open" aria-label="选择用餐日期">${s.day.slice(0,4)} 年 ${+s.day.slice(5,7)} 月 ${icon('down')}</button>${ibtn('week-shift','下一周','right','1')}</div></div>
      <div class="week-strip" data-motion-group="home-days">${days.map((label,i)=>{const date=offset(week.start,i);return `<button class="day ${date===s.day?'active':''} ${datesWithMeals.has(date)?'has-meal':''}" ${attr('day',date)} aria-label="${when(date)} 星期${label}" aria-pressed="${date===s.day}"><span class="day-name">周${label}</span><span class="day-num">${+date.slice(8)}</span></button>`;}).join('')}</div></section>
      <section class="section"><div class="section-head"><div class="section-title"><h2>用餐流水</h2><small>${s.day===Ledger.today()?'今天':when(s.day)}</small></div>${btn('new-meal','记一餐','plus','primary small')}</div>${meals.length?`<div class="card">${meals.map(ticket).join('')}</div>`:empty('receipt','这一天还没有用餐记录')}</section>
      ${window.DiaryUI.mealHistory(month,s.historyLimit)}</div>${StatsCalendar.render(db,s.homeCalendar,window.DiaryUI)}`;
  }
  function beginMeal(existing=null,first=null) {
    const hour=new Date().getHours();
    s.editFrom=existing?'meal':s.page;
    s.draft=existing?{id:existing.id,date:existing.date,type:existing.type,amount:(existing.amountCents/100).toFixed(2),items:existing.items.map(it=>({...it}))}:{date:s.day,type:hour<11?'早餐':hour<17?'午餐':'晚餐',amount:'',items:[]};
    s.dirty=false;
    if(first) increment(first,1);
    go('edit');
  }
  function increment(id,delta) {
    const items=s.draft.items;const it=items.find(x=>x.productId===id);
    if(it){it.quantity=Math.min(9999,it.quantity+delta);if(it.quantity<=0) items.splice(items.indexOf(it),1);}
    else if(delta>0){const p=product(id);if(p) items.push({productId:p.id,name:p.name,category:p.category,kcal:p.kcal,kcalSource:p.kcalSource,quantity:1});}
    s.dirty=true;
  }
  function qty(id,count) {
    return `<div class="qty">${count?`${ibtn('minus','减一份','minus',id)}<output>${count}</output>`:''}<button class="plus" ${attr('plus',id)} aria-label="加一份">${icon('plus')}</button></div>`;
  }
  function draftTotals() {
    const totals={qty:0,unknown:0,estimated:0,kcal:0};
    for(const item of s.draft.items) {
      totals.qty+=item.quantity;
      if(item.kcal===null) totals.unknown+=item.quantity;
      else totals.kcal+=item.kcal*item.quantity;
      if(item.kcalSource==='estimated') totals.estimated+=item.quantity;
    }
    return totals;
  }
  function draftSource(item) {
    return ({estimated:'品类估算',personal:'个人填写',official:'官方数据'})[item.kcalSource] || '';
  }
  function editor() {
    const d=s.draft;
    const totals=draftTotals();
    return `${header(d.id?'编辑这餐':'记一餐')}<div class="stack"><section class="card form-card"><div class="field"><label for="meal-date">用餐日期</label><input class="input" id="meal-date" type="date" data-field="meal-date" value="${esc(d.date)}"></div><div class="field"><span class="field-label">餐别</span><div class="tabs">${['早餐','午餐','晚餐'].map(t=>`<button ${attr('type',t)} aria-pressed="${d.type===t}" class="${d.type===t?'active':''}">${icon(mealIcon(t))} ${t}</button>`).join('')}</div></div></section>
      <section class="card form-card"><div class="spread"><h3>吃了什么</h3>${btn('pick','选食品','plus','soft small')}</div>${d.items.length?d.items.map(it=>`<div class="edit-row"><div class="spread"><strong class="item-title">${esc(it.name)}</strong>${qty(it.productId,it.quantity)}</div><label class="kcal-edit">每份热量 <input type="number" inputmode="decimal" min="0" max="100000" step=".01" data-kcal="${esc(it.productId)}" value="${it.kcal===null?'':esc(it.kcal)}" placeholder="待补充"> 大卡 <span class="sub" data-kcal-label>${draftSource(it)}</span></label></div>`).join(''):`<button class="pick-placeholder" ${attr('pick')}>${icon('bag')} 从商品库添加这一餐的食品 ${icon('right')}</button>`}
      <div class="food-footer">${icon('flame')}<strong id="draft-energy">${energy(totals.kcal,totals.unknown,totals.estimated)}</strong></div></section>
      <section class="card form-card"><label class="field-label" for="amount">这餐实付</label><div class="cost-wrap"><span>¥</span><input id="amount" type="text" inputmode="decimal" autocomplete="off" maxlength="12" data-field="amount" value="${esc(d.amount)}" placeholder="0.00"></div></section><p class="err" id="error" role="alert"></p></div><div class="sticky-action">${btn('save-meal','保存这餐','check','primary full')}</div>`;
  }
  function library(picking=false) {
    const last=db.lastSync();
    const syncDate=last?new Date(last).toLocaleDateString('zh-CN'):'尚未下载';
    return `${header(picking?'选择食品':'商品库',picking)}
      <div class="stack">${picking?'':`<section class="sync-box"><div class="grow"><h3>近期活动商品</h3><p class="sub">${esc(s.syncMessage || (last?'上次下载 '+syncDate:syncDate+' · 来源于麦当劳中国官网'))}</p></div><button class="btn small" ${attr('sync')} ${s.syncing?'disabled':''}>${icon('sync')}${s.syncing?'更新中…':last?'联网更新':'联网下载'}</button></section>`}
      <label class="search">${icon('search')}<input type="search" placeholder="搜索食品名称" aria-label="搜索食品名称" data-field="search" value="${esc(s.query)}"></label>
      <div class="tabs" data-motion-group="food-kinds">${[['all','全部'],...Object.entries(kinds)].map(([k,v])=>`<button class="${s.kind===k?'active':''}" ${attr('kind',k)}>${esc(v)}</button>`).join('')}</div>
      <div class="chips">${window.DiaryUI.foodCategories(db.products().filter(p=>s.kind==='all'||p.kind===s.kind)).map(c=>`<button ${attr('category',c)} class="${s.cat===c?'active':''}">${esc(c)}</button>`).join('')}</div>${s.kind==='custom'?`<section class="spread custom-products-head"><div><h3>我的自定义食品</h3><p class="sub">添加名称、分类和每份热量</p></div>${btn('new-product','添加食品','plus','primary small')}</section>`:''}<div id="product-results">${results(picking)}</div></div>${picking?`<div class="sticky-action">${btn('picked',`选好了（${n(draftTotals().qty)} 份）`,'check','primary full')}</div>`:''}`;
  }
  function productRow(p,picking) {
    const badge=p.kind==='limited'?'<span class="badge">活动商品</span>':'';
    const main=`${foodIcon(p)}<div class="grow"><div class="item-title">${esc(p.name)}${badge}</div><div class="sub">${esc(p.category)} · ${kcalText(p)}</div></div>`;
    if(picking) {
      const item=s.draft.items.find(it=>it.productId===p.id);
      return `<div class="list-row">${main}${qty(p.id,item?item.quantity:0)}</div>`;
    }
    return `<button class="list-row" ${attr('product',p.id)}>${main}${icon('right','arrow')}</button>`;
  }
  function results(picking) {
    const query=s.query.trim().toLowerCase();
    const list=db.products().filter(p=>(s.kind==='all'||s.kind===p.kind)&&(s.cat==='全部'||p.category===s.cat)&&p.name.toLowerCase().includes(query));
    if(!list.length) return empty('search',s.kind==='limited'&&!query?'没有符合条件的已下载商品':'没有找到匹配的食品',s.kind==='limited'?'可在商品库顶部联网更新。':'可更换关键词，或添加自定义食品。');
    const rows=products=>`<div class="card">${products.map(p=>productRow(p,picking)).join('')}</div>`;
    if(s.kind!=='limited') return rows(list);
    const recent=list.filter(p=>p.currentSync);
    const previous=list.filter(p=>!p.currentSync);
    const current=recent.length?`<h3 class="download-heading">最近同步 · ${recent.length} 款</h3>${rows(recent)}`:'';
    const history=previous.length?`<details class="download-history" ${(!recent.length||query)?'open':''}><summary>历史下载 · ${previous.length} 款</summary>${rows(previous)}</details>`:'';
    return current+history;
  }
  function productDetail() {
    const p=product(s.productId);if(!p) return header('商品详情');
    const eaten=db.meals().filter(m=>m.items.some(it=>it.productId===p.id));
    const count=eaten.reduce((sum,m)=>sum+m.items.filter(it=>it.productId===p.id).reduce((a,it)=>a+it.quantity,0),0);
    const official=/^https:\/\/(?:www\.)?mcdonalds\.com\.cn\//i.test(p.sourceUrl);
    return `${header('商品详情')}<div class="stack"><section class="card form-card"><div class="fact-title">${foodIcon(p)}<div><h2>${esc(p.name)}</h2><div class="sub">${esc(p.category)} · ${kinds[p.kind]}商品</div></div></div></section>
      <section class="card"><div class="detail-line"><span>每份热量</span><strong>${kcalText(p)}</strong></div><div class="detail-line"><span>累计食用</span><strong>${n(eaten.length)} 餐 · ${n(count)} 份</strong></div>${p.publishedDate?`<div class="detail-line"><span>活动发布日期</span><strong>${esc(when(p.publishedDate,true))}</strong></div>`:''}${official?`<div class="detail-line"><span>商品来源</span><a class="source" href="${esc(p.sourceUrl)}">麦当劳中国官网 ${icon('external')}</a></div>`:''}</section>
      ${p.kcalSource==='estimated'&&p.estimateBasis?`<p class="note">${esc(p.estimateBasis)}</p>`:''}${p.canSetKcal?nutritionForm(p):''}${p.kind==='limited'?'<p class="note">商品来自近期官方活动，供应以门店为准。</p>':''}${btn('new-with-product','用这个商品记一餐','plus','primary full')}
      ${p.kind==='custom'?btn('delete-product','删除自定义商品','','danger full'):''}</div>`;
  }
  function nutritionForm(p) {
    const hint=p.officialKcal!=null ? `官网每份 ${n(p.officialKcal)} 大卡。清空个人值可恢复官网数值。` : p.kind==='custom'?'保存后，之后记餐时会自动带入。':'可按包装或门店资料填写，清空后使用品类估算。';
    return `<form class="card form-card" id="product-nutrition"><label class="field-label" for="personal-kcal">我记录的每份热量</label><div class="nutrition-input"><input class="input" id="personal-kcal" name="kcal" type="number" min="0" max="100000" step=".01" inputmode="decimal" placeholder="大卡" value="${p.userKcal?esc(p.kcal):''}"><button class="btn soft" type="submit">保存</button></div><p class="sub">${hint}</p><p class="err" id="error" role="alert"></p></form>`;
  }
  function customForm() {
    return `${header('添加自定义食品')}<form id="custom-form" class="stack"><section class="card form-card"><div class="field"><label for="p-name">食品名称</label><input class="input" id="p-name" name="name" required maxlength="120" placeholder="例如 新品汉堡（单个）"></div>
      <div class="field"><label for="p-cat">分类</label><select class="input" id="p-cat" name="category">${[...new Set([...db.products().map(p=>p.category),'其他'])].map(c=>`<option>${esc(c)}</option>`).join('')}</select></div>
      <div class="field"><label for="p-kcal">每份热量（大卡）</label><input class="input" id="p-kcal" name="kcal" type="number" inputmode="decimal" min="0" max="100000" step=".01" placeholder="未知可留空"></div></section><p class="err" id="error" role="alert"></p><button class="btn primary full" type="submit">${icon('check')}保存食品</button></form>`;
  }
  function mealDetail() {
    const m=currentMeal();if(!m)return header('用餐详情');
    return `${header('用餐详情')}<div class="stack"><section class="summary-head"><small>${when(m.date,true)} · ${esc(m.type)}实付</small><div class="money"><span class="unit">¥</span>${money(m.amountCents)}</div></section><section class="card">${m.items.map(it=>`<div class="detail-line">${foodIcon(it)}<div class="grow"><strong>${esc(it.name)}</strong><div class="sub">${kcalText(it)}</div></div><strong>× ${it.quantity}</strong></div>`).join('')}<div class="detail-line"><span>${icon('flame')} 热量</span><strong class="right">${energy(m.knownKcal,m.unknownQuantity,m.estimatedQuantity)}</strong></div></section><div class="actions">${btn('delete-meal','删除记录','','danger')}${btn('edit-meal','编辑这餐','','primary')}</div></div>`;
  }
  function render() {
    const selectedBlocks=motion.captureSelections(screen);
    const oldPicker=app.querySelector('.period-overlay');
    const selection=DiaryDateSheet.capture(oldPicker);
    const sheetScroll=oldPicker?.querySelector('.period-sheet').scrollTop||0;
    oldPicker?.dispose?.();oldPicker?.remove();
    const chips=app.querySelector('.chips');
    const chipScroll=chips?chips.scrollLeft:0;
    const main=['home','library','stats'].includes(s.page);
    const pages={home,library:()=>library(false),stats:()=>header('用餐统计',false)+StatsUI.render(db,s.stats,window.DiaryUI),edit:editor,pick:()=>library(true),product:productDetail,custom:customForm,meal:mealDetail};
    screen.innerHTML=`<main class="wrap ${main?'':'editor-wrap'}">${pages[s.page]()}</main>`;
    const pageHeader=screen.querySelector('main>header');
    headerHost.querySelector('.header-inner').replaceChildren(pageHeader);
    headerHost.inert=hasPicker();
    motion.restoreSelections(screen,selectedBlocks);
    if(main && !navHost.firstChild)navHost.innerHTML=nav();
    navHost.hidden=!main;
    navHost.inert=hasPicker();
    if(hasPicker()){
      const overlay=screen.querySelector('.period-overlay');
      app.appendChild(overlay);
      overlay.querySelector('.period-sheet').scrollTop=sheetScroll;
      DiaryDateSheet.attach(overlay,()=>closePicker(),selection,!oldPicker,direction=>handle('stats-picker-move',String(direction)));
      screen.inert=true;
    }else screen.inert=false;
    navHost.querySelectorAll('[data-act="tab"]').forEach(button=>{
      const active=button.dataset.val===s.tab;
      button.classList.toggle('active',active);
      if(active)button.setAttribute('aria-current','page');
      else button.removeAttribute('aria-current');
    });
    const nextChips=app.querySelector('.chips');
    if(nextChips)nextChips.scrollLeft=chipScroll;
  }
  function confirmAction(title,message,yes,act) {
    if(confirmation)return;
    const focus=document.activeElement;confirmation={act,focus};app.insertAdjacentHTML('beforeend',`<div class="sheet-bg"><section class="dialog" role="alertdialog" aria-modal="true" aria-labelledby="dialog-title"><h2 id="dialog-title">${esc(title)}</h2><p>${esc(message)}</p><div class="actions">${btn('cancel','取消','','outlined')}${btn('confirm',yes,'','danger')}</div></section></div>`);
    app.querySelector('main').inert=true;headerHost.inert=true;app.querySelector('[data-act="cancel"]').focus();
    motion.dialog(app.querySelector('.sheet-bg'));
  }
  function closeDialog(afterClose){
    if(!confirmation)return;
    const focus=confirmation.focus;
    const overlay=app.querySelector('.sheet-bg');
    confirmation=null;
    dialogClosing=true;
    overlay.style.pointerEvents='none';
    motion.dismiss(overlay,()=>{
      overlay.remove();
      dialogClosing=false;
      app.querySelector('main').inert=false;
      headerHost.inert=false;
      if(focus?.isConnected)focus.focus();
      try {
        if(afterClose)afterClose();
      } catch(error) {
        err(error.message);
      }
    });
  }
  function back() {
    if(dateClosing)return true;
    if(hasPicker()){closePicker();return true;}
    if(dialogClosing)return true;
    if(confirmation){closeDialog();return true;}
    if(s.page==='pick'){go('edit',true,true);return true;}
    if(s.page==='custom'){go(s.customFrom,true,true);return true;}
    if(s.page==='product'){go(s.productFrom,true,true);return true;}
    if(s.page==='meal'){go(s.detailFrom,false,true);screen.scrollTop=s.mealReturnScroll||0;return true;}
    if(s.page==='edit'){const leave=()=>{s.draft=null;s.dirty=false;go(s.editFrom,true,true);};if(s.dirty)confirmAction('放弃本次编辑？','本次修改还没有保存。','放弃修改',leave);else leave();return true;}
    if(s.page!=='home'){tab('home');return true;}return false;
  }
  function saveMeal() {
    const d=s.draft;const amount=d.amount.trim();
    if(!/^\d{1,7}(\.\d{1,2})?$/.test(amount))throw new Error('请输入这餐的实付金额，最多保留两位小数。');
    const [yuan,jiao='']=amount.split('.');
    const saved=db.saveMeal({id:d.id,date:d.date,type:d.type,amountCents:Number(yuan)*100+Number(jiao.padEnd(2,'0')),items:d.items});
    s.day=saved.date;s.draft=null;s.dirty=false;tab('home');toast('这餐已保存');
  }
  function handle(act,v='') {
    if(dialogClosing||dateClosing)return;
    if(confirmation && act!=='confirm'&&act!=='cancel')return;
    if(hasPicker()&&(act==='stats-picker-close'||act==='stats-picker-apply')){
      closePicker(act==='stats-picker-apply');return;
    }
    if(hasPicker()&&act.startsWith('stats-pick')){
      if(StatsCalendar.action(act,v,pickerState())){render();focusPicker(act,v);}
      return;
    }
    if(act.startsWith('stats-')){
      if(StatsUI.action(act,v,s.stats,db)){
        render();
        if(hasPicker())focusPicker(act,v);
        if(['stats-period','stats-move'].includes(act))motion.chart(app);
      }
      return;
    }
    switch(act){
      case 'back':back();break;
      case 'tab':tab(v);break;
      case 'home-picker-open':s.homeCalendar.anchor=s.day;StatsCalendar.open(s.homeCalendar,{start:s.day,end:s.day});render();focusPicker();break;
      case 'today':s.day=Ledger.today();render();break;
      case 'day':s.day=v;render();break;
      case 'week-shift':s.day=offset(s.day,7*Number(v));render();break;
      case 'month-stats':s.stats.period='month';s.stats.anchor=s.day;tab('stats');break;
      case 'new-meal':beginMeal();break;
      case 'new-with-product':beginMeal(null,s.productId);break;
      case 'meal':s.mealReturnScroll=screen.scrollTop;s.mealId=v;s.detailFrom=s.page;go('meal');break;
      case 'history-more':s.historyLimit+=20;render();break;
      case 'product':s.productId=v;s.productFrom=s.page;go('product');break;
      case 'delete-product': {
        const item=product(s.productId);
        if(s.page!=='product'||item?.kind!=='custom')return;
        confirmAction('删除自定义商品？',`“${item.name}”将从商品库移除。已记录的餐次和统计会保留。`,'删除商品',()=>{
          db.deleteCustomProduct(item.id);
          s.productId='';
          if(!window.DiaryUI.foodCategories(db.products().filter(p=>s.kind==='all'||p.kind===s.kind)).includes(s.cat))s.cat='全部';
          go(s.productFrom,true,true);
          toast('自定义商品已删除');
        });
        break;
      }
      case 'edit-meal':beginMeal(currentMeal());break;
      case 'delete-meal':confirmAction('删除这餐记录？','删除后，该餐的花费、热量和商品次数会从统计中扣除。','删除这餐',()=>{db.deleteMeal(s.mealId);go(s.detailFrom);toast('记录已删除');});break;
      case 'cancel':closeDialog();break;
      case 'confirm':closeDialog(confirmation.act);break;
      case 'type':s.draft.type=v;s.dirty=true;render();break;
      case 'pick':clearFilter();go('pick');break;
      case 'picked':go('edit');break;
      case 'plus':case 'minus':{
        increment(v,act==='plus'?1:-1);
        render();
        const button=Array.from(app.querySelectorAll('[data-act="plus"]')).find(el=>el.dataset.val===v);
        if(button)motion.changed(button.parentElement.querySelector('output')||button);
        motion.changed(document.getElementById('draft-energy'));
        break;
      }
      case 'kind':s.kind=v;s.cat='全部';render();break;
      case 'category':s.cat=v;render();break;
      case 'new-product':s.customFrom=s.page;go('custom');break;
      case 'save-meal':saveMeal();break;
      case 'sync':
        if(s.syncing)return;
        if(!window.AndroidStore?.syncMenu){s.syncMessage='请在安卓应用内下载限定商品。';render();break;}
        s.syncing=true;s.syncMessage='正在读取官网近期活动…';render();
        try{window.AndroidStore.syncMenu();}catch(e){s.syncing=false;s.syncMessage='未能启动下载，请重试。';render();}break;
    }
  }
  app.addEventListener('click',e=>{const button=e.target.closest('[data-act]');if(button&&!button.disabled){try{handle(button.dataset.act,button.dataset.val);}catch(ex){err(ex.message);}}});
  app.addEventListener('input',e=>{
    const el=e.target;
    if(el.dataset.field==='stats-point')StatsUI.updatePoint(el.value,s.stats,db,app.querySelector('.trend-section'),window.DiaryUI);
    if(el.dataset.field==='search'){s.query=el.value;document.getElementById('product-results').innerHTML=results(s.page==='pick');}
    if(el.dataset.field==='amount'){s.draft.amount=el.value;s.dirty=true;}
    if(el.dataset.kcal) {
      const item=s.draft.items.find(i=>i.productId===el.dataset.kcal);
      item.kcal=el.value===''?null:Number(el.value);
      item.kcalSource=item.kcal===null?'unknown':'personal';
      el.parentElement.querySelector('[data-kcal-label]').textContent=draftSource(item);
      s.dirty=true;
      const totals=draftTotals();
      document.getElementById('draft-energy').textContent=energy(totals.kcal,totals.unknown,totals.estimated);
    }
  });
  app.addEventListener('change',e=>{
    const el=e.target;if(!el.dataset.field)return;
    if(el.dataset.field==='meal-date'){s.draft.date=el.value;s.dirty=true;return;}
    if(!/^\d{4}-\d{2}-\d{2}$/.test(el.value))return;
    if(el.dataset.field==='stats-date'){if(StatsUI.action('stats-date',el.value,s.stats))render();}
  });
  app.addEventListener('submit',e=>{
    if(e.target.id==='product-nutrition'){
      e.preventDefault();
      const value=new FormData(e.target).get('kcal');
      try{db.setProductKcal(s.productId,value===''?null:Number(value));render();toast('默认热量已保存');}catch(ex){err(ex.message);}
      return;
    }
    if(e.target.id!=='custom-form')return;e.preventDefault();
    try{
      const fields=new FormData(e.target);
      const p=db.addProduct({name:fields.get('name'),category:fields.get('category'),kcal:fields.get('kcal')===''?null:Number(fields.get('kcal'))});
      if(s.customFrom==='pick'){increment(p.id,1);go('edit');toast('食品已保存并加入这餐');}
      else{clearFilter();s.kind='custom';go('library');toast('食品已保存');}
    }catch(ex){err(ex.message);}
  });
  window.onMenuSyncResult=payload=>{
    try {
      const result=typeof payload==='string'?JSON.parse(payload):payload;
      if(!result?.ok)throw new Error(result?.message||'同步未完成，请检查网络后重试。');
      const count=db.mergeLimited(result.items,{partial:result.partial===true});
      s.syncMessage=result.partial?`已取得 ${count} 款，部分活动暂未读取，可稍后重试。`:count?`本次同步 ${count} 款活动商品`:'本次未发现可下载的活动商品';
      if(s.page==='library'){s.kind='limited';s.cat='全部';s.query='';}
      toast(count?'限定商品已存入本地':'已检查官网近期活动');
    }
    catch(e){s.syncMessage=(e.message||'下载失败')+' 已下载的商品仍可使用。';}
    finally{s.syncing=false;if(s.page==='library')render();}
  };
  window.handleBack=back;
  bindSwipeNavigation(screen,{
    enabled:()=>mainTabs.includes(s.page) && !confirmation && !dialogClosing && !dateClosing && !hasPicker() &&
      !app.querySelector('input:focus,textarea:focus,select:focus'),
    canMove:direction=>mainTabs.indexOf(s.page)+direction>=0 && mainTabs.indexOf(s.page)+direction<mainTabs.length,
    move:direction=>tab(mainTabs[mainTabs.indexOf(s.page)+direction])
  });
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&back())e.preventDefault();
    if(e.key==='Tab'&&hasPicker()){
      const buttons=Array.from(app.querySelectorAll('.period-overlay button:not(:disabled)'));
      const first=buttons[0],last=buttons[buttons.length-1];
      if(e.shiftKey&&document.activeElement===first){last.focus();e.preventDefault();}
      else if(!e.shiftKey&&document.activeElement===last){first.focus();e.preventDefault();}
    }
  });
  render();
})();
