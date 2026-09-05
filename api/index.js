const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SHEET_API_URL = process.env.SHEET_API_URL;
const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Fungsi untuk mengambil/mendaftarkan data user dari Google Sheets
async function getUserData(chatId, name) {
  try {
    if (!SHEET_API_URL) return { saldo: 0 };
    const response = await axios.get(`${SHEET_API_URL}?action=getUser&chatId=${chatId}&name=${encodeURIComponent(name)}`);
    return response.data;
  } catch (err) {
    console.error("Gagal mengambil data dari Sheet:", err.message);
    return { saldo: 0 };
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST' && req.body) {
      const body = req.body;

      if (body.message) {
        const chatId = body.message.chat.id;
        const text = body.message.text || '';
        const name = body.message.from.first_name || 'User';

        if (text === '/start') {
          // Otomatis daftar/ambil data user dari Sheet
          await getUserData(chatId, name);

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
        const name = cb.from.first_name || 'User';

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
          // Ambil saldo langsung dari Google Sheets
          const user = await getUserData(chatId, name);
          const saldoFormatted = new Intl.NumberFormat('id-ID').format(user.saldo || 0);

          await axios.post(`${TELEGRAM_API}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text: `<b>👤 PROFIL PENGGUNA</b>\n\nNama: <b>${name}</b>\nID Chat: <code>${chatId}</code>\nSaldo Saat Ini: <b>Rp ${saldoFormatted}</b>\n\n<i>Ketik <code>/voucher KODE</code> untuk klaim voucher.</i>`,
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [[{ text: "⬅️ Kembali ke Menu", callback_data: "menu_main" }]]
            }
          });
        } else if (data === 'menu_main') {
          await axios.post(`${TELEGRAM_API}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text: `Selamat datang di Bot Topup, <b>${name}</b>! 👋\n\nLayanan topup game otomatis, cepat, dan terpercaya. Silahkan pilih menu di bawah:`,
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
    }
  } catch (err) {
    console.error("Error:", err.message);
  }

  return res.status(200).send('OK');
};
