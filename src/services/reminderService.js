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
        
        const prayers = [
            { name: 'fajr', time: times.fajr },
            { name: 'dhuhr', time: times.dhuhr },
            { name: 'asr', time: times.asr },
            { name: 'maghrib', time: times.maghrib },
            { name: 'isha', time: times.isha }
        ];
        
        const current = moment(currentTime, 'HH:mm');
        
        for (const prayer of prayers) {
            const prayerTime = moment(prayer.time, 'HH:mm');
            const status = record[`${prayer.name}_status`];
            
            console.log(`Checking ${prayer.name}: current=${currentTime}, prayer=${prayer.time}, status=${status}`);
            
            // Faqat pending statusdagi namozlarni tekshiramiz
            if (status === 'pending') {
                const activeKey = `${user.telegram_id}_${prayer.name}_${today}`;
                const pendingKey = `${user.telegram_id}_${prayer.name}`;
                
                // Keyingi namoz vaqtini topamiz
                const nextPrayerIndex = this.getNextPrayerIndex(prayer.name);
                const nextPrayer = this.getPrayerByIndex(nextPrayerIndex);
                
                let shouldSendReminder = false;
                
                if (nextPrayer) {
                    // Keyingi namoz bor - keyingi namoz vaqti kirganda vaqt o'tgan hisoblanadi
                    const nextPrayerTime = moment(times[nextPrayer], 'HH:mm');
                    shouldSendReminder = current.isAfter(nextPrayerTime);
                } else {
                    // Keyingi namoz yo'q (isha) - ertangi bomdodgacha
                    // Kecha 23:59 dan keyin vaqt o'tgan hisoblanadi
                    shouldSendReminder = current.isAfter(moment('23:59', 'HH:mm'));
                }
                
                // Faqat vaqt o'tgan bo'lsa eslatma yuboramiz
                if (shouldSendReminder) {
                    console.log(`Sending missed reminder for ${prayer.name}`);
                    // Namoz vaqti o'tib ketgan - missed eslatma yuboramiz
                    await this.sendMissedPrayerReminder(user, prayer.name);
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
        if (this.pendingReminders.has(key)) {
            try {
                const messageId = this.pendingReminders.get(key);
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
        this.pendingReminders.set(key, message.message_id);
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
    }
}

module.exports = ReminderService;
