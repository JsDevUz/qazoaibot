const Database = require('./database');

class UserService {
    constructor(db) {
        this.db = db;
    }

    async createUser(telegramId, username, firstName) {
        const query = `
            INSERT OR REPLACE INTO users (telegram_id, username, first_name)
            VALUES (?, ?, ?)
        `;
        try {
            await this.db.run(query, [telegramId, username, firstName]);
            return await this.getUser(telegramId);
        } catch (error) {
            console.error('Error creating user:', error);
            throw error;
        }
    }

    async getUser(telegramId) {
        const query = 'SELECT * FROM users WHERE telegram_id = ?';
        try {
            return await this.db.get(query, [telegramId]);
        } catch (error) {
            console.error('Error getting user:', error);
            throw error;
        }
    }

    async updateUserTimezone(telegramId, timezone, city, country) {
        const query = `
            UPDATE users 
            SET timezone = ?, city = ?, country = ?, updated_at = CURRENT_TIMESTAMP
            WHERE telegram_id = ?
        `;
        try {
            await this.db.run(query, [timezone, city, country, telegramId]);
            return await this.getUser(telegramId);
        } catch (error) {
            console.error('Error updating user timezone:', error);
            throw error;
        }
    }

    async getAllUsers() {
        const query = 'SELECT * FROM users';
        try {
            return await this.db.all(query);
        } catch (error) {
            console.error('Error getting all users:', error);
            throw error;
        }
    }
}

module.exports = UserService;
