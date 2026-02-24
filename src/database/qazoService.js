const User = require("../models/User");
const QazoCount = require("../models/QazoCount");

class QazoService {
  // Constructor no longer needs db instance passed down
  constructor() {
    this.prayers = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  }

  async getOrCreateQazoCount(telegramId) {
    try {
      const qazo = await QazoCount.findOneAndUpdate(
        { user_id: telegramId },
        {
          $setOnInsert: {
            user_id: telegramId,
            total_count: 0,
            fajr_count: 0,
            dhuhr_count: 0,
            asr_count: 0,
            maghrib_count: 0,
            isha_count: 0,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );

      return qazo;
    } catch (error) {
      console.error("Error getting/creating qazo count:", error);
      throw error;
    }
  }

  async addQazo(telegramId, prayerName) {
    const user = await User.findOne({ telegram_id: telegramId });

    if (!user) {
      throw new Error("User not found in database");
    }

    try {
      const updateField = {};
      updateField[`${prayerName}_count`] = 1;
      updateField["total_count"] = 1;

      const qazo = await QazoCount.findOneAndUpdate(
        { user_id: telegramId },
        { $inc: updateField },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      return qazo;
    } catch (error) {
      console.error("Error adding qazo:", error);
      throw error;
    }
  }

  async getQazoSummary(telegramId) {
    const user = await User.findOne({ telegram_id: telegramId });

    if (!user) {
      throw new Error("User not found in database");
    }

    const qazo = await this.getOrCreateQazoCount(telegramId);
    const summary = {
      total: qazo.total_count,
      details: {},
    };

    for (const prayer of this.prayers) {
      summary.details[prayer] = qazo[`${prayer}_count`] || 0;
    }

    console.log(`Qazo summary for user ${telegramId}:`, summary);
    return summary;
  }

  async resetQazo(telegramId) {
    const user = await User.findOne({ telegram_id: telegramId });

    if (!user) {
      throw new Error("User not found in database");
    }

    try {
      const qazo = await QazoCount.findOneAndUpdate(
        { user_id: telegramId },
        {
          fajr_count: 0,
          dhuhr_count: 0,
          asr_count: 0,
          maghrib_count: 0,
          isha_count: 0,
          total_count: 0,
        },
        { new: true },
      );
      return qazo || (await this.getOrCreateQazoCount(telegramId));
    } catch (error) {
      console.error("Error resetting qazo:", error);
      throw error;
    }
  }
}

module.exports = QazoService;
