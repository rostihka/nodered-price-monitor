// Обробка команд Telegram: /start /help /add /list /remove /check
// Вихід 1 -> відповіді в Telegram, вихід 2 -> запуск ручної перевірки цін.
const STORE = 'file';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

const HELP = [
    '🤖 <b>Монітор цін</b>',
    '',
    '/add &lt;посилання&gt; [назва] — додати товар',
    '/list — показати відстежувані товари',
    '/remove &lt;номер або id&gt; — видалити товар',
    '/check — перевірити ціни зараз',
    '/help — ця підказка',
    '',
    'Щодня бот перевіряє ціни сам і пише, якщо ціна впала.'
].join('\n');

flow.set('pollLock', null);   // запит завершено, можна опитувати знову

const data = msg.payload;
if (!data || data.ok !== true) {
    if (msg.statusCode) node.warn('getUpdates: HTTP ' + msg.statusCode);
    node.status({ fill: 'red', shape: 'ring', text: 'getUpdates: ' + (msg.statusCode || 'помилка') });
    return null;
}
node.status({ fill: 'green', shape: 'dot', text: 'ок ' + new Date().toLocaleTimeString() });

const allowed = String(env.get('TELEGRAM_CHAT_ID') || '').trim();
let items = global.get('items', STORE) || [];
let prices = global.get('prices', STORE) || {};
let offset = global.get('tg_offset', STORE) || 0;
const replies = [];
let runCheck = false;
let changed = false;

for (const u of (data.result || [])) {
    offset = Math.max(offset, u.update_id + 1);
    const m = u.message;
    if (!m || typeof m.text !== 'string') continue;

    const chatId = String(m.chat.id);
    const say = text => replies.push({ chat_id: chatId, text: text });
    const parts = m.text.trim().split(/\s+/);
    const cmd = parts[0].split('@')[0].toLowerCase();

    // Якщо TELEGRAM_CHAT_ID ще не задано, відповідаємо лише на /start і показуємо chat_id
    if (!allowed) {
        if (cmd === '/start') {
            say('👋 Твій chat_id: <code>' + esc(chatId) + '</code>\nЗадай його у змінній середовища TELEGRAM_CHAT_ID і перезапусти Node-RED.');
        }
        continue;
    }
    // Чужі чати ігноруємо
    if (chatId !== allowed) {
        node.warn('Команда з чужого чату ' + chatId + ' проігнорована');
        continue;
    }

    switch (cmd) {
        case '/start':
        case '/help':
            say(HELP);
            break;

        case '/add': {
            const url = parts[1];
            if (!url || !/^https?:\/\/[^\s]+$/i.test(url)) {
                say('Використання: <code>/add &lt;посилання&gt; [назва]</code>');
                break;
            }
            if (items.some(i => i.url === url)) {
                say('ℹ️ Це посилання вже відстежується.');
                break;
            }
            const host = url.replace(/^https?:\/\//i, '').split(/[\/?#]/)[0].toLowerCase().replace(/^www\./, '');
            const path = url.replace(/^https?:\/\/[^\/?#]+/i, '').split(/[?#]/)[0];
            let type = 'generic';
            let currency = '';
            let name = parts.slice(2).join(' ');
            if (/(^|\.)comfy\.ua$/.test(host)) {
                type = 'comfy_product'; currency = '₴';
                if (!name) name = 'Comfy: ' + (path.split('/').filter(Boolean).pop() || host).replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').slice(0, 70);
            } else if (/(^|\.)auto\.ria\.com$/.test(host)) {
                type = /\/search\b/.test(path) ? 'auto_ria_search' : 'auto_ria_listing';
                currency = '$';
                if (!name) name = type === 'auto_ria_search' ? 'AUTO.RIA — пошук' : 'AUTO.RIA — оголошення';
            } else if (!name) {
                name = host + ': ' + (path.split('/').filter(Boolean).pop() || '').replace(/\.html?$/i, '').replace(/[-_]+/g, ' ').slice(0, 60);
            }
            const id = host.replace(/\W+/g, '_') + '_' + hash(url);
            items.push({ id: id, name: name, url: url, type: type, currency: currency });
            changed = true;
            say('✅ Додано: <b>' + esc(name) + '</b>\nТип: ' + type + '\nПерша ціна збережеться при найближчій перевірці (або команда /check).');
            break;
        }

        case '/list': {
            if (!items.length) {
                say('Список порожній. Додай товар: <code>/add &lt;посилання&gt;</code>');
                break;
            }
            const lines = items.map((it, i) => {
                const p = prices[it.id];
                const priceTxt = p && p.last_price != null ? fmt(p.last_price) + ' ' + (p.currency || it.currency || '') : 'ще не перевірено';
                return (i + 1) + '. <b>' + esc(it.name) + '</b> — ' + priceTxt + '\n    id: <code>' + esc(it.id) + '</code>';
            });
            say('📋 Відстежується (' + items.length + '):\n\n' + lines.join('\n'));
            break;
        }

        case '/remove':
        case '/del': {
            const arg = parts[1];
            if (!arg) { say('Використання: <code>/remove &lt;номер або id&gt;</code>'); break; }
            const idx = /^\d+$/.test(arg) ? parseInt(arg, 10) - 1 : items.findIndex(i => i.id === arg);
            if (idx < 0 || idx >= items.length) { say('❌ Не знайшов такої позиції. Дивись /list'); break; }
            const removed = items.splice(idx, 1)[0];
            delete prices[removed.id];
            changed = true;
            say('🗑 Видалено: <b>' + esc(removed.name) + '</b>');
            break;
        }

        case '/check':
            if (!items.length) {
                say('Список порожній. Додай товар: <code>/add &lt;посилання&gt;</code>');
            } else {
                say('⏳ Перевіряю ціни (' + items.length + ' поз.)…');
                runCheck = true;
            }
            break;

        default:
            if (cmd.startsWith('/')) say('Невідома команда. Напиши /help');
    }
}

global.set('tg_offset', offset, STORE);
if (changed) {
    global.set('items', items, STORE);
    global.set('prices', prices, STORE);
}
return [replies.length ? replies : null, runCheck ? { manual: true } : null];
