const axios = require('axios');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SHEET_API_URL = process.env.SHEET_API_URL;
const HOMETOPUP_KEY = process.env.HOMETOPUP_KEY;
const MARKUP_PERCENT = 5; // Keuntungan 5%

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Ambil Data User dari Google Sheets
async function getUserData(chatId, name) {
  try {
    if (!SHEET_API_URL) return { saldo: 0 };
    const res = await axios.get(`${SHEET_API_URL}?action=getUser&chatId=${chatId}&name=${encodeURIComponent(name)}`);
    return res.data;
  } catch (err) {
    return { saldo: 0 };
  }
}

// Tembak API Hometopup LANGSUNG dari Vercel
async function getHometopupProductsDirect(brandName) {
  try {
    if (!HOMETOPUP_KEY) return [];

    const res = await axios.post('https://api.hometopup.id/api/product', {}, {
      headers: {
        'Authorization': `Bearer ${HOMETOPUP_KEY}`,
        'X-API-KEY': HOMETOPUP_KEY,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    if (!res.data || !res.data.data) return [];

    // Filter Game & Status Aktif
    const filtered = res.data.data.filter(item => {
      const kat = (item.kategori || '').toUpperCase();
      const brd = (brandName || '').toUpperCase();
      const isActive = (item.status || '').toLowerCase() === 'aktif';
      return (kat.includes(brd) || brd.includes(kat)) && isActive;
    });

    filtered.sort((a, b) => a.harga - b.harga);

    return filtered.slice(0, 15).map(item => {
      const hargaModal = parseFloat(item.harga || 0);
      const hargaJual = Math.ceil(hargaModal + (hargaModal * (MARKUP_PERCENT / 100)));
      return {
        code: item.code,
        name: item.nama_layanan,
        price: hargaJual
      };
    });
  } catch (err) {
    console.error('Error Hometopup Direct:', err.response ? err.response.data : err.message);
    return [];
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
          await getUserData(chatId, name);
          await axios.post(`${TELEGRAM_API}/sendMessage`, {
            chat_id: chatId,
            text: `Selamat datang di Bot Topup Hometopup, <b>${name}</b>! 👋\n\nLayanan topup game otomatis, murah & cepat. Silahkan pilih menu:`,
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

        await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: cb.id });

        if (data === 'menu_topup') {
          await axios.post(`${TELEGRAM_API}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text: "🎮 <b>PILIH GAME TOPUP</b>\n\nSilahkan pilih kategori game di bawah:",
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "Mobile Legends", callback_data: "game_Mobile Legends" }, { text: "Free Fire", callback_data: "game_Free Fire" }],
                [{ text: "⬅️ Kembali", callback_data: "menu_main" }]
              ]
            }
          });
        } else if (data.startsWith('game_')) {
          const brand = data.replace('game_', '');
          
          await axios.post(`${TELEGRAM_API}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text: `🔄 <i>Mengambil harga terbaru ${brand} dari Hometopup...</i>`,
            parse_mode: "HTML"
          });

          const items = await getHometopupProductsDirect(brand);

          if (items.length === 0) {
            await axios.post(`${TELEGRAM_API}/editMessageText`, {
              chat_id: chatId,
              message_id: messageId,
              text: `⚠️ Produk ${brand} saat ini sedang tidak tersedia atau API Key belum sesuai.`,
              parse_mode: "HTML",
              reply_markup: { inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "menu_topup" }]] }
            });
          } else {
            const buttons = items.map(item => {
              const hargaFmt = new Intl.NumberFormat('id-ID').format(item.price);
              return [{ text: `${item.name} - Rp ${hargaFmt}`, callback_data: `info_${item.code}_${item.price}` }];
            });
            buttons.push([{ text: "⬅️ Kembali", callback_data: "menu_topup" }]);

            await axios.post(`${TELEGRAM_API}/editMessageText`, {
              chat_id: chatId,
              message_id: messageId,
              text: `💎 <b>KATALOG ${brand.toUpperCase()}</b>\n\nPilih nominal item yang ingin dibeli:`,
              parse_mode: "HTML",
              reply_markup: { inline_keyboard: buttons }
            });
          }
        } else if (data === 'menu_profile') {
          const user = await getUserData(chatId, name);
          const saldoFormatted = new Intl.NumberFormat('id-ID').format(user.saldo || 0);

          await axios.post(`${TELEGRAM_API}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text: `<b>👤 PROFIL PENGGUNA</b>\n\nNama: <b>${name}</b>\nID Chat: <code>${chatId}</code>\nSaldo Aktif: <b>Rp ${saldoFormatted}</b>`,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Kembali ke Menu", callback_data: "menu_main" }]] }
          });
        } else if (data === 'menu_main') {
          await axios.post(`${TELEGRAM_API}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text: `Selamat datang di Bot Topup Hometopup, <b>${name}</b>! 👋\n\nLayanan topup game otomatis, murah & cepat. Silahkan pilih menu:`,
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
