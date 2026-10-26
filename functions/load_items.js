// Бере список товарів і випускає по одному повідомленню на кожен товар
// (далі вони йдуть через ноду-обмежувач швидкості і завантажуються по черзі).
const STORE = 'file';
const items = global.get('items', STORE) || [];
if (items.length === 0) {
    node.status({ fill: 'yellow', shape: 'ring', text: 'список порожній' });
    return null;
}

const manual = msg.manual === true;
const out = items.map(item => ({
    item: item,
    manual: manual,
    url: item.url,
    requestTimeout: 30000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'uk-UA,uk;q=0.9,en-US;q=0.8,en;q=0.7'
    }
}));

node.status({ fill: 'blue', shape: 'dot', text: 'перевірка: ' + out.length + ' поз.' });
return [out];
