(function (root) {
  'use strict';

  const STORAGE_KEY = 'mai-diary.ledger.v1';
  const MEAL_TYPES = ['早餐', '午餐', '晚餐'];
  const DAY_MS = 86400000;

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function label(value, maxLength, field) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > maxLength) {
      throw new Error('请填写有效的' + field + '（最多 ' + maxLength + ' 字）。');
    }
    return value.trim();
  }

  function nutrition(value) {
    if (value === undefined || value === null || value === '') return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 100000) {
      throw new Error('每份热量须为 0 至 100000 之间的数字，也可以留空。');
    }
    return Math.round(value * 100) / 100;
  }

  function normalizeProduct(input, kind) {
    const url = typeof input.sourceUrl === 'string' ? input.sourceUrl.trim() : '';
    const publishedDate = /^\d{4}-\d{2}-\d{2}$/.test(input.publishedDate) ? input.publishedDate : '';
    return {
      id: label(input.id, 240, '商品标识'),
      name: label(input.name, 120, '商品名称'),
      category: label(input.category || '其他', 40, '商品分类'),
      kcal: nutrition(input.kcal),
      kind: kind,
      estimateWhenMissing: kind === 'builtin' && input.estimateWhenMissing === true,
      publishedDate: publishedDate,
      sourceUrl: /^https:\/\//i.test(url) ? url : ''
    };
  }

  // Default portion when the campaign names the food without stating a size or piece count.
  // Numerical fallbacks are coarse estimates used when the local reference group is empty.
  const categoryDefaults = {
    '汉堡': 440, '鸡肉小食': 220, '小食': 150, '饮品': 150, '甜品': 230, '早餐': 310, '薯条': 290
  };
  const families = [
    ['饮品', '雪冰', /雪冰|冰沙/, 1, 320],
    ['饮品', '奶咖', /奶铁|拿铁|卡布奇诺|玛奇朵/, 1, 165],
    ['饮品', '美式', /美式/, 1, 15],
    ['饮品', '气泡饮料', /汽水|气泡|可乐|雪碧/, 1, 125],
    ['甜品', '麦旋风', /麦旋风|麦炫风/, 1, 280],
    ['甜品', '新地', /新地/, 1, 260],
    ['甜品', '圆筒', /圆筒|甜筒/, 1, 95],
    ['甜品', '派', /派/, 1, 225],
    ['鸡肉小食', '鸡翅', /鸡翅|[vV]翅/, 2, 210],
    ['鸡肉小食', '鸡块', /鸡块|麦乐鸡|鸡球/, 5, 215],
    ['鸡肉小食', '炸鸡块（带骨）', /脆汁鸡|炸鸡|琵琶腿/, 1, 300],
    ['鸡肉小食', '鸡排', /鸡排/, 1, 385],
    ['早餐', '麦满分', /麦满分/, 1, 350],
    ['早餐', '粥', /粥/, 1, 125]
  ];

  function serving(name) {
    const text = name.normalize('NFKC');
    const sizeMatch = /\((迷你|[小中大])(?:杯|份)?\)|(?:^|[^大中小])([小中大])(?:杯|份)|^(迷你)/.exec(text);
    const countMatch = /([1-9]\d?)(?:块|个|只|支|片)/.exec(text);
    return {size: sizeMatch && (sizeMatch[1] || sizeMatch[2] || sizeMatch[3]),
      count: countMatch ? Number(countMatch[1]) : 0};
  }

  function median(values) {
    values.sort(function (a, b) { return a - b; });
    const mid = Math.floor(values.length / 2);
    return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;
  }

  function estimateProduct(record, references) {
    const family = families.find(function (row) { return row[0] === record.category && row[2].test(record.name); });
    const category = record.category;
    const groupName = family ? family[1] : category;
    const standardCount = family ? family[3] : 1;
    const portion = serving(record.name);
    const count = portion.count || standardCount;
    let samples = references.filter(function (item) {
      return item.category === category && (!family || family[2].test(item.name));
    });
    const sizes = samples.some(function (item) { return item.portion.size; });
    let size = '';
    if (sizes) {
      const preferred = [portion.size || '中', '中', null, '小', '大', '迷你'];
      size = preferred.find(function (choice) { return samples.some(function (item) { return item.portion.size === choice; }); });
      samples = samples.filter(function (item) { return item.portion.size === size; });
    }
    const portionLabel = (size ? size + '份' : '常规份') + (count > 1 || portion.count ? '，按 ' + count + ' 件' : '');
    if (!samples.length) {
      const standard = family ? family[4] : (categoryDefaults[category] || 250);
      return {kcal: Math.round(standard / standardCount * count),
        basis: '按' + groupName + '的品类参考值估算（' + portionLabel + '）。'};
    }
    const value = median(samples.map(function (item) {
      return family || portion.count ? item.kcal / (item.portion.count || 1) : item.kcal;
    })) * count;
    return {kcal: Math.round(value), basis: '参考本地' + groupName + '商品的热量中位数（' + portionLabel + '）。'};
  }

  function catalogName(name) {
    const plain = name.replace(/[®™℠\s]/g, '').normalize('NFKC').toLowerCase();
    // Only strip portions. Flavours, fillings and product-line names distinguish new releases.
    return plain.replace(/\((?:迷你|[小中大](?:份|杯|包|盒)?|\d+(?:块|个|只|片|杯|包|支|盒|份|毫升|ml)|盒装)\)$/i, '')
      .replace(/^(?:[小中大](?:份|杯))/, '').replace(/(?:[小中大](?:份|杯)|\d+(?:块装|块|片装|片))$/, '');
  }

  function today(instant) {
    const local = instant || new Date();
    return [String(local.getFullYear()).padStart(4, '0'),
      String(local.getMonth() + 1).padStart(2, '0'), String(local.getDate()).padStart(2, '0')].join('-');
  }

  // Calendar arithmetic uses UTC day numbers so DST and local clock changes cannot skip a date.
  function dateValue(text) {
    if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      throw new Error('请选择有效日期。');
    }
    const date = new Date(text + 'T00:00:00.000Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== text) {
      throw new Error('请选择有效日期。');
    }
    return date;
  }

  function periodBounds(period, anchor) {
    const start = dateValue(anchor);
    const end = new Date(start);
    switch (period) {
      case 'week':
        start.setUTCDate(start.getUTCDate() - (start.getUTCDay() + 6) % 7);
        end.setTime(start.getTime() + 6 * DAY_MS);
        break;
      case 'month':
        start.setUTCDate(1);
        end.setUTCMonth(start.getUTCMonth() + 1, 0);
        break;
      case 'year':
        start.setUTCMonth(0, 1);
        end.setUTCMonth(11, 31);
        break;
      default:
        throw new Error('请选择周、月或年统计。');
    }
    // The accepted input range is four-digit years.
    const first = start.getUTCFullYear() < 0 ? '0000-01-01' : start.toISOString().slice(0, 10);
    const last = end.getUTCFullYear() > 9999 ? '9999-12-31' : end.toISOString().slice(0, 10);
    return {start: first, end: last};
  }

  function makeId(prefix) {
    if (root.crypto && typeof root.crypto.getRandomValues === 'function') {
      const values = root.crypto.getRandomValues(new Uint32Array(4));
      return prefix + Array.from(values, function (n) { return n.toString(36); }).join('-');
    }
    return prefix + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  }

  function platformStorage() {
    if (root.AndroidStore) {
      return {
        read: function () { return root.AndroidStore.read(); },
        write: function (json) { return root.AndroidStore.write(json); }
      };
    }
    return {
      read: function () { return root.localStorage.getItem(STORAGE_KEY); },
      write: function (json) { root.localStorage.setItem(STORAGE_KEY, json); return true; }
    };
  }

  function readState(storage) {
    let raw;
    try {
      raw = storage.read();
    } catch (error) {
      throw new Error('无法读取本地账本，请检查应用存储权限或浏览器设置。');
    }
    if (raw === '' || raw === null) {
      return {version: 1, products: [], meals: [], lastSync: null};
    }
    try {
      const state = JSON.parse(raw);
      if (state.version !== 1 || !Array.isArray(state.products) || !Array.isArray(state.meals)) {
        throw new Error();
      }
      return state;
    } catch (error) {
      throw new Error('无法识别本地账本格式，已保留原始数据。');
    }
  }

  function sortedMeals(meals) {
    return meals.slice().sort(function (a, b) {
      return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
    });
  }

  function measure(items) {
    let kcalHundredths = 0;
    let estimateHundredths = 0;
    let estimatedQuantity = 0;
    let unknownQuantity = 0;
    items.forEach(function (item) {
      if (item.kcal === null) {
        unknownQuantity += item.quantity;
      } else {
        const kcal = Math.round(item.kcal * 100) * item.quantity;
        kcalHundredths += kcal;
        if (item.kcalSource === 'estimated') {
          estimateHundredths += kcal;
          estimatedQuantity += item.quantity;
        }
      }
    });
    return {knownKcal: kcalHundredths / 100, unknownQuantity: unknownQuantity,
      estimatedQuantity: estimatedQuantity, estimatedKcal: estimateHundredths / 100};
  }

  function mealWithTotals(meal) {
    const items = meal.items.map(function (item) {
      if (item.kcalSource) return item;
      // Earlier releases stored the number but did not distinguish manual entries from official data.
      return Object.assign({}, item, {kcalSource: item.kcal === null ? 'unknown' : 'recorded'});
    });
    return Object.assign({}, meal, {items: items}, measure(items));
  }

  function summarize(meals, period, anchor, end) {
    let bounds;
    if(period==='custom') {
      dateValue(anchor);
      dateValue(end);
      if(anchor>end)throw new Error('结束日期须不早于开始日期。');
      bounds={start:anchor,end:end};
    } else bounds = periodBounds(period, anchor);
    const included = sortedMeals(meals.filter(function (meal) {
      return bounds.start <= meal.date && meal.date <= bounds.end;
    })).map(mealWithTotals);
    const result = Object.assign(bounds, {mealCount: included.length, amountCents: 0,
      knownKcal: 0, unknownQuantity: 0, estimatedQuantity: 0, estimatedKcal: 0,
      quantity: 0, ranking: [], meals: included});
    const byProduct = new Map();
    let kcalHundredths = 0;
    let estimateHundredths = 0;
    included.forEach(function (meal) {
      result.amountCents += meal.amountCents;
      kcalHundredths += Math.round(meal.knownKcal * 100);
      result.unknownQuantity += meal.unknownQuantity;
      result.estimatedQuantity += meal.estimatedQuantity;
      estimateHundredths += Math.round(meal.estimatedKcal * 100);
      const seen = new Set();
      meal.items.forEach(function (item) {
        if (!byProduct.has(item.productId)) {
          byProduct.set(item.productId, {productId: item.productId, name: item.name, category: item.category || '其他', mealCount: 0, quantity: 0});
        }
        const row = byProduct.get(item.productId);
        if (!seen.has(item.productId)) row.mealCount++;
        seen.add(item.productId);
        row.quantity += item.quantity;
        result.quantity += item.quantity;
      });
    });
    result.knownKcal = kcalHundredths / 100;
    result.estimatedKcal = estimateHundredths / 100;
    result.ranking = Array.from(byProduct.values()).sort(function (a, b) {
      return b.mealCount - a.mealCount || b.quantity - a.quantity || a.name.localeCompare(b.name);
    });
    return result;
  }

  function buildItems(inputs, products, original) {
    if (!Array.isArray(inputs) || !inputs.length) throw new Error('请至少选择一种食品。');
    const previous = original ? original.items.slice() : [];
    return inputs.map(function (input) {
      if (!input || !Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 9999) {
        throw new Error('每项食品数量须为 1 至 9999 的整数。');
      }
      const product = products.get(input.productId);
      const priorIndex = previous.findIndex(function (item) { return item.productId === input.productId; });
      const old = priorIndex >= 0 ? previous.splice(priorIndex, 1)[0] : null;
      const snapshot = old || product;
      if (!snapshot) throw new Error('所选食品不存在，请重新选择。');
      const kcal = input.kcal !== undefined ? nutrition(input.kcal) : snapshot.kcal;
      let kcalSource = 'unknown';
      if (kcal !== null) {
        const source = snapshot.kcalSource || 'recorded';
        kcalSource = (input.kcalSource === 'personal' || kcal !== snapshot.kcal) ? 'personal' : source;
        // A download may complete while a new meal is open. Keep the provenance of the selection.
        if (!old && input.kcal !== undefined && ['estimated', 'official', 'personal'].includes(input.kcalSource)) {
          kcalSource = input.kcalSource;
        }
      }
      return {productId: input.productId, quantity: input.quantity, name: snapshot.name,
        category: snapshot.category, kcal: kcal, kcalSource: kcalSource};
    });
  }

  function open(builtins, storageOverride) {
    const seeds = (builtins || []).map(function (item) { return normalizeProduct(item, 'builtin'); });
    const builtInNames = new Set(seeds.map(function (item) { return catalogName(item.name); }));
    const references = seeds.filter(function (item) { return typeof item.kcal === 'number'; })
      .map(function (item) { return Object.assign({}, item, {portion: serving(item.name)}); });
    const estimates = new Map();
    const storage = storageOverride || platformStorage();
    let state = readState(storage);

    function productView(record, builtinOverrides) {
      const custom = record.kind === 'custom';
      const builtin = record.kind === 'builtin';
      let personal = custom ? record.kcal : record.overrideKcal;
      if (builtin && builtinOverrides) personal = builtinOverrides[record.id];
      const userKcal = typeof personal === 'number';
      const officialKcal = custom ? null : record.kcal;
      const eligible = record.kind === 'limited' || record.estimateWhenMissing;
      let estimate = null;
      if (eligible && officialKcal == null) {
        const key = JSON.stringify([record.category, record.name]);
        if (!estimates.has(key)) estimates.set(key, estimateProduct(record, references));
        estimate = estimates.get(key);
      }
      let kcal = officialKcal;
      let kcalSource = kcal == null ? 'unknown' : 'official';
      if (userKcal) { kcal = personal; kcalSource = 'personal'; }
      else if (estimate) { kcal = estimate.kcal; kcalSource = 'estimated'; }
      return {id: record.id, name: record.name, category: record.category, kind: record.kind,
        kcal: kcal, kcalSource: kcalSource, userKcal: userKcal, officialKcal: officialKcal,
        canSetKcal: !builtin || !!record.estimateWhenMissing || userKcal,
        estimateBasis: estimate ? estimate.basis : '', publishedDate: record.publishedDate || '',
        currentSync: record.currentSync === true, sourceUrl: record.sourceUrl};
    }

    function catalog(current) {
      const products = new Map();
      seeds.concat(current.products).forEach(function (item) { products.set(item.id, productView(item, current.builtinKcal)); });
      return products;
    }

    function change(edit) {
      // Apply to the latest persisted snapshot. A failed write leaves both views untouched.
      const next = readState(storage);
      const result = edit(next);
      try {
        if (storage.write(JSON.stringify(next)) !== true) throw new Error();
      } catch (error) {
        throw new Error('本地保存失败，请检查剩余存储空间后重试。');
      }
      state = next;
      return result;
    }

    return {
      products: function () {
        const all = Array.from(catalog(state).values());
        const limited = all.filter(function (p) { return p.kind === 'limited'; }).sort(function (a, b) {
          return Number(b.currentSync) - Number(a.currentSync) || b.publishedDate.localeCompare(a.publishedDate);
        });
        return clone(all.filter(function (p) { return p.kind !== 'limited'; }).concat(limited));
      },
      meals: function () { return clone(sortedMeals(state.meals).map(mealWithTotals)); },
      lastSync: function () { return state.lastSync; },
      summary: function (period, anchor, end) { return clone(summarize(state.meals, period, anchor || today(),end)); },

      addProduct: function (input) {
        const product = normalizeProduct(Object.assign({}, input, {id: makeId('custom-')}), 'custom');
        return change(function (next) {
          next.products.push(product);
          return productView(product);
        });
      },

      deleteCustomProduct: function (id) {
        return change(function (next) {
          const index = next.products.findIndex(item => item.id === id && item.kind === 'custom');
          if (index < 0) throw new Error('找不到可删除的自定义商品。');
          next.products.splice(index, 1);
        });
      },

      setProductKcal: function (id, value) {
        if (value !== null && typeof value !== 'number') throw new Error('请填写有效的每份热量。');
        const kcal = nutrition(value);
        return change(function (next) {
          const builtin = seeds.find(function (item) { return item.id === id; });
          if (builtin && productView(builtin, next.builtinKcal).canSetKcal) {
            if (!next.builtinKcal) next.builtinKcal = {};
            if (kcal === null) delete next.builtinKcal[id];
            else next.builtinKcal[id] = kcal;
            return productView(builtin, next.builtinKcal);
          }
          const record = next.products.find(function (item) { return item.id === id; });
          if (!record || (record.kind !== 'custom' && record.kind !== 'limited')) {
            throw new Error('请选择自定义或已下载的限时商品。');
          }
          if (record.kind === 'custom') record.kcal = kcal;
          else record.overrideKcal = kcal;
          return productView(record);
        });
      },

      mergeLimited: function (items, options) {
        if (!Array.isArray(items)) throw new Error('限时商品数据格式无效。');
        const feed = new Map();
        items.forEach(function (item) {
          const product = normalizeProduct(item, 'limited');
          if (!builtInNames.has(catalogName(product.name))) feed.set(product.id, product);
        });
        return change(function (next) {
          const products = catalog(next);
          const saved = new Map(next.products.map(function (item) { return [item.id, item]; }));
          if (!(options && options.partial)) {
            saved.forEach(function (item) { if (item.kind === 'limited') item.currentSync = false; });
          }
          feed.forEach(function (product, id) {
            const existing = products.get(id);
            if (existing && existing.kind !== 'limited') throw new Error('限时商品编号与本地菜单冲突。');
            if (existing) {
              if (product.kcal === null) product.kcal = existing.officialKcal;
              if (existing.userKcal) product.overrideKcal = existing.kcal;
              if (existing.publishedDate > product.publishedDate) {
                product.publishedDate = existing.publishedDate;
                product.sourceUrl = existing.sourceUrl;
              }
            }
            product.currentSync = true;
            saved.set(id, product);
          });
          next.products = Array.from(saved.values());
          next.lastSync = new Date().toISOString();
          return feed.size;
        });
      },

      saveMeal: function (input) {
        if (!input || !MEAL_TYPES.includes(input.type)) throw new Error('请选择早餐、午餐或晚餐。');
        dateValue(input.date);
        if (!Number.isSafeInteger(input.amountCents) || input.amountCents < 0 || input.amountCents > 999999999) {
          throw new Error('请填写有效的实付金额，范围为 0 至 9999999.99 元。');
        }
        return change(function (next) {
          const index = input.id ? next.meals.findIndex(function (meal) { return meal.id === input.id; }) : -1;
          if (input.id && index < 0) throw new Error('该餐次已经不存在，请刷新记录。');
          const original = next.meals[index];
          const meal = {
            id: original ? original.id : makeId('meal-'),
            createdAt: original ? original.createdAt : Date.now(),
            date: input.date,
            type: input.type,
            amountCents: input.amountCents,
            items: buildItems(input.items, catalog(next), original)
          };
          if (original) next.meals[index] = meal;
          else next.meals.unshift(meal);
          return clone(mealWithTotals(meal));
        });
      },

      deleteMeal: function (id) {
        return change(function (next) {
          const index = next.meals.findIndex(function (meal) { return meal.id === id; });
          if (index < 0) throw new Error('该餐次已经不存在，请刷新记录。');
          next.meals.splice(index, 1);
          return true;
        });
      }
    };
  }

  const ledger = {open: open, today: today};
  if (typeof module !== 'undefined' && module.exports) module.exports = ledger;
  else root.Ledger = ledger;
})(typeof window !== 'undefined' ? window : globalThis);
