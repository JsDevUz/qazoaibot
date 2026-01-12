const cron = require('node-cron');
const moment = require('moment-timezone');
const { Markup } = require('telegraf');

class ReminderService {
    constructor(bot, prayerService, qazoService, db, userService, prayerTimesService) {
        this.bot = bot;
        this.prayerService = prayerService;
        this.qazoService = qazoService;
        this.db = db;
        this.userService = userService;
        this.prayerTimesService = prayerTimesService;
        this.activeReminders = new Map();
        this.pendingReminders = new Map(); // Yangi: pending eslatmalarni saqlash
        this.pendingPrayerReminders = new Map(); // Pending prayer reminders uchun
        this.missedReminders = new Map(); // Missed eslatmalar uchun
        this.checkInterval = null;
    }

    async start() {
        console.log('Starting reminder service...');
        
        // Har daqiqa - aniq namoz vaqtini tekshirish
        cron.schedule('*/1 * * * *', async () => {
            await this.checkPrayerTimes();
        });
        
        // Har 10 daqiqa - pending namozlarni eslatish
        cron.schedule('*/10 * * * *', async () => {
            await this.checkPendingPrayers();
        });
        
        // Har kecha yarim kechada eslatmalarni tozalash
        cron.schedule('0 0 * * *', async () => {
            await this.clearDailyReminders();
        });
        
        console.log('Reminder service started');
    }

    async stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }
        console.log('Reminder service stopped');
    }

    async checkPrayerTimes() {
        try {
            const users = await this.getAllUsers();
            
            for (const user of users) {
                // User timezone ga mos vaqtni olamiz
                const userTimezone = user.timezone || 'Asia/Tashkent';
                const currentTime = moment().tz(userTimezone).format('HH:mm');
                await this.checkUserPrayerTimes(user, currentTime);
            }
        } catch (error) {
            console.error('Error checking prayer times:', error);
        }
    }

    async checkPendingPrayers() {
        try {
            const users = await this.getAllUsers();
            
            for (const user of users) {
                // User timezone ga mos vaqtni olamiz
                const userTimezone = user.timezone || 'Asia/Tashkent';
                const currentTime = moment().tz(userTimezone).format('HH:mm');
                await this.checkUserPendingPrayers(user, currentTime);
            }
        } catch (error) {
            console.error('Error checking pending prayers:', error);
        }
    }

    async checkUserPrayerTimes(user, currentTime) {
        const today = new Date().toISOString().split('T')[0];
        const times = await this.getPrayerTimes(user.telegram_id, today);
        
        if (!times) return;
        
        const prayers = [
            { name: 'fajr', time: times.fajr, displayName: '🌅 Bomdod' },
            { name: 'dhuhr', time: times.dhuhr, displayName: '☀️ Peshin' },
            { name: 'asr', time: times.asr, displayName: '🌇 Asr' },
            { name: 'maghrib', time: times.maghrib, displayName: '🌆 Shom' },
            { name: 'isha', time: times.isha, displayName: '🌙 Qufton' }
        ];
        
        for (const prayer of prayers) {
            const key = `${user.telegram_id}_${prayer.name}_${today}`;
            
            // Faqat bir marta eslatish uchun tekshiramiz
            if (!this.activeReminders.has(key) && this.isPrayerTime(currentTime, prayer.time)) {
                await this.sendPrayerReminder(user, prayer);
                // Eslatma yuborilganini belgilaymiz
                this.activeReminders.set(key, true);
            }
        }
    }

    async checkUserPendingPrayers(user, currentTime) {
        const today = new Date().toISOString().split('T')[0];
        const record = await this.prayerService.getOrCreatePrayerRecord(user.telegram_id, today);
        const times = await this.getPrayerTimes(user.telegram_id, today);
        
        if (!times) return;
        
        const current = moment(currentTime, 'HH:mm');
        
        // Hozirgi vaqtdagi namozni topamiz
        const currentPrayer = this.getCurrentPrayer(current, times);
        
        if (!currentPrayer) {
            console.log(`No current prayer found for time ${currentTime}`);
            return;
        }
        
        const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
        
        for (const prayer of prayers) {
            const prayerTime = moment(times[prayer], 'HH:mm');
            const status = record[`${prayer}_status`];
            
            console.log(`Checking ${prayer}: current=${currentTime}, prayer=${times[prayer]}, status=${status}`);
            
            // Faqat pending statusdagi namozlarni tekshiramiz
            if (status === 'pending') {
                const activeKey = `${user.telegram_id}_${prayer}_${today}`;
                const pendingKey = `${user.telegram_id}_${prayer}`;
                
                // Vaqti o'tgan bo'lsa
                if (current.isAfter(prayerTime)) {
                    // Agar bu hozirgi namoz bo'lsa, pending eslatma yuboramiz
                    if (prayer === currentPrayer) {
                        console.log(`Sending pending reminder for ${prayer} (current prayer)`);
                        await this.sendPendingPrayerReminder(user, prayer);
                    } else {
                        // O'tgan namozlar uchun keyingi namoz vaqtini tekshiramiz
                        const nextPrayerIndex = this.getNextPrayerIndex(prayer);
                        const nextPrayer = this.getPrayerByIndex(nextPrayerIndex);
                        
                        let shouldSendMissed = false;
                        if (nextPrayer) {
                            const nextPrayerTime = moment(times[nextPrayer], 'HH:mm');
                            shouldSendMissed = current.isAfter(nextPrayerTime);
                        } else {
                            // Isha dan keyin ertangi bomdodgacha
                            shouldSendMissed = current.isAfter(moment('23:59', 'HH:mm'));
                        }
                        
                        if (shouldSendMissed) {
                            console.log(`Sending missed reminder for ${prayer}`);
                            await this.sendMissedPrayerReminder(user, prayer);
                        } else {
                            console.log(`Sending pending reminder for ${prayer}`);
                            await this.sendPendingPrayerReminder(user, prayer);
                        }
                    }
                }
            }
        }
    }

    async sendPrayerReminder(user, prayer) {
        const today = new Date().toISOString().split('T')[0];
        const record = await this.prayerService.getOrCreatePrayerRecord(user.telegram_id, today);
        const status = record[`${prayer.name}_status`];
        
        if (status === 'pending') {
            const prayerNames = {
                fajr: '🌅 Bomdod',
                dhuhr: '☀️ Peshin',
                asr: '🌇 Asr',
                maghrib: '🌆 Shom',
                isha: '🌙 Qufton'
            };
            
            await this.bot.telegram.sendMessage(
                user.telegram_id,
                `⏰ ${prayerNames[prayer.name]} vaqti kirdi!\n\n` +
                `Namozni o'qiganingizni belgilang:`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Ha, o\'qidim', `prayer_${prayer.name}_read`)],
                    [Markup.button.callback('⏰ Keyinroq', `prayer_${prayer.name}_later`)]
                ])
            );
        }
    }

    async sendPendingPrayerReminder(user, prayerName) {
        const prayerNames = {
            fajr: '🌅 Bomdod',
            dhuhr: '☀️ Peshin',
            asr: '🌇 Asr',
            maghrib: '🌆 Shom',
            isha: '🌙 Qufton'
        };
        
        const key = `${user.telegram_id}_${prayerName}`;
        
        // Avvalgi eslatmani o'chirish
        if (this.pendingReminders.has(key)) {
            try {
                const messageId = this.pendingReminders.get(key);
                await this.bot.telegram.deleteMessage(user.telegram_id, messageId);
                console.log(`Deleted previous reminder for ${prayerName}`);
            } catch (error) {
                console.log('Could not delete previous reminder:', error.message);
            }
        }
        
        // Yangi eslatma yuborish
        const message = await this.bot.telegram.sendMessage(
            user.telegram_id,
            `⏰ ${prayerNames[prayerName]} namozini o'qidingizmi?\n\n` +
            `Har 10 daqiqada so'rab boramiz`,
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Ha, o\'qidim', `prayer_${prayerName}_read`)],
                [Markup.button.callback('⏰ Keyinroq', `prayer_${prayerName}_later`)]
            ])
        );
        
        // Yangi eslatma ID sini saqlash
        this.pendingReminders.set(key, message.message_id);
    }

    async sendMissedPrayerReminder(user, prayerName) {
        const prayerNames = {
            fajr: '🌅 Bomdod',
            dhuhr: '☀️ Peshin',
            asr: '🌇 Asr',
            maghrib: '🌆 Shom',
            isha: '🌙 Qufton'
        };
        
        const key = `${user.telegram_id}_${prayerName}`;
        
        // Avvalgi eslatmani o'chirish
        if (this.missedReminders.has(key)) {
            try {
                const messageId = this.missedReminders.get(key);
                await this.bot.telegram.deleteMessage(user.telegram_id, messageId);
                console.log(`Deleted previous missed reminder for ${prayerName}`);
            } catch (error) {
                console.log('Could not delete previous missed reminder:', error.message);
            }
        }
        
        // Yangi eslatma yuborish
        const message = await this.bot.telegram.sendMessage(
            user.telegram_id,
            `⚠️ ${prayerNames[prayerName]} namozini o'qilmadingiz!\n\n` +
            `Qazo qildingizmi?`,
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Ha, o\'qidim', `prayer_${prayerName}_read`)],
                [Markup.button.callback('❌ Qazo bo\'ldi', `prayer_${prayerName}_missed`)]
            ])
        );
        
        // Yangi eslatma ID sini saqlash
        this.missedReminders.set(key, message.message_id);
    }

    isPrayerTime(currentTime, prayerTime, toleranceMinutes = 2) {
        const current = moment(currentTime, 'HH:mm');
        const prayer = moment(prayerTime, 'HH:mm');
        const diff = Math.abs(current.diff(prayer, 'minutes'));
        
        return diff <= toleranceMinutes;
    }

    shouldSendMissedReminder(user, prayer, currentTime) {
        // Agar namoz vaqti 10-30 daqiqa oldin o'tgan bo'lsa va eslatma yuborilmagan bo'lsa
        const prayerTime = moment(prayer.time, 'HH:mm');
        const current = moment(currentTime, 'HH:mm');
        const diffMinutes = current.diff(prayerTime, 'minutes');
        
        // Namoz vaqti 10-30 daqiqa oldin o'tgan bo'lsa
        return diffMinutes >= 10 && diffMinutes <= 30;
    }

    getMissedPrayers(times, currentTime) {
        const prayers = [
            { name: 'fajr', time: times.fajr },
            { name: 'dhuhr', time: times.dhuhr },
            { name: 'asr', time: times.asr },
            { name: 'maghrib', time: times.maghrib },
            { name: 'isha', time: times.isha }
        ];
        
        const current = moment(currentTime, 'HH:mm');
        const missed = [];
        
        for (const prayer of prayers) {
            const prayerTime = moment(prayer.time, 'HH:mm');
            if (current.isAfter(prayerTime)) {
                missed.push(prayer.name);
            }
        }
        
        return missed;
    }

    getPrayerByIndex(index) {
        const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
        return index >= 0 && index < prayers.length ? prayers[index] : null;
    }

    getNextPrayerIndex(prayerName) {
        const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
        const currentIndex = prayers.indexOf(prayerName);
        return currentIndex < prayers.length - 1 ? currentIndex + 1 : -1;
    }

    getCurrentPrayer(currentTime, times) {
        const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
        
        for (let i = 0; i < prayers.length; i++) {
            const prayer = prayers[i];
            const prayerTime = moment(times[prayer], 'HH:mm');
            
            // Keyingi namozni topamiz
            const nextPrayerIndex = i < prayers.length - 1 ? i + 1 : 0;
            const nextPrayer = prayers[nextPrayerIndex];
            const nextPrayerTime = moment(times[nextPrayer], 'HH:mm');
            
            // Agar hozirgi vaqt bu namoz vaqtidan keyinroq bo'lsa va keyingi namoz vaqtidan oldinroq bo'lsa
            if (currentTime.isAfter(prayerTime) && currentTime.isBefore(nextPrayerTime)) {
                return prayer;
            }
        }
        
        // Agar hech qaysi oraliqda bo'lmasa, oxirgi namozni qaytaramiz
        return 'isha';
    }

    async getPrayerTimes(userId, date) {
        try {
            const user = await this.userService.getUser(userId);
            return await this.prayerTimesService.getTodayPrayerTimes(userId, user.city || 'Tashkent', user.timezone || 'Asia/Tashkent');
        } catch (error) {
            console.error('Error getting prayer times:', error);
            return null;
        }
    }

    async getAllUsers() {
        const query = 'SELECT * FROM users';
        try {
            return await this.db.all(query);
        } catch (error) {
            console.error('Error getting users:', error);
            return [];
        }
    }

    async clearDailyReminders() {
        console.log('Clearing daily reminders...');
        this.activeReminders.clear();
        this.pendingReminders.clear();
        this.pendingPrayerReminders.clear();
        this.missedReminders.clear();
    }
}

module.exports = ReminderService;
