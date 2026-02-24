const mongoose = require("mongoose");

const prayerRecordSchema = new mongoose.Schema(
  {
    user_id: { type: Number, required: true },
    date: { type: String, required: true }, // Format: YYYY-MM-DD
    fajr_status: {
      type: String,
      enum: ["pending", "read", "missed"],
      default: "pending",
    },
    dhuhr_status: {
      type: String,
      enum: ["pending", "read", "missed"],
      default: "pending",
    },
    asr_status: {
      type: String,
      enum: ["pending", "read", "missed"],
      default: "pending",
    },
    maghrib_status: {
      type: String,
      enum: ["pending", "read", "missed"],
      default: "pending",
    },
    isha_status: {
      type: String,
      enum: ["pending", "read", "missed"],
      default: "pending",
    },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

// Compound index for unique records per user per day
prayerRecordSchema.index({ user_id: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("PrayerRecord", prayerRecordSchema);
