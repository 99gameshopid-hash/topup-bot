const axios = require('axios');
const crypto = require('crypto');

const BOT_TOKEN = process.env.BOT_TOKEN;
const SHEET_API_URL = process.env.SHEET_API_URL;
const DIGIFLAZZ_USERNAME = process.env.DIGIFLAZZ_USERNAME;
const DIGIFLAZZ_KEY = process.env.DIGIFLAZZ_KEY;
const MARKUP_PERCENT = parseFloat(process.env.MARKUP_PERCENT || '5'); // Default markup 5%

const TELEGRAM_API = `https://api.telegram.org/bot${BOT_TOKEN}`;

// Fungsi ambil/simpan user di Google Sheets
async function getUserData(chatId, name) {
  try {
    if (!SHEET_API_URL) return { saldo: 0 };
    const response = await axios.get(`${SHEET_API_URL}?action=getUser&chatId=${chatId}&name=${encodeURIComponent(name)}`);
    return response.data;
  } catch (err) {
    console.error("Gagal konek Sheet:", err.message);
    return { saldo: 0 };
  }
}

// Fungsi narik produk langsung dari API Digiflazz
async function getDigiflazzProducts(brandName) {
  try {
    if (!DIGIFLAZZ_USERNAME || !DIGIFLAZZ_KEY) return [];

    // Buat MD5 signature sesuai dokumen resmi Digiflazz: md5(username + apiKey + "pricelist")
    const sign = crypto.createHash('md5').update(DIGIFLAZZ_USERNAME + DIGIFLAZZ_KEY + 'pricelist').digest('hex');

    const res = await axios.post('https://api.digiflazz.com/v1/price-list', {
      cmd: 'prepaid',
      username: DIGIFLAZZ_USERNAME,
      sign: sign
    });

    if (!res.data || !res.data.data) return [];

    // Filter produk berdasarkan Brand & status aktif
    const products = res.data.data.filter(item => {
      const matchBrand = item.brand.toUpperCase() === brandName.toUpperCase();
      const isActive = item.buyer_product_status && item.seller_product_status;
      return matchBrand && isActive;
    });

    // Urutkan dari harga termurah
    products.sort((a, b) => a.price - b.price);

    // Ambil maksimal 10 produk teratas biar muat di tombol Telegram
    return products.slice(0, 10).map(item => {
      const hargaModal = item.price;
      const hargaJual = Math.ceil(hargaModal + (hargaModal * (MARKUP_PERCENT / 100)));
      return {
        sku: item.buyer_sku_code,
        name: item.product_name,
        price: hargaJual
      };
    });
  } catch (err) {
    console.error("Gagal narik Digiflazz:", err.message);
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

        await axios.post(`${TELEGRAM_API}/answerCallbackQuery`, { callback_query_id: cb.id });

        if (data === 'menu_topup') {
          await axios.post(`${TELEGRAM_API}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text: "🎮 <b>PILIH GAME</b>\n\nSilahkan pilih game yang ingin kamu top up:",
            parse_mode: "HTML",
            reply_markup: {
              inline_keyboard: [
                [{ text: "Mobile Legends", callback_data: "game_MLBB" }, { text: "Free Fire", callback_data: "game_FREE FIRE" }],
                [{ text: "⬅️ Kembali", callback_data: "menu_main" }]
              ]
            }
          });
        } else if (data.startsWith('game_')) {
          const brand = data.replace('game_', '');
          
          await axios.post(`${TELEGRAM_API}/editMessageText`, {
            chat_id: chatId,
            message_id: messageId,
            text: `🔄 <i>Mengambil daftar harga ${brand} dari Digiflazz...</i>`,
            parse_mode: "HTML"
          });

          const items = await getDigiflazzProducts(brand);

          if (items.length === 0) {
            await axios.post(`${TELEGRAM_API}/editMessageText`, {
              chat_id: chatId,
              message_id: messageId,
              text: `⚠️ Produk ${brand} sedang tidak tersedia atau API Key Digiflazz belum dikonfigurasi.`,
              parse_mode: "HTML",
              reply_markup: { inline_keyboard: [[{ text: "⬅️ Kembali", callback_data: "menu_topup" }]] }
            });
          } else {
            const buttons = items.map(item => {
              const hargaFmt = new Intl.NumberFormat('id-ID').format(item.price);
              return [{ text: `${item.name} - Rp ${hargaFmt}`, callback_data: `buy_${item.sku}` }];
            });
            buttons.push([{ text: "⬅️ Kembali", callback_data: "menu_topup" }]);

            await axios.post(`${TELEGRAM_API}/editMessageText`, {
              chat_id: chatId,
              message_id: messageId,
              text: `💎 <b>PRODUK ${brand}</b>\n\nHarga sudah termasuk keuntungan. Silahkan pilih nominal yang ingin dibeli:`,
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
            text: `<b>👤 PROFIL PENGGUNA</b>\n\nNama: <b>${name}</b>\nID Chat: <code>${chatId}</code>\nSaldo Saat Ini: <b>Rp ${saldoFormatted}</b>`,
            parse_mode: "HTML",
            reply_markup: { inline_keyboard: [[{ text: "⬅️ Kembali ke Menu", callback_data: "menu_main" }]] }
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
