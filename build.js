// Збирає flow.json з файлів у functions/. Запуск: node build.js
const fs = require('fs');
const path = require('path');

const code = name => fs.readFileSync(path.join(__dirname, 'functions', name + '.js'), 'utf8');
const TAB = 'pm_tab';

const fn = (id, name, file, x, y, wires, outputs = 1) => ({
    id, type: 'function', z: TAB, name, func: code(file),
    outputs, timeout: 0, noerr: 0, initialize: '', finalize: '', libs: [],
    x, y, wires
});

const nodes = [
    { id: TAB, type: 'tab', label: 'Price Monitor', disabled: false,
      info: 'Моніторинг цін: щоденна перевірка + Telegram-команди /add /list /remove /check.\nПотрібні змінні середовища: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.\nПотрібне файлове сховище контексту "file" у settings.js (див. README).' },

    // ---------- Коментарі ----------
    { id: 'pm_c1', type: 'comment', z: TAB, name: '1) Перевірка цін (щодня о 09:00 + вручну)', info: 'Щодня о 09:00 за локальним часом комп\'ютера. Кнопка "Перевірити зараз" запускає ручну перевірку зі звітом по кожному товару.', x: 230, y: 40, wires: [] },
    { id: 'pm_c2', type: 'comment', z: TAB, name: '2) Діалог у Telegram: /add /list /remove /check /help', info: 'Кожні 5 секунд бот опитує Telegram (getUpdates) і обробляє команди власника.', x: 260, y: 400, wires: [] },
    { id: 'pm_c3', type: 'comment', z: TAB, name: '0) Ініціалізація списку товарів', info: 'При першому запуску записує стартовий список (Comfy + AUTO.RIA) у файлове сховище.', x: 190, y: 560, wires: [] },

    // ---------- Блок 1: перевірка цін ----------
    { id: 'pm_inj_daily', type: 'inject', z: TAB, name: 'Щодня 09:00',
      props: [{ p: 'payload' }, { p: 'topic', vt: 'str' }], repeat: '', crontab: '00 09 * * *',
      once: false, onceDelay: 0.1, topic: '', payload: '', payloadType: 'date', x: 140, y: 100, wires: [['pm_fn_load']] },
    { id: 'pm_inj_manual', type: 'inject', z: TAB, name: 'Перевірити зараз',
      props: [{ p: 'manual', v: 'true', vt: 'bool' }], repeat: '', crontab: '',
      once: false, onceDelay: 0.1, topic: '', x: 150, y: 160, wires: [['pm_fn_load']] },

    fn('pm_fn_load', 'Список товарів', 'load_items', 380, 130, [['pm_delay']]),

    { id: 'pm_delay', type: 'delay', z: TAB, name: '1 запит / 2 с', pauseType: 'rate',
      timeout: '5', timeoutUnits: 'seconds', rate: '1', nbRateUnits: '2', rateUnits: 'second',
      randomFirst: '1', randomLast: '5', randomUnits: 'seconds', drop: false, allowrate: false, outputs: 1,
      x: 580, y: 130, wires: [['pm_http_fetch']] },

    { id: 'pm_http_fetch', type: 'http request', z: TAB, name: 'Завантажити сторінку',
      method: 'GET', ret: 'txt', paytoqs: 'ignore', url: '', tls: '', persist: false, proxy: '',
      insecureHTTPParser: false, authType: '', senderr: false, headers: [],
      x: 790, y: 130, wires: [['pm_fn_parse']] },

    { id: 'pm_catch', type: 'catch', z: TAB, name: 'Помилка мережі', scope: ['pm_http_fetch'], uncaught: false,
      x: 790, y: 200, wires: [['pm_fn_parse']] },

    fn('pm_fn_parse', 'Ціна → порівняння → сповіщення', 'parse_compare', 1030, 130, [['pm_fn_send']]),

    fn('pm_fn_send', 'Підготувати Telegram', 'telegram_send', 1270, 130, [['pm_delay_send']]),

    // Черга відправки: зберігає порядок повідомлень (запити без неї летіли б паралельно) і тримається в ліміті Telegram
    { id: 'pm_delay_send', type: 'delay', z: TAB, name: '1 повідомлення / с', pauseType: 'rate',
      timeout: '5', timeoutUnits: 'seconds', rate: '1', nbRateUnits: '1', rateUnits: 'second',
      randomFirst: '1', randomLast: '5', randomUnits: 'seconds', drop: false, allowrate: false, outputs: 1,
      x: 1480, y: 130, wires: [['pm_http_send']] },

    { id: 'pm_http_send', type: 'http request', z: TAB, name: 'Telegram sendMessage',
      method: 'POST', ret: 'txt', paytoqs: 'ignore', url: '', tls: '', persist: false, proxy: '',
      insecureHTTPParser: false, authType: '', senderr: false, headers: [],
      x: 1690, y: 130, wires: [['pm_dbg_send']] },

    { id: 'pm_dbg_send', type: 'debug', z: TAB, name: 'Статус відправки', active: true, tosidebar: true,
      console: false, tostatus: true, complete: 'statusCode', targetType: 'msg', statusVal: 'statusCode', statusType: 'auto',
      x: 1900, y: 130, wires: [] },

    // ---------- Блок 2: Telegram-команди ----------
    { id: 'pm_inj_poll', type: 'inject', z: TAB, name: 'Кожні 5 с',
      props: [{ p: 'payload' }], repeat: '5', crontab: '',
      once: true, onceDelay: 3, topic: '', payload: '', payloadType: 'date', x: 130, y: 460, wires: [['pm_fn_getupd']] },

    fn('pm_fn_getupd', 'getUpdates (запит)', 'getupdates', 340, 460, [['pm_http_getupd']]),

    { id: 'pm_http_getupd', type: 'http request', z: TAB, name: 'Telegram getUpdates',
      method: 'GET', ret: 'obj', paytoqs: 'ignore', url: '', tls: '', persist: false, proxy: '',
      insecureHTTPParser: false, authType: '', senderr: false, headers: [],
      x: 570, y: 460, wires: [['pm_fn_cmd']] },

    fn('pm_fn_cmd', 'Обробка команд', 'commands', 790, 460, [['pm_fn_send'], ['pm_fn_load']], 2),

    // ---------- Блок 0: ініціалізація ----------
    { id: 'pm_inj_init', type: 'inject', z: TAB, name: 'При запуску',
      props: [{ p: 'payload' }], repeat: '', crontab: '',
      once: true, onceDelay: 0.5, topic: '', payload: '', payloadType: 'date', x: 130, y: 600, wires: [['pm_fn_init']] },
    fn('pm_fn_init', 'Стартовий список', 'init', 340, 600, [[]])
];

fs.writeFileSync(path.join(__dirname, 'flow.json'), JSON.stringify(nodes, null, 2));
console.log('flow.json: ' + nodes.length + ' вузлів');
