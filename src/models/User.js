const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    telegram_id: { type: Number, required: true, unique: true },
    username: { type: String },
    first_name: { type: String },
    timezone: { type: String, default: "Asia/Tashkent" },
    city: { type: String, default: "Tashkent" },
    country: { type: String, default: "UZ" },
    is_blocked: { type: Boolean, default: false },
    last_activity_update_at: { type: Date, default: Date.now },
  },
  {
    timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
  },
);

module.exports = mongoose.model("User", userSchema);
