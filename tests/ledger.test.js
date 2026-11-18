'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ledgerPath = path.resolve(__dirname, '../app/src/main/assets/www/ledger.js');
const Ledger = require(ledgerPath);

const seeds = [
  {id: 'burger', name: '汉堡', category: '汉堡', kcal: 222.25, sourceUrl: 'https://example.org/burger'},
  {id: 'sauce', name: '酱料', category: '其他', kcal: null}
];
function memoryStorage() {
  return {raw: '', read() { return this.raw; }, write(value) { this.raw = value; return true; }};
}
function fixture() {
  const storage = memoryStorage();
  return {storage, db: Ledger.open(seeds, storage)};
}
function meal(date, fields) {
  return Object.assign({date, type: '午餐', amountCents: 1890, items: [{productId: 'burger', quantity: 1}]}, fields);
}
function limited(name, kcal) {
  return {id: 'promo-1', name, category: '小食', kcal, sourceUrl: 'https://example.org/promo'};
}

test('删除自定义商品仅影响对应商品，重开后保留历史统计且旧餐次仍可编辑', () => {
  const {db, storage} = fixture();
  const food = {name:'我的小食', category:'小食', kcal:120};
  const removed = db.addProduct(food), kept = db.addProduct(food);
  db.mergeLimited([limited('活动小食',135)]);
  const saved = db.saveMeal(meal('2026-11-18',{items:[{productId:removed.id,quantity:2}]}));
  const before = db.summary('month',saved.date);
  assert.throws(()=>db.deleteCustomProduct('burger'));
  assert.throws(()=>db.deleteCustomProduct('promo-1'));
  db.deleteCustomProduct(removed.id);
  const reopened = Ledger.open(seeds,storage);
  assert(!reopened.products().some(p=>p.id===removed.id));
  assert(reopened.products().some(p=>p.id===kept.id));
  assert.deepEqual(reopened.summary('month',saved.date),before);
  assert.equal(reopened.saveMeal({...saved,amountCents:990}).items[0].name,food.name);
  assert.throws(()=>reopened.saveMeal(meal(saved.date,{items:saved.items})));
});

test('餐次、手动商品和下载菜单断网重开后保留，日期按本地日历生成', () => {
  const {db, storage} = fixture();
  assert.equal(db.lastSync(), null);
  const custom = db.addProduct({name: '　我的食品　', category: '小食', kcal: 0});
  assert.equal(custom.name, '我的食品');
  assert.equal(custom.kind, 'custom');
  assert.equal(db.mergeLimited([limited('新品', null)]), 1);
  const saved = db.saveMeal(meal('2026-05-02', {amountCents: 0, items: [
    {productId: custom.id, quantity: 2}, {productId: 'promo-1', quantity: 1}
  ]}));
  const reopened = Ledger.open(seeds, storage);
  assert.equal(reopened.lastSync(), db.lastSync());
  assert.ok(Number.isFinite(Date.parse(reopened.lastSync())));
  assert.deepEqual(reopened.products(), db.products());
  assert.deepEqual(reopened.meals(), [saved]);
  assert.equal(saved.knownKcal, 150);
  assert.equal(saved.unknownQuantity, 0);
  assert.equal(saved.estimatedQuantity, 1);
  assert.equal(Ledger.today(new Date(2024, 1, 29, 0, 1)), '2024-02-29');
});

test('跨年周从周一至周日，月与年按日历取值', () => {
  const {db} = fixture();
  for (const date of ['2025-12-28', '2025-12-29', '2026-01-01', '2026-01-04', '2026-01-05']) {
    db.saveMeal(meal(date));
  }
  const week = db.summary('week', '2026-01-04');
  assert.deepEqual([week.start, week.end, week.mealCount, week.amountCents],
    ['2025-12-29', '2026-01-04', 3, 5670]);
  assert.deepEqual(week.meals.map(m => m.date), ['2026-01-04', '2026-01-01', '2025-12-29']);
  assert.deepEqual(db.summary('week', '2025-12-29'), week);
  assert.equal(db.summary('year', '2025-01-01').mealCount, 2);
  assert.equal(db.summary('year', '2026-11-10').mealCount, 3);
  assert.equal(db.summary('month', '2024-02-11').end, '2024-02-29');
  assert.equal(db.summary('month', '2025-02-28').end, '2025-02-28');
  assert.equal(db.summary('month', '2026-02-01').mealCount, 0);
});

test('份数、用餐次数、实付和已知热量分别统计，单餐多份和重复行只算吃过一次', () => {
  const {db} = fixture();
  db.saveMeal(meal('2026-03-01', {amountCents: 2990, items: [
    {productId: 'burger', quantity: 2}, {productId: 'burger', quantity: 1, kcal: 110.1},
    {productId: 'sauce', quantity: 3}
  ]}));
  db.saveMeal(meal('2026-03-02', {amountCents: 1, type: '早餐', items: [
    {productId: 'burger', quantity: 1}, {productId: 'sauce', quantity: 1, kcal: 0}
  ]}));
  const month = db.summary('month', '2026-03-15');
  assert.deepEqual([month.mealCount, month.quantity, month.amountCents, month.knownKcal, month.unknownQuantity],
    [2, 8, 2991, 776.85, 3]);
  assert.deepEqual(month.ranking.find(row => row.productId === 'sauce'),
    {productId: 'sauce', name: '酱料', category: '其他', mealCount: 2, quantity: 4});
});

test('商品按稳定 ID 去重下载，同步与改餐保留历史快照和本次覆盖热量', () => {
  const {db} = fixture();
  assert.equal(db.mergeLimited([limited('当期小食', 120), limited('当期小食', 125)]), 1);
  const first = db.saveMeal(meal('2026-05-01', {items: [{productId: 'promo-1', quantity: 1, kcal: 99}]}));
  db.mergeLimited([limited('升级小食', 200)]);
  db.mergeLimited([{id: 'promo-2', name: '另一期商品', category: '小食', kcal: 80}]);
  assert.equal(db.products().length, 4);
  assert.equal(db.meals()[0].items[0].name, '当期小食');
  const edited = db.saveMeal(meal('2026-05-02', {id: first.id, type: '晚餐', amountCents: 990,
    items: [{productId: 'promo-1', quantity: 2}]}));
  assert.equal(edited.knownKcal, 198);
  assert.equal(edited.items[0].name, '当期小食');
  assert.equal(db.saveMeal(meal('2026-05-03', {items: [{productId: 'promo-1', quantity: 1}]})).knownKcal, 200);
  assert.equal(db.deleteMeal(first.id), true);
  assert.equal(db.summary('month', '2026-05-01').mealCount, 1);
  assert.throws(() => db.saveMeal(meal('2026-05-01', {id: first.id})), /不存在/);
});

test('校验失败、编号冲突和持久化写入失败时均保留原数据', () => {
  const {db, storage} = fixture();
  const saved = db.saveMeal(meal('2026-05-02'));
  const before = storage.raw;
  for (const input of [
    meal('2025-02-29'), meal('2026-05-01', {amountCents: -2}),
    meal('2026-05-01', {amountCents: 1.2}), meal('2026-05-01', {type: '宵夜'}),
    meal('2026-05-01', {items: []}), meal('2026-05-01', {items: [{productId: 'missing', quantity: 1}]}),
    meal('2026-05-01', {items: [{productId: 'burger', quantity: 0}]}),
    meal('2026-05-01', {items: [{productId: 'burger', quantity: 1, kcal: NaN}]})
  ]) assert.throws(() => db.saveMeal(input));
  assert.throws(() => db.mergeLimited([limited('新品', 10), {id: 'burger', name: '冲突', kcal: 88}]), /冲突/);
  assert.throws(() => db.mergeLimited(null));
  assert.equal(db.lastSync(), null);
  storage.write = () => false;
  assert.throws(() => db.deleteMeal(saved.id), /本地保存失败/);
  assert.equal(storage.raw, before);
  assert.equal(db.meals().length, 1);
  storage.raw = 'not-json';
  assert.throws(() => Ledger.open(seeds, storage), /保留原始数据/);
  assert.equal(storage.raw, 'not-json');
});

test('限时同步排除常驻品的商标与份量写法，同时保留同系列的限定口味', () => {
  const db = Ledger.open([{id: 'a', name: '麦乐鸡（5块）'}, {id: 'b', name: '薯条（大）'},
    {id: 'c', name: '巨无霸'}, {id: 'd', name: '鸡排（原味）'}], memoryStorage());
  const items = ['麦乐鸡®', '薯 条(中)', '大份薯条', '巨无霸™', '蒜香麦乐鸡', '鸡排（藤椒味）']
    .map((name, index) => ({id: 'promo-' + index, name}));
  assert.equal(db.mergeLimited(items), 2);
  assert.deepEqual(db.products().filter(item => item.kind === 'limited').map(item => item.name),
    ['蒜香麦乐鸡', '鸡排（藤椒味）']);
  assert.equal(db.mergeLimited(items.slice(0, 4)), 0);
  assert.ok(db.lastSync());
});

test('可持久修改默认热量，重新同步和清除个人值不会改变原餐次', () => {
  const {db, storage} = fixture();
  db.mergeLimited([limited('新品', 120)]);
  const original = db.saveMeal(meal('2026-05-01', {items: [{productId: 'promo-1', quantity: 1}]}));
  const edited = db.setProductKcal('promo-1', 0);
  assert.deepEqual([edited.kcal, edited.officialKcal, edited.userKcal], [0, 120, true]);
  db.mergeLimited([limited('新品', null)]);
  let current = db.products().find(p => p.id === 'promo-1');
  assert.deepEqual([current.kcal, current.officialKcal, current.userKcal], [0, 120, true]);
  db.mergeLimited([limited('新品', 110)]);
  const reopened = Ledger.open(seeds, storage);
  const second = reopened.saveMeal(meal('2026-05-02', {items: [{productId: 'promo-1', quantity: 3}]}));
  assert.deepEqual([second.knownKcal, second.unknownQuantity], [0, 0]);
  current = reopened.setProductKcal('promo-1', null);
  assert.deepEqual([current.kcal, current.officialKcal, current.userKcal], [110, 110, false]);
  assert.deepEqual(reopened.meals().find(m => m.id === original.id), original);
  assert.deepEqual(reopened.meals().find(m => m.id === second.id), second);
  assert.throws(() => reopened.setProductKcal('burger', 10));
  assert.throws(() => reopened.setProductKcal('promo-1', -1));
  assert.throws(() => reopened.setProductKcal('promo-1', ''));
});

test('旧自定义商品可修改及清空，成功的空列表同步保留全部缓存并更新日期', () => {
  const storage = memoryStorage();
  storage.raw = JSON.stringify({version: 1, meals: [], lastSync: '2000-01-01T00:00:00.000Z', products: [
    {id: 'old-custom', kind: 'custom', name: '自定义', kcal: 89, category: '其他', sourceUrl: ''},
    Object.assign(limited('旧限时品', null), {kind: 'limited'})
  ]});
  const db = Ledger.open(seeds, storage);
  assert.equal(db.products().find(p => p.id === 'old-custom').userKcal, true);
  assert.equal(db.setProductKcal('old-custom', 198.5).kcal, 198.5);
  const empty = db.setProductKcal('old-custom', null);
  assert.deepEqual([empty.kcal, empty.officialKcal, empty.userKcal], [null, null, false]);
  const before = db.products();
  assert.equal(db.mergeLimited([]), 0);
  assert.ok(db.lastSync() > '2000-01-01T00:00:00.000Z');
  assert.deepEqual(db.products(), before);
  assert.equal(db.addProduct({name: '测试商品', kcal: 12}).userKcal, true);
});

test('顺序写入的两个实例保留彼此的修改，返回对象隔离内部状态', () => {
  const {db, storage} = fixture();
  const another = Ledger.open(seeds, storage);
  const first = db.saveMeal(meal('2026-11-10'));
  another.saveMeal(meal('2026-11-11', {type: '晚餐'}));
  first.items[0].name = '外部修改';
  const latest = another.meals();
  latest[1].amountCents = 0;
  assert.equal(another.summary('year', '2026-01-01').amountCents, 3780);
  assert.equal(another.meals()[1].items[0].name, '汉堡');
});

test('浏览器自动选择 Android 桥，普通浏览器使用 localStorage', () => {
  const source = fs.readFileSync(ledgerPath, 'utf8');
  const files = new Map();
  const localStorage = {getItem: key => files.get(key) || null, setItem: (key, value) => files.set(key, value)};
  const android = memoryStorage();
  const window = {AndroidStore: android, localStorage};
  vm.runInNewContext(source, {window});
  window.Ledger.open(seeds).saveMeal(meal('2026-04-02'));
  assert.equal(JSON.parse(android.raw).meals.length, 1);
  assert.equal(files.size, 0);
  delete window.AndroidStore;
  window.Ledger.open(seeds).saveMeal(meal('2026-04-03'));
  assert.equal(window.Ledger.open(seeds).meals()[0].date, '2026-04-03');
  assert.equal(files.size, 1);
});

test('限定品按细类别和份量估算，零值、个人值及历史快照分别保留', () => {
  const base = [
    {id:'w1', name:'辣鸡翅（2块）', category:'鸡肉小食', kcal:200},
    {id:'w2', name:'鲜香V翅（2块）', category:'鸡肉小食', kcal:220},
    {id:'n5', name:'麦乐鸡（5块）', category:'鸡肉小食', kcal:900},
    {id:'d1', name:'常驻巧克力雪冰（中）', category:'饮品', kcal:320},
    {id:'d2', name:'常驻巧克力雪冰（大）', category:'饮品', kcal:410},
    {id:'d3', name:'美式（大）', category:'饮品', kcal:14}
  ];
  const storage = memoryStorage();
  const db = Ledger.open(base, storage);
  const wing = {id:'sw', name:'芝士鸡翅（3块）', category:'鸡肉小食', kcal:null};
  const drink = {id:'sd', name:'柿子雪冰（大）', category:'饮品'};
  db.mergeLimited([wing, drink]);
  const get = id => db.products().find(p => p.id === id);
  assert.deepEqual([get('sw').kcal, get('sw').kcalSource, get('sw').officialKcal], [315, 'estimated', null]);
  assert.match(get('sw').estimateBasis, /鸡翅.*3 件/);
  assert.deepEqual([get('sd').kcal, get('sd').kcalSource], [410, 'estimated']);
  const saved = db.saveMeal(meal('2026-11-11', {items:[
    {productId:'sw', kcal:315, quantity:2}, {productId:'sd', kcal:410, quantity:1, kcalSource:'personal'}
  ]}));
  assert.deepEqual(saved.items.map(i => i.kcalSource), ['estimated', 'personal']);
  assert.deepEqual([saved.knownKcal, saved.estimatedQuantity, saved.estimatedKcal], [1040, 2, 630]);
  db.mergeLimited([{...wing, kcal:0}, drink]);
  assert.deepEqual([get('sw').kcalSource, get('sw').kcal], ['official', 0]);
  assert.equal(db.setProductKcal('sd', 0).kcalSource, 'personal');
  assert.equal(db.setProductKcal('sd', null).kcalSource, 'estimated');
  const edited = db.saveMeal({...saved, amountCents:2040});
  assert.deepEqual(edited.items, saved.items);
  for (const period of ['week', 'month', 'year']) {
    const summary = Ledger.open(base, storage).summary(period, '2026-11-11');
    assert.deepEqual([summary.knownKcal, summary.estimatedQuantity, summary.estimatedKcal], [1040, 2, 630]);
  }
});

test('旧的限定品首次启动即可估算；缺少来源的旧餐次保留原始数值与待补状态', () => {
  const storage = memoryStorage();
  const items = [
    {productId:'promo-1', name:'旧品', category:'小食', quantity:1, kcal:null},
    {productId:'burger', name:'汉堡', category:'汉堡', quantity:2, kcal:50}
  ];
  storage.raw = JSON.stringify({version:1, products:[{...limited('旧品', null), kind:'limited'}],
    meals:[{id:'old', type:'晚餐', date:'2026-11-10', amountCents:1299, createdAt:12, items}],
    lastSync:'2025-01-01T00:00:00Z'});
  const before = storage.raw;
  const db = Ledger.open(seeds, storage);
  assert.equal(db.products().find(p => p.id==='promo-1').kcalSource, 'estimated');
  const old = db.meals()[0];
  assert.deepEqual(old.items.map(i=>[i.kcal, i.kcalSource]), [[null, 'unknown'], [50, 'recorded']]);
  assert.deepEqual([old.knownKcal, old.unknownQuantity, old.estimatedQuantity], [100, 1, 0]);
  assert.equal(storage.raw, before);
  assert.deepEqual(db.saveMeal({...old, amountCents:999}).items, old.items);
});

test('需估算的常驻规格可调整个人值，更新后可恢复官方值，旧餐次不变', () => {
  const storage = memoryStorage();
  const leg = {id:'leg', name:'麦麦脆汁鸡（琵琶腿，1块）', category:'鸡肉小食', kcal:326};
  const tender = {...leg, id:'tender', name:'麦麦脆汁鸡（带骨里脊，1块）', kcal:null, estimateWhenMissing:true};
  let db = Ledger.open([leg, tender], storage);
  assert.equal(db.products()[1].kcal, 326);
  assert.equal(db.products()[1].kcalSource, 'estimated');
  const saved = db.saveMeal(meal('2026-11-11', {items:[{productId:'tender', quantity:1}]}));
  assert.equal(db.setProductKcal('tender', 280).kcalSource, 'personal');
  db = Ledger.open([leg, {...tender, kcal:305, estimateWhenMissing:false}], storage);
  assert.equal(db.products()[1].kcal, 280);
  assert.equal(db.products()[1].officialKcal, 305);
  const reset = db.setProductKcal('tender', null);
  assert.deepEqual([reset.kcal, reset.kcalSource, reset.canSetKcal], [305, 'official', false]);
  assert.deepEqual(db.meals()[0], saved);
});

test('完整同步按日期展示本次和历史，部分同步保留旧清单和较新的文章日期', () => {
  const {db, storage} = fixture();
  const old = {...limited('旧品', null), publishedDate:'2026-10-15'};
  const fresh = {...limited('新品', null), id:'promo-2', publishedDate:'2026-11-11'};
  db.mergeLimited([old]);
  db.mergeLimited([fresh], {partial:true});
  const rows = () => db.products().filter(p=>p.kind==='limited').map(p=>[p.id,p.currentSync,p.publishedDate]);
  assert.deepEqual(rows(), [['promo-2',true,'2026-11-11'], ['promo-1',true,'2026-10-15']]);
  db.mergeLimited([{...fresh,publishedDate:'2026-11-02'}]);
  assert.deepEqual(rows(), [['promo-2',true,'2026-11-11'], ['promo-1',false,'2026-10-15']]);
  db.mergeLimited([]);
  assert.deepEqual(rows(), [['promo-2',false,'2026-11-11'], ['promo-1',false,'2026-10-15']]);
  assert.deepEqual(db.products(), Ledger.open(seeds, storage).products());
});
