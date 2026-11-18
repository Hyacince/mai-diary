(function initInterfaceTools() {
  'use strict';
  const paths = {
    receipt:'<path d="M5 3l2 1.4L9.5 3 12 4.4 14.5 3 17 4.4 19 3v18l-2-1.4-2.5 1.4-2.5-1.4L9.5 21 7 19.6 5 21z"/><path d="M9 9h6m-6 4h6"/>',
    book:'<path d="M4 5a2 2 0 0 1 2-2h12a1 1 0 0 1 1 1v16H6a2 2 0 0 1-2-2zm0 12c0-1 1-2 2-2h13M8 3v12m3-7h5"/>',
    calendar:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4m10-4v4M3 10h18m-13 4h2m4 0h2"/>',
    flame:'<path d="M12 2c1 5 6 5 6 11 1-1 2-2 2-4 4 7-.5 13-7 13-5 0-9-3-9-8 0-3 2-6 5-8 0 4 1 5 2 5 2-3 2-6 1-9z"/>',
    fork:'<path d="M4 3v5c0 3 6 3 6 0V3M7 3v18m11 0V3c-4 2-5 8-3 10h3"/>',
    chart:'<path d="M3 20h18M6 16v-5m6 5V5m6 11V8"/>',
    grid:'<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    burger:'<path d="M3 11c.3-4.8 4-8 9-8s8.7 3.2 9 8ZM3 15l4-1 4 2 5-2 5 1m-18 3h18c-.3 2-1.2 3-4 3H7c-2.4 0-3.7-1-4-3Z"/><path d="m9 7 .5-.4m5 1 .6-.4"/>',
    fries:'<path d="m3.5 10 2.2 11h12.6l2.2-11-4 1-4.5-2-4.5 2zm2-1-1-5 3-.5 1 6m2-1V2h3v7m2 1 1-6 3 .6-1.3 5.7"/>',
    drink:'<path d="M6 9h13l-2 12H8zm-1-2h15m-8-1 1-4h5"/>',
    ice:'<path d="m7.5 13 4.5 9 4.5-9m-10-1c-2-2 0-5 2-5 0-2 1-3 3-3 1 0 2-1 2-2 2 1 3 3 2 5 3 1 4 3 2 5Z"/>',
    chicken:'<path d="M10 14c-4-5 0-11 5-11 5 0 8 5 5 9-2 3-5 4-8 3l-4 4c0 3-4 3-4 0-3-1-2-5 1-4l3.5-3"/>',
    egg:'<path d="M20 14c0 5-3.5 7-8 7s-8-2-8-7c0-4 4-12 8-12s8 8 8 12Z"/><path d="M8 15c0 2 1.5 3 3 3"/>',
    bag:'<path d="M4 8h16l-1 13H5zm4 0V6a4 4 0 1 1 8 0v2"/>',
    clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    coin:'<circle cx="12" cy="12" r="9"/><path d="m9 8 3 4 3-4m-6 5h6m-3-1v5"/>',
    left:'<path d="m14.5 6-6 6 6 6"/>',right:'<path d="m9 6 6 6-6 6"/>',down:'<path d="m6 9 6 6 6-6"/>',
    back:'<path d="m10 5-7 7 7 7M3 12h17"/>',plus:'<path d="M12 5v14M5 12h14"/>',minus:'<path d="M5 12h14"/>',
    check:'<path d="m4 12 5 5L20 6"/>',search:'<circle cx="10" cy="10" r="6.5"/><path d="m15 15 5 5"/>',
    sync:'<path d="M3 10a9 9 0 0 1 15-5l2 2m0-5v5h-5M21 14a9 9 0 0 1-15 5l-2-2m0 5v-5h5"/>',
    external:'<path d="M14 3h7v7m0-7L10 14m0-9H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5"/>',
    morning:'<path d="M3 16h18M5 20h14m-12-6a5 5 0 0 1 10 0M12 3v3M4 7l2 2m14-2-2 2"/>',
    noon:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    night:'<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>'
  };
  const brandMark = '<span class="brandmark" aria-hidden="true"><svg viewBox="0 0 273 239"><path fill="#FFC72C" d="M195.8 17.933c23.3 0 42.2 98.3 42.2 219.7h34c0-130.7-34.3-236.5-76.3-236.5-24 0-45.2 31.7-59.2 81.5-14-49.8-35.2-81.5-59-81.5-42 0-76.2 105.7-76.2 236.4h34c0-121.4 18.7-219.6 42-219.6s42.2 90.8 42.2 202.8h33.8c0-112 19-202.8 42.3-202.8Z"/></svg></span>';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (name, cls='') => `<svg class="${esc(cls)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.bag}</svg>`;
  const n = value => Number(value).toLocaleString('zh-CN',{maximumFractionDigits:2});
  const money = cents => (Number(cents)/100).toLocaleString('zh-CN',{minimumFractionDigits:2,maximumFractionDigits:2});
  const when = (date, year=false) => { const [y,m,d]=date.split('-');return `${year? y+'年':''}${+m}月${+d}日`; };
  const offset = (date,days) => {const t=new Date(date+'T12:00:00Z');t.setUTCDate(t.getUTCDate()+days);return t.toISOString().slice(0,10);};
  const attr = (act,value='') => `data-act="${esc(act)}" data-val="${esc(value)}"`;
  const btn = (act,title,i='',cls='soft',value='') => `<button class="btn ${esc(cls)}" ${attr(act,value)}>${i?icon(i):''}${esc(title)}</button>`;
  const ibtn = (act,title,i,value='') => `<button class="iconbtn" ${attr(act,value)} aria-label="${esc(title)}">${icon(i)}</button>`;
  const mealIcon = type => ({'早餐':'morning','午餐':'noon','晚餐':'night'}[type] || 'fork');
  function foodIcon(product) {
    const text=product.name+product.category;
    const [shape,tone] = /薯条|薯格/.test(text)?['fries',1]:/早餐|满分|麦芬|薯饼/.test(text)?['egg',0]:/堡|汉堡/.test(text)?['burger',0]:/甜品|冰淇淋|新地|麦旋风|派/.test(text)?['ice',3]:/饮|咖啡|拿铁|可乐|奶茶/.test(text)?['drink',2]:/鸡|小食/.test(text)?['chicken',1]:['bag',4];
    return `<span class="food-icon tone-${tone}">${icon(shape)}</span>`;
  }
  function energy(kcal,unknown,estimated=0) {
    const parts=[];
    if(kcal>0 || !unknown || estimated) parts.push((estimated?'约 ':unknown?'已计 ':'')+n(kcal)+' 大卡');
    if(estimated) parts.push(n(estimated)+' 份估算');
    if(unknown) parts.push(n(unknown)+' 份热量待补');
    return parts.join(' · ');
  }
  function kcalText(item) {
    if(item.kcal==null) return '热量待补';
    const label=item.kcalSource==='estimated'?'约 ':'';
    const source=item.kcalSource==='estimated'?' · 品类估算':item.kcalSource==='personal'?' · 个人填写':'';
    return label+n(item.kcal)+' 大卡 / 份'+source;
  }
  function ticket(meal) {
    const foods=meal.items.map(it=>`${esc(it.name)} ×${it.quantity}`).join('、');
    return `<button class="ticket" ${attr('meal',meal.id)}><span class="spread"><span class="meal-type">${icon(mealIcon(meal.type))}${esc(meal.type)}</span><span class="price">¥${money(meal.amountCents)}</span></span><span class="ticket-items">${foods}</span><span class="ticket-foot"><span>${icon('flame')} ${energy(meal.knownKcal,meal.unknownQuantity,meal.estimatedQuantity)}</span>${icon('right')}</span></button>`;
  }
  function empty(symbol,title,hint='') {
    return `<div class="card empty"><span class="empty-icon">${icon(symbol)}</span><strong>${esc(title)}</strong>${hint?`<p>${esc(hint)}</p>`:''}</div>`;
  }
  function mealHistory(data, limit=20) {
    const groups=[];
    data.meals.forEach(meal=>{
      let group=groups[groups.length-1];
      if(!group||group.date!==meal.date){group={date:meal.date,meals:[],amount:0};groups.push(group);}
      group.meals.push(meal);group.amount+=meal.amountCents;
    });
    let shown=0;
    const rows=groups.filter(group=>{if(shown>=limit)return false;shown+=group.meals.length;return true;}).map(group=>{
      const weekday=['周日','周一','周二','周三','周四','周五','周六'][new Date(group.date+'T12:00:00Z').getUTCDay()];
      return `<section class="history-day" data-history-date="${esc(group.date)}"><div class="history-date"><div><strong>${when(group.date)}</strong><small>${weekday} · ${group.meals.length} 餐</small></div><span>合计 <b class="num">¥${money(group.amount)}</b></span></div><div class="card">${group.meals.map(ticket).join('')}</div></section>`;
    }).join('');
    return `<section class="section meal-history"><div class="section-head"><div class="section-title"><h2>用餐明细</h2><small>${data.start.slice(0,4)}年${Number(data.start.slice(5,7))}月 · ${data.mealCount} 餐</small></div></div>${rows||empty('receipt','这个月还没有用餐记录','在上方选择日期，记下你的第一餐。')}${shown<data.meals.length?btn('history-more','查看更多餐次','down','outlined full'):(shown?'<p class="history-end">本月记录已全部显示</p>':'')}</section>`;
  }
  const foodCategories=products=>['全部',...new Set(products.map(p=>p.category||'其他'))];
  window.DiaryUI={brandMark,esc,icon,n,money,when,offset,attr,btn,ibtn,foodIcon,energy,kcalText,mealIcon,ticket,empty,mealHistory,foodCategories};
})();
