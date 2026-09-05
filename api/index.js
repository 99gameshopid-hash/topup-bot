const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

module.exports = async (req, res) => {
  // Kirim respon HTTP 200 instan ke Telegram agar bebas spam
  res.status(200).send('OK');

  if (req.method !== 'POST' || !req.body) return;

  const body = req.body;

  try {
    if (body.message) {
      const chatId = body.message.chat.id;
      const text = body.message.text || '';
      const name = body.message.from.first_name || 'User';

      if (text === '/start') {
        await axios.post(`${TELEGRAM_API}/sendMessage`, {
          chat_id: chatId,
          text: `Selamat datang di Bot Topup, <b>${name}</b>! 👋\n\nLayanan topup game otomatis, cepat, dan terpercaya. Silahkan pilih menu di bawah:`,
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎮 Topup Game", callback_data: "menu_topup" }],
              [{ text: "👤 Profil & Saldo", callback_data: "menu_profile" }]
            ]
          }
        });
      }
    } else if (body.callback_query) {
      const cb = body.callback_query;
      const chatId = cb.message.chat.id;
      const messageId = cb.message.message_id;
      const data = cb.data;

      // Hentikan loading tombol Telegram
      await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, {
        callback_query_id: cb.id
      });

      if (data === 'menu_topup') {
        await axios.post(`${TELEGRAM_API}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text: "🎮 <b>PILIH GAME</b>\n\nSilahkan pilih game yang ingin kamu top up:",
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "Mobile Legends", callback_data: "game_mlbb" }, { text: "Free Fire", callback_data: "game_ff" }],
              [{ text: "⬅️ Kembali", callback_data: "menu_main" }]
            ]
          }
        });
      } else if (data === 'menu_profile') {
        await axios.post(`${TELEGRAM_API}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text: `<b>👤 PROFIL PENGGUNA</b>\n\nID Chat: <code>${chatId}</code>\nSaldo Saat Ini: <b>Rp 0</b>\n\n<i>Ketik <code>/voucher KODE</code> untuk klaim voucher.</i>`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [[{ text: "⬅️ Kembali ke Menu", callback_data: "menu_main" }]]
          }
        });
      } else if (data === 'menu_main') {
        await axios.post(`${TELEGRAM_API}/editMessageText`, {
          chat_id: chatId,
          message_id: messageId,
          text: `Selamat datang di Bot Topup, <b>${cb.from.first_name}</b>! 👋\n\nLayanan topup game otomatis, cepat, dan terpercaya. Silahkan pilih menu di bawah:`,
          parse_mode: "HTML",
          reply_markup: {
            inline_keyboard: [
              [{ text: "🎮 Topup Game", callback_data: "menu_topup" }],
              [{ text: "👤 Profil & Saldo", callback_data: "menu_profile" }]
            ]
          }
        });
      }
    }
  } catch (err) {
    console.error("Error:", err.message);
  }
};
