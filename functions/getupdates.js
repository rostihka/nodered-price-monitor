// Формує запит getUpdates (опитування Telegram на нові команди). Запускається кожні 5 секунд.
const token = env.get('TELEGRAM_BOT_TOKEN');
if (!token) {
    node.status({ fill: 'red', shape: 'ring', text: 'нема TELEGRAM_BOT_TOKEN' });
    return null;
}

// Захист від накладання запитів: якщо попередній ще не завершився, пропускаємо цикл
const now = Date.now();
const lock = flow.get('pollLock');
if (lock && now - lock < 20000) return null;
flow.set('pollLock', now);

const base = env.get('TELEGRAM_API_BASE') || 'https://api.telegram.org';
const offset = global.get('tg_offset', 'file') || 0;
return {
    url: base + '/bot' + token + '/getUpdates?timeout=0&offset=' + offset,
    requestTimeout: 15000,
    headers: {}
};
