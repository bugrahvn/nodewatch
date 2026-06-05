const { Telegraf } = require('telegraf');
const cryptoService = require('./crypto.service');

// Store active bot instances mapping: userId -> Telegraf instance
const activeBots = new Map();

/**
 * Register and launch a new Telegram Bot instance for a specific user.
 * Stops any pre-existing bot for this user before starting the new one.
 * @param {number} userId - The owner user ID.
 * @param {string} token - The decrypted Telegram Bot Token.
 * @returns {Promise<boolean>} - True if registration and startup succeeded, false otherwise.
 */
async function registerBot(userId, token) {
  // Stop existing bot if running
  await unregisterBot(userId);

  if (!token) return false;

  try {
    const bot = new Telegraf(token);

    // Verify token validity with Telegram API before launching
    const botInfo = await bot.telegram.getMe();
    console.log(`Successfully verified Bot @${botInfo.username} for User ID ${userId}`);

    // Command: /start
    bot.start((ctx) => {
      ctx.reply(
        `🤖 *NodeWatch İzleme Botuna Hoş Geldiniz!*\n\n` +
        `Bu bot, NodeWatch hesabınızdaki sitelerin durumunu sorgulamak ve kesinti anlarında bildirim almak için yapılandırılmıştır.\n\n` +
        `Kullanılabilir komutlar:\n` +
        `/status - Sitelerinizin anlık performans ve durumunu listeler\n` +
        `/ping - Botun çalışıp çalışmadığını test eder\n` +
        `/help - Yardım menüsünü gösterir`,
        { parse_mode: 'Markdown' }
      );
    });

    // Command: /help
    bot.help((ctx) => {
      ctx.reply(
        `❓ *NodeWatch Bot Yardım Menüsü*\n\n` +
        `• `/status` - Tüm izlenen sitelerin durumunu, son tepki süresini ve yaklaşık uptime yüzdesini getirir.\n` +
        `• `/ping` - Bot ve sunucu yanıt süresi testi.\n` +
        `• `/help` - Bu kılavuzu görüntüler.`,
        { parse_mode: 'Markdown' }
      );
    });

    // Command: /ping
    bot.command('ping', (ctx) => {
      ctx.reply('🏓 *Pong!* Bot çevrimiçi ve izleme sunucusu ile iletişim halinde.', { parse_mode: 'Markdown' });
    });

    // Command: /status
    bot.command('status', async (ctx) => {
      try {
        const { pool } = require('../config/db');
        const query = `
          SELECT m.id, m.name, m.url, m.last_status,
                 (SELECT response_time FROM pings WHERE monitor_id = m.id ORDER BY checked_at DESC LIMIT 1) as last_ping,
                 (SELECT COUNT(*) FROM pings WHERE monitor_id = m.id AND status = 'UP') as up_count,
                 (SELECT COUNT(*) FROM pings WHERE monitor_id = m.id) as total_count
          FROM monitors m
          WHERE m.user_id = ?;
        `;
        const [monitors] = await pool.query(query, [userId]);

        if (monitors.length === 0) {
          return ctx.reply('⚠️ Kayıtlı izlenen siteniz bulunmuyor. Web panelinden site ekleyebilirsiniz.');
        }

        let responseText = `📊 *NodeWatch Güncel Durum Raporu*\n\n`;

        monitors.forEach((m) => {
          const isUp = m.last_status === 'UP';
          const statusEmoji = isUp ? '✅' : (m.last_status === 'DOWN' ? '🚨' : '⚪');
          const pingText = m.last_ping !== null ? `${m.last_ping}ms` : 'TIMEOUT';
          
          let uptimePct = 100;
          if (m.total_count > 0) {
            uptimePct = Math.round((m.up_count / m.total_count) * 100);
          }

          responseText += `${statusEmoji} *${m.name}* — ${m.last_status}\n`;
          responseText += `   • URL: ${m.url}\n`;
          responseText += `   • Son Yanıt: \`${pingText}\`\n`;
          responseText += `   • Uptime Oranı: \`%${uptimePct}\`\n\n`;
        });

        ctx.reply(responseText, { parse_mode: 'Markdown', disable_web_page_preview: true });
      } catch (err) {
        console.error(`Status command error for User ${userId}:`, err);
        ctx.reply('❌ Durum raporu alınırken veritabanı hatası oluştu.');
      }
    });

    // Launch bot instance asynchronously
    bot.launch().catch((err) => {
      console.error(`Error during launch for bot of User ID ${userId}:`, err.message);
    });

    // Handle bot failures gracefully without crashing app
    bot.catch((err) => {
      console.error(`Telegraf error caught for User ID ${userId}:`, err);
    });

    activeBots.set(userId, bot);
    return true;
  } catch (err) {
    console.error(`Failed to register bot for User ID ${userId}:`, err.message);
    return false;
  }
}

/**
 * Stop and remove a Telegram Bot instance.
 * @param {number} userId - The owner user ID.
 */
async function unregisterBot(userId) {
  if (activeBots.has(userId)) {
    try {
      const oldBot = activeBots.get(userId);
      await oldBot.stop();
      activeBots.delete(userId);
      console.log(`Stopped Telegram Bot for User ID ${userId}`);
    } catch (err) {
      console.error(`Error while stopping Telegram Bot for User ID ${userId}:`, err.message);
    }
  }
}

/**
 * Initialize all bots registered in the database.
 * Runs on application boot.
 */
async function initBots() {
  try {
    const { pool } = require('../config/db');
    const [settings] = await pool.query('SELECT user_id, bot_token FROM telegram_settings');
    
    console.log(`Initializing Telegram bots for ${settings.length} users...`);
    for (const setting of settings) {
      const decryptedToken = cryptoService.decrypt(setting.bot_token);
      if (decryptedToken) {
        await registerBot(setting.user_id, decryptedToken);
      }
    }
    console.log('All active Telegram bots loaded.');
  } catch (err) {
    console.error('Error during Telegram bots initialization:', err);
  }
}

/**
 * Send an Uptime/Downtime notification to a specific chat ID.
 * Uses the user's running bot instance.
 * @param {number} userId - Owner user ID.
 * @param {string} chatId - Target Telegram Chat ID.
 * @param {string} message - Message body.
 */
async function sendAlertNotification(userId, chatId, message) {
  const botInstance = activeBots.get(userId);
  if (!botInstance) {
    console.warn(`No active Telegram Bot registered for User ID ${userId}. Cannot send alert.`);
    return;
  }
  if (!chatId) {
    console.warn(`No Telegram Chat ID configured for the monitor of User ID ${userId}.`);
    return;
  }

  try {
    await botInstance.telegram.sendMessage(chatId, message, {
      parse_mode: 'Markdown',
      disable_web_page_preview: true
    });
    console.log(`Alert notification sent via Bot to Chat ID ${chatId} for User ID ${userId}`);
  } catch (err) {
    console.error(`Failed to send alert via bot to Chat ID ${chatId} for User ID ${userId}:`, err.message);
  }
}

module.exports = {
  initBots,
  registerBot,
  unregisterBot,
  sendAlertNotification
};
