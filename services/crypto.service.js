const crypto = require('crypto');
require('dotenv').config();

const ALGORITHM = 'aes-256-cbc';
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ENCRYPTION_IV = process.env.ENCRYPTION_IV;

if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 32) {
  throw new Error('ENCRYPTION_KEY environment variable must be exactly 32 characters long.');
}

if (!ENCRYPTION_IV || ENCRYPTION_IV.length !== 16) {
  throw new Error('ENCRYPTION_IV environment variable must be exactly 16 characters long.');
}

/**
 * Encrypt a plain text string to hex format.
 * @param {string} text - Plain text to encrypt.
 * @returns {string} - Hex encoded encrypted string.
 */
function encrypt(text) {
  if (!text) return '';
  const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), Buffer.from(ENCRYPTION_IV));
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

/**
 * Decrypt a hex encoded encrypted string back to plain text.
 * @param {string} encryptedText - Encrypted hex string.
 * @returns {string} - Decrypted plain text.
 */
function decrypt(encryptedText) {
  if (!encryptedText) return '';
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY), Buffer.from(ENCRYPTION_IV));
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('Decryption failed. Please check your ENCRYPTION_KEY and ENCRYPTION_IV.', error.message);
    return '';
  }
}

module.exports = {
  encrypt,
  decrypt
};
