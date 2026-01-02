const { Markup } = require('telegraf');

class PrayerTimesDisplayService {
    constructor(bot, prayerTimesService, userService) {
        this.bot = bot;
        this.prayerTimesService = prayerTimesService;
        this.userService = userService;
    }

    setupHandlers() {
        this.bot.command('times', async (ctx) => {
            await this.showPrayerTimes(ctx.from.id);
        });

        this.bot.action('refresh_times', async (ctx) => {
            await this.showPrayerTimes(ctx.from.id);
            await ctx.answerCbQuery();
        });
    }

    async showPrayerTimes(userId) {
        try {
            const user = await this.userService.getUser(userId);
            const today = new Date().toISOString().split('T')[0];
            
            let times = await this.prayerTimesService.getTodayPrayerTimes(userId, user.city || 'Tashkent', user.timezone || 'Asia/Tashkent');
            
            // Save to database
            await this.prayerTimesService.savePrayerTimesForUser(
                userId, 
                user.city || 'Tashkent', 
                user.timezone || 'Asia/Tashkent'
            );

            const prayerNames = {
                fajr: '🌅 Bomdod',
                dhuhr: '☀️ Peshin', 
                asr: '🌇 Asr',
                maghrib: '🌆 Shom',
                isha: '🌙 Qufton'
            };

            const currentTime = new Date().toLocaleTimeString('uz-UZ', { 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: false,
                timeZone: user.timezone || 'Asia/Tashkent'
            });

            let message = `🕌 ${user.city || 'Toshkent'} uchun bugungi namoz vaqtlari\n\n`;
            message += `📅 ${today}\n`;
            message += `🕐 Hozirgi vaqt: ${currentTime}\n\n`;

            for (const [key, name] of Object.entries(prayerNames)) {
                const time = times[key];
                const status = this.getPrayerStatus(time, currentTime);
                
                message += `${name}: ${time} ${status}\n`;
            }

            message += `📊 Namoz holatini ko'rish uchun /today`;
            message += `\n🔄 Vaqtlarni yangilash uchun pastdagi tugmani bosing`;

            await this.bot.telegram.sendMessage(
                userId,
                message,
                Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Vaqtlarni yangilash', 'refresh_times')]
                ])
            );

        } catch (error) {
            console.error('Error showing prayer times:', error);
            await this.bot.telegram.sendMessage(
                userId,
                '❌ Namoz vaqtlarini ko\'rsatishda xatolik yuz berdi. Iltimos, qaytadan urining.'
            );
        }
    }

    getPrayerStatus(prayerTime, currentTime) {
        const current = new Date(`1970-01-01T${currentTime}:00`);
        const prayer = new Date(`1970-01-01T${prayerTime}:00`);
        
        const diffMinutes = (prayer - current) / (1000 * 60);
        
        if (diffMinutes > 0 && diffMinutes <= 30) {
            return '🔸 Tez orada';
        } else if (diffMinutes > 30) {
            return '⏳';
        } else if (diffMinutes >= -30 && diffMinutes <= 0) {
            return '🔴 Vaqt kirdi!';
        } else {
            return '✅ O\'tgan';
        }
    }

    async sendDailyPrayerTimes(userId) {
        const user = await this.userService.getUser(userId);
        const today = new Date().toISOString().split('T')[0];
        
        let times = await this.prayerTimesService.getPrayerTimes(userId, today);
        
        if (!times) {
            times = await this.prayerTimesService.savePrayerTimesForUser(
                userId, 
                user.city || 'Tashkent', 
                user.timezone || 'Asia/Tashkent'
            );
        }

        const prayerNames = {
            fajr: '🌅 Bomdod',
            dhuhr: '☀️ Peshin', 
            asr: '🌇 Asr',
            maghrib: '🌆 Shom',
            isha: '🌙 Qufton'
        };

        let message = `🕌 ${user.city || 'Toshkent'} uchun bugungi namoz vaqtlari\n\n`;
        message += `📅 ${today}\n\n`;

        for (const [key, name] of Object.entries(prayerNames)) {
            const time = times[`${key}_time`];
            message += `${name}: ${time}\n`;
        }

        message += `\n🤲 Alloh qabul qilsin!`;

        await this.bot.telegram.sendMessage(userId, message);
    }
}

module.exports = PrayerTimesDisplayService;
