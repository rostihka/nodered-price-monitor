// Готує запит sendMessage до Telegram API. Токен береться зі змінної середовища.
const token = env.get('TELEGRAM_BOT_TOKEN');
const chat = msg.chat_id || env.get('TELEGRAM_CHAT_ID');
if (!token || !chat) {
    node.status({ fill: 'red', shape: 'ring', text: 'нема TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID' });
    node.warn('Змінні середовища TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID не задані — повідомлення не надіслано');
    return null;
}
if (!msg.text) return null;

const base = env.get('TELEGRAM_API_BASE') || 'https://api.telegram.org';
return {
    url: base + '/bot' + token + '/sendMessage',
    headers: { 'content-type': 'application/json' },
    requestTimeout: 20000,
    payload: {
        chat_id: chat,
        text: String(msg.text).slice(0, 4000),
        parse_mode: 'HTML',
        disable_web_page_preview: true
    }
};
