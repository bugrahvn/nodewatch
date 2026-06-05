const mysql = require('mysql2/promise');
require('dotenv').config();

const {
  DB_HOST,
  DB_PORT,
  DB_USER,
  DB_PASSWORD,
  DB_NAME
} = process.env;

let pool = null;

async function initDb() {
  // 1. First connect without a database to create the database if it doesn't exist
  const connection = await mysql.createConnection({
    host: DB_HOST || 'localhost',
    port: DB_PORT || 3306,
    user: DB_USER || 'root',
    password: DB_PASSWORD || ''
  });

  await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME || 'nodewatch'}\`;`);
  await connection.end();

  // 2. Initialize the global pool with the database name
  pool = mysql.createPool({
    host: DB_HOST || 'localhost',
    port: DB_PORT || 3306,
    user: DB_USER || 'root',
    password: DB_PASSWORD || '',
    database: DB_NAME || 'nodewatch',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });

  console.log('Database connection pool established.');

  // 3. Create tables sequentially due to foreign key constraints
  const createUsersTable = `
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(255) NOT NULL UNIQUE,
      password VARCHAR(255) NOT NULL,
      role ENUM('user', 'superadmin') DEFAULT 'user',
      monitor_limit INT DEFAULT 5,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB;
  `;

  const createMonitorsTable = `
    CREATE TABLE IF NOT EXISTS monitors (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      name VARCHAR(255) NOT NULL,
      url VARCHAR(255) NOT NULL,
      check_interval INT DEFAULT 5,
      telegram_chat_id VARCHAR(255),
      last_status ENUM('UP', 'DOWN', 'UNKNOWN') DEFAULT 'UNKNOWN',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;

  const createPingsTable = `
    CREATE TABLE IF NOT EXISTS pings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      monitor_id INT NOT NULL,
      response_time INT,
      status ENUM('UP', 'DOWN') NOT NULL,
      checked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (monitor_id) REFERENCES monitors(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;

  const createTelegramSettingsTable = `
    CREATE TABLE IF NOT EXISTS telegram_settings (
      id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL UNIQUE,
      bot_token TEXT NOT NULL,
      chat_id VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB;
  `;

  await pool.query(createUsersTable);
  await pool.query(createMonitorsTable);
  await pool.query(createPingsTable);
  await pool.query(createTelegramSettingsTable);

  console.log('Database tables verified/created successfully.');

  // 4. Check if a default Superadmin needs to be created from .env
  const { SUPERADMIN_USERNAME, SUPERADMIN_PASSWORD } = process.env;
  if (SUPERADMIN_USERNAME && SUPERADMIN_PASSWORD) {
    try {
      const bcrypt = require('bcryptjs');
      const sanitizedUsername = SUPERADMIN_USERNAME.trim().toLowerCase();
      
      const [existing] = await pool.query('SELECT id FROM users WHERE username = ?', [sanitizedUsername]);
      if (existing.length === 0) {
        const hashedPassword = await bcrypt.hash(SUPERADMIN_PASSWORD, 10);
        await pool.query(
          'INSERT INTO users (username, password, role, monitor_limit) VALUES (?, ?, ?, ?)',
          [sanitizedUsername, hashedPassword, 'superadmin', 999]
        );
        console.log(`Default Superadmin account "${sanitizedUsername}" created successfully.`);
      } else {
        console.log(`Default Superadmin account "${sanitizedUsername}" already exists.`);
      }
    } catch (adminErr) {
      console.error('Failed to create default Superadmin account:', adminErr.message);
    }
  }
}

// Export a proxy object so we can access pool after initDb runs
module.exports = {
  initDb,
  get pool() {
    if (!pool) {
      throw new Error('Database pool not initialized. Call initDb() first.');
    }
    return pool;
  }
};
