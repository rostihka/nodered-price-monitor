// Витягує ціну зі сторінки, порівнює з попередньою, оновлює історію і формує сповіщення.
const STORE = 'file';
const THRESHOLDS = [
    [25, '🔥 Падіння ціни більше 25%'],
    [20, '🔥 Падіння ціни 20%+'],
    [15, '📉 Падіння ціни 15%+'],
    [10, '📉 Падіння ціни 10%+'],
    [0,  '🔻 Ціна зменшилась']
];
const CUR = { UAH: '₴', USD: '$', EUR: '€' };

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const toNum = s => parseFloat(String(s).replace(/[\s ]/g, '').replace(',', '.'));

const item = msg.item;
if (!item) return null;
const manual = msg.manual === true;

// 1) Помилка завантаження (403, таймаут, немає мережі тощо)
if (msg.error || !msg.statusCode || msg.statusCode >= 400) {
    const reason = msg.error ? (msg.error.message || String(msg.error)) : ('HTTP ' + msg.statusCode);
    node.warn('[' + item.name + '] помилка завантаження: ' + reason);
    return manual ? { text: '⚠️ <b>' + esc(item.name) + '</b>: не вдалося завантажити сторінку (' + esc(reason) + ').' } : null;
}

// 2) Пошук ціни
const html = typeof msg.payload === 'string' ? msg.payload : '';
let price = null;
let cur = item.currency || '';

if (item.type === 'auto_ria_search' || item.type === 'auto_ria_listing') {
    // На AUTO.RIA беремо поточну (не закреслену) ціну в доларах: "13 300 $ ·"
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ');
    const found = [];
    // Ціна = цифри групами по три ("17 950") або суцільне число; не може починатись усередині іншого числа (рік тощо)
    const re = /(?<!\d)(\d{1,3}(?:\s\d{3})*|\d{4,7})\s?\$\s*·/g;
    let m;
    while ((m = re.exec(text)) !== null) {
        const v = toNum(m[1]);
        if (isFinite(v) && v > 0) found.push(v);
    }
    if (found.length) {
        price = item.type === 'auto_ria_search' ? Math.min.apply(null, found) : found[0];
        cur = '$';
    }
} else {
    // Магазини (comfy.ua та інші): мета-теги Open Graph / schema.org / JSON-LD
    const patterns = [
        /<meta[^>]+(?:property|name)=["']product:price:amount["'][^>]*content=["']([^"']+)["']/i,
        /<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']product:price:amount["']/i,
        /<meta[^>]+(?:property|name)=["']og:price:amount["'][^>]*content=["']([^"']+)["']/i,
        /itemprop=["']price["'][^>]*content=["']([^"']+)["']/i,
        /"price"\s*:\s*"?(\d[\d.]*)"?/
    ];
    for (const p of patterns) {
        const m = html.match(p);
        if (m) {
            const v = toNum(m[1]);
            if (isFinite(v) && v > 0) { price = v; break; }
        }
    }
    if (!cur) {
        const cm = html.match(/<meta[^>]+(?:property|name)=["'](?:product|og):price:currency["'][^>]*content=["']([A-Z]{3})["']/i)
                || html.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/);
        if (cm) cur = CUR[cm[1]] || cm[1];
    }
}

const prices = global.get('prices', STORE) || {};
const entry = prices[item.id] || { history: [] };

if (price === null) {
    node.warn('[' + item.name + '] ціну не знайдено — можливо, змінилась верстка');
    const first = !entry.warned;
    entry.warned = true;
    prices[item.id] = entry;
    global.set('prices', prices, STORE);
    if (manual || first) {
        return { text: '⚠️ <b>' + esc(item.name) + '</b>: не вдалось знайти ціну на сторінці.\n' + esc(item.url) };
    }
    return null;
}

// 3) Порівняння з попередньою ціною
const old = entry.last_price;
let text = null;
if (old !== undefined && old !== null && price < old) {
    const pct = (old - price) / old * 100;
    const label = THRESHOLDS.find(t => pct >= t[0])[1];
    text = label + '\n<b>' + esc(item.name) + '</b>\n' +
           'Було: ' + fmt(old) + ' ' + cur + '\n' +
           'Стало: ' + fmt(price) + ' ' + cur + '\n' +
           'Падіння: ' + pct.toFixed(1) + '%\n' + esc(item.url);
} else if (manual) {
    const status = (old === undefined || old === null) ? 'базову ціну збережено'
                 : price > old ? 'ціна зросла (було ' + fmt(old) + ')'
                 : 'без змін';
    text = 'ℹ️ <b>' + esc(item.name) + '</b>: ' + fmt(price) + ' ' + cur + ' — ' + status;
}

// 4) Зберігаємо стан (історія — останні 180 записів)
entry.last_price = price;
entry.currency = cur;
entry.name = item.name;
entry.url = item.url;
entry.warned = false;
entry.history = (entry.history || []).concat({ date: new Date().toISOString(), price: price }).slice(-180);
prices[item.id] = entry;
global.set('prices', prices, STORE);

node.status({ fill: 'green', shape: 'dot', text: item.name.slice(0, 24) + ': ' + fmt(price) });
return text ? { text: text } : null;
