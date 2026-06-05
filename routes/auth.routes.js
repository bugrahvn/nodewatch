const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/db');

// GET: Render Login Page
router.get('/login', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', {
    error: req.query.error || null,
    success: req.query.success || null
  });
});

// POST: Handle Login Submission
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.redirect('/auth/login?error=Lütfen tüm alanları doldurunuz.');
  }

  try {
    const [users] = await db.pool.query('SELECT * FROM users WHERE username = ?', [username.trim().toLowerCase()]);
    
    if (users.length === 0) {
      return res.redirect('/auth/login?error=Hatalı kullanıcı adı veya şifre.');
    }

    const user = users[0];
    const match = await bcrypt.compare(password, user.password);

    if (!match) {
      return res.redirect('/auth/login?error=Hatalı kullanıcı adı veya şifre.');
    }

    // Set user details in session
    req.session.user = {
      id: user.id,
      username: user.username,
      role: user.role,
      monitor_limit: user.monitor_limit
    };

    res.redirect('/dashboard');
  } catch (err) {
    console.error('Login database error:', err);
    res.redirect('/auth/login?error=Bir sunucu hatası oluştu. Lütfen tekrar deneyin.');
  }
});

// GET: Render Register Page
router.get('/register', (req, res) => {
  if (req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('register', {
    error: req.query.error || null
  });
});

// POST: Handle Registration
router.post('/register', async (req, res) => {
  const { username, password, passwordConfirm } = req.body;

  if (!username || !password || !passwordConfirm) {
    return res.redirect('/auth/register?error=Lütfen tüm alanları doldurunuz.');
  }

  if (password !== passwordConfirm) {
    return res.redirect('/auth/register?error=Şifreler eşleşmiyor.');
  }

  if (password.length < 6) {
    return res.redirect('/auth/register?error=Şifre en az 6 karakter olmalıdır.');
  }

  const sanitizedUsername = username.trim().toLowerCase();

  try {
    // Check if user already exists
    const [existing] = await db.pool.query('SELECT id FROM users WHERE username = ?', [sanitizedUsername]);
    if (existing.length > 0) {
      return res.redirect('/auth/register?error=Kullanıcı adı zaten alınmış.');
    }

    // Determine role (first registered user is automatically superadmin)
    const [[{ count }]] = await db.pool.query('SELECT COUNT(*) as count FROM users');
    const role = count === 0 ? 'superadmin' : 'user';
    const defaultLimit = parseInt(process.env.DEFAULT_MONITOR_LIMIT) || 5;
    const limit = role === 'superadmin' ? 999 : defaultLimit;

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Insert user
    await db.pool.query(
      'INSERT INTO users (username, password, role, monitor_limit) VALUES (?, ?, ?, ?)',
      [sanitizedUsername, hashedPassword, role, limit]
    );

    res.redirect('/auth/login?success=Hesabınız başarıyla oluşturuldu! Şimdi giriş yapabilirsiniz.');
  } catch (err) {
    console.error('Registration database error:', err);
    res.redirect('/auth/register?error=Bir hata oluştu. Lütfen tekrar deneyin.');
  }
});

// GET: Logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Logout session destroy error:', err);
    }
    res.redirect('/auth/login');
  });
});

module.exports = router;
