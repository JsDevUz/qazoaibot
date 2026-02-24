const PrayerRecord = require("../models/PrayerRecord");
const PrayerTime = require("../models/PrayerTime");

class PrayerService {
  // Constructor no longer needs db instance passed down
  constructor() {
    this.prayers = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
  }

  async getOrCreatePrayerRecord(telegramId, date) {
    try {
      const record = await PrayerRecord.findOneAndUpdate(
        { user_id: telegramId, date: date },
        {
          $setOnInsert: {
            user_id: telegramId,
            date: date,
            fajr_status: "pending",
            dhuhr_status: "pending",
            asr_status: "pending",
            maghrib_status: "pending",
            isha_status: "pending",
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      return record;
    } catch (error) {
      console.error("Error getting/creating prayer record:", error);
      throw error;
    }
  }

  async updatePrayerStatus(telegramId, date, prayerName, status) {
    try {
      const updateField = {};
      updateField[`${prayerName}_status`] = status;

      const record = await PrayerRecord.findOneAndUpdate(
        { user_id: telegramId, date: date },
        { $set: updateField },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      );
      return record;
    } catch (error) {
      console.error("Error updating prayer status:", error);
      throw error;
    }
  }

  async getTodayPrayerRecord(telegramId) {
    const today = new Date().toISOString().split("T")[0];
    return await this.getOrCreatePrayerRecord(telegramId, today);
  }

  async getPendingPrayers(telegramId, date) {
    const record = await this.getOrCreatePrayerRecord(telegramId, date);
    const pending = [];

    for (const prayer of this.prayers) {
      if (record[`${prayer}_status`] === "pending") {
        pending.push(prayer);
      }
    }

    return pending;
  }

  async savePrayerTimes(telegramId, date, times) {
    try {
      await PrayerTime.findOneAndUpdate(
        { user_id: telegramId, date: date },
        {
          fajr_time: times.fajr,
          dhuhr_time: times.dhuhr,
          asr_time: times.asr,
          maghrib_time: times.maghrib,
          isha_time: times.isha,
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
    } catch (error) {
      console.error("Error saving prayer times:", error);
      throw error;
    }
  }

  async getPrayerTimes(telegramId, date) {
    try {
      return await PrayerTime.findOne({ user_id: telegramId, date: date });
    } catch (error) {
      console.error("Error getting prayer times:", error);
      throw error;
    }
  }
}

module.exports = PrayerService;
