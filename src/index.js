require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const moment = require("moment-timezone");
const Database = require("./database/database");
const UserService = require("./database/userService");
const PrayerService = require("./database/prayerService");
const QazoService = require("./database/qazoService");
const PrayerTimesService = require("./services/prayerTimesService");
const ReminderService = require("./services/reminderService");
const PrayerTimesDisplayService = require("./services/prayerTimesDisplayService");
const QazoInputService = require("./services/qazoInputService");
const AdminService = require("./services/adminService");

class QazoBot {
  constructor() {
    this.bot = new Telegraf(process.env.BOT_TOKEN);
    this.db = new Database();
    this.userService = null;
    this.prayerService = null;
    this.qazoService = null;
    this.prayerTimesService = null;
    this.reminderService = null;
    this.prayerTimesDisplayService = null;
    this.qazoInputService = null;
    this.adminService = null;
    this.currentPrayerChecks = new Map();
    this.testTimeOffset = null; // TEST MODE: vaqt offset
  }

  // TEST MODE: .env da TEST_TIME=HH:mm deb yozsa, test vaqti boshlaydi va davom etib vaqt o'tadi
  initializeTestMode() {
    if (process.env.TEST_TIME) {
      const [testHour, testMinute] =
        process.env.TEST_TIME.split(":").map(Number);
      const testMoment = moment()
        .tz("Asia/Tashkent")
        .hour(testHour)
        .minute(testMinute)
        .second(0);
      const now = moment().tz("Asia/Tashkent");

      this.testTimeOffset = testMoment.diff(now, "milliseconds");
      console.log(`🧪 TEST MODE: Boshlang'ich vaqt = ${process.env.TEST_TIME}`);
      console.log(`🧪 Vaqt offset = ${this.testTimeOffset}ms`);
    }
  }

  // Hozirgi vaqtni olish (TEST_TIME offset bilan yoki real vaqt)
  getCurrentTime(timezone = "Asia/Tashkent", format = "HH:mm") {
    let currentMoment = moment().tz(timezone);

    if (this.testTimeOffset !== null) {
      // Test rejimida: hozirgi vaqtga offset qo'shamiz
      currentMoment = currentMoment.add(this.testTimeOffset, "milliseconds");
    }

    return currentMoment.format(format);
  }

  async initialize() {
    await this.db.connect();
    this.userService = new UserService();
    this.prayerService = new PrayerService();
    this.qazoService = new QazoService();
    this.prayerTimesService = new PrayerTimesService();
    this.reminderService = new ReminderService(
      this.bot,
      this.prayerService,
      this.qazoService,
      this.userService,
      this.prayerTimesService,
    );

    this.prayerTimesDisplayService = new PrayerTimesDisplayService(
      this.bot,
      this.prayerTimesService,
      this.userService,
    );
    this.qazoInputService = new QazoInputService(
      this.bot,
      this.qazoService,
      this.userService,
    );
    this.adminService = new AdminService(this.bot, this.userService);

    this.setupHandlers();
    this.prayerTimesDisplayService.setupHandlers();
    this.qazoInputService.setupHandlers();
    this.qazoInputService.setupConfirmationHandlers();
    await this.reminderService.start();
  }

  setupHandlers() {
    this.bot.start(async (ctx) => {
      const user = ctx.from;
      const existingUser = await this.userService.getUser(user.id);

      if (!existingUser) {
        // Yangi user - saqlaymiz va admin xabari yuboramiz
        const newUser = await this.userService.createUser(
          user.id,
          user.username,
          user.first_name,
        );
        await this.adminService.sendNewUserNotification(newUser);
      } else {
        // Mavjud user - blokni olib tashlaymiz va aktivligini yangilaymiz
        await this.userService.unblockUser(user.id);
      }

      // Avval start javobini yuboramiz
      await ctx.reply(
        "🕌 Assalomu alaykum! Qazo AI botiga xush kelibsiz!\n\n" +
          "Bu bot sizning namozlaringizni kuzatib boradi va qazo qilgan namozlaringizni hisoblaydi.\n\n" +
          "📝 Bot quyidagi funksiyalarni bajaradi:\n" +
          "• Namoz vaqtlarini eslatish\n" +
          "• Namoz o'qilganini kuzatish\n" +
          "• Qazo namozlarni hisoblash\n" +
          "• Har 10 daqiqada so'rab borish\n" +
          "• Eski qazolarni kiritish\n\n" +
          "Quyidagi tugmalardan foydalaning:",
        Markup.inlineKeyboard([
          [Markup.button.callback("📊 Qazo holati", "menu_qazo")],
          [Markup.button.callback("📅 Bugungi namozlar", "menu_today")],
          [Markup.button.callback("🕐 Namoz vaqtlari", "menu_times")],
          [Markup.button.callback("📝 Qazolarni yangilash", "menu_addqazo")],
          [Markup.button.callback("⚙️ Sozlamalar", "menu_settings")],
          [Markup.button.callback("❓ Yordam", "menu_help")],
        ]),
      );

      // Update user activity
      await this.userService.updateLastActivity(user.id);

      // Keyin pending eslatmalarni tekshiramiz
      const userTimezone = await this.userService.getUserTimezone(user.id);
      const currentTime = moment()
        .tz(userTimezone || "Asia/Tashkent")
        .format("HH:mm");

      // Faqat bugungi namozlar uchun eslatma yuboramiz
      const today = new Date().toISOString().split("T")[0];
      const todayRecord = await this.prayerService.getOrCreatePrayerRecord(
        user.id,
        today,
      );

      // Bugungi pending namozlarni tekshiramiz
      const prayers = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
      for (const prayer of prayers) {
        const status = todayRecord[`${prayer}_status`];
        if (status === "pending") {
          const times = await this.reminderService.getPrayerTimes(
            user.id,
            today,
          );
          if (times) {
            const prayerTime = moment(times[prayer], "HH:mm");
            const current = moment(currentTime, "HH:mm");

            // Vaqti o'tgan bo'lsa
            if (current.isAfter(prayerTime)) {
              // Hozirgi namozni topamiz
              const currentPrayer = this.reminderService.getCurrentPrayer(
                current,
                times,
              );

              // Agar bu hozirgi namoz bo'lsa, pending eslatma yuboramiz
              if (prayer === currentPrayer) {
                // Avvalgi pending eslatmani o'chirish
                const pendingKey = `${user.id}_${prayer}`;
                if (this.reminderService.pendingReminders.has(pendingKey)) {
                  try {
                    const messageId =
                      this.reminderService.pendingReminders.get(pendingKey);
                    await ctx.telegram.deleteMessage(user.id, messageId);
                    console.log(
                      `Deleted previous pending reminder for ${prayer}`,
                    );
                  } catch (error) {
                    console.log(
                      "Could not delete previous pending reminder:",
                      error.message,
                    );
                  }
                }
                // Avvalgi missed eslatmani o'chirish
                if (this.reminderService.missedReminders.has(pendingKey)) {
                  try {
                    const messageId =
                      this.reminderService.missedReminders.get(pendingKey);
                    await ctx.telegram.deleteMessage(user.id, messageId);
                    console.log(
                      `Deleted previous missed reminder for ${prayer}`,
                    );
                  } catch (error) {
                    console.log(
                      "Could not delete previous missed reminder:",
                      error.message,
                    );
                  }
                }

                await this.reminderService.sendPendingPrayerReminder(
                  { telegram_id: user.id },
                  prayer,
                );
              } else {
                // O'tgan namozlar uchun keyingi namoz vaqtini tekshiramiz
                const nextPrayerIndex =
                  this.reminderService.getNextPrayerIndex(prayer);
                const nextPrayer =
                  this.reminderService.getPrayerByIndex(nextPrayerIndex);

                let shouldSendMissed = false;
                if (nextPrayer) {
                  const nextPrayerTime = moment(times[nextPrayer], "HH:mm");
                  shouldSendMissed = current.isAfter(nextPrayerTime);
                } else {
                  // Isha dan keyin 23:40 gacha
                  shouldSendMissed = current.isAfter(moment("23:40", "HH:mm"));
                }

                // Avvalgi eslatmalarni o'chirish
                const pendingKey = `${user.id}_${prayer}`;
                if (this.reminderService.pendingReminders.has(pendingKey)) {
                  try {
                    const messageId =
                      this.reminderService.pendingReminders.get(pendingKey);
                    await ctx.telegram.deleteMessage(user.id, messageId);
                    console.log(
                      `Deleted previous pending reminder for ${prayer}`,
                    );
                  } catch (error) {
                    console.log(
                      "Could not delete previous pending reminder:",
                      error.message,
                    );
                  }
                }
                if (this.reminderService.missedReminders.has(pendingKey)) {
                  try {
                    const messageId =
                      this.reminderService.missedReminders.get(pendingKey);
                    await ctx.telegram.deleteMessage(user.id, messageId);
                    console.log(
                      `Deleted previous missed reminder for ${prayer}`,
                    );
                  } catch (error) {
                    //
                    console.log(
                      "Could not delete previous missed reminder:",
                      error.message,
                    );
                  }
                }

                if (shouldSendMissed) {
                  await this.reminderService.sendMissedPrayerReminder(
                    { telegram_id: user.id },
                    prayer,
                  );
                } else {
                  await this.reminderService.sendPendingPrayerReminder(
                    { telegram_id: user.id },
                    prayer,
                  );
                }
              }
            }
          }
        }
      }
    });

    this.bot.command("settings", async (ctx) => {
      // Command larni olib tashlaymiz, faqat action lar bilan ishlamiz
    });

    this.bot.command("qazo", async (ctx) => {
      // Command larni olib tashlaymiz, faqat action lar bilan ishlamiz
    });

    this.bot.command("help", async (ctx) => {
      // Command larni olib tashlaymiz, faqat action lar bilan ishlamiz
    });

    // Admin commandlari
    this.bot.command("stats", async (ctx) => {
      if (!this.adminService.isAdmin(ctx.from.id)) {
        await ctx.reply("❌ Sizda bu commandni ishlatish uchun ruxsat yo'q!");
        return;
      }
      await this.adminService.sendStatsNotification();
      await ctx.reply("📊 Statistika adminga yuborildi!");
    });

    this.bot.command("broadcast", async (ctx) => {
      if (!this.adminService.isAdmin(ctx.from.id)) {
        await ctx.reply("❌ Sizda bu commandni ishlatish uchun ruxsat yo'q!");
        return;
      }

      const message = ctx.message.text.replace("/broadcast", "").trim();
      if (!message) {
        await ctx.reply(
          "❌ Xabar matni kiritilmadi! Masalan: /broadcast Assalomu alaykum!",
        );
        return;
      }

      await ctx.reply("📢 Xabar yuborilmoqda...");
      const result = await this.adminService.sendBroadcastToAllUsers(message);
      await ctx.reply(
        `✅ Xabar muvaffaqiyatli ${result.successCount} ta userga yuborildi!`,
      );
    });

    this.bot.command("getdb", async (ctx) => {
      if (!this.adminService.isAdmin(ctx.from.id)) {
        await ctx.reply("❌ Sizda bu commandni ishlatish uchun ruxsat yo'q!");
        return;
      }

      try {
        // Database faylini adminga yuborish
        const fs = require("fs");
        const path = require("path");
        const dbPath = path.join(__dirname, "../database/qazo_bot.db");

        // Fayl mavjudligini tekshirish
        if (fs.existsSync(dbPath)) {
          await ctx.replyWithDocument(
            { source: dbPath },
            "📄 Database fayli (qazo_bot.db)",
            Markup.inlineKeyboard([
              [Markup.button.callback("🏠 Bosh menu", "menu_main")],
            ]),
          );
          console.log(`Database file sent to admin ${ctx.from.id}`);
        } else {
          await ctx.reply("❌ Database fayli topilmadi!");
        }
      } catch (error) {
        console.error("Error sending database file:", error);
        await ctx.reply("❌ Database faylini yuborishda xatolik yuz berdi!");
      }
    });

    this.bot.action("save_qazo_status", async (ctx) => {
      await ctx.reply(
        "✅ Qazo holati saqlab qolindi!",
        Markup.inlineKeyboard([
          [Markup.button.callback("🏠 Bosh menu", "menu_main")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.action("menu_main", async (ctx) => {
      const userId = ctx.from.id;

      // Check if user is blocked
      const isBlocked = await this.userService.isUserBlocked(userId);
      if (isBlocked) {
        await ctx.editMessageText(
          "⚠️ Sizning hisobingiz bloklangan.\n\n" +
            "🔄 Qayta ishga tushirish uchun /start ni bosing.",
          Markup.inlineKeyboard([
            [Markup.button.callback("🔄 Qayta start", "menu_main")],
          ]),
        );
        await ctx.answerCbQuery();
        return;
      }

      // Unblock user if they click main menu while blocked
      if (isBlocked) {
        await this.userService.unblockUser(userId);
      }

      // Update user activity
      await this.userService.updateLastActivity(userId);

      await ctx.editMessageText(
        "🕌 Assalomu alaykum! Qazo AI botiga xush kelibsiz!\n\n" +
          "Quyidagi tugmalardan foydalaning:",
        Markup.inlineKeyboard([
          [Markup.button.callback("📊 Qazo holati", "menu_qazo")],
          [Markup.button.callback("📅 Bugungi namozlar", "menu_today")],
          [Markup.button.callback("🕐 Namoz vaqtlari", "menu_times")],
          [Markup.button.callback("📝 Qazolarni yangilash", "menu_addqazo")],
          [Markup.button.callback("⚙️ Sozlamalar", "menu_settings")],
          [Markup.button.callback("❓ Yordam", "menu_help")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.command("today", async (ctx) => {
      const userId = ctx.from.id;
      const record = await this.prayerService.getTodayPrayerRecord(userId);

      const prayerNames = {
        fajr: "🌅 Bomdod",
        dhuhr: "☀️ Peshin",
        asr: "🌇 Asr",
        maghrib: "🌆 Shom",
        isha: "🌙 Xufton",
      };

      const statusEmojis = {
        read: "✅",
        missed: "❌",
        pending: "⏳",
      };

      let message = "📅 Bugungi namozlar:\n\n";

      for (const prayer of ["fajr", "dhuhr", "asr", "maghrib", "isha"]) {
        const status = record[`${prayer}_status`];
        message += `${prayerNames[prayer]} ${statusEmojis[status] || "⏳"}\n`;
      }

      await ctx.editMessageText(
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback("🏠 Bosh menu", "menu_main")],
        ]),
      );
    });

    this.bot.command("addqazo", async (ctx) => {
      const userId = ctx.from.id;

      await ctx.reply(
        "📝 Eski qazolarni kiritish:\n\n" + "Qanday usulda kiritmoqchisiz?",
        Markup.inlineKeyboard([
          [Markup.button.callback("📅 Oy/Yil bo'yicha", "qazo_by_period")],
          [Markup.button.callback("🔢 Har bir namozni sanab", "qazo_by_count")],
        ]),
      );
    });

    this.bot.command("times", async (ctx) => {
      await this.prayerTimesDisplayService.showPrayerTimes(ctx.from.id);
    });

    this.bot.action(/confirm_period_(.+)/, async (ctx) => {
      const userId = ctx.from.id;
      const qazoCount = parseInt(ctx.match[1]);

      const qazoData = {
        fajr: qazoCount,
        dhuhr: qazoCount,
        asr: qazoCount,
        maghrib: qazoCount,
        isha: qazoCount,
      };

      try {
        await this.qazoInputService.addQazoToDatabase(userId, qazoData);
        await ctx.editMessageText(
          "✅ Qazolar muvaffaqiyatli qo'shildi!",
          Markup.inlineKeyboard([
            [Markup.button.callback("🏠 Bosh menu", "menu_main")],
          ]),
        );
        this.qazoInputService.inputStates.delete(userId);
      } catch (error) {
        await ctx.editMessageText(
          "❌ Xatolik yuz berdi. Qaytadan urining.",
          Markup.inlineKeyboard([
            [Markup.button.callback("🏠 Bosh menu", "menu_main")],
          ]),
        );
      }

      await ctx.answerCbQuery();
    });

    this.bot.action("confirm_count", async (ctx) => {
      const userId = ctx.from.id;
      const state = this.qazoInputService.inputStates.get(userId);

      if (!state || !state.counts) {
        await ctx.editMessageText(
          "❌ Ma'lumotlar topilmadi. Qaytadan boshlang.",
          Markup.inlineKeyboard([
            [Markup.button.callback("🏠 Bosh menu", "menu_main")],
          ]),
        );
        await ctx.answerCbQuery();
        return;
      }

      try {
        await this.qazoInputService.addQazoToDatabase(userId, state.counts);
        await ctx.editMessageText(
          "✅ Qazolar muvaffaqiyatli qo'shildi!",
          Markup.inlineKeyboard([
            [Markup.button.callback("🏠 Bosh menu", "menu_main")],
          ]),
        );
        this.qazoInputService.inputStates.delete(userId);
      } catch (error) {
        await ctx.editMessageText(
          "❌ Xatolik yuz berdi. Qaytadan urining.",
          Markup.inlineKeyboard([
            [Markup.button.callback("🏠 Bosh menu", "menu_main")],
          ]),
        );
        await ctx.editMessageText(
          "❌ Xatolik yuz berdi. Qaytadan urining.",
          Markup.inlineKeyboard([
            [Markup.button.callback("🏠 Bosh menu", "menu_main")],
          ]),
        );
      }

      await ctx.answerCbQuery();
    });

    this.bot.action(/confirm_remove_count_(.+)/, async (ctx) => {
      const userId = ctx.from.id;
      let qazoData;

      try {
        // Yangi format: prayer:count,prayer:count
        const dataString = ctx.match[1];
        const entries = dataString.split(",").map((entry) => {
          const [prayer, count] = entry.split(":");
          return [prayer, parseInt(count)];
        });

        qazoData = {};
        entries.forEach(([prayer, count]) => {
          qazoData[prayer] = -count;
        });
      } catch (error) {
        // Eski format - bitta son
        const count = parseInt(ctx.match[1]);
        qazoData = {
          fajr: -count,
          dhuhr: -count,
          asr: -count,
          maghrib: -count,
          isha: -count,
        };
      }

      try {
        await this.qazoInputService.addQazoToDatabase(userId, qazoData);
        await ctx.editMessageText(
          "✅ Qazolar muvaffaqiyatli ayirildi!",
          Markup.inlineKeyboard([
            [Markup.button.callback("🏠 Bosh menu", "menu_main")],
          ]),
        );
        this.qazoInputService.inputStates.delete(userId);
      } catch (error) {
        await ctx.editMessageText(
          "❌ Xatolik yuz berdi. Qaytadan urining.",
          Markup.inlineKeyboard([
            [Markup.button.callback("🏠 Bosh menu", "menu_main")],
          ]),
        );
      }

      await ctx.answerCbQuery();
    });

    this.bot.action("cancel_qazo", async (ctx) => {
      const userId = ctx.from.id;
      this.qazoInputService.inputStates.delete(userId);
      await ctx.editMessageText(
        "❌ Qazo kiritish bekor qilindi.",
        Markup.inlineKeyboard([
          [Markup.button.callback("🏠 Bosh menu", "menu_main")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.action("qazo_by_period", async (ctx) => {
      const userId = ctx.from.id;
      this.qazoInputService.inputStates.set(userId, {
        mode: "period",
        step: 1,
      });

      await ctx.editMessageText(
        "📅 Oy/Yil bo'yicha qazo kiritish:\n\n" +
          "Qancha vaqt qazo qilgansiz?\n\n" +
          "Masalan:\n" +
          '• "2 yil 3 oy"\n' +
          '• "6 oy"\n' +
          '• "1 yil"\n\n' +
          'Format: "X yil Y oy" yoki "X oy" yoki "X yil"\n\n' +
          "❌ Bekor qilish uchun /cancel ni bosing",
        Markup.inlineKeyboard([
          [Markup.button.callback("❌ Bekor qilish", "cancel_qazo")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.action("qazo_by_count", async (ctx) => {
      const userId = ctx.from.id;
      this.qazoInputService.inputStates.set(userId, { mode: "count", step: 1 });

      await ctx.editMessageText(
        "🔢 Har bir namoz uchun qazo soni:\n\n" +
          "🌅 Bomdod: nechta qazo?\n\n" +
          "Faqat sonni kiriting (masalan: 45)\n\n" +
          "❌ Bekor qilish uchun /cancel ni bosing",
        Markup.inlineKeyboard([
          [Markup.button.callback("❌ Bekor qilish", "cancel_qazo")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.action("refresh_times", async (ctx) => {
      const userId = ctx.from.id;
      const user = await this.userService.getUser(userId);
      const today = new Date().toISOString().split("T")[0];

      let times = await this.prayerTimesService.getTodayPrayerTimes(
        userId,
        user.city || "Tashkent",
        user.timezone || "Asia/Tashkent",
      );

      // Save to database
      await this.prayerTimesService.savePrayerTimesForUser(
        userId,
        user.city || "Tashkent",
        user.timezone || "Asia/Tashkent",
      );

      const prayerNames = {
        fajr: "🌅 Bomdod",
        dhuhr: "☀️ Peshin",
        asr: "🌇 Asr",
        maghrib: "🌆 Shom",
        isha: "🌙 Xufton",
      };

      const currentTime = this.getCurrentTime(
        user.timezone || "Asia/Tashkent",
        "HH:mm:ss",
      );

      let message = `🕌 ${user.city || "Toshkent"} uchun bugungi namoz vaqtlari\n\n`;
      message += `📅 ${today}\n`;
      message += `🕐 Hozirgi vaqt: ${currentTime}\n\n`;

      for (const [key, name] of Object.entries(prayerNames)) {
        const time = times[key];
        const status = this.prayerTimesDisplayService.getPrayerStatus(
          time,
          currentTime,
        );

        message += `${name}: ${time} ${status}\n`;
      }

      message += `\n🔄 Yangilandi: ${new Date().toLocaleTimeString("uz-UZ", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: user.timezone || "Asia/Tashkent",
      })}`;

      try {
        await ctx.editMessageText(
          message,
          Markup.inlineKeyboard([
            [Markup.button.callback("🔄 Vaqtlarni yangilash", "refresh_times")],
            [Markup.button.callback("🏠 Bosh menu", "menu_main")],
          ]),
        );
      } catch (error) {
        if (error.description.includes("message is not modified")) {
          // Message is the same, just answer the callback
          await ctx.answerCbQuery("Vaqtlar yangilandi!");
          return;
        }
        throw error;
      }

      await ctx.answerCbQuery("Vaqtlar yangilandi!");
    });

    // Menu callback handlers
    this.bot.action("menu_qazo", async (ctx) => {
      const userId = ctx.from.id;

      // Check if user is blocked
      const isBlocked = await this.userService.isUserBlocked(userId);
      if (isBlocked) {
        await ctx.editMessageText(
          "⚠️ Sizning hisobingiz bloklangan.\n\n" +
            "🔄 Qayta ishga tushirish uchun /start ni bosing.",
          Markup.inlineKeyboard([
            [Markup.button.callback("🔄 Qayta start", "menu_main")],
          ]),
        );
        await ctx.answerCbQuery();
        return;
      }

      // Update user activity
      await this.userService.updateLastActivity(userId);

      const qazoSummary = await this.qazoService.getQazoSummary(userId);
      const user = await this.userService.getUser(userId);
      const currentTime = new Date().toLocaleString("uz-UZ", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
        timeZone: user.timezone || "Asia/Tashkent",
      });

      const prayerNames = {
        fajr: "🌅 Bomdod",
        dhuhr: "☀️ Peshin",
        asr: "🌇 Asr",
        maghrib: "🌆 Shom",
        isha: "🌙 Xufton",
      };

      let message = "📊 Sizning qazo holatingiz:\n\n";
      message += `🔢 Jami qazo: ${qazoSummary.total}\n`;
      message += `🕐 Vaqt: ${currentTime}\n\n`;

      for (const [prayer, count] of Object.entries(qazoSummary.details)) {
        message += `${prayerNames[prayer]}: ${count} ta\n`;
      }

      await ctx.editMessageText(
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback("🏠 Bosh menu", "menu_main")],
        ]),
      );

      await ctx.answerCbQuery();
    });

    this.bot.action("menu_today", async (ctx) => {
      const userId = ctx.from.id;
      await this.userService.updateLastActivity(userId);

      const record = await this.prayerService.getTodayPrayerRecord(userId);

      const prayerNames = {
        fajr: "🌅 Bomdod",
        dhuhr: "☀️ Peshin",
        asr: "🌇 Asr",
        maghrib: "🌆 Shom",
        isha: "🌙 Xufton",
      };

      const statusEmojis = {
        read: "✅",
        missed: "❌",
        pending: "⏳",
      };

      let message = "📅 Bugungi namozlar:\n\n";

      for (const prayer of ["fajr", "dhuhr", "asr", "maghrib", "isha"]) {
        const status = record[`${prayer}_status`];
        message += `${prayerNames[prayer]} ${statusEmojis[status] || "⏳"}\n`;
      }

      await ctx.editMessageText(
        message,
        Markup.inlineKeyboard([
          [Markup.button.callback("🏠 Bosh menu", "menu_main")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.action("menu_times", async (ctx) => {
      const userId = ctx.from.id;
      await this.userService.updateLastActivity(userId);
      const user = await this.userService.getUser(userId);
      const today = new Date().toISOString().split("T")[0];

      let times = await this.prayerTimesService.getTodayPrayerTimes(
        userId,
        user.city || "Tashkent",
        user.timezone || "Asia/Tashkent",
      );

      // Save to database
      await this.prayerTimesService.savePrayerTimesForUser(
        userId,
        user.city || "Tashkent",
        user.timezone || "Asia/Tashkent",
      );

      const prayerNames = {
        fajr: "🌅 Bomdod",
        dhuhr: "☀️ Peshin",
        asr: "🌇 Asr",
        maghrib: "🌆 Shom",
        isha: "🌙 Xufton",
      };

      const currentTime = this.getCurrentTime(
        user.timezone || "Asia/Tashkent",
        "HH:mm:ss",
      );

      let message = `🕌 ${user.city || "Toshkent"} uchun bugungi namoz vaqtlari\n\n`;
      message += `📅 ${today}\n`;
      message += `🕐 Hozirgi vaqt: ${currentTime}\n\n`;

      for (const [key, name] of Object.entries(prayerNames)) {
        const time = times[key];
        const status = this.prayerTimesDisplayService.getPrayerStatus(
          time,
          currentTime,
        );

        message += `${name}: ${time} ${status}\n`;
      }

      try {
        await ctx.editMessageText(
          message,
          Markup.inlineKeyboard([
            [Markup.button.callback("🔄 Vaqtlarni yangilash", "refresh_times")],
            [Markup.button.callback("🏠 Bosh menu", "menu_main")],
          ]),
        );
      } catch (error) {
        if (
          error.description &&
          error.description.includes("message is not modified")
        ) {
          // Message is the same, just answer the callback
          await ctx.answerCbQuery();
          return;
        }
        throw error;
      }
      await ctx.answerCbQuery();
    });

    this.bot.action("menu_addqazo", async (ctx) => {
      const userId = ctx.from.id;
      await this.userService.updateLastActivity(userId);

      await ctx.editMessageText(
        "📝 Qazo boshqaruvi:\n\n" + "Qanday amalni bajarmoqchisiz?",
        Markup.inlineKeyboard([
          [Markup.button.callback("➕ Qazolarni qo'shish", "add_qazo_menu")],
          [Markup.button.callback("➖ Qazo ayrish", "remove_qazo_menu")],
          [Markup.button.callback("🏠 Bosh menu", "menu_main")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.action("add_qazo_menu", async (ctx) => {
      await ctx.editMessageText(
        "📝 Eski qazolarni kiritish:\n\n" + "Qanday usulda kiritmoqchisiz?",
        Markup.inlineKeyboard([
          [Markup.button.callback("📅 Kun/Oy/Yil", "qazo_by_period")],
          [Markup.button.callback("🔢 Har bir namozni sanab", "qazo_by_count")],
          [Markup.button.callback("🗓️ Sana oralig'i", "qazo_by_date_range")],
          [Markup.button.callback("🔙 Orqaga", "menu_addqazo")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.action("remove_qazo_menu", async (ctx) => {
      await ctx.editMessageText(
        "➖ Qazo ayrish:\n\n" + "Qanday usulda ayirmoqchisiz?",
        Markup.inlineKeyboard([
          [Markup.button.callback("📅 Kun/Oy/Yil", "remove_qazo_period")],
          [
            Markup.button.callback(
              "🔢 Har bir namozni sanab",
              "remove_qazo_count",
            ),
          ],
          [
            Markup.button.callback(
              "🗓️ Sana oralig'i",
              "remove_qazo_date_range",
            ),
          ],
          [Markup.button.callback("🔙 Orqaga", "menu_addqazo")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.action("remove_qazo_count", async (ctx) => {
      const userId = ctx.from.id;
      this.qazoInputService.inputStates.set(userId, {
        mode: "remove_count",
        step: 1,
        prayerIndex: 0,
      });

      const prayers = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
      const prayerNames = {
        fajr: "🌅 Bomdod",
        dhuhr: "☀️ Peshin",
        asr: "🌇 Asr",
        maghrib: "🌆 Shom",
        isha: "🌙 Xufton",
      };

      await ctx.editMessageText(
        "🔢 Har bir namozni sanab qazo ayrish:\n\n" +
          `${prayerNames[prayers[0]]} nechta qazo?`,
        Markup.inlineKeyboard([
          [Markup.button.callback("❌ Bekor qilish", "cancel_qazo")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.action("menu_settings", async (ctx) => {
      const userId = ctx.from.id;
      await this.userService.updateLastActivity(userId);

      await ctx.editMessageText(
        "⚙️ Sozlamalar:\n\n" +
          "Vaqtni zonalarni va shaharni sozlash uchun tugmalardan foydalaning:\n\n" +
          "📍 Yoki lokatsiyangizni yuboring - avtomatik aniqlanadi!",
        Markup.inlineKeyboard([
          [Markup.button.callback("🌍 Toshkent", "set_tashkent")],
          [Markup.button.callback("🌍 Samarqand", "set_samarkand")],
          [Markup.button.callback("🌍 Buxoro", "set_bukhara")],
          [Markup.button.callback("🌍 Farg'ona", "set_fergana")],
          [Markup.button.callback("📍 Lokatsiya yuborish", "request_location")],
          [Markup.button.callback("🏠 Bosh menu", "menu_main")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.action("request_location", async (ctx) => {
      await ctx.reply(
        "📍 Lokatsiyangizni yuboring:\n\n" +
          "Quyidagi tugmani bosing va lokatsiyangizni tanlang:",
        Markup.keyboard([
          [Markup.button.locationRequest("📍 Lokatsiya yuborish")],
        ])
          .resize()
          .oneTime(),
      );
      await ctx.answerCbQuery();
    });

    this.bot.on("location", async (ctx) => {
      const userId = ctx.from.id;
      const location = ctx.message.location;

      try {
        // Lokatsiya bo'yicha shaharni aniqlaymiz
        const cityInfo = await this.getCityFromLocation(
          location.latitude,
          location.longitude,
        );

        if (cityInfo) {
          // User ma'lumotlarini yangilaymiz
          await this.userService.updateUserLocation(
            userId,
            cityInfo.city,
            cityInfo.timezone,
            cityInfo.country,
          );

          await ctx.reply(
            `✅ Lokatsiya aniqlandi!\n\n` +
              `🏙️ Shahar: ${cityInfo.city}\n` +
              `🌍 Davlat: ${cityInfo.country}\n` +
              `⏰ Vaqt zonasi: ${cityInfo.timezone}\n\n` +
              `Namoz vaqtlari ${cityInfo.city} uchun sozlandi!`,
            Markup.inlineKeyboard([
              [Markup.button.callback("🏠 Bosh menu", "menu_main")],
            ]),
          );

          // Klaviaturani yopamiz
          await ctx.reply("🏠 Bosh menu:", Markup.removeKeyboard());
        } else {
          await ctx.reply(
            "❌ Kechirasiz, bu lokatsiya uchun shaharni aniqlab bo'lmadi.\n\n" +
              "Iltimos, qo'lda shaharni tanlang:",
            Markup.inlineKeyboard([
              [Markup.button.callback("🌍 Toshkent", "set_tashkent")],
              [Markup.button.callback("🌍 Samarqand", "set_samarkand")],
              [Markup.button.callback("🌍 Buxoro", "set_bukhara")],
              [Markup.button.callback("🌍 Farg'ona", "set_fergona")],
            ]),
          );

          // Klaviaturani yopamiz
          await ctx.reply("🏠 Bosh menu:", Markup.removeKeyboard());
        }
      } catch (error) {
        console.error("Error processing location:", error);
        await ctx.reply(
          "❌ Xatolik yuz berdi. Iltimos, qaytadan urining yoki shaharni qo'lda tanlang.",
          Markup.inlineKeyboard([
            [Markup.button.callback("🌍 Toshkent", "set_tashkent")],
            [Markup.button.callback("🌍 Samarqand", "set_samarkand")],
            [Markup.button.callback("🌍 Buxoro", "set_bukhara")],
            [Markup.button.callback("🌍 Farg'ona", "set_fergona")],
          ]),
        );

        // Klaviaturani yopamiz
        await ctx.reply("🏠 Bosh menu:", Markup.removeKeyboard());
      }
    });

    this.bot.action("qazo_by_date_range", async (ctx) => {
      const userId = ctx.from.id;
      this.qazoInputService.inputStates.set(userId, {
        mode: "date_range",
        step: 1,
      });

      await ctx.editMessageText(
        "🗓️ Sana oralig'i bo'yicha qazo kiritish:\n\n" +
          "Boshlanish va tugash sanalarini kiriting (DD.MM.YYYY - DD.MM.YYYY):\n\n" +
          "Masalan:\n" +
          '• "01.12.2025 - 31.12.2025"\n' +
          '• "15.06.2025 - 15.07.2025"\n' +
          '• "01.01.2025 - 01.01.2026"\n\n' +
          "❌ Bekor qilish uchun /cancel ni bosing",
        Markup.inlineKeyboard([
          [Markup.button.callback("❌ Bekor qilish", "cancel_qazo")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.action("remove_qazo_period", async (ctx) => {
      const userId = ctx.from.id;
      this.qazoInputService.inputStates.set(userId, {
        mode: "remove_period",
        step: 1,
      });

      await ctx.editMessageText(
        "📅 Kun/Oy/Yil bo'yicha qazo ayrish:\n\n" +
          "Qancha vaqt qazo ayirmoqchisiz?\n\n" +
          "Masalan:\n" +
          '• "2 yil 3 oy 5 kun"\n' +
          '• "6 oy 10 kun"\n' +
          '• "1 yil"\n' +
          '• "15 kun"\n\n' +
          'Format: "X yil Y oy Z kun" yoki "X oy Y kun" yoki "X kun" yoki "X yil" yoki "X oy"\n\n' +
          "❌ Bekor qilish uchun /cancel ni bosing",
        Markup.inlineKeyboard([
          [Markup.button.callback("❌ Bekor qilish", "cancel_qazo")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.action("remove_qazo_date_range", async (ctx) => {
      const userId = ctx.from.id;
      this.qazoInputService.inputStates.set(userId, {
        mode: "remove_date_range",
        step: 1,
      });

      await ctx.editMessageText(
        "🗓️ Sana oralig'i bo'yicha qazo ayrish:\n\n" +
          "Boshlanish va tugash sanalarini kiriting (DD.MM.YYYY - DD.MM.YYYY):\n\n" +
          "Masalan:\n" +
          '• "01.12.2025 - 31.12.2025"\n' +
          '• "15.06.2025 - 15.07.2025"\n' +
          '• "01.01.2025 - 01.01.2026"\n\n' +
          "❌ Bekor qilish uchun /cancel ni bosing",
        Markup.inlineKeyboard([
          [Markup.button.callback("❌ Bekor qilish", "cancel_qazo")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.action("menu_help", async (ctx) => {
      await ctx.editMessageText(
        "❓ Yordam:\n\n" +
          "🔹 Bot faqat tugmalar (action) orqali ishlaydi\n\n" +
          "� Asosiy funksiyalar:\n" +
          "• � Qazo holati - qazolaringizni ko'rish\n" +
          "• � Bugungi namozlar - kunlik namoz holati\n" +
          "• � Namoz vaqtlari - bugungi vaqtlar\n" +
          "• � Qazolarni yangilash - eski qazolarni kiritish\n" +
          "• ⚙️ Sozlamalar - shahar va vaqt zonasi\n\n" +
          "🤖 Bot avtomatik ravishda:\n" +
          "• Namoz vaqtlarida eslatish yuboradi\n" +
          "• Har 10 daqiqada so'rab boradi\n" +
          "• Lokatsiya orqali shaharni aniqlaydi\n\n" +
          "📍 Lokatsiya yuborish orqali avtomatik shaharni aniqlashingiz mumkin!",
        Markup.inlineKeyboard([
          [Markup.button.callback("🏠 Bosh menu", "menu_main")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.action(/set_(.+)/, async (ctx) => {
      const city = ctx.match[1];
      const userId = ctx.from.id;

      const cityData = {
        tashkent: {
          city: "Tashkent",
          country: "UZ",
          timezone: "Asia/Tashkent",
        },
        samarkand: {
          city: "Samarkand",
          country: "UZ",
          timezone: "Asia/Samarkand",
        },
        bukhara: { city: "Bukhara", country: "UZ", timezone: "Asia/Tashkent" },
        fergana: { city: "Fergana", country: "UZ", timezone: "Asia/Tashkent" },
      };

      const data = cityData[city];
      await this.userService.updateUserTimezone(
        userId,
        data.timezone,
        data.city,
        data.country,
      );

      await ctx.editMessageText(
        `✅ Sozlandi: ${data.city}, ${data.country}`,
        Markup.inlineKeyboard([
          [Markup.button.callback("🏠 Bosh menu", "menu_main")],
        ]),
      );
      await ctx.answerCbQuery();
    });

    this.bot.on("callback_query", async (ctx) => {
      const data = ctx.callbackQuery.data;
      const userId = ctx.from.id;

      if (data.startsWith("prayer_")) {
        const [_, prayer, action] = data.split("_");
        const today = new Date().toISOString().split("T")[0];

        // Eslatma xabarlarini tozalash
        const pendingKey = `${userId}_${prayer}`;
        const activeKey = `${userId}_${prayer}_${today}`;

        // Pending eslatma xabarini o'chirish
        if (this.reminderService.pendingReminders.has(pendingKey)) {
          try {
            const messageId =
              this.reminderService.pendingReminders.get(pendingKey);
            await ctx.telegram.deleteMessage(userId, messageId);
            console.log(`Deleted pending reminder message for ${prayer}`);
          } catch (error) {
            console.log(
              "Could not delete pending reminder message:",
              error.message,
            );
          }
        }

        // Missed eslatma xabarini o'chirish
        if (this.reminderService.missedReminders.has(pendingKey)) {
          try {
            const messageId =
              this.reminderService.missedReminders.get(pendingKey);
            await ctx.telegram.deleteMessage(userId, messageId);
            console.log(`Deleted missed reminder message for ${prayer}`);
          } catch (error) {
            console.log(
              "Could not delete missed reminder message:",
              error.message,
            );
          }
        }

        // Asosiy namoz vaqti eslatmasini o'chirish
        if (this.reminderService.prayerTimeReminders.has(activeKey)) {
          try {
            const messageId =
              this.reminderService.prayerTimeReminders.get(activeKey);
            await ctx.telegram.deleteMessage(userId, messageId);
            console.log(`Deleted prayer time reminder message for ${prayer}`);
          } catch (error) {
            console.log(
              "Could not delete prayer time reminder message:",
              error.message,
            );
          }
        }

        // Faqat read va missed da activeReminders ni tozalash
        if (action === "read" || action === "missed") {
          this.reminderService.activeReminders.delete(activeKey);
        }

        // Map lardan kalitlarni o'chirish
        this.reminderService.pendingReminders.delete(pendingKey);
        this.reminderService.missedReminders.delete(pendingKey);
        this.reminderService.prayerTimeReminders.delete(activeKey);

        // "Later" da pendingPrayerReminders ni tozlamasligimiz kerak
        // chunki har 10 daqiqada qayta eslatish kerak
        if (action === "later") {
          // pendingPrayerReminders ni tozlamaymiz, qayta eslatish uchun
          // this.reminderService.pendingPrayerReminders.delete(pendingKey);
        }

        if (action === "read") {
          await this.prayerService.updatePrayerStatus(
            userId,
            today,
            prayer,
            "read",
          );
          try {
            await ctx.editMessageText(
              `✅ ${prayer} namozi o'qilgan deb belgilandi!`,
            );
          } catch (error) {
            console.log("Could not edit message:", error.message);
            // Xabar o'chirilgan bo'lsa, yangi xabar yuboramiz
            await ctx.reply(`✅ ${prayer} namozi o'qilgan deb belgilandi!`);
          }
        } else if (action === "missed") {
          await this.prayerService.updatePrayerStatus(
            userId,
            today,
            prayer,
            "missed",
          );
          await this.qazoService.addQazo(userId, prayer);
          try {
            await ctx.editMessageText(`❌ ${prayer} namozi qazo qilindi!`);
          } catch (error) {
            console.log("Could not edit message:", error.message);
            // Xabar o'chirilgan bo'lsa, yangi xabar yuboramiz
            await ctx.reply(`❌ ${prayer} namozi qazo qilindi!`);
          }
        } else if (action === "later") {
          try {
            await ctx.editMessageText(
              `⏰ ${prayer} namozi uchun eslatma qayta yuboriladi.`,
            );
          } catch (error) {
            console.log("Could not edit message:", error.message);
            // Xabar o'chirilgan bo'lsa, yangi xabar yuboramiz
            await ctx.reply(
              `⏰ ${prayer} namozi uchun eslatma qayta yuboriladi.`,
            );
          }
        }

        await ctx.answerCbQuery();
      }
    });

    this.bot.on("message", async (ctx) => {
      const text = ctx.message.text;
      const userId = ctx.from.id;

      // Qazo input handler
      const state = this.qazoInputService.inputStates.get(userId);
      if (state) {
        if (state.mode === "period") {
          await this.qazoInputService.handlePeriodInput(
            ctx,
            userId,
            text,
            state,
          );
          return;
        } else if (state.mode === "count") {
          await this.qazoInputService.handleCountInput(
            ctx,
            userId,
            text,
            state,
          );
          return;
        } else if (state.mode === "remove_period") {
          await this.handleRemovePeriodInput(ctx, userId, text, state);
          return;
        } else if (state.mode === "remove_count") {
          await this.handleRemoveCountInput(ctx, userId, text, state);
          return;
        } else if (state.mode === "date_range") {
          await this.handleDateRangeInput(ctx, userId, text, state);
          return;
        } else if (state.mode === "remove_date_range") {
          await this.handleRemoveDateRangeInput(ctx, userId, text, state);
          return;
        }
      }

      // Only handle text commands, ignore button presses since we use inline keyboards
    });
  }

  async handleRemovePeriodInput(ctx, userId, text, state) {
    if (state.step === 1) {
      const periodData = this.qazoInputService.parsePeriod(text);

      if (!periodData) {
        await ctx.reply(
          "❌ Noto'g'ri format! Qaytadan urining:\n\n" +
            'Masalan: "2 yil 3 oy 5 kun" yoki "6 oy 10 kun" yoki "15 kun" yoki "1 yil"',
        );
        return;
      }

      const totalDays = this.qazoInputService.calculateTotalDays(periodData);
      const totalQazo = Math.floor(totalDays * 5); // 5 namoz kuniga
      const qazoPerPrayer = Math.floor(totalQazo / 5); // Har bir namoz uchun

      await ctx.reply(
        `📊 Hisoblash natijasi:\n\n` +
          `📅 ${periodData.years} yil ${periodData.months} oy ${periodData.days} kun = ${totalDays} kun\n` +
          `🕌 Jami qazo: ${totalQazo} ta namoz\n\n` +
          `Har bir namoz uchun taqsimlash:\n` +
          `🌅 Bomdod: ${qazoPerPrayer} ta\n` +
          `☀️ Peshin: ${qazoPerPrayer} ta\n` +
          `🌇 Asr: ${qazoPerPrayer} ta\n` +
          `🌆 Shom: ${qazoPerPrayer} ta\n` +
          `🌙 Xufton: ${qazoPerPrayer} ta\n\n` +
          `Bu qazolarni ayirishni tasdiqlaysizmi?`,
        Markup.inlineKeyboard([
          [
            Markup.button.callback(
              "✅ Tasdiqlash",
              `confirm_remove_period_${qazoPerPrayer}`,
            ),
          ],
          [Markup.button.callback("❌ Bekor qilish", "cancel_qazo")],
        ]),
      );

      this.qazoInputService.inputStates.set(userId, {
        ...state,
        step: 2,
        qazoCount: qazoPerPrayer,
        periodData,
      });
    }
  }

  async handleRemoveCountInput(ctx, userId, text, state) {
    const prayers = ["fajr", "dhuhr", "asr", "maghrib", "isha"];
    const prayerNames = {
      fajr: "🌅 Bomdod",
      dhuhr: "☀️ Peshin",
      asr: "🌇 Asr",
      maghrib: "🌆 Shom",
      isha: "🌙 Xufton",
    };

    if (state.step === 1) {
      const count = parseInt(text.trim());

      if (isNaN(count) || count < 0) {
        await ctx.reply(
          "❌ Noto'g'ri son! Iltimos, musbat yoki nol son kiriting:",
        );
        return;
      }

      // Birinchi namoz uchun count ni saqlaymiz
      const qazoCounts = state.qazoCounts || {};
      qazoCounts[prayers[state.prayerIndex]] = count;

      // Agar oxirgi namoz bo'lsa, tasdiqlash ko'rsatamiz
      if (state.prayerIndex === prayers.length - 1) {
        // Qazo counts ni qisqartirilgan formatda yuboramiz
        const qazoData = {};
        Object.entries(qazoCounts).forEach(([prayer, count]) => {
          qazoData[prayer] = -count;
        });

        // Short formatda yuboramiz - faqat bir nechta ekanligini ko'rsatamiz
        await ctx.reply(
          `🔢 Qazo ayirish tasdiqlash:\n\n` +
            `Jami: ${Object.values(qazoCounts).reduce((a, b) => a + b, 0)} ta qazo ayiriladi\n\n` +
            `Tasdiqlaysizmi?`,
          Markup.inlineKeyboard([
            [
              Markup.button.callback(
                "✅ Tasdiqlash",
                `confirm_remove_count_${Object.entries(qazoCounts)
                  .map(([p, c]) => `${p}:${c}`)
                  .join(",")}`,
              ),
            ],
            [Markup.button.callback("❌ Bekor qilish", "cancel_qazo")],
          ]),
        );
        this.qazoInputService.inputStates.set(userId, {
          ...state,
          step: 2,
          qazoData,
        });
      } else {
        // Keyingi namozga o'tamiz
        const nextPrayerIndex = state.prayerIndex + 1;
        await ctx.reply(
          `🔢 Har bir namozni sanab qazo ayrish:\n\n` +
            `${prayerNames[prayers[nextPrayerIndex]]} nechta qazo?`,
          Markup.inlineKeyboard([
            [Markup.button.callback("❌ Bekor qilish", "cancel_qazo")],
          ]),
        );
        this.qazoInputService.inputStates.set(userId, {
          ...state,
          prayerIndex: nextPrayerIndex,
          qazoCounts,
        });
      }
    }
  }

  async handleDateRangeInput(ctx, userId, text, state) {
    if (state.step === 1) {
      // Parse date range
      const dateRangeMatch = text.match(
        /^(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})$/,
      );
      if (!dateRangeMatch) {
        await ctx.reply(
          "❌ Noto'g'ri format! Iltimos, DD.MM.YYYY - DD.MM.YYYY formatida kiriting (masalan: 01.12.2025 - 31.12.2025)",
        );
        return;
      }

      const [, startDay, startMonth, startYear, endDay, endMonth, endYear] =
        dateRangeMatch;
      const startDate = `${startYear}-${startMonth}-${startDay}`;
      const endDate = `${endYear}-${endMonth}-${endDay}`;

      // Store dates and move to next step
      state.startDate = startDate;
      state.endDate = endDate;
      state.step = 2;
      this.qazoInputService.inputStates.set(userId, state);

      await ctx.reply(
        "🗓️ Sana oralig'i: " +
          text +
          "\n\n" +
          "Qaysi namozlar uchun qazo qo'shmoqchisiz?\n\n" +
          "Masalan:\n" +
          '• "bomdod peshin"\n' +
          '• "barchasi"\n' +
          '• "asr shom qufton"\n\n' +
          "❌ Bekor qilish uchun /cancel ni bosing",
      );
    } else if (state.step === 2) {
      // Parse prayers
      const prayers = this.parsePrayers(text);

      if (!prayers || prayers.length === 0) {
        await ctx.reply(
          '❌ Noto\'g\'ri namozlar! Iltimos, "bomdod peshin asr shom qufton" yoki "barchasi" deb kiriting',
        );
        return;
      }

      const qazoData = {};
      prayers.forEach((prayer) => {
        qazoData[prayer] = 1; // 1 ta qazo
      });

      try {
        await this.qazoInputService.addQazoToDatabase(userId, qazoData);
        await ctx.reply(
          `✅ ${state.startDate} dan ${state.endDate} gacha ${prayers.join(", ")} namozi uchun qazo qo'shildi!`,
          Markup.inlineKeyboard([
            [Markup.button.callback("🏠 Bosh menu", "menu_main")],
          ]),
        );
        this.qazoInputService.inputStates.delete(userId);
      } catch (error) {
        console.error("Error in handleDateRangeInput:", error);
        await ctx.reply("❌ Xatolik yuz berdi. Qaytadan urining.");
      }
    }
  }

  async handleRemoveDateRangeInput(ctx, userId, text, state) {
    if (state.step === 1) {
      // Parse date range
      const dateRangeMatch = text.match(
        /^(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})$/,
      );
      if (!dateRangeMatch) {
        await ctx.reply(
          "❌ Noto'g'ri format! Iltimos, DD.MM.YYYY - DD.MM.YYYY formatida kiriting (masalan: 01.12.2025 - 31.12.2025)",
        );
        return;
      }

      const [, startDay, startMonth, startYear, endDay, endMonth, endYear] =
        dateRangeMatch;
      const startDate = `${startYear}-${startMonth}-${startDay}`;
      const endDate = `${endYear}-${endMonth}-${endDay}`;

      // Store dates and move to next step
      state.startDate = startDate;
      state.endDate = endDate;
      state.step = 2;
      this.qazoInputService.inputStates.set(userId, state);

      await ctx.reply(
        "🗓️ Sana oralig'i: " +
          text +
          "\n\n" +
          "Qaysi namozlar uchun qazo ayirmoqchisiz?\n\n" +
          "Masalan:\n" +
          '• "bomdod peshin"\n' +
          '• "barchasi"\n' +
          '• "asr shom qufton"\n\n' +
          "❌ Bekor qilish uchun /cancel ni bosing",
      );
    } else if (state.step === 2) {
      // Parse prayers
      const prayers = this.parsePrayers(text);
      if (!prayers || prayers.length === 0) {
        await ctx.reply(
          '❌ Noto\'g\'ri namozlar! Iltimos, "bomdod peshin asr shom qufton" yoki "barchasi" deb kiriting',
        );
        return;
      }

      const qazoData = {};
      prayers.forEach((prayer) => {
        qazoData[prayer] = -1; // 1 ta qazo ayirish
      });

      try {
        await this.qazoInputService.addQazoToDatabase(userId, qazoData);
        await ctx.reply(
          `✅ ${state.startDate} dan ${state.endDate} gacha ${prayers.join(", ")} namozi uchun qazo ayirildi!`,
          Markup.inlineKeyboard([
            [Markup.button.callback("🏠 Bosh menu", "menu_main")],
          ]),
        );
        this.qazoInputService.inputStates.delete(userId);
      } catch (error) {
        console.error("Error in handleRemoveDateRangeInput:", error);
        await ctx.reply("❌ Xatolik yuz berdi. Qaytadan urining.");
      }
    }
  }

  parsePrayers(text) {
    const prayerMap = {
      bomdod: "fajr",
      peshin: "dhuhr",
      asr: "asr",
      shom: "maghrib",
      qufton: "isha",
      barchasi: ["fajr", "dhuhr", "asr", "maghrib", "isha"],
    };

    const words = text.toLowerCase().split(" ");
    const prayers = [];

    for (const word of words) {
      if (prayerMap[word]) {
        if (word === "barchasi") {
          return prayerMap[word];
        }
        prayers.push(prayerMap[word]);
      }
    }

    return prayers.length > 0 ? prayers : null;
  }

  async getCityFromLocation(latitude, longitude) {
    // O'zbekiston shaharlari koordinatalari
    const uzbekistanCities = [
      {
        name: "Toshkent",
        lat: 41.2995,
        lon: 69.2401,
        timezone: "Asia/Tashkent",
        country: "Uzbekistan",
      },
      {
        name: "Samarqand",
        lat: 39.6542,
        lon: 66.9597,
        timezone: "Asia/Samarkand",
        country: "Uzbekistan",
      },
      {
        name: "Buxoro",
        lat: 39.7681,
        lon: 64.4555,
        timezone: "Asia/Samarkand",
        country: "Uzbekistan",
      },
      {
        name: "Farg'ona",
        lat: 40.3842,
        lon: 71.7845,
        timezone: "Asia/Tashkent",
        country: "Uzbekistan",
      },
      {
        name: "Andijon",
        lat: 40.7821,
        lon: 72.3442,
        timezone: "Asia/Tashkent",
        country: "Uzbekistan",
      },
      {
        name: "Namangan",
        lat: 40.9983,
        lon: 71.6726,
        timezone: "Asia/Tashkent",
        country: "Uzbekistan",
      },
      {
        name: "Qarshi",
        lat: 38.8606,
        lon: 65.7896,
        timezone: "Asia/Samarkand",
        country: "Uzbekistan",
      },
      {
        name: "Nukus",
        lat: 42.4531,
        lon: 59.6103,
        timezone: "Asia/Tashkent",
        country: "Uzbekistan",
      },
      {
        name: "Jizzax",
        lat: 40.1153,
        lon: 67.8422,
        timezone: "Asia/Tashkent",
        country: "Uzbekistan",
      },
      {
        name: "Guliston",
        lat: 39.4954,
        lon: 67.3745,
        timezone: "Asia/Tashkent",
        country: "Uzbekistan",
      },
      {
        name: "Termiz",
        lat: 37.2242,
        lon: 67.2783,
        timezone: "Asia/Samarkand",
        country: "Uzbekistan",
      },
      {
        name: "Navoiy",
        lat: 40.0947,
        lon: 65.3777,
        timezone: "Asia/Samarkand",
        country: "Uzbekistan",
      },
    ];

    // Eng yaqin shaharni topamiz
    let closestCity = null;
    let minDistance = Infinity;

    for (const city of uzbekistanCities) {
      const distance = this.calculateDistance(
        latitude,
        longitude,
        city.lat,
        city.lon,
      );

      if (distance < minDistance && distance < 100) {
        // 100 km radius ichida
        minDistance = distance;
        closestCity = {
          city: city.name,
          timezone: city.timezone,
          country: city.country,
        };
      }
    }

    return closestCity;
  }

  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) *
        Math.cos(this.toRad(lat2)) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  toRad(deg) {
    return deg * (Math.PI / 180);
  }

  async start() {
    // TEST MODE initialize qilish
    this.initializeTestMode();

    await this.initialize();

    // Global error handling
    this.bot.catch((err, ctx) => {
      console.error("Bot error occurred:", {
        error: err.message,
        stack: err.stack,
        update: ctx.update,
      });
    });

    // Unhandled promise rejection handling
    process.on("unhandledRejection", (reason, promise) => {
      console.error("Unhandled Rejection at:", promise, "reason:", reason);
    });

    // Uncaught exception handling
    process.on("uncaughtException", (error) => {
      console.error("Uncaught Exception:", error);
      // Botni to'xtatmaymiz, log qilib qo'yamiz
    });

    this.bot.launch();
    console.log("Qazo AI bot is running...");
  }

  async stop() {
    await this.reminderService.stop();
    await this.db.close();
    this.bot.stop();
  }
}

const bot = new QazoBot();
bot.start().catch(console.error);

process.once("SIGINT", () => bot.stop());
process.once("SIGTERM", () => bot.stop());
