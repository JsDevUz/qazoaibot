const Database = require("./database");

class UserService {
  constructor(db) {
    this.db = db;
  }

  async createUser(telegramId, username, firstName) {
    const query = `
            INSERT OR REPLACE INTO users (telegram_id, username, first_name, created_at, last_activity_update_at, is_blocked)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
        `;
    try {
      await this.db.run(query, [telegramId, username, firstName]);
      return await this.getUser(telegramId);
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  async getUser(telegramId) {
    const query = "SELECT * FROM users WHERE telegram_id = ?";
    try {
      return await this.db.get(query, [telegramId]);
    } catch (error) {
      console.error("Error getting user:", error);
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
      console.error("Error updating user timezone:", error);
      throw error;
    }
  }

  async updateUserLocation(telegramId, city, timezone, country) {
    const query = `
            UPDATE users 
            SET timezone = ?, city = ?, country = ?, updated_at = CURRENT_TIMESTAMP
            WHERE telegram_id = ?
        `;
    try {
      await this.db.run(query, [timezone, city, country, telegramId]);
      return await this.getUser(telegramId);
    } catch (error) {
      console.error("Error updating user location:", error);
      throw error;
    }
  }

  async getAllUsers() {
    const query = "SELECT * FROM users";
    try {
      return await this.db.all(query);
    } catch (error) {
      console.error("Error getting all users:", error);
      return [];
    }
  }

  async getUserTimezone(telegramId) {
    try {
      const user = await this.getUser(telegramId);
      return user ? user.timezone : null;
    } catch (error) {
      console.error("Error getting user timezone:", error);
      return null;
    }
  }

  async updateLastActivity(telegramId) {
    const query = `
            UPDATE users 
            SET last_activity_update_at = CURRENT_TIMESTAMP
            WHERE telegram_id = ?
        `;
    try {
      await this.db.run(query, [telegramId]);
    } catch (error) {
      console.error("Error updating last activity:", error);
    }
  }

  async blockUser(telegramId, blockReason = "No activity for 2 days") {
    const query = `
            UPDATE users 
            SET is_blocked = 1, updated_at = CURRENT_TIMESTAMP
            WHERE telegram_id = ?
        `;
    try {
      await this.db.run(query, [telegramId]);
      console.log(`User ${telegramId} blocked: ${blockReason}`);
    } catch (error) {
      console.error("Error blocking user:", error);
    }
  }

  async unblockUser(telegramId) {
    const query = `
            UPDATE users 
            SET is_blocked = 0, last_activity_update_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
            WHERE telegram_id = ?
        `;
    try {
      await this.db.run(query, [telegramId]);
      console.log(`User ${telegramId} unblocked`);
    } catch (error) {
      console.error("Error unblocking user:", error);
    }
  }

  async isUserBlocked(telegramId) {
    try {
      const user = await this.getUser(telegramId);
      return user ? user.is_blocked === 1 : false;
    } catch (error) {
      console.error("Error checking if user is blocked:", error);
      return false;
    }
  }

  async getInactiveUsers(hoursThreshold = 48) {
    const query = `
            SELECT * FROM users 
            WHERE datetime('now', '-' || ? || ' hours') > last_activity_update_at
            AND is_blocked = 0
        `;
    try {
      return await this.db.all(query, [hoursThreshold]);
    } catch (error) {
      console.error("Error getting inactive users:", error);
      return [];
    }
  }
}

module.exports = UserService;
