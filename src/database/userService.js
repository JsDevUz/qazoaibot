const User = require("../models/User");

class UserService {
  // Constructor no longer needs db instance passed down if we're using Mongoose globally
  constructor() {}

  async createUser(telegramId, username, firstName) {
    try {
      const user = await User.findOneAndUpdate(
        { telegram_id: telegramId },
        {
          username,
          first_name: firstName,
          is_blocked: false,
          last_activity_update_at: new Date(),
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      return user;
    } catch (error) {
      console.error("Error creating user:", error);
      throw error;
    }
  }

  async getUser(telegramId) {
    try {
      return await User.findOne({ telegram_id: telegramId });
    } catch (error) {
      console.error("Error getting user:", error);
      throw error;
    }
  }

  async updateUserTimezone(telegramId, timezone, city, country) {
    try {
      return await User.findOneAndUpdate(
        { telegram_id: telegramId },
        { timezone, city, country },
        { new: true },
      );
    } catch (error) {
      console.error("Error updating user timezone:", error);
      throw error;
    }
  }

  async updateUserLocation(telegramId, city, timezone, country) {
    return this.updateUserTimezone(telegramId, timezone, city, country);
  }

  async getAllUsers() {
    try {
      return await User.find({});
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
    try {
      await User.updateOne(
        { telegram_id: telegramId },
        { last_activity_update_at: new Date() },
      );
    } catch (error) {
      console.error("Error updating last activity:", error);
    }
  }

  async blockUser(telegramId, blockReason = "No activity for 2 days") {
    try {
      await User.updateOne({ telegram_id: telegramId }, { is_blocked: true });
      console.log(`User ${telegramId} blocked: ${blockReason}`);
    } catch (error) {
      console.error("Error blocking user:", error);
    }
  }

  async unblockUser(telegramId) {
    try {
      await User.updateOne(
        { telegram_id: telegramId },
        { is_blocked: false, last_activity_update_at: new Date() },
      );
      console.log(`User ${telegramId} unblocked`);
    } catch (error) {
      console.error("Error unblocking user:", error);
    }
  }

  async isUserBlocked(telegramId) {
    try {
      const user = await this.getUser(telegramId);
      return user ? user.is_blocked : false;
    } catch (error) {
      console.error("Error checking if user is blocked:", error);
      return false;
    }
  }

  async getInactiveUsers(hoursThreshold = 48) {
    try {
      const thresholdDate = new Date(
        Date.now() - hoursThreshold * 60 * 60 * 1000,
      );
      return await User.find({
        last_activity_update_at: { $lt: thresholdDate },
        is_blocked: false,
      });
    } catch (error) {
      console.error("Error getting inactive users:", error);
      return [];
    }
  }
}

module.exports = UserService;
