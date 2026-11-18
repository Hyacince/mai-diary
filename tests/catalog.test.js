'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = {window: {}};
const catalogPath = path.resolve(__dirname, '../app/src/main/assets/www/catalog.js');
vm.runInNewContext(fs.readFileSync(catalogPath, 'utf8'), context);
const menu = context.window.BUILTIN_MENU;

test('鸡肉小食能找到两种麦麦脆汁鸡，各按一块计', () => {
    const chicken = menu.filter(product =>
        product.category === '鸡肉小食' && product.name.includes('麦麦脆汁鸡'));
    assert.equal(chicken.length, 2);
    const leg = chicken.find(product => product.name.includes('琵琶腿'));
    const tenderloin = chicken.find(product => product.name.includes('带骨里脊'));
    assert.ok(leg && tenderloin);
    assert.notEqual(leg.id, tenderloin.id);
    assert.match(leg.name, /1块/);
    assert.match(tenderloin.name, /1块/);
    assert.equal(leg.kcal, 326);
    assert.equal(leg.sourceUrl, 'https://www.mcdonalds.com.cn/know_your_icon/Bone-in-chicken');
    assert.equal(tenderloin.kcal, null);
    assert.equal(tenderloin.estimateWhenMissing, true);
});

test('各规格编号唯一，已知热量为非负数，来源可追溯', () => {
    assert.equal(new Set(menu.map(product => product.id)).size, menu.length);
    for (const product of menu) {
        assert.equal(new URL(product.sourceUrl).origin, 'https://www.mcdonalds.com.cn');
        if (product.kcal === null) {
            assert.equal(product.estimateWhenMissing, true, product.name);
        } else {
            assert.ok(Number.isFinite(product.kcal) && product.kcal >= 0, product.name);
        }
    }
});
