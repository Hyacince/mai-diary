(function (root) {
  'use strict';

  const periods = {week: '周', month: '月', year: '年', custom: '自定义'};

  function parse(date) { return new Date(date + 'T00:00:00Z'); }
  function iso(date) { return date.toISOString().slice(0, 10); }
  function monthDay(date) { return Number(date.slice(5, 7)) + '月' + Number(date.slice(8)) + '日'; }

  function periodText(period, data) {
    if (period === 'year') return data.start.slice(0, 4) + '年';
    if (period === 'month') return data.start.slice(0, 4) + '年' + Number(data.start.slice(5, 7)) + '月';
    const startYear = data.start.slice(0, 4);
    const endYear = data.end.slice(0, 4);
    const first = startYear + '年' + monthDay(data.start);
    if (startYear !== endYear) return first + ' – ' + endYear + '年' + monthDay(data.end);
    if (data.start.slice(5, 7) !== data.end.slice(5, 7)) return first + ' – ' + monthDay(data.end);
    return first + ' – ' + Number(data.end.slice(8)) + '日';
  }

  function moveAnchor(anchor, period, step) {
    const date = parse(anchor);
    if (period === 'week') {
      date.setUTCDate(date.getUTCDate() + step * 7);
    } else {
      const day = date.getUTCDate();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() + step * (period === 'year' ? 12 : 1));
      const end = new Date(date);
      end.setUTCMonth(date.getUTCMonth() + 1, 0);
      date.setUTCDate(Math.min(day, end.getUTCDate()));
    }
    if (date.getUTCFullYear() < 1 || date.getUTCFullYear() > 9999) return anchor;
    return iso(date);
  }

  function summary(db, state) {
    return state.period === 'custom' ? db.summary('custom', state.rangeStart, state.rangeEnd) :
      db.summary(state.period || 'month', state.anchor || root.Ledger.today());
  }
  function controls(state, data, ui) {
    const tabs = Object.keys(periods).map(key => '<button type="button" data-act="stats-period" data-val="'+key+'" aria-pressed="'+(state.period===key)+'" class="'+(state.period===key?'active':'')+'">'+(key==='custom'?'自定义':'按'+periods[key])+'</button>').join('');
    const move = step => '<button class="iconbtn" aria-label="'+(step<0?'上一':'下一')+periods[state.period]+'" data-act="stats-move" data-val="'+step+'">'+ui.icon(step<0?'left':'right')+'</button>';
    return '<div class="tabs" role="group" aria-label="统计周期">'+tabs+'</div><div class="date-controls period-select">'+
      (state.period==='custom'?'':move(-1))+'<button class="datejump" data-act="stats-picker-open" aria-label="选择统计日期">'+ui.icon('calendar')+ui.esc(periodText(state.period,data))+ui.icon('down')+'</button>'+(state.period==='custom'?'':move(1))+'</div>';
  }

  function totals(data, ui) {
    const average = data.mealCount ? '餐均 ¥' + ui.money(Math.round(data.amountCents / data.mealCount)) : '';
    const unknown = data.unknownQuantity ? '<div class="unknown">' +
      ui.n(data.unknownQuantity) + ' 份待补热量</div>' : '';
    const kcal = data.quantity && data.unknownQuantity === data.quantity ? '—' : ui.n(data.knownKcal);
    const energyLabel = data.unknownQuantity ? '已计热量' : '摄入热量';
    const estimate = data.estimatedQuantity ? '<div class="unknown">其中 '+
      ui.n(data.estimatedQuantity)+' 份为估算 · '+ui.n(data.estimatedKcal)+' 大卡</div>' : '';
    return '<div class="summary-head stats-total"><small>实付总额</small>' +
      '<div class="money"><span class="unit">¥</span>' + ui.money(data.amountCents) + '</div>' +
      (average ? '<div class="stats-avg">' + average + '</div>' : '') + '</div>' +
      '<div class="stat-metrics"><div class="card metric"><small>' + ui.icon('receipt') + '用餐次数</small>' +
      '<div class="value">' + ui.n(data.mealCount) + '<span class="suffix">餐</span></div></div>' +
      '<div class="card metric"><small>' + ui.icon('flame') + energyLabel + '</small><div class="value">' +
      (data.estimatedQuantity?'约 ':'') + kcal + '<span class="suffix">大卡</span></div>' + estimate + unknown + '</div></div>';
  }

  function ranking(state, data, ui, products) {
    const catalog = new Map(products.map(p=>[p.id,p]));
    const allRows = data.ranking.map(row=>({...row,category:catalog.get(row.productId)?.category||row.category||'其他'}));
    const categories = ui.foodCategories(products.concat(allRows));
    const category = categories.includes(state.rankCategory) ? state.rankCategory : '全部';
    const rows = allRows.filter(row=>category==='全部'||row.category===category).sort((a,b)=>
      b.quantity-a.quantity||a.name.localeCompare(b.name,'zh-CN')||a.productId.localeCompare(b.productId));
    const chips = categories.map(c=>'<button data-act="stats-category" data-val="'+ui.esc(c)+'" aria-pressed="'+
      (c===category)+'" class="'+(c===category?'active':'')+'">'+ui.esc(c)+'</button>').join('');
    const top = state.rankExpanded ? rows : rows.slice(0, 5);
    const list = top.map(function (product, index) {
      const major = ui.n(product.quantity) + ' 份';
      return '<div class="rank-row"><span class="rank-no num">' + (index + 1) +
        '</span><div class="grow"><div class="item-title">' + ui.esc(product.name) + '</div><div class="sub">' +
        ui.esc(product.category) + '</div></div><strong class="rank-count num">' + major + '</strong></div>';
    }).join('');
    const more = rows.length > 5 ? '<button class="stats-more" data-act="stats-rank-more" aria-expanded="' +
      Boolean(state.rankExpanded) + '">' + (state.rankExpanded ? '收起排行' : '查看全部 ' + rows.length + ' 种商品') +
      '</button>' : '';
    return '<section class="section food-ranking"><div class="section-head"><h2>餐品排行</h2><small>按食用份数</small></div>' +
      '<div class="chips rank-categories" role="group" aria-label="餐品分类">'+chips+'</div><div class="card">' +
      (list || '<div class="empty"><strong>'+(category==='全部'?'本期还没有餐品记录':'本期该分类还没有用餐记录')+'</strong></div>') + more + '</div></section>';
  }

  function render(db, state, ui) {
    const settings = Object.assign({}, state);
    if (!Object.prototype.hasOwnProperty.call(periods, settings.period)) settings.period = 'month';
    if (!settings.anchor) settings.anchor = root.Ledger.today();
    const data = summary(db, settings);
    return controls(settings, data, ui) + totals(data, ui) + root.StatsTrend.render(settings, data, ui) +
      ranking(settings, data, ui, db.products()) + root.StatsCalendar.render(db, settings, ui);
  }

  function resetInterval(state) {
    delete state.bucket;
    delete state.rankExpanded;
  }

  function action(name, value, state, db) {
    if (root.StatsCalendar.action(name, value, state)) return true;
    switch (name) {
      case 'stats-picker-open':
        root.StatsCalendar.open(state, summary(db, state));
        return true;
      case 'stats-period':
        if (!Object.prototype.hasOwnProperty.call(periods, value)) return false;
        if(value==='custom' && state.period!=='custom') {
          const current=summary(db,state);
          state.rangeStart=current.start;state.rangeEnd=current.end;
        }
        state.period = value;
        if(value==='custom')root.StatsCalendar.open(state,summary(db,state));
        resetInterval(state);
        break;
      case 'stats-move':
        if(state.period==='custom')return false;
        if (value !== '-1' && value !== '1') return false;
        state.anchor = moveAnchor(state.anchor || root.Ledger.today(), state.period || 'month', Number(value));
        resetInterval(state);
        break;
      case 'stats-date':
        if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parse(value).getTime()) ||
          iso(parse(value)) !== value) return false;
        state.anchor = value;
        resetInterval(state);
        break;
      case 'stats-category':
        if (!root.DiaryUI.foodCategories(db.products().concat(summary(db,state).ranking)).includes(value)) return false;
        state.rankCategory = value;
        delete state.rankExpanded;
        break;
      case 'stats-bucket':
        state.bucket = value;
        break;
      case 'stats-rank-more':
        state.rankExpanded = !state.rankExpanded;
        break;
      default:
        return false;
    }
    return true;
  }
  root.StatsUI = {render, action, updatePoint(value,state,db,element,ui) { root.StatsTrend.update(value,state,summary(db,state),element,ui); }};
})(window);
