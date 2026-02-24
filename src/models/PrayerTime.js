const mongoose = require("mongoose");

const prayerTimeSchema = new mongoose.Schema(
  {
    user_id: { type: Number, required: true },
    date: { type: String, required: true }, // Format: YYYY-MM-DD
    fajr_time: { type: String, required: true },
    dhuhr_time: { type: String, required: true },
    asr_time: { type: String, required: true },
    maghrib_time: { type: String, required: true },
    isha_time: { type: String, required: true },
  },
  {
    timestamps: { createdAt: "created_at" }, // prayer_times table had created_at
  },
);

// Compound index for unique records per user per day
prayerTimeSchema.index({ user_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("PrayerTime", prayerTimeSchema);
