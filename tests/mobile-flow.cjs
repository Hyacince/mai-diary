'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const http=require('node:http');
const path=require('node:path');
const os=require('node:os');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=path.resolve(__dirname,'../app/src/main/assets/www');
const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.webp':'image/webp'};
const server=http.createServer((req,res)=>{
  const file=path.join(root,req.url==='/'?'index.html':req.url.slice(1));
  if(path.dirname(file)!==root || !fs.existsSync(file)){res.writeHead(404).end();return;}
  res.setHeader('Content-Type',types[path.extname(file)] || 'application/octet-stream');
  fs.createReadStream(file).pipe(res);
});
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
  try{
    const page=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'zh-CN'});
    const errors=[];page.on('pageerror',ex=>errors.push(ex.message));
    const btn=(act,val)=>page.locator('[data-act="'+act+'"]'+(val===undefined?'':'[data-val="'+val+'"]'));
    const click=async(act,val)=>{await btn(act,val).first().click();if(['stats-picker-close','stats-picker-apply'].includes(act))await page.locator('.period-overlay').waitFor({state:'hidden'});};
    const pauseDate=async(value,field)=>{
      if(field!=='day'){await page.locator('[data-field="'+field+'"]').fill(value);return;}
      await click('home-picker-open');await click('stats-pick-day',value);await click('stats-picker-apply');
    };
    const read=()=>page.evaluate(()=>Ledger.open(BUILTIN_MENU).meals());
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
    await page.getByRole('heading',{name:'麦记手账'}).waitFor();
    assert(await page.locator('.hero-art').evaluate(im=>im.complete&&im.naturalWidth>0));
    assert.equal(await page.locator('.preview-product').count(),0);
    assert.equal(await page.getByRole('heading',{name:'常驻菜单',exact:true}).count(),0);
    assert.equal(await page.locator('.meal-history').count(),1);
    const dayMotion=await page.evaluate(async()=>{
      const group=document.querySelector('[data-motion-group="home-days"]'),old=group.querySelector('.selection-marker').getBoundingClientRect().left;
      group.querySelector('button:last-child').click();
      const marker=document.querySelector('[data-motion-group="home-days"] .selection-marker'),positions=[];
      const until=performance.now()+330;
      while(performance.now()<until){await new Promise(requestAnimationFrame);positions.push(marker.getBoundingClientRect().left);}
      return {old,positions};
    });
    assert(Math.abs(dayMotion.positions[0]-dayMotion.positions[dayMotion.positions.length-1])>20,'手账日期背景平滑移动');
    await click('today');
    for(const tabName of ['home','stats','library']){
      await click('tab',tabName);
      const stable=await page.evaluate(()=>{
        const header=document.querySelector('#header-host'),screen=document.querySelector('#screen'),top=header.getBoundingClientRect().top;
        screen.scrollTop=300;const same=header.getBoundingClientRect().top===top&&top===0;
        screen.scrollTop=0;return same;
      });
      assert(stable,'滚动时顶部红栏固定 '+tabName);
    }
    assert.equal(await page.locator('#header-host [data-act="new-product"]').count(),0);
    assert.equal(await btn('new-product').count(),0);
    const kindMotion=await page.evaluate(async()=>{
      document.querySelector('[data-act="kind"][data-val="custom"]').click();
      const marker=document.querySelector('[data-motion-group="food-kinds"] .selection-marker'),positions=[];
      const until=performance.now()+330;
      while(performance.now()<until){await new Promise(requestAnimationFrame);positions.push(marker.getBoundingClientRect().left);}
      return positions;
    });
    assert(Math.abs(kindMotion[0]-kindMotion[kindMotion.length-1])>50,'商品类型黄色背景平滑移动');
    assert.equal(await page.locator('.custom-products-head [data-act="new-product"]').count(),1);
    await click('new-product');await click('back');assert.equal(await btn('new-product').count(),1);
    await click('tab','home');
    const cdp=await page.context().newCDPSession(page);
    async function swipe(x1,y1,x2,y2,cancel=false){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x1,y:y1}]});
      for(let step=1;step<=6;step++){
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x1+(x2-x1)*step/6,y:y1+(y2-y1)*step/6}]});
        await page.waitForTimeout(20);
      }
      await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
      await page.waitForTimeout(260);
    }
    const selected=()=>page.locator('.nav [aria-current="page"]').getAttribute('data-val');
    await swipe(300,400,100,400);assert.equal(await selected(),'stats');
    await swipe(300,400,100,400);assert.equal(await selected(),'library');
    await swipe(300,400,100,400);assert.equal(await selected(),'library');
    await swipe(100,400,300,400);assert.equal(await selected(),'stats');
    await swipe(100,400,125,400);assert.equal(await selected(),'stats');
    await swipe(100,400,300,400,true);assert.equal(await selected(),'stats');
    await swipe(190,650,190,340);assert.equal(await selected(),'stats');
    assert(await page.locator('#screen').evaluate(el=>el.scrollTop)>0);
    const navStable=await page.evaluate(async()=>{
      const nav=document.querySelector('.nav'),top=nav.getBoundingClientRect().top;
      for(const name of ['home','stats','library','stats','home']){
        document.querySelector('[data-act="tab"][data-val="'+name+'"]').click();
        for(let frame=0;frame<18;frame++){
          await new Promise(requestAnimationFrame);
          if(document.querySelector('.nav')!==nav || Math.abs(nav.getBoundingClientRect().top-top)>.1)return false;
        }
      }
      return true;
    });
    assert(navStable,'导航栏在全部切页动画帧保持位置和节点稳定');
    const opening=await page.evaluate(async()=>{
      document.querySelector('[data-act="home-picker-open"]').click();
      const sheet=document.querySelector('.period-sheet'),frames=[];
      const until=performance.now()+430;
      while(performance.now()<until){await new Promise(requestAnimationFrame);frames.push(sheet.getBoundingClientRect().top);}
      return frames;
    });
    assert(opening[0]-opening[opening.length-1]>200,'日期面板从屏幕底部上滑');
    const originalDay=await page.locator('.day.active').getAttribute('data-val');
    const selection=await page.evaluate(async()=>{
      const target=document.querySelector('[data-act="stats-pick-day"][data-val="2026-11-03"]');
      target.click();
      const marker=document.querySelector('.calendar-highlight'),cell=document.querySelector('.single-selected'),frames=[];
      const until=performance.now()+330;
      while(performance.now()<until){await new Promise(requestAnimationFrame);frames.push({y:marker.getBoundingClientRect().top,text:cell.getBoundingClientRect().top});}
      return frames;
    });
    assert(Math.abs(selection[0].y-selection[selection.length-1].y)>20,'黄色选中块平滑移动');
    assert(selection.every(f=>Math.abs(f.text-selection[0].text)<.1),'日期文字不随色块移动');
    for(const width of [320,390,768]){
      await page.setViewportSize({width,height:844});
      for(const date of ['2026-11-02','2026-11-08','2026-11-30','2026-12-06']){
        await click('stats-pick-day',date);
        const circle=await page.locator('.calendar-highlight').evaluate(async marker=>{
          await Promise.all(marker.getAnimations().map(a=>a.finished.catch(()=>{})));
          const r=marker.getBoundingClientRect(),cell=document.querySelector('.single-selected').getBoundingClientRect();
          return {width:r.width,height:r.height,radius:getComputedStyle(marker).borderRadius,dx:r.x+r.width/2-cell.x-cell.width/2,dy:r.y+r.height/2-cell.y-cell.height/2};
        });
        assert(Math.abs(circle.width-circle.height)<.1&&circle.radius==='50%','边缘日期为正圆 '+width+' '+date);
        assert(Math.abs(circle.dx)<.5&&Math.abs(circle.dy)<.5,'选中圆形在格子中心');
      }
    }
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator('[data-val="2026-11-12"] small').innerText(),'初四');
    await click('stats-pick-day','2026-11-08');
    const monthHeading=()=>page.locator('.period-heading strong').innerText();
    const calendarSwipe=async(direction,cancel=false,short=false)=>{
      await page.locator('.period-sheet').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});
      const grid=await page.locator('.calendar-days,.period-grid').boundingBox();
      const y=grid.y+Math.min(70,grid.height/2);
      await swipe(direction<0?110:280,y,direction<0?(short?130:280):(short?260:110),y,cancel);
    };
    await calendarSwipe(1);assert.equal(await monthHeading(),'2026年12月');
    assert.equal(await page.locator('.period-chosen').innerText(),'2026/11/08','滑动只翻页，不改变已选日期');
    await calendarSwipe(-1);assert.equal(await monthHeading(),'2026年11月');
    await calendarSwipe(1,true);assert.equal(await monthHeading(),'2026年11月');
    await calendarSwipe(1,false,true);assert.equal(await monthHeading(),'2026年11月');
    assert.equal(await page.locator('.period-chosen').innerText(),'2026/11/08','短划和取消不误选日期');
    let grip=await page.locator('.sheet-drag-zone').boundingBox();
    await swipe(190,grip.y+16,190,grip.y+36);assert.equal(await page.locator('.period-overlay').count(),1);
    grip=await page.locator('.sheet-drag-zone').boundingBox();
    await swipe(190,grip.y+16,190,grip.y+156,true);assert.equal(await page.locator('.period-overlay').count(),1);
    grip=await page.locator('.sheet-drag-zone').boundingBox();
    await swipe(190,grip.y+16,190,grip.y+156);await page.locator('.period-overlay').waitFor({state:'hidden'});
    assert.equal(await page.locator('.day.active').getAttribute('data-val'),originalDay,'拖拽关闭不保存未确认日期');
    await click('home-picker-open');
    await page.locator('.period-sheet').evaluate(async el=>{await Promise.all(el.getAnimations().map(a=>a.finished.catch(()=>{})));});
    const closing=await page.evaluate(async()=>{
      const overlay=document.querySelector('.period-overlay'),sheet=overlay.querySelector('.period-sheet'),frames=[];
      overlay.click();
      const until=performance.now()+500;
      while(sheet.isConnected&&performance.now()<until){await new Promise(requestAnimationFrame);if(sheet.isConnected)frames.push(sheet.getBoundingClientRect().top);}
      return {frames,closed:!overlay.isConnected};
    });
    assert(closing.closed&&closing.frames[closing.frames.length-1]-closing.frames[0]>200,'点击遮罩时面板向下收回');
    await swipe(300,400,100,400);await swipe(300,400,100,400);
    await swipe(300,310,100,310);assert.equal(await selected(),'library');
    await click('tab','home');
    const shots=process.env.DIARY_SCREENSHOTS || path.join(os.tmpdir(),'mai-diary-shots');
    fs.mkdirSync(shots,{recursive:true});
    await page.screenshot({path:path.join(shots,'home.png')});
    await click('new-meal');await click('save-meal');
    assert.match(await page.locator('#error').innerText(),/金额/);
    await pauseDate('2026-11-10','meal-date');await click('type','午餐');
    await click('pick');await page.getByRole('searchbox').fill('巨无霸');
    await click('plus');await click('plus');await click('picked');
    await page.locator('#amount').fill('37.90');await click('save-meal');
    let meals=await read();assert.equal(meals.length,1);assert.equal(meals[0].amountCents,3790);assert.equal(meals[0].items[0].quantity,2);assert.equal(meals[0].type,'午餐');
    await page.reload();await pauseDate('2026-11-10','day');
    await click('meal');await click('edit-meal');await click('pick');await click('kind','custom');await click('new-product');
    await page.locator('#p-name').fill('试吃新品');await page.locator('#p-cat').selectOption('小食');await page.locator('#custom-form button[type=submit]').click();
    await click('save-meal');meals=await read();
    assert.equal(meals[0].items.length,2);assert.equal(meals[0].unknownQuantity,1);assert.equal(meals[0].knownKcal,1026);
    await click('month-stats');await click('stats-period','week');
    assert.match(await page.locator('main').innerText(),/37\.90/);assert.match(await page.locator('main').innerText(),/1 份待补热量/);
    assert.equal(await btn('stats-metric').count(),0);
    await click('stats-category','汉堡');
    assert.match(await page.locator('.food-ranking').innerText(),/2 份/);
    assert.doesNotMatch(await page.locator('.food-ranking').innerText(),/试吃新品|吃过/);
    await click('stats-category','鸡肉小食');
    assert.match(await page.locator('.food-ranking').innerText(),/本期该分类还没有用餐记录/);
    await click('stats-category','全部');
    assert.equal(await page.getByRole('heading',{name:'用餐明细',exact:true}).count(),0);
    await click('tab','home');await page.locator('.meal-history [data-act="meal"]').first().click();
    await click('back');
    assert(await page.locator('#screen').evaluate(el=>el.scrollTop)>0,'从明细返回保持列表位置');
    await page.locator('.meal-history [data-act="meal"]').first().click();
    await click('edit-meal');await page.locator('[data-kcal]').last().fill('110');await click('save-meal');assert.equal((await read())[0].knownKcal,1136);
    await click('month-stats');
    await click('stats-picker-open');
    assert.equal(await btn('stats-pick-value').count(),12);
    await calendarSwipe(1);assert.equal(await monthHeading(),'2027年');
    await calendarSwipe(-1);assert.equal(await monthHeading(),'2026年');
    assert.equal(await page.locator('.period-overlay input[type=date]').count(),0);
    await page.screenshot({path:path.join(shots,'month-picker.png'),animations:'disabled'});
    await click('stats-pick-value','2026-11-01');await click('stats-picker-apply');
    await click('stats-period','week');await click('stats-picker-open');
    assert.equal(await page.locator('.calendar-week.selected .calendar-day').count(),7);
    await click('stats-pick-week','2026-11-09');
    await page.screenshot({path:path.join(shots,'week-picker.png'),animations:'disabled'});
    await swipe(300,300,100,300);assert.equal(await selected(),'stats');
    await click('stats-picker-apply');
    await click('stats-period','custom');
    await click('stats-picker-move','-1');await click('stats-pick-day','2026-10-28');
    assert(await btn('stats-picker-apply').isDisabled());
    await click('stats-picker-move','1');await click('stats-pick-day','2026-11-12');
    await page.screenshot({path:path.join(shots,'range-picker.png'),animations:'disabled'});
    await click('stats-picker-apply');
    assert.match(await page.locator('.stats-total').innerText(),/37\.90/);
    await page.locator('[data-field="stats-point"]').fill('13');
    assert.equal(await page.locator('[data-trend-date]').innerText(),'2026-11-10');
    assert.equal(await page.locator('[data-trend-amount]').innerText(),'¥37.90');
    await page.screenshot({path:path.join(shots,'stats.png'),animations:'disabled'});
    await click('stats-picker-open');await click('stats-pick-day','2026-10-30');
    await page.keyboard.press('Escape');
    await page.locator('.period-overlay').waitFor({state:'hidden'});
    assert.equal(await page.locator('.period-overlay').count(),0);
    assert.match(await page.locator('.stats-total').innerText(),/37\.90/);
    for(const width of [320,390,768]){
      await page.setViewportSize({width,height:800});await click('stats-picker-open');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'calendar overflow at '+width);
      await click('stats-picker-close');
    }
    await page.setViewportSize({width:390,height:844});
    await click('stats-period','year');await click('stats-picker-open');
    assert.equal(await btn('stats-pick-value').count(),12);
    const yearGroup=await monthHeading();await calendarSwipe(1);
    assert.notEqual(await monthHeading(),yearGroup);await calendarSwipe(-1);assert.equal(await monthHeading(),yearGroup);
    await click('stats-picker-close');
    await click('tab','library');await page.getByRole('searchbox').fill('试吃');await click('product');assert.match(await page.locator('main').innerText(),/1 餐 · 1 份/);
    await page.locator('#personal-kcal').fill('195');
    await page.locator('#product-nutrition button').click();
    assert.match(await page.locator('main').innerText(),/195 大卡/);
    assert.equal((await read())[0].knownKcal,1136);
    await click('delete-product');assert.match(await page.getByRole('alertdialog').innerText(),/试吃新品/);
    await click('cancel');await page.getByRole('alertdialog').waitFor({state:'hidden'});
    assert.equal(await btn('delete-product').count(),1);
    await click('delete-product');await click('confirm');await page.getByRole('heading',{name:'商品库',exact:true}).waitFor();
    assert.equal(await btn('product').count(),0);
    assert.equal((await read())[0].knownKcal,1136);
    await click('tab','home');await click('meal');await click('delete-meal');await click('cancel');assert.equal((await read()).length,1);
    await click('delete-meal');await click('confirm');
    await page.waitForFunction(()=>Ledger.open(BUILTIN_MENU).meals().length===0);
    await click('new-meal');await click('type','晚餐');await page.keyboard.press('Escape');await click('confirm');await page.getByRole('heading',{name:'麦记手账'}).waitFor();
    await click('tab','library');await click('category','鸡肉小食');
    await page.getByRole('searchbox').fill('麦麦脆汁鸡');
    assert.equal(await page.locator('#product-results .list-row').count(),2);
    await click('product','cn-mccrispy-bone-in-tenderloin');
    assert.match(await page.locator('main').innerText(),/品类估算/);
    await click('back');
    await page.evaluate(()=>{
      const older=[{id:'old-campaign',name:'旧活动鸡腿堡',category:'汉堡',kcal:null,publishedDate:'2026-10-01'}];
      window.onMenuSyncResult({ok:true,items:older});
      window.onMenuSyncResult({ok:true,items:[{id:'sea-land',name:'海陆双全堡',category:'汉堡',kcal:null,
        publishedDate:'2026-11-02',sourceUrl:'https://www.mcdonalds.com.cn/news/20261102-value/'}]});
    });
    assert.match(await page.locator('main').innerText(),/最近同步 · 1 款/);
    assert.equal(await page.locator('.download-history[open]').count(),0);
    await page.screenshot({path:path.join(shots,'downloaded.png'),animations:'disabled'});
    await click('product','sea-land');
    assert.match(await page.locator('main').innerText(),/品类估算/);
    assert.match(await page.locator('main').innerText(),/2026年11月2日/);
    await click('new-with-product');await page.locator('#amount').fill('26.90');
    await click('save-meal');
    meals=await read();
    assert.equal(meals[0].estimatedQuantity,1);assert.equal(meals[0].items[0].kcalSource,'estimated');
    await click('month-stats');assert.match(await page.locator('main').innerText(),/1 份为估算/);
    await click('stats-period','week');await click('stats-period','year');
    await click('tab','home');await click('meal');await click('edit-meal');
    await page.locator('#amount').fill('22.90');await click('save-meal');
    assert.equal((await read())[0].items[0].kcalSource,'estimated');
    await click('meal');await click('edit-meal');await page.locator('[data-kcal]').fill('555');
    await click('save-meal');
    assert.equal((await read())[0].items[0].kcalSource,'personal');
    await page.emulateMedia({reducedMotion:'reduce'});
    await click('tab','stats');assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
    await swipe(300,400,100,400);assert.equal(await selected(),'library');
    assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
    await click('tab','home');
    await click('home-picker-open');assert.equal(await page.evaluate(()=>document.getAnimations().length),0);
    await click('stats-picker-close');assert.equal(await page.locator('.period-overlay').count(),0);
    for(const width of [320,390,768]){await page.setViewportSize({width,height:800});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'layout overflow at '+width);}
    assert.deepEqual(errors,[]);
    const preview=await browser.newPage({viewport:{width:390,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true,locale:'zh-CN'});
    await preview.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'networkidle'});
    await preview.evaluate(()=>{
      const db=Ledger.open(BUILTIN_MENU),product=db.products()[0];
      [1250,1900,1800,2500,0,0,3000,2100,2790,1400,1600,2300].forEach((amount,i)=>{
        if(amount)db.saveMeal({date:'2026-11-'+String(i+1).padStart(2,'0'),type:'午餐',amountCents:amount,items:[{productId:product.id,quantity:1}]});
      });
    });
    await preview.reload();await preview.locator('[data-act="tab"][data-val="stats"]').click();
    await preview.locator('[data-act="stats-period"][data-val="custom"]').click();
    for(const width of [320,390,768]){
      await preview.setViewportSize({width,height:844});
      for(const pair of [['2026-10-30','2026-11-14'],['2026-11-10','2026-11-12'],['2026-11-02','2026-11-08'],['2026-11-01','2026-11-23'],['2026-11-14','2026-11-14']]){
        for(const date of pair)await preview.locator('[data-act="stats-pick-day"][data-val="'+date+'"]').click();
        const result=await preview.evaluate(()=>{
          const endpoints=Array.from(document.querySelectorAll('.range-day.endpoint'));
          return endpoints.map(el=>{
            const circle=getComputedStyle(el,'::after'),strip=getComputedStyle(el,'::before'),cell=el.getBoundingClientRect();
            return {circleWidth:parseFloat(circle.width),circleHeight:parseFloat(circle.height),radius:circle.borderRadius,
              strip:strip.content,color:strip.backgroundColor,width:parseFloat(strip.width),cellWidth:cell.width,
              start:el.classList.contains('range-start'),end:el.classList.contains('range-end'),first:el===el.parentElement.firstElementChild,last:el===el.parentElement.lastElementChild,left:strip.left,right:strip.right};
          });
        });
        for(const r of result){
          assert(Math.abs(r.circleWidth-r.circleHeight)<.2&&r.radius==='50%','范围端点保持正圆');
          if(pair[0]!==pair[1]&&!(r.start&&r.last)&&!(r.end&&r.first)){
            assert.equal(r.color,'rgb(255, 199, 44)','范围黄色与其他日历一致');
            assert(Math.abs(r.width-r.cellWidth/2)<.2,'黄色底条延伸到端点中心');
            assert.equal(r.start?r.right:r.left,'0px','底条与相邻日期无缝连接');
          }else assert.equal(r.strip,'none','单日或外侧边缘不绘制黄色底条');
        }
      }
    }
    await preview.setViewportSize({width:390,height:844});
    await preview.locator('[data-act="stats-pick-day"][data-val="2026-10-30"]').click();
    await preview.locator('[data-act="stats-pick-day"][data-val="2026-11-14"]').click();
    await preview.screenshot({path:path.join(shots,'connected-range.png'),animations:'disabled'});
    await preview.locator('[data-act="stats-pick-day"][data-val="2026-11-01"]').click();
    await preview.locator('[data-act="stats-pick-day"][data-val="2026-11-23"]').click();
    await preview.screenshot({path:path.join(shots,'range-no-leak.png'),animations:'disabled'});
    await preview.locator('[data-act="stats-pick-day"][data-val="2026-11-01"]').click();
    await preview.locator('[data-act="stats-pick-day"][data-val="2026-11-12"]').click();
    await preview.locator('[data-act="stats-picker-apply"]').click();await preview.locator('.period-overlay').waitFor({state:'hidden'});
    await preview.locator('[data-field="stats-point"]').fill('8');
    await preview.screenshot({path:path.join(shots,'trend-preview.png'),animations:'disabled'});
    await preview.locator('[data-act="stats-category"][data-val="汉堡"]').click();
    await preview.locator('.food-ranking').scrollIntoViewIfNeeded();
    await preview.screenshot({path:path.join(shots,'ranking-categories.png'),animations:'disabled'});
    const rankCategories=await preview.locator('[data-act="stats-category"]').evaluateAll(els=>els.map(el=>el.dataset.val));
    await preview.locator('[data-act="tab"][data-val="library"]').click();
    const pickerCategories=await preview.locator('[data-act="category"]').evaluateAll(els=>els.map(el=>el.dataset.val));
    assert.deepEqual(rankCategories,pickerCategories);
    await preview.locator('[data-act="tab"][data-val="home"]').click();
    await preview.locator('.meal-history').scrollIntoViewIfNeeded();
    assert.equal(await preview.locator('.history-day').count(),10);
    const dates=await preview.locator('.history-day').evaluateAll(els=>els.map(el=>el.dataset.historyDate));
    assert.equal(dates[0],'2026-11-12');assert.equal(dates[dates.length-1],'2026-11-01');
    await preview.screenshot({path:path.join(shots,'home-history.png'),animations:'disabled'});
    await preview.locator('[data-act="home-picker-open"]').click();
    await preview.locator('[data-act="stats-picker-move"][data-val="-1"]').click();
    await preview.locator('[data-act="stats-pick-day"][data-val="2026-10-01"]').click();
    await preview.screenshot({path:path.join(shots,'home-date-sheet.png'),animations:'disabled'});
    await preview.locator('[data-act="stats-pick-day"][data-val="2026-10-04"]').click();
    await preview.screenshot({path:path.join(shots,'calendar-edge-circle.png'),animations:'disabled'});
    await preview.locator('[data-act="stats-pick-day"][data-val="2026-10-01"]').click();
    await preview.locator('[data-act="stats-picker-apply"]').click();await preview.locator('.period-overlay').waitFor({state:'hidden'});
    assert.equal(await preview.locator('.history-day').count(),0);
    assert.match(await preview.locator('.meal-history').innerText(),/这个月还没有用餐记录/);
    await preview.close();
    console.log('移动端界面检查通过：记餐、编辑、归档、脆汁鸡、估算来源、统计、删除、减少动态效果、日期范围、曲线及三个屏宽。截图目录 '+shots);
  } finally{await browser.close();}
}
run().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>server.close());
