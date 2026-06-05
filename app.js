require('dotenv').config();
const express = require('express');
const session = require('express-session');
const db = require('./config/db');
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const adminRoutes = require('./routes/admin.routes');
const telegramService = require('./services/telegram.service');
const cronService = require('./services/cron.service');

const app = express();

// Set EJS as the template engine
app.set('view engine', 'ejs');

// Parse requests
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Session Middleware
app.use(session({
  secret: process.env.SESSION_SECRET || 'nodewatch_super_secret_session_key_123',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    secure: false // Set to true if running behind HTTPS in production
  }
}));

// Global user session helper for views
app.use((req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
});

// Route Definitions
app.get('/', (req, res) => {
  res.redirect('/dashboard');
});

app.use('/auth', authRoutes);
app.use('/', userRoutes);
app.use('/admin', adminRoutes);

// 404 Handler
app.use((req, res, next) => {
  res.status(404).render('login', {
    error: 'Aradığınız sayfa bulunamadı.',
    success: null
  });
});

// 500 Handler
app.use((err, req, res, next) => {
  console.error('Unhandled application error:', err);
  res.status(500).send('Sunucuda beklenmeyen bir hata oluştu.');
});

// Bootstrap application, database tables, and cron/bot services
async function bootstrap() {
  try {
    // 1. Initialize MySQL database and tables
    await db.initDb();

    // 2. Initialize and load active Telegram Bots
    await telegramService.initBots();

    // 3. Start background Uptime Pinger
    cronService.startCron();

    // 4. Start HTTP Server
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`\n======================================================`);
      console.log(`NodeWatch Uptime Monitor is running at: http://localhost:${PORT}`);
      console.log(`======================================================\n`);
    });
  } catch (err) {
    console.error('Fatal error during application startup:', err);
    process.exit(1);
  }
}

bootstrap();
