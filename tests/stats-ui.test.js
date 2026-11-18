'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const www = path.resolve(__dirname, '../app/src/main/assets/www');
const Ledger = require(path.join(www, 'ledger.js'));
const window = {Ledger};
for (const file of ['ui.js', 'stats-calendar.js', 'stats-trend.js', 'stats-ui.js']) {
  vm.runInNewContext(fs.readFileSync(path.join(www, file), 'utf8'), {window});
}
const {StatsUI, DiaryUI} = window;

function makeDb() {
  const store = {value: '', read() { return this.value; }, write(value) { this.value = value; return true; }};
  const db = Ledger.open([{id: 'a', name: '甲食品', category:'汉堡', kcal: 100}, {id: 'b', name: '乙食品', category:'饮品', kcal: null}, {id:'c',name:'鸡块',category:'鸡肉小食',kcal:200}], store);
  db.saveMeal({date: '2024-02-01', type: '午餐', amountCents: 3790, items: [
    {productId: 'a', quantity: 6}, {productId: 'b', quantity: 1}
  ]});
  db.saveMeal({date: '2024-02-29', type: '晚餐', amountCents: 990, items: [{productId: 'b', quantity: 1}]});
  return db;
}

test('统计页呈现每日曲线与未知热量，保留排行并移除用餐明细', () => {
  const db = makeDb();
  const state = {period: 'month', anchor: '2024-02-29'};
  const render = () => StatsUI.render(db, state, DiaryUI);
  const html = render();
  assert.match(html, /47\.80/);
  assert.match(html, /2 份待补热量/);
  assert.match(html, /class="expense-line"/);
  assert.doesNotMatch(html, /bar-slot/);
  const points=window.StatsTrend.series(db.summary('month','2024-02-29'));
  assert.equal(points.length,29);
  assert.equal(points[0].amount,3790);
  assert.equal(points[1].amount,0);
  assert.equal(points[28].amount,990);
  assert.doesNotMatch(html, /data-act="meal"/);
  assert.ok(html.indexOf('甲食品') < html.indexOf('乙食品'));
  assert.doesNotMatch(html,/stats-metric|吃过 \d+ 餐/);
  assert.match(html,/6 份/);
  assert.equal(StatsUI.action('stats-category', '饮品', state, db), true);
  assert.doesNotMatch(render(),/甲食品/);assert.match(render(),/乙食品/);
  assert.match(render(),/47\.80/);
  StatsUI.action('stats-category','鸡肉小食',state,db);
  assert.match(render(),/本期该分类还没有用餐记录/);
  assert.equal(StatsUI.action('stats-category','不存在的分类',state,db),false);
  StatsUI.action('stats-bucket', '2024-02-29', state, db);
  assert.match(render(), /2024-02-29/);
  assert.doesNotMatch(render(), /用餐明细|data-act="meal"/);
});

test('排行分类顺序与选食品一致，切换分类重置展开，周期切换保留分类',()=>{
  const db=makeDb(),state={period:'month',anchor:'2024-02-01',rankExpanded:true};
  for(let i=0;i<6;i++){
    const p=db.addProduct({name:'饮品'+i,category:'饮品',kcal:1});
    db.saveMeal({date:'2024-02-02',type:'早餐',amountCents:0,items:[{productId:p.id,quantity:3}]});
  }
  const html=StatsUI.render(db,state,DiaryUI);
  const categories=[...html.matchAll(/data-act="stats-category" data-val="([^"]*)"/g)].map(m=>m[1]);
  assert.deepEqual(categories,Array.from(DiaryUI.foodCategories(db.products())));
  StatsUI.action('stats-category','饮品',state,db);assert.equal(state.rankExpanded,undefined);
  let ranked=StatsUI.render(db,state,DiaryUI);assert.equal((ranked.match(/class="rank-row"/g)||[]).length,5);
  StatsUI.action('stats-rank-more','',state,db);
  ranked=StatsUI.render(db,state,DiaryUI);assert.equal((ranked.match(/class="rank-row"/g)||[]).length,7);
  StatsUI.action('stats-period','year',state,db);assert.equal(state.rankCategory,'饮品');
});

test('周期导航按日历进退，闰日、月末和日期选择正确', () => {
  const db = makeDb();
  const state = {period: 'month', anchor: '2024-03-31', bucket: '2024-03-15'};
  const apply = (act, val) => StatsUI.action('stats-' + act, val, state, db);
  apply('move', '-1');
  assert.equal(state.anchor, '2024-02-29');
  assert.equal(state.bucket, undefined);
  apply('period', 'year');
  apply('move', '1');
  assert.equal(state.anchor, '2025-02-28');
  const year = StatsUI.render(db, state, DiaryUI);
  assert.match(year, /class="expense-line"/);
  assert.equal(window.StatsTrend.series(db.summary('year',state.anchor)).length,365);
  assert.equal(apply('date', '2025-02-29'), false);
  assert.equal(apply('date', ''), false);
  assert.equal(state.anchor, '2025-02-28');
  assert.equal(apply('date', '2024-01-01'), true);
  apply('period', 'week');
  apply('move', '-1');
  assert.equal(state.anchor, '2023-12-25');
  const week = StatsUI.render(db, state, DiaryUI);
  assert.equal(window.StatsTrend.series(db.summary('week',state.anchor)).length,7);
  assert.match(week, /2023年12月25日 – 31日/);
});

test('日期选择按周整行、按月十二格、按年独立选择，取消不改日期',()=>{
  const db=makeDb(),state={period:'week',anchor:'2024-02-29'};
  const apply=(a,v)=>StatsUI.action('stats-'+a,v,state,db);
  apply('picker-open','');
  let html=StatsUI.render(db,state,DiaryUI);
  assert.equal((html.match(/class="calendar-week selected"/g)||[]).length,1);
  apply('pick-week','2024-03-04');apply('picker-close','');
  assert.equal(state.anchor,'2024-02-29');
  apply('period','month');apply('picker-open','');
  html=StatsUI.render(db,state,DiaryUI);
  assert.equal((html.match(/data-act="stats-pick-value"/g)||[]).length,12);
  assert.doesNotMatch(html,/calendar-day|type="date"/);
  apply('pick-value','2024-01-01');apply('picker-apply','');
  assert.equal(state.anchor,'2024-01-01');
  apply('period','year');apply('picker-open','');apply('pick-value','2023-01-01');
  assert.equal(state.picker.end,'2023-12-31');apply('picker-apply','');
  assert.equal(state.anchor,'2023-01-01');
});

test('手账单日选择使用同一日历，只有确认后才改变日期',()=>{
  const state={period:'day',anchor:'2026-11-17'};
  window.StatsCalendar.open(state,{start:state.anchor,end:state.anchor});
  window.StatsCalendar.action('stats-pick-day','2026-11-03',state);
  assert.equal(state.anchor,'2026-11-17');assert.equal(state.picker.end,'2026-11-03');
  const html=window.StatsCalendar.render(makeDb(),state,DiaryUI);
  assert.match(html,/选择用餐日期|sheet-drag-zone/);
  assert.equal((html.match(/single-selected/g)||[]).length,1);
  window.StatsCalendar.action('stats-picker-apply','',state);assert.equal(state.anchor,'2026-11-03');
  window.StatsCalendar.open(state,{start:state.anchor,end:state.anchor});
  window.StatsCalendar.action('stats-pick-day','2026-12-31',state);
  window.StatsCalendar.action('stats-picker-close','',state);assert.equal(state.anchor,'2026-11-03');
});

test('无消费的日期显示农历，初一显示月份，金额和零元记录优先',()=>{
  assert.equal(window.StatsCalendar.lunarLabel('2026-11-09'),'十月');
  assert.equal(window.StatsCalendar.lunarLabel('2026-11-12'),'初四');
  assert.equal(window.StatsCalendar.lunarLabel('2026-11-17'),'初九');
  assert.equal(window.StatsCalendar.lunarLabel('2026-02-17'),'正月');
  assert.equal(window.StatsCalendar.lunarLabel('2025-07-25'),'闰六月');
  const db=makeDb();
  db.saveMeal({date:'2024-02-03',type:'早餐',amountCents:0,items:[{productId:'a',quantity:1}]});
  const state={period:'day',anchor:'2024-02-01'};
  window.StatsCalendar.open(state,{start:state.anchor,end:state.anchor});
  const html=window.StatsCalendar.render(db,state,DiaryUI);
  assert.equal((html.match(/<small>[^<]+<\/small>/g)||[]).length,42);
  assert.match(html,/data-val="2024-02-01"><span>1<\/span><small>37.90<\/small>/);
  assert.match(html,/data-val="2024-02-03"><span>3<\/span><small>0.00<\/small>/);
});

test('自定义范围含首尾日期，反向选取、跨年、单日与空数据可用',()=>{
  const db=makeDb(),state={period:'month',anchor:'2024-02-01'};
  const apply=(a,v)=>StatsUI.action('stats-'+a,v,state,db);
  apply('period','custom');
  apply('pick-day','2024-02-29');
  assert.equal(apply('picker-apply',''),false);
  apply('pick-day','2023-12-31');apply('picker-apply','');
  assert.equal(state.rangeStart,'2023-12-31');assert.equal(state.rangeEnd,'2024-02-29');
  const data=db.summary('custom',state.rangeStart,state.rangeEnd);
  assert.equal(data.amountCents,4780);assert.equal(data.mealCount,2);
  assert.equal(window.StatsTrend.series(data).length,61);
  assert.match(StatsUI.render(db,state,DiaryUI),/47\.80/);
  assert.equal(db.summary('custom','2024-02-29','2024-02-29').amountCents,990);
  assert.equal(window.StatsTrend.series(db.summary('custom','2024-02-29','2024-02-29')).length,1);
  assert.equal(db.summary('custom','2025-01-01','2025-02-01').amountCents,0);
  assert.throws(()=>db.summary('custom','2024-02-29','2024-02-01'));
  assert.throws(()=>db.summary('custom','2025-02-29','2025-03-01'));
  assert.equal(window.StatsTrend.series(db.summary('year','2024-01-01')).length,366);
});

test('平滑曲线通过每个数据点，插值不产生负支出或超过相邻峰值',()=>{
  for(const values of [[0,100,0,40,40,0],[70,40,20,80,0],[0,0,0]]){
    const points=values.map((y,i)=>({x:i*10,y}));
    const commands=window.StatsTrend.path(points).split(' C ').slice(1);
    commands.forEach((cmd,i)=>{
      const [x1,y1,x2,y2,x3,y3]=cmd.split(' ').map(Number);
      assert.equal(x3,points[i+1].x);assert.equal(y3,points[i+1].y);
      for(let t=0;t<=1;t+=.01){
        const y=(1-t)**3*values[i]+3*(1-t)**2*t*y1+3*(1-t)*t*t*y2+t**3*y3;
        assert(y>=Math.min(values[i],y3)-1e-8&&y<=Math.max(values[i],y3)+1e-8);
      }
    });
  }
});
