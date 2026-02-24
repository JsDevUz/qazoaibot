const mongoose = require("mongoose");

const qazoCountSchema = new mongoose.Schema(
  {
    user_id: { type: Number, required: true, unique: true },
    fajr_count: { type: Number, default: 0 },
    dhuhr_count: { type: Number, default: 0 },
    asr_count: { type: Number, default: 0 },
    maghrib_count: { type: Number, default: 0 },
    isha_count: { type: Number, default: 0 },
    total_count: { type: Number, default: 0 },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

module.exports = mongoose.model("QazoCount", qazoCountSchema);
