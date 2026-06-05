const cron = require('node-cron');
const axios = require('axios');
const telegramService = require('./telegram.service');

let cronJob = null;

/**
 * Perform a single ping check on a monitor URL.
 * @param {object} monitor - Monitor metadata.
 */
async function pingMonitor(monitor) {
  const { pool } = require('../config/db');
  const startTime = Date.now();
  let status = 'UP';
  let responseTime = 0;

  try {
    const response = await axios.get(monitor.url, {
      timeout: 5000,
      headers: {
        'User-Agent': 'NodeWatch Uptime Monitor (+https://nodewatch.io)'
      },
      validateStatus: (status) => status >= 200 && status < 400
    });

    responseTime = Date.now() - startTime;
    status = 'UP';
  } catch (error) {
    status = 'DOWN';
    responseTime = error.code === 'ECONNABORTED' ? null : (Date.now() - startTime);
  }

  try {
    // 1. Record ping entry
    await pool.query(
      'INSERT INTO pings (monitor_id, response_time, status) VALUES (?, ?, ?)',
      [monitor.id, responseTime, status]
    );

    // 2. Check for state transition
    const previousStatus = monitor.last_status;
    
    // Update the monitor's last status in the database
    await pool.query('UPDATE monitors SET last_status = ? WHERE id = ?', [status, monitor.id]);

    if (previousStatus !== 'UNKNOWN' && previousStatus !== status) {
      // Status has transitioned (UP ⇄ DOWN). Dispatch Telegram notification!
      const timeStr = new Date().toLocaleString('tr-TR');
      let message = '';

      if (status === 'DOWN') {
        message = 
          `🚨 *NodeWatch Kesinti Bildirimi!*\n\n` +
          `🖥️ *Site:* ${monitor.name}\n` +
          `🔗 *URL:* ${monitor.url}\n` +
          `🔴 *Durum:* DOWN (Çevrimdışı)\n` +
          `📅 *Zaman:* ${timeStr}\n\n` +
          `⚠️ Siteye erişim sağlanamadı veya sunucu hatası alındı. Lütfen kontrol edin.`;
      } else {
        message = 
          `✅ *NodeWatch Düzeltme Bildirimi!*\n\n` +
          `🖥️ *Site:* ${monitor.name}\n` +
          `🔗 *URL:* ${monitor.url}\n` +
          `🟢 *Durum:* UP (Çevrimiçi)\n` +
          `⚡ *Yanıt Süresi:* \`${responseTime}ms\`\n` +
          `📅 *Zaman:* ${timeStr}\n\n` +
          `💚 Servisiniz tekrar çevrimiçi duruma geldi.`;
      }

      await telegramService.sendAlertNotification(monitor.user_id, monitor.telegram_chat_id, message);
    }
  } catch (dbErr) {
    console.error(`Database operations failed for monitor check on ID ${monitor.id}:`, dbErr.message);
  }
}

/**
 * Scan all active monitors and perform check if they are due.
 */
async function checkAllMonitors() {
  try {
    const { pool } = require('../config/db');
    // Fetch monitors with their latest ping timestamp
    const query = `
      SELECT m.*, MAX(p.checked_at) as last_checked
      FROM monitors m
      LEFT JOIN pings p ON m.id = p.monitor_id
      GROUP BY m.id;
    `;
    const [monitors] = await pool.query(query);

    for (const monitor of monitors) {
      const lastCheckedTime = monitor.last_checked;
      const minutesSinceCheck = lastCheckedTime
        ? (Date.now() - new Date(lastCheckedTime).getTime()) / (1000 * 60)
        : Infinity;

      // Check if the monitor is due for a ping check (based on its interval)
      if (minutesSinceCheck >= monitor.check_interval - 0.1) {
        // Run ping asynchronously (don't block the loop)
        pingMonitor(monitor).catch((err) => {
          console.error(`Error during ping for Monitor ${monitor.name}:`, err.message);
        });
      }
    }
  } catch (err) {
    console.error('Failed to run monitor check iteration:', err.message);
  }
}

/**
 * Start the background cron monitoring system (Runs every 1 minute).
 */
function startCron() {
  if (cronJob) return;

  // Run immediately on boot to handle startup checks
  checkAllMonitors();

  // Schedule to run every 1 minute
  cronJob = cron.schedule('* * * * *', () => {
    console.log('Cron running check iteration at:', new Date().toLocaleTimeString('tr-TR'));
    checkAllMonitors();
  });

  console.log('Uptime Monitor background cron started.');
}

/**
 * Stop the background cron monitoring system.
 */
function stopCron() {
  if (cronJob) {
    cronJob.stop();
    cronJob = null;
    console.log('Uptime Monitor background cron stopped.');
  }
}

module.exports = {
  startCron,
  stopCron,
  pingMonitor
};
