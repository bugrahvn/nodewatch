const express = require('express');
const router = express.Router();
const db = require('../config/db');
const pool = {
  query: (...args) => db.pool.query(...args)
};
const { isAuthenticated, isSuperAdmin } = require('../middleware/auth');

// Apply both isAuthenticated and isSuperAdmin middlewares to protect all admin endpoints
router.use(isAuthenticated, isSuperAdmin);

// GET: Render Superadmin Panel
router.get('/', async (req, res) => {
  try {
    // 1. Fetch global system stats
    const [[{ total_users }]] = await pool.query('SELECT COUNT(*) as total_users FROM users');
    const [[{ total_monitors }]] = await pool.query('SELECT COUNT(*) as total_monitors FROM monitors');
    const [[{ total_bots }]] = await pool.query('SELECT COUNT(*) as total_bots FROM telegram_settings');

    const [[{ avg_uptime }]] = await pool.query(`
      SELECT IFNULL(ROUND((SUM(CASE WHEN status = 'UP' THEN 1 ELSE 0 END) / COUNT(*)) * 100, 1), 100.0) as avg_uptime
      FROM pings;
    `);

    // 2. Fetch all users in the system with their active monitor counts and Telegram configurations
    const usersQuery = `
      SELECT u.id, u.username, u.role, u.monitor_limit, u.created_at,
             (SELECT COUNT(*) FROM monitors WHERE user_id = u.id) as monitor_count,
             IF((SELECT COUNT(*) FROM telegram_settings WHERE user_id = u.id) > 0, 1, 0) as has_telegram
      FROM users u
      ORDER BY u.id DESC;
    `;
    const [usersList] = await pool.query(usersQuery);

    res.render('admin', {
      user: req.session.user,
      usersList,
      stats: {
        total_users,
        total_monitors,
        total_bots,
        avg_uptime
      },
      error: req.query.error || null,
      success: req.query.success || null
    });
  } catch (err) {
    console.error('Error loading admin page:', err);
    res.status(500).send('Admin paneli yüklenirken sunucu hatası oluştu.');
  }
});

// POST: Update User Monitor Limit
router.post('/users/:id/limit', async (req, res) => {
  const userId = req.params.id;
  const { monitor_limit } = req.body;

  const parsedLimit = parseInt(monitor_limit);
  if (isNaN(parsedLimit) || parsedLimit < 1) {
    return res.redirect('/admin?error=Geçersiz limit değeri.');
  }

  try {
    // Make sure we are not updating a superadmin's limit if that is not allowed,
    // or just execute it. (Updating it is perfectly fine)
    await pool.query('UPDATE users SET monitor_limit = ? WHERE id = ?', [parsedLimit, userId]);
    
    res.redirect(`/admin?success=Kullanıcı limiti başarıyla ${parsedLimit} olarak güncellendi.`);
  } catch (err) {
    console.error('Error updating user limit:', err);
    res.redirect('/admin?error=Kullanıcı limiti güncellenirken veritabanı hatası.');
  }
});

module.exports = router;
