const express = require('express');
const router = express.Router();
const db = require('../config/db');
const pool = {
  query: (...args) => db.pool.query(...args)
};
const { isAuthenticated } = require('../middleware/auth');
const cryptoService = require('../services/crypto.service');
const telegramService = require('../services/telegram.service');
const cronService = require('../services/cron.service');

// Apply isAuthenticated middleware to all user routes
router.use(isAuthenticated);

// GET: Render User Dashboard
router.get('/dashboard', async (req, res) => {
  const userId = req.session.user.id;

  try {
    // 1. Fetch user monitor limit
    const [[userLimitRow]] = await pool.query('SELECT username, role, monitor_limit FROM users WHERE id = ?', [userId]);
    
    // Update session data to keep it fresh
    req.session.user.monitor_limit = userLimitRow.monitor_limit;
    req.session.user.role = userLimitRow.role;

    // 2. Fetch monitors with latest ping and uptime counts
    const monitorsQuery = `
      SELECT m.*,
             (SELECT response_time FROM pings WHERE monitor_id = m.id ORDER BY checked_at DESC LIMIT 1) as last_ping,
             (SELECT COUNT(*) FROM pings WHERE monitor_id = m.id AND status = 'UP') as up_count,
             (SELECT COUNT(*) FROM pings WHERE monitor_id = m.id) as total_count
      FROM monitors m
      WHERE m.user_id = ?;
    `;
    const [monitors] = await pool.query(monitorsQuery, [userId]);

    // Fetch last 30 pings for each monitor to display history bars
    for (const monitor of monitors) {
      const [pingRows] = await pool.query(
        'SELECT status FROM pings WHERE monitor_id = ? ORDER BY checked_at DESC LIMIT 30',
        [monitor.id]
      );
      monitor.history = pingRows.reverse().map(p => p.status.toLowerCase());
      while (monitor.history.length < 30) {
        monitor.history.unshift('unknown');
      }
    }

    // 3. Fetch Telegram settings
    const [telegramRows] = await pool.query('SELECT bot_token, chat_id FROM telegram_settings WHERE user_id = ?', [userId]);
    let decryptedBotToken = '';
    let chatId = '';

    if (telegramRows.length > 0) {
      chatId = telegramRows[0].chat_id || '';
      if (telegramRows[0].bot_token) {
        decryptedBotToken = cryptoService.decrypt(telegramRows[0].bot_token);
      }
    }

    res.render('dashboard', {
      user: {
        id: userId,
        username: userLimitRow.username,
        role: userLimitRow.role,
        monitor_limit: userLimitRow.monitor_limit
      },
      monitors,
      telegramSettings: {
        bot_token: decryptedBotToken,
        chat_id: chatId
      },
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('Error loading dashboard data:', err);
    res.status(500).send('Sunucu hatası oluştu.');
  }
});

// POST: Add Monitor
router.post('/monitors', async (req, res) => {
  const userId = req.session.user.id;
  const { name, url, check_interval, enable_telegram } = req.body;

  if (!name || !url) {
    return res.redirect('/dashboard?error=Site adı ve URL alanları zorunludur.');
  }

  try {
    // 1. Check user limit
    const [[{ count }]] = await pool.query('SELECT COUNT(*) as count FROM monitors WHERE user_id = ?', [userId]);
    const [[{ monitor_limit }]] = await pool.query('SELECT monitor_limit FROM users WHERE id = ?', [userId]);

    if (count >= monitor_limit) {
      return res.redirect(`/dashboard?error=İzleme limitinize ulaştınız (${monitor_limit} site).`);
    }

    // 2. Fetch user's default Telegram Chat ID if notifications are enabled
    let telegramChatId = null;
    let warning = '';
    if (enable_telegram === 'on') {
      const [telegramRows] = await pool.query('SELECT chat_id FROM telegram_settings WHERE user_id = ?', [userId]);
      if (telegramRows.length > 0 && telegramRows[0].chat_id) {
        telegramChatId = telegramRows[0].chat_id;
      } else {
        warning = ' (Telegram Chat ID bulunamadığı için bildirimler devre dışı bırakıldı)';
      }
    }

    // 3. Insert monitor
    const [result] = await pool.query(
      'INSERT INTO monitors (user_id, name, url, check_interval, telegram_chat_id, last_status) VALUES (?, ?, ?, ?, ?, ?)',
      [userId, name.trim(), url.trim(), parseInt(check_interval) || 5, telegramChatId, 'UNKNOWN']
    );

    // 4. Trigger immediate check in background
    const insertedId = result.insertId;
    const [[monitorObj]] = await pool.query('SELECT * FROM monitors WHERE id = ?', [insertedId]);
    cronService.pingMonitor(monitorObj).catch(err => console.error('Immediate check error:', err));

    res.redirect(`/dashboard?success=Yeni site başarıyla eklendi ve izleme başlatıldı.${warning}`);
  } catch (err) {
    console.error('Error adding monitor:', err);
    res.redirect('/dashboard?error=Site eklenirken veritabanı hatası oluştu.');
  }
});

// POST: Edit Monitor
router.post('/monitors/:id/edit', async (req, res) => {
  const userId = req.session.user.id;
  const monitorId = req.params.id;
  const { name, url, check_interval } = req.body;

  if (!name || !url) {
    return res.redirect('/dashboard?error=Site adı ve URL alanları zorunludur.');
  }

  try {
    // Verify monitor belongs to user
    const [monitors] = await pool.query('SELECT id FROM monitors WHERE id = ? AND user_id = ?', [monitorId, userId]);
    if (monitors.length === 0) {
      return res.redirect('/dashboard?error=İzlenen site bulunamadı.');
    }

    await pool.query(
      'UPDATE monitors SET name = ?, url = ?, check_interval = ? WHERE id = ?',
      [name.trim(), url.trim(), parseInt(check_interval) || 5, monitorId]
    );

    res.redirect('/dashboard?success=Site başarıyla güncellendi.');
  } catch (err) {
    console.error('Error editing monitor:', err);
    res.redirect('/dashboard?error=Site güncellenirken hata oluştu.');
  }
});

// POST: Delete Monitor
router.post('/monitors/:id/delete', async (req, res) => {
  const userId = req.session.user.id;
  const monitorId = req.params.id;

  try {
    const [monitors] = await pool.query('SELECT id FROM monitors WHERE id = ? AND user_id = ?', [monitorId, userId]);
    if (monitors.length === 0) {
      return res.redirect('/dashboard?error=İzlenen site bulunamadı.');
    }

    await pool.query('DELETE FROM monitors WHERE id = ?', [monitorId]);
    res.redirect('/dashboard?success=Site izleme listesinden silindi.');
  } catch (err) {
    console.error('Error deleting monitor:', err);
    res.redirect('/dashboard?error=Site silinirken hata oluştu.');
  }
});

// POST: Save/Update Telegram Settings
router.post('/telegram/settings', async (req, res) => {
  const userId = req.session.user.id;
  const { bot_token, chat_id } = req.body;

  if (!bot_token || !chat_id) {
    return res.redirect('/dashboard?error=Bot Token ve Chat ID alanları zorunludur.');
  }

  try {
    // Encrypt bot token
    const encryptedToken = cryptoService.encrypt(bot_token.trim());

    // Check if settings already exist
    const [existing] = await pool.query('SELECT id FROM telegram_settings WHERE user_id = ?', [userId]);

    if (existing.length > 0) {
      await pool.query(
        'UPDATE telegram_settings SET bot_token = ?, chat_id = ? WHERE user_id = ?',
        [encryptedToken, chat_id.trim(), userId]
      );
    } else {
      await pool.query(
        'INSERT INTO telegram_settings (user_id, bot_token, chat_id) VALUES (?, ?, ?)',
        [userId, encryptedToken, chat_id.trim()]
      );
    }

    // Try to spin up/register the Telegram bot dynamically
    const botStatus = await telegramService.registerBot(userId, bot_token.trim());

    if (!botStatus) {
      return res.redirect('/dashboard?error=Telegram botu başlatılamadı. Lütfen bot tokenını kontrol edin.');
    }

    // Update existing monitors with the new default chat ID if they don't have one
    await pool.query('UPDATE monitors SET telegram_chat_id = ? WHERE user_id = ? AND telegram_chat_id IS NULL', [chat_id.trim(), userId]);

    // Send a test message via Telegram
    await telegramService.sendAlertNotification(
      userId,
      chat_id.trim(),
      `🤖 *NodeWatch Telegram Bildirim Testi*\n\n` +
      `Tebrikler! Bot bağlantısı başarıyla kuruldu. Kesinti bildirimleri bu sohbete gönderilecektir.`
    );

    res.redirect('/dashboard?success=Telegram bot ayarları kaydedildi ve test mesajı gönderildi.');
  } catch (err) {
    console.error('Error updating Telegram settings:', err);
    res.redirect('/dashboard?error=Telegram ayarları kaydedilirken hata oluştu.');
  }
});

// POST: Manual Ping API (JSON response)
router.post('/monitors/:id/ping', async (req, res) => {
  const userId = req.session.user.id;
  const monitorId = req.params.id;

  try {
    const [monitors] = await pool.query('SELECT * FROM monitors WHERE id = ? AND user_id = ?', [monitorId, userId]);
    if (monitors.length === 0) {
      return res.status(404).json({ error: 'Site bulunamadı.' });
    }

    const monitor = monitors[0];
    
    // We reuse pingMonitor logic directly to get real-time status and response time
    const axios = require('axios');
    const startTime = Date.now();
    let status = 'UP';
    let responseTime = 0;

    try {
      await axios.get(monitor.url, {
        timeout: 5000,
        headers: { 'User-Agent': 'NodeWatch Manual Pinger' },
        validateStatus: (status) => status >= 200 && status < 400
      });
      responseTime = Date.now() - startTime;
    } catch (err) {
      status = 'DOWN';
      responseTime = null;
    }

    // Write manual ping to DB as well
    await pool.query(
      'INSERT INTO pings (monitor_id, response_time, status) VALUES (?, ?, ?)',
      [monitor.id, responseTime, status]
    );

    // Update last status
    await pool.query('UPDATE monitors SET last_status = ? WHERE id = ?', [status, monitor.id]);

    res.json({
      success: true,
      status,
      response_time: responseTime
    });
  } catch (err) {
    console.error('Manual ping error:', err);
    res.status(500).json({ error: 'Manual ping check failed.' });
  }
});

// GET: Fetch last 24 pings for Chart.js API
router.get('/api/pings/:monitorId', async (req, res) => {
  const userId = req.session.user.id;
  const monitorId = req.params.monitorId;

  try {
    // Ensure monitor belongs to user
    const [monitors] = await pool.query('SELECT id FROM monitors WHERE id = ? AND user_id = ?', [monitorId, userId]);
    if (monitors.length === 0) {
      return res.status(403).json({ error: 'Yetkisiz erişim.' });
    }

    const query = `
      SELECT response_time, status, checked_at 
      FROM pings 
      WHERE monitor_id = ? 
      ORDER BY checked_at DESC 
      LIMIT 24;
    `;
    const [pings] = await pool.query(query, [monitorId]);

    // Reverse to present timeline from past to present (left to right in chart)
    res.json(pings.reverse());
  } catch (err) {
    console.error('Error fetching ping history:', err);
    res.status(500).json({ error: 'Tepki geçmişi yüklenirken hata oluştu.' });
  }
});

module.exports = router;
