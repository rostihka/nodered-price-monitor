// Юніт-тести логіки function-нод без Node-RED: node test_functions.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

function makeRunner(file, envVars = {}) {
    const src = fs.readFileSync(path.join(__dirname, 'functions', file + '.js'), 'utf8');
    const store = {};
    const mk = () => ({
        get: (k) => store[k],
        set: (k, v) => { store[k] = v; }
    });
    const warns = [];
    const ctx = {
        global: mk(), flow: mk(),
        env: { get: k => envVars[k] },
        node: { warn: m => warns.push(m), status: () => {} },
        Date, Math, String, Number, parseInt, parseFloat, isFinite, JSON, RegExp, Array, Object
    };
    // використовуємо спільне сховище для global/flow, щоб імітувати файлове сховище
    ctx.global.get = (k) => store['g:' + k];
    ctx.global.set = (k, v) => { store['g:' + k] = v; };
    ctx.flow.get = (k) => store['f:' + k];
    ctx.flow.set = (k, v) => { store['f:' + k] = v; };
    const script = new vm.Script('(function(msg){' + src + '\n})');
    const run = (msg) => script.runInNewContext(ctx)(msg);
    return { run, store, warns };
}

let passed = 0;
const t = (name, fn) => { fn(); passed++; console.log('ok  - ' + name); };

// ---------- parse_compare ----------
const comfyHtml = (p) => `<html><head><meta property="og:type" content="product" />
<meta property="product:price:amount" content="${p}" /><meta property="product:price:currency" content="UAH" /></head></html>`;

t('comfy: ціна з мета-тегу, перша перевірка тихо', () => {
    const r = makeRunner('parse_compare');
    const item = { id: 'c1', name: 'Phone', url: 'https://x/y', type: 'comfy_product', currency: '₴' };
    const out = r.run({ item, statusCode: 200, payload: comfyHtml(17999) });
    assert.strictEqual(out, null);
    assert.strictEqual(r.store['g:prices'].c1.last_price, 17999);
});

t('падіння 5% → "Ціна зменшилась"', () => {
    const r = makeRunner('parse_compare');
    const item = { id: 'c1', name: 'Phone', url: 'https://x/y', type: 'comfy_product', currency: '₴' };
    r.run({ item, statusCode: 200, payload: comfyHtml(10000) });
    const out = r.run({ item, statusCode: 200, payload: comfyHtml(9500) });
    assert.ok(out.text.includes('🔻'), out.text);
    assert.ok(out.text.includes('5.0%'));
});

t('пороги 10 / 15 / 20 / 25', () => {
    const cases = [[9000, '10%+'], [8500, '15%+'], [8000, '20%+'], [7000, 'більше 25%']];
    for (const [newPrice, label] of cases) {
        const r = makeRunner('parse_compare');
        const item = { id: 'c1', name: 'P', url: 'u', type: 'comfy_product', currency: '₴' };
        r.run({ item, statusCode: 200, payload: comfyHtml(10000) });
        const out = r.run({ item, statusCode: 200, payload: comfyHtml(newPrice) });
        assert.ok(out.text.includes(label), newPrice + ' → ' + out.text);
    }
});

t('ціна зросла або без змін → тиша', () => {
    const r = makeRunner('parse_compare');
    const item = { id: 'c1', name: 'P', url: 'u', type: 'comfy_product', currency: '₴' };
    r.run({ item, statusCode: 200, payload: comfyHtml(10000) });
    assert.strictEqual(r.run({ item, statusCode: 200, payload: comfyHtml(10000) }), null);
    assert.strictEqual(r.run({ item, statusCode: 200, payload: comfyHtml(11000) }), null);
});

const riaText = `Chevrolet Bolt EV 2023</span> <span>17 950 $ · 804 160 грн</span>
 Chevrolet Bolt EV 2016 <span>13&nbsp;999 $</span> <span>13&nbsp;500 $ · 604 800 грн</span>
 Chevrolet Bolt EV 2017 <span>14 999 $ 14 500 $ · 649 600 грн</span>`;

t('auto.ria пошук: мінімум серед оголошень, закреслені ціни ігноруються', () => {
    const r = makeRunner('parse_compare');
    const item = { id: 'a1', name: 'Bolt', url: 'u', type: 'auto_ria_search', currency: '$' };
    r.run({ item, statusCode: 200, payload: riaText });
    assert.strictEqual(r.store['g:prices'].a1.last_price, 13500);
});

t('auto.ria оголошення: перша ціна', () => {
    const r = makeRunner('parse_compare');
    const item = { id: 'a2', name: 'Bolt', url: 'u', type: 'auto_ria_listing', currency: '$' };
    r.run({ item, statusCode: 200, payload: riaText });
    assert.strictEqual(r.store['g:prices'].a2.last_price, 17950);
});

t('generic: JSON-LD з price і priceCurrency', () => {
    const r = makeRunner('parse_compare');
    const item = { id: 'g1', name: 'G', url: 'u', type: 'generic', currency: '' };
    const html = '<script type="application/ld+json">{"@type":"Product","offers":{"price":"1299.50","priceCurrency":"USD"}}</script>';
    r.run({ item, statusCode: 200, payload: html });
    assert.strictEqual(r.store['g:prices'].g1.last_price, 1299.5);
    assert.strictEqual(r.store['g:prices'].g1.currency, '$');
});

t('403: тихо у плановому режимі, звіт у ручному', () => {
    const r = makeRunner('parse_compare');
    const item = { id: 'c1', name: 'P', url: 'u', type: 'comfy_product' };
    assert.strictEqual(r.run({ item, statusCode: 403, payload: '' }), null);
    const out = r.run({ item, statusCode: 403, payload: '', manual: true });
    assert.ok(out.text.includes('403'));
});

t('ціну не знайдено: попередження лише один раз', () => {
    const r = makeRunner('parse_compare');
    const item = { id: 'c1', name: 'P', url: 'u', type: 'comfy_product' };
    assert.ok(r.run({ item, statusCode: 200, payload: '<html></html>' }).text.includes('⚠️'));
    assert.strictEqual(r.run({ item, statusCode: 200, payload: '<html></html>' }), null);
});

t('помилка з catch-ноди (msg.error)', () => {
    const r = makeRunner('parse_compare');
    const item = { id: 'c1', name: 'P', url: 'u', type: 'comfy_product' };
    const out = r.run({ item, error: { message: 'ECONNREFUSED' }, manual: true });
    assert.ok(out.text.includes('ECONNREFUSED'));
});

// ---------- commands ----------
const upd = (id, text, chat = 42) => ({ update_id: id, message: { chat: { id: chat }, text } });

t('commands: /add визначає тип за доменом, /list, /remove', () => {
    const r = makeRunner('commands', { TELEGRAM_CHAT_ID: '42' });
    r.store['g:items'] = [];
    const [rep1] = r.run({ payload: { ok: true, result: [
        upd(1, '/add https://comfy.ua/ua/smartfon-x.html'),
        upd(2, '/add https://auto.ria.com/uk/search/?query=bolt Мій пошук'),
        upd(3, '/add https://auto.ria.com/uk/auto_chevrolet_bolt-ev_123.html'),
        upd(4, '/add https://shop.example.com/item/42 Крісло'),
        upd(5, '/add https://shop.example.com/item/42'),
        upd(6, '/list')
    ] } });
    const types = r.store['g:items'].map(i => i.type);
    assert.deepStrictEqual(types, ['comfy_product', 'auto_ria_search', 'auto_ria_listing', 'generic']);
    assert.strictEqual(r.store['g:items'][1].name, 'Мій пошук');
    assert.ok(rep1.some(x => x.text.includes('вже відстежується')));
    assert.ok(rep1[rep1.length - 1].text.includes('Відстежується (4)'));
    const [rep2] = r.run({ payload: { ok: true, result: [upd(7, '/remove 1'), upd(8, '/remove nonexistent')] } });
    assert.strictEqual(r.store['g:items'].length, 3);
    assert.ok(rep2[0].text.includes('Видалено'));
    assert.ok(rep2[1].text.includes('Не знайшов'));
});

t('commands: /check запускає ручну перевірку; offset зсувається', () => {
    const r = makeRunner('commands', { TELEGRAM_CHAT_ID: '42' });
    r.store['g:items'] = [{ id: 'a', name: 'A', url: 'u', type: 'generic' }];
    const out = r.run({ payload: { ok: true, result: [upd(10, '/check')] } });
    assert.strictEqual(out[1].manual, true);
    assert.strictEqual(r.store['g:tg_offset'], 11);
});

t('commands: чужий чат ігнорується', () => {
    const r = makeRunner('commands', { TELEGRAM_CHAT_ID: '42' });
    r.store['g:items'] = [];
    const out = r.run({ payload: { ok: true, result: [upd(1, '/list', 999)] } });
    assert.strictEqual(out[0], null);
});

t('commands: без TELEGRAM_CHAT_ID /start показує chat_id', () => {
    const r = makeRunner('commands', {});
    const out = r.run({ payload: { ok: true, result: [upd(1, '/start', 555)] } });
    assert.ok(out[0][0].text.includes('555'));
});

t('commands: некоректний URL у /add', () => {
    const r = makeRunner('commands', { TELEGRAM_CHAT_ID: '42' });
    r.store['g:items'] = [];
    const out = r.run({ payload: { ok: true, result: [upd(1, '/add не-посилання')] } });
    assert.ok(out[0][0].text.includes('Використання'));
    assert.strictEqual(r.store['g:items'].length, 0);
});

// ---------- telegram_send ----------
t('telegram_send: токен лише зі змінної середовища', () => {
    const r = makeRunner('telegram_send', { TELEGRAM_BOT_TOKEN: 'TKN', TELEGRAM_CHAT_ID: '42' });
    const out = r.run({ text: 'hi' });
    assert.strictEqual(out.url, 'https://api.telegram.org/botTKN/sendMessage');
    assert.strictEqual(out.payload.chat_id, '42');
    const r2 = makeRunner('telegram_send', {});
    assert.strictEqual(r2.run({ text: 'hi' }), null);
});

console.log('\nУсі тести пройдені: ' + passed);
