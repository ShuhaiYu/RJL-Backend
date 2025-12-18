/**
 * Token Generator Utility
 *
 * Generates secure tokens for booking links.
 */

const crypto = require('crypto');

/**
 * Generate a secure booking token
 * @returns {string} 64-character hex string
 */
function generateBookingToken() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Get token expiry date (14 days from now)
 * @returns {Date} Expiry date
 */
function getTokenExpiryDate() {
  const date = new Date();
  date.setDate(date.getDate() + 14);
  return date;
}

/**
 * Check if a token is expired
 * @param {Date} expiryDate - The expiry date to check
 * @returns {boolean} True if expired
 */
function isTokenExpired(expiryDate) {
  return new Date() > new Date(expiryDate);
}

module.exports = {
  generateBookingToken,
  getTokenExpiryDate,
  isTokenExpired,
};
