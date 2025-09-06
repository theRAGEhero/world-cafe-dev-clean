const crypto = require('crypto');

class PasswordUtils {
    /**
     * Generate a secure random password
     * @param {number} length - Password length (default: 8)
     * @returns {string} Generated password
     */
    static generatePassword(length = 8) {
        const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excluding confusing chars (0,O,I,1)
        let password = '';
        
        for (let i = 0; i < length; i++) {
            const randomIndex = crypto.randomInt(0, charset.length);
            password += charset[randomIndex];
        }
        
        return password;
    }

    /**
     * Hash a password using crypto
     * @param {string} password - Plain text password
     * @returns {string} Hashed password
     */
    static hashPassword(password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    }

    /**
     * Verify a password against a hash
     * @param {string} password - Plain text password
     * @param {string} hash - Stored hash
     * @returns {boolean} Match result
     */
    static verifyPassword(password, hash) {
        const inputHash = this.hashPassword(password);
        return inputHash === hash;
    }

    /**
     * Detect what type of code/password was entered
     * @param {string} input - User input
     * @returns {Object} Detection result
     */
    static detectInputType(input) {
        if (!input || typeof input !== 'string') {
            return { type: 'invalid', input: input };
        }

        const trimmed = input.trim();

        // UUID format (session code): xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (uuidRegex.test(trimmed)) {
            return { type: 'session_code', input: trimmed };
        }

        // Table code format: sessionId/table/N (from QR codes)
        const tableCodeRegex = /^[0-9a-f-]+\/table\/\d+$/i;
        if (tableCodeRegex.test(trimmed)) {
            return { type: 'table_code', input: trimmed };
        }

        // Password format: 6-12 uppercase chars/numbers
        const passwordRegex = /^[A-Z0-9]{6,12}$/;
        if (passwordRegex.test(trimmed)) {
            return { type: 'password', input: trimmed };
        }

        // If none match, treat as potential password (case insensitive)
        return { type: 'password', input: trimmed.toUpperCase() };
    }
}

module.exports = PasswordUtils;