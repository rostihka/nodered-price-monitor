// Ініціалізація: при першому запуску записуємо стартовий список товарів у файлове сховище.
const STORE = 'file';
const DEFAULT_ITEMS = [
    {
        id: 'comfy_galaxy_a17',
        name: 'Samsung Galaxy A17 8/256Gb Gray (Comfy)',
        url: 'https://comfy.ua/ua/smartfon-samsung-galaxy-a17-8-256gb-gray-sm-a175fzaeeuc.html',
        type: 'comfy_product',
        currency: '₴'
    },
    {
        id: 'auto_ria_bolt_ev_search',
        name: 'Chevrolet Bolt EV — пошук на AUTO.RIA',
        url: 'https://auto.ria.com/uk/search/?abroad=0&customs_cleared=1&all%5B0%5D.any%5B0%5D.brand=13&all%5B0%5D.any%5B0%5D.any%5B0%5D.model=51091&query=chevrolet+bolt+ev',
        type: 'auto_ria_search',
        currency: '$'
    }
];

if (global.get('items', STORE) === undefined) {
    global.set('items', DEFAULT_ITEMS, STORE);
    node.status({ fill: 'green', shape: 'dot', text: 'стартовий список записано' });
} else {
    const n = (global.get('items', STORE) || []).length;
    node.status({ fill: 'grey', shape: 'dot', text: 'позицій у списку: ' + n });
}
return null;
