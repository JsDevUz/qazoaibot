require('dotenv').config();
const { Telegraf, Markup } = require('telegraf');
const Database = require('./database/database');
const UserService = require('./database/userService');
const PrayerService = require('./database/prayerService');
const QazoService = require('./database/qazoService');
const PrayerTimesService = require('./services/prayerTimesService');
const ReminderService = require('./services/reminderService');
const PrayerTimesDisplayService = require('./services/prayerTimesDisplayService');
const QazoInputService = require('./services/qazoInputService');

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
        this.currentPrayerChecks = new Map();
    }

    async initialize() {
        await this.db.connect();
        this.userService = new UserService(this.db);
        this.prayerService = new PrayerService(this.db);
        this.qazoService = new QazoService(this.db);
        this.prayerTimesService = new PrayerTimesService(this.db);
        this.reminderService = new ReminderService(this.bot, this.prayerService, this.qazoService, this.db, this.userService, this.prayerTimesService);
        
        this.prayerTimesDisplayService = new PrayerTimesDisplayService(this.bot, this.prayerTimesService, this.userService);
        this.qazoInputService = new QazoInputService(this.bot, this.qazoService, this.userService, this.db);
        
        this.setupHandlers();
        this.prayerTimesDisplayService.setupHandlers();
        this.qazoInputService.setupHandlers();
        this.qazoInputService.setupConfirmationHandlers();
        await this.reminderService.start();
    }

    setupHandlers() {
        this.bot.start(async (ctx) => {
            const user = ctx.from;
            await this.userService.createUser(user.id, user.username, user.first_name);
            
            // User online bo'lganda pending eslatmalarni tekshiramiz
            await this.reminderService.checkUserPendingPrayers({ telegram_id: user.id });
            
            await ctx.reply(
                '🕌 Assalomu alaykum! Qazo AI botiga xush kelibsiz!\n\n' +
                'Bu bot sizning namozlaringizni kuzatib boradi va qazo qilgan namozlaringizni hisoblaydi.\n\n' +
                '📝 Bot quyidagi funksiyalarni bajaradi:\n' +
                '• Namoz vaqtlarini eslatish\n' +
                '• Namoz o\'qilganini kuzatish\n' +
                '• Qazo namozlarni hisoblash\n' +
                '• Har 10 daqiqada so\'rab borish\n' +
                '• Eski qazolarni kiritish\n\n' +
                'Quyidagi tugmalardan foydalaning:',
                Markup.inlineKeyboard([
                    [Markup.button.callback('📊 Qazo holati', 'menu_qazo')],
                    [Markup.button.callback('📅 Bugungi namozlar', 'menu_today')],
                    [Markup.button.callback('🕐 Namoz vaqtlari', 'menu_times')],
                    [Markup.button.callback('📝 Qazo qo\'shish', 'menu_addqazo')],
                    [Markup.button.callback('⚙️ Sozlamalar', 'menu_settings')],
                    [Markup.button.callback('❓ Yordam', 'menu_help')]
                ])
            );
        });

        this.bot.command('settings', async (ctx) => {
            await ctx.reply(
                '⚙️ Sozlamalar:\n\n' +
                'Vaqtni zonalarni va shaharni sozlash uchun tugmalardan foydalaning:',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🌍 Toshkent', 'set_tashkent')],
                    [Markup.button.callback('🌍 Samarqand', 'set_samarkand')],
                    [Markup.button.callback('🌍 Buxoro', 'set_bukhara')],
                    [Markup.button.callback('🌍 Farg\'ona', 'set_fergana')]
                ])
            );
        });

        this.bot.command('qazo', async (ctx) => {
            const userId = ctx.from.id;
            const qazoSummary = await this.qazoService.getQazoSummary(userId);
            
            let message = '📊 Sizning qazo holatingiz:\n\n';
            message += `🔢 Jami qazo: ${qazoSummary.total}\n\n`;
            
            const prayerNames = {
                fajr: '🌅 Bomdod',
                dhuhr: '☀️ Peshin',
                asr: '🌇 Asr',
                maghrib: '🌆 Shom',
                isha: '🌙 Qufton'
            };
            
            for (const [prayer, count] of Object.entries(qazoSummary.details)) {
                message += `${prayerNames[prayer]}: ${count} ta\n`;
            }
            
            await ctx.editMessageText(message, Markup.inlineKeyboard([
                [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
            ]));
        });

        this.bot.command('help', async (ctx) => {
            await ctx.reply(
                '❓ Yordam:\n\n' +
                '🔹 /start - Botni ishga tushurish\n' +
                '🔹 /settings - Sozlamalar\n' +
                '🔹 /qazo - Qazo holatini ko\'rish\n' +
                '🔹 /today - Bugungi namozlar\n' +
                '🔹 /addqazo - Eski qazolarni kiritish\n' +
                '🔹 /times - Bugungi namoz vaqtlari\n' +
                '🔹 /help - Yordam\n\n' +
                'Bot avtomatik ravishda namoz vaqtlarida eslatishlar yuboradi!\n\n' +
                'Bosh menyuga qaytish uchun /start ni bosing.',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                ])
            );
        });

        this.bot.action('menu_main', async (ctx) => {
            await ctx.editMessageText(
                '🕌 Assalomu alaykum! Qazo AI botiga xush kelibsiz!\n\n' +
                'Quyidagi tugmalardan foydalaning:',
                Markup.inlineKeyboard([
                    [Markup.button.callback('📊 Qazo holati', 'menu_qazo')],
                    [Markup.button.callback('📅 Bugungi namozlar', 'menu_today')],
                    [Markup.button.callback('🕐 Namoz vaqtlari', 'menu_times')],
                    [Markup.button.callback('📝 Qazo qo\'shish', 'menu_addqazo')],
                    [Markup.button.callback('⚙️ Sozlamalar', 'menu_settings')],
                    [Markup.button.callback('❓ Yordam', 'menu_help')]
                ])
            );
            await ctx.answerCbQuery();
        });

        this.bot.command('today', async (ctx) => {
            const userId = ctx.from.id;
            const record = await this.prayerService.getTodayPrayerRecord(userId);
            
            const prayerNames = {
                fajr: '🌅 Bomdod',
                dhuhr: '☀️ Peshin',
                asr: '🌇 Asr',
                maghrib: '🌆 Shom',
                isha: '🌙 Qufton'
            };
            
            const statusEmojis = {
                read: '✅',
                missed: '❌',
                pending: '⏳'
            };
            
            let message = '📅 Bugungi namozlar:\n\n';
            
            for (const prayer of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
                const status = record[`${prayer}_status`];
                message += `${prayerNames[prayer]} ${statusEmojis[status] || '⏳'}\n`;
            }
            
            await ctx.editMessageText(message, Markup.inlineKeyboard([
                [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
            ]));
        });

        this.bot.command('addqazo', async (ctx) => {
            const userId = ctx.from.id;
            
            await ctx.reply(
                '📝 Eski qazolarni kiritish:\n\n' +
                'Qanday usulda kiritmoqchisiz?',
                Markup.inlineKeyboard([
                    [Markup.button.callback('📅 Oy/Yil bo\'yicha', 'qazo_by_period')],
                    [Markup.button.callback('🔢 Har bir namozni sanab', 'qazo_by_count')]
                ])
            );
        });

        this.bot.command('times', async (ctx) => {
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
                isha: qazoCount
            };
            
            try {
                await this.qazoInputService.addQazoToDatabase(userId, qazoData);
                await ctx.editMessageText('✅ Qazolar muvaffaqiyatli qo\'shildi!', Markup.inlineKeyboard([
                    [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                ]));
                this.qazoInputService.inputStates.delete(userId);
            } catch (error) {
                await ctx.editMessageText('❌ Xatolik yuz berdi. Qaytadan urining.', Markup.inlineKeyboard([
                    [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                ]));
            }
            
            await ctx.answerCbQuery();
        });

        this.bot.action('confirm_count', async (ctx) => {
            const userId = ctx.from.id;
            const state = this.qazoInputService.inputStates.get(userId);
            
            if (!state || !state.counts) {
                await ctx.editMessageText('❌ Ma\'lumotlar topilmadi. Qaytadan boshlang.', Markup.inlineKeyboard([
                    [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                ]));
                await ctx.answerCbQuery();
                return;
            }
            
            try {
                await this.qazoInputService.addQazoToDatabase(userId, state.counts);
                await ctx.editMessageText('✅ Qazolar muvaffaqiyatli qo\'shildi!', Markup.inlineKeyboard([
                    [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                ]));
                this.qazoInputService.inputStates.delete(userId);
            } catch (error) {
                await ctx.editMessageText('❌ Xatolik yuz berdi. Qaytadan urining.', Markup.inlineKeyboard([
                    [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                ]));
            }
            
            await ctx.answerCbQuery();
        });

        this.bot.action('cancel_qazo', async (ctx) => {
            const userId = ctx.from.id;
            this.qazoInputService.inputStates.delete(userId);
            await ctx.editMessageText('❌ Qazo kiritish bekor qilindi.', Markup.inlineKeyboard([
                [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
            ]));
            await ctx.answerCbQuery();
        });

        this.bot.action('qazo_by_period', async (ctx) => {
            const userId = ctx.from.id;
            this.qazoInputService.inputStates.set(userId, { mode: 'period', step: 1 });
            
            await ctx.editMessageText(
                '📅 Oy/Yil bo\'yicha qazo kiritish:\n\n' +
                'Qancha vaqt qazo qilgansiz?\n\n' +
                'Masalan:\n' +
                '• "2 yil 3 oy"\n' +
                '• "6 oy"\n' +
                '• "1 yil"\n\n' +
                'Format: "X yil Y oy" yoki "X oy" yoki "X yil"\n\n' +
                '❌ Bekor qilish uchun /cancel ni bosing',
                Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Bekor qilish', 'cancel_qazo')]
                ])
            );
            await ctx.answerCbQuery();
        });

        this.bot.action('qazo_by_count', async (ctx) => {
            const userId = ctx.from.id;
            this.qazoInputService.inputStates.set(userId, { mode: 'count', step: 1 });
            
            await ctx.editMessageText(
                '🔢 Har bir namoz uchun qazo soni:\n\n' +
                '🌅 Bomdod: nechta qazo?\n\n' +
                'Faqat sonni kiriting (masalan: 45)\n\n' +
                '❌ Bekor qilish uchun /cancel ni bosing',
                Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Bekor qilish', 'cancel_qazo')]
                ])
            );
            await ctx.answerCbQuery();
        });

        this.bot.action('refresh_times', async (ctx) => {
            const userId = ctx.from.id;
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
                second: '2-digit',
                hour12: false,
                timeZone: user.timezone || 'Asia/Tashkent'
            });

            let message = `🕌 ${user.city || 'Toshkent'} uchun bugungi namoz vaqtlari\n\n`;
            message += `📅 ${today}\n`;
            message += `🕐 Hozirgi vaqt: ${currentTime}\n\n`;

            for (const [key, name] of Object.entries(prayerNames)) {
                const time = times[key];
                const status = this.prayerTimesDisplayService.getPrayerStatus(time, currentTime);
                
                message += `${name}: ${time} ${status}\n`;
            }

            message += `\n🔄 Yangilandi: ${new Date().toLocaleTimeString('uz-UZ', { 
                hour: '2-digit', 
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
                timeZone: user.timezone || 'Asia/Tashkent'
            })}`;

            try {
                await ctx.editMessageText(message, Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Vaqtlarni yangilash', 'refresh_times')],
                    [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                ]));
            } catch (error) {
                if (error.description.includes('message is not modified')) {
                    // Message is the same, just answer the callback
                    await ctx.answerCbQuery('Vaqtlar yangilandi!');
                    return;
                }
                throw error;
            }
            
            await ctx.answerCbQuery('Vaqtlar yangilandi!');
        });

        // Menu callback handlers
        this.bot.action('menu_qazo', async (ctx) => {
            const userId = ctx.from.id;
            const qazoSummary = await this.qazoService.getQazoSummary(userId);
            
            const prayerNames = {
                fajr: '🌅 Bomdod',
                dhuhr: '☀️ Peshin',
                asr: '🌇 Asr',
                maghrib: '🌆 Shom',
                isha: '🌙 Qufton'
            };
            
            let message = '📊 Sizning qazo holatingiz:\n\n';
            message += `🔢 Jami qazo: ${qazoSummary.total} ta\n\n`;
            
            for (const [prayer, count] of Object.entries(qazoSummary.details)) {
                message += `${prayerNames[prayer]}: ${count} ta\n`;
            }
            
            await ctx.editMessageText(message, Markup.inlineKeyboard([
                [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
            ]));
            await ctx.answerCbQuery();
        });

        this.bot.action('menu_today', async (ctx) => {
            const userId = ctx.from.id;
            const record = await this.prayerService.getTodayPrayerRecord(userId);
            
            const prayerNames = {
                fajr: '🌅 Bomdod',
                dhuhr: '☀️ Peshin',
                asr: '🌇 Asr',
                maghrib: '🌆 Shom',
                isha: '🌙 Qufton'
            };
            
            const statusEmojis = {
                read: '✅',
                missed: '❌',
                pending: '⏳'
            };
            
            let message = '📅 Bugungi namozlar:\n\n';
            
            for (const prayer of ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']) {
                const status = record[`${prayer}_status`];
                message += `${prayerNames[prayer]} ${statusEmojis[status] || '⏳'}\n`;
            }
            
            await ctx.editMessageText(message, Markup.inlineKeyboard([
                [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
            ]));
            await ctx.answerCbQuery();
        });

        this.bot.action('menu_times', async (ctx) => {
            const userId = ctx.from.id;
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
                second: '2-digit',
                hour12: false,
                timeZone: user.timezone || 'Asia/Tashkent'
            });

            let message = `🕌 ${user.city || 'Toshkent'} uchun bugungi namoz vaqtlari\n\n`;
            message += `📅 ${today}\n`;
            message += `🕐 Hozirgi vaqt: ${currentTime}\n\n`;

            for (const [key, name] of Object.entries(prayerNames)) {
                const time = times[key];
                const status = this.prayerTimesDisplayService.getPrayerStatus(time, currentTime);
                
                message += `${name}: ${time} ${status}\n`;
            }

            try {
                await ctx.editMessageText(message, Markup.inlineKeyboard([
                    [Markup.button.callback('🔄 Vaqtlarni yangilash', 'refresh_times')],
                    [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                ]));
            } catch (error) {
                if (error.description && error.description.includes('message is not modified')) {
                    // Message is the same, just answer the callback
                    await ctx.answerCbQuery();
                    return;
                }
                throw error;
            }
            await ctx.answerCbQuery();
        });

        this.bot.action('menu_addqazo', async (ctx) => {
            await ctx.editMessageText(
                '📝 Qazo boshqaruvi:\n\n' +
                'Qanday amalni bajarmoqchisiz?',
                Markup.inlineKeyboard([
                    [Markup.button.callback('➕ Qazo qo\'shish', 'add_qazo_menu')],
                    [Markup.button.callback('➖ Qazo ayrish', 'remove_qazo_menu')],
                    [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                ])
            );
            await ctx.answerCbQuery();
        });

        this.bot.action('add_qazo_menu', async (ctx) => {
            await ctx.editMessageText(
                '📝 Eski qazolarni kiritish:\n\n' +
                'Qanday usulda kiritmoqchisiz?',
                Markup.inlineKeyboard([
                    [Markup.button.callback('📅 Kun/Oy/Yil', 'qazo_by_period')],
                    [Markup.button.callback('🔢 Har bir namozni sanab', 'qazo_by_count')],
                    [Markup.button.callback('🗓️ Sana oralig\'i', 'qazo_by_date_range')],
                    [Markup.button.callback('🔙 Orqaga', 'menu_addqazo')]
                ])
            );
            await ctx.answerCbQuery();
        });

        this.bot.action('remove_qazo_menu', async (ctx) => {
            await ctx.editMessageText(
                '➖ Qazo ayrish:\n\n' +
                'Qanday usulda ayirmoqchisiz?',
                Markup.inlineKeyboard([
                    [Markup.button.callback('📅 Kun/Oy/Yil', 'remove_qazo_period')],
                    [Markup.button.callback('🔢 Har bir namozni sanab', 'remove_qazo_count')],
                    [Markup.button.callback('🗓️ Sana oralig\'i', 'remove_qazo_date_range')],
                    [Markup.button.callback('🔙 Orqaga', 'menu_addqazo')]
                ])
            );
            await ctx.answerCbQuery();
        });

        this.bot.action('menu_settings', async (ctx) => {
            await ctx.editMessageText(
                '⚙️ Sozlamalar:\n\n' +
                'Vaqtni zonalarni va shaharni sozlash uchun tugmalardan foydalaning:',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🌍 Toshkent', 'set_tashkent')],
                    [Markup.button.callback('🌍 Samarqand', 'set_samarkand')],
                    [Markup.button.callback('🌍 Buxoro', 'set_bukhara')],
                    [Markup.button.callback('🌍 Farg\'ona', 'set_fergana')],
                    [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                ])
            );
            await ctx.answerCbQuery();
        });

        this.bot.action('qazo_by_date_range', async (ctx) => {
            const userId = ctx.from.id;
            this.qazoInputService.inputStates.set(userId, { mode: 'date_range', step: 1 });
            
            await ctx.editMessageText(
                '🗓️ Sana oralig\'i bo\'yicha qazo kiritish:\n\n' +
                'Boshlanish va tugash sanalarini kiriting (DD.MM.YYYY - DD.MM.YYYY):\n\n' +
                'Masalan:\n' +
                '• "01.12.2025 - 31.12.2025"\n' +
                '• "15.06.2025 - 15.07.2025"\n' +
                '• "01.01.2025 - 01.01.2026"\n\n' +
                '❌ Bekor qilish uchun /cancel ni bosing',
                Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Bekor qilish', 'cancel_qazo')]
                ])
            );
            await ctx.answerCbQuery();
        });

        this.bot.action('remove_qazo_date_range', async (ctx) => {
            const userId = ctx.from.id;
            this.qazoInputService.inputStates.set(userId, { mode: 'remove_date_range', step: 1 });
            
            await ctx.editMessageText(
                '🗓️ Sana oralig\'i bo\'yicha qazo ayrish:\n\n' +
                'Boshlanish va tugash sanalarini kiriting (DD.MM.YYYY - DD.MM.YYYY):\n\n' +
                'Masalan:\n' +
                '• "01.12.2025 - 31.12.2025"\n' +
                '• "15.06.2025 - 15.07.2025"\n' +
                '• "01.01.2025 - 01.01.2026"\n\n' +
                '❌ Bekor qilish uchun /cancel ni bosing',
                Markup.inlineKeyboard([
                    [Markup.button.callback('❌ Bekor qilish', 'cancel_qazo')]
                ])
            );
            await ctx.answerCbQuery();
        });

        this.bot.action('menu_help', async (ctx) => {
            await ctx.editMessageText(
                '❓ Yordam:\n\n' +
                '🔹 /start - Botni ishga tushurish\n' +
                '🔹 /settings - Sozlamalar\n' +
                '🔹 /qazo - Qazo holatini ko\'rish\n' +
                '🔹 /today - Bugungi namozlar\n' +
                '🔹 /addqazo - Eski qazolarni kiritish\n' +
                '🔹 /times - Bugungi namoz vaqtlari\n' +
                '🔹 /help - Yordam\n\n' +
                'Bot avtomatik ravishda namoz vaqtlarida eslatishlar yuboradi!',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                ])
            );
            await ctx.answerCbQuery();
        });

        this.bot.action(/set_(.+)/, async (ctx) => {
            const city = ctx.match[1];
            const userId = ctx.from.id;
            
            const cityData = {
                tashkent: { city: 'Tashkent', country: 'UZ', timezone: 'Asia/Tashkent' },
                samarkand: { city: 'Samarkand', country: 'UZ', timezone: 'Asia/Samarkand' },
                bukhara: { city: 'Bukhara', country: 'UZ', timezone: 'Asia/Tashkent' },
                fergana: { city: 'Fergana', country: 'UZ', timezone: 'Asia/Tashkent' }
            };
            
            const data = cityData[city];
            await this.userService.updateUserTimezone(userId, data.timezone, data.city, data.country);
            
            await ctx.editMessageText(`✅ Sozlandi: ${data.city}, ${data.country}`, Markup.inlineKeyboard([
                [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
            ]));
            await ctx.answerCbQuery();
        });

        this.bot.on('callback_query', async (ctx) => {
            const data = ctx.callbackQuery.data;
            const userId = ctx.from.id;
            
            if (data.startsWith('prayer_')) {
                const [_, prayer, action] = data.split('_');
                
                if (action === 'read') {
                    await this.prayerService.updatePrayerStatus(userId, new Date().toISOString().split('T')[0], prayer, 'read');
                    await ctx.editMessageText(`✅ ${prayer} namozi o'qilgan deb belgilandi!`);
                } else if (action === 'missed') {
                    await this.prayerService.updatePrayerStatus(userId, new Date().toISOString().split('T')[0], prayer, 'missed');
                    await this.qazoService.addQazo(userId, prayer);
                    await ctx.editMessageText(`❌ ${prayer} namozi qazo qilindi!`);
                } else if (action === 'later') {
                    await ctx.editMessageText(`⏰ ${prayer} namozi uchun eslatma qayta yuboriladi.`);
                }
                
                await ctx.answerCbQuery();
            }
        });

        this.bot.on('message', async (ctx) => {
            const text = ctx.message.text;
            const userId = ctx.from.id;
            
            // Qazo input handler
            const state = this.qazoInputService.inputStates.get(userId);
            if (state) {
                if (state.mode === 'period') {
                    await this.qazoInputService.handlePeriodInput(ctx, userId, text, state);
                    return;
                } else if (state.mode === 'count') {
                    await this.qazoInputService.handleCountInput(ctx, userId, text, state);
                    return;
                } else if (state.mode === 'date_range') {
                    await this.handleDateRangeInput(ctx, userId, text, state);
                    return;
                } else if (state.mode === 'remove_date_range') {
                    await this.handleRemoveDateRangeInput(ctx, userId, text, state);
                    return;
                }
            }
            
            // Only handle text commands, ignore button presses since we use inline keyboards
        });
    }

    async handleDateRangeInput(ctx, userId, text, state) {
        if (state.step === 1) {
            // Parse date range
            const dateRangeMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})$/);
            if (!dateRangeMatch) {
                await ctx.reply('❌ Noto\'g\'ri format! Iltimos, DD.MM.YYYY - DD.MM.YYYY formatida kiriting (masalan: 01.12.2025 - 31.12.2025)');
                return;
            }

            const [, startDay, startMonth, startYear, endDay, endMonth, endYear] = dateRangeMatch;
            const startDate = `${startYear}-${startMonth}-${startDay}`;
            const endDate = `${endYear}-${endMonth}-${endDay}`;
            
            // Store dates and move to next step
            state.startDate = startDate;
            state.endDate = endDate;
            state.step = 2;
            this.qazoInputService.inputStates.set(userId, state);

            await ctx.reply(
                '🗓️ Sana oralig\'i: ' + text + '\n\n' +
                'Qaysi namozlar uchun qazo qo\'shmoqchisiz?\n\n' +
                'Masalan:\n' +
                '• "bomdod peshin"\n' +
                '• "barchasi"\n' +
                '• "asr shom qufton"\n\n' +
                '❌ Bekor qilish uchun /cancel ni bosing'
            );
        } else if (state.step === 2) {
            // Parse prayers
            const prayers = this.parsePrayers(text);
            
            if (!prayers || prayers.length === 0) {
                await ctx.reply('❌ Noto\'g\'ri namozlar! Iltimos, "bomdod peshin asr shom qufton" yoki "barchasi" deb kiriting');
                return;
            }

            const qazoData = {};
            prayers.forEach(prayer => {
                qazoData[prayer] = 1; // 1 ta qazo
            });

            try {
                await this.qazoInputService.addQazoToDatabase(userId, qazoData);
                await ctx.reply(`✅ ${state.startDate} dan ${state.endDate} gacha ${prayers.join(', ')} namozi uchun qazo qo'shildi!`, Markup.inlineKeyboard([
                    [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                ]));
                this.qazoInputService.inputStates.delete(userId);
            } catch (error) {
                console.error('Error in handleDateRangeInput:', error);
                await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urining.');
            }
        }
    }

    async handleRemoveDateRangeInput(ctx, userId, text, state) {
        if (state.step === 1) {
            // Parse date range
            const dateRangeMatch = text.match(/^(\d{2})\.(\d{2})\.(\d{4})\s*-\s*(\d{2})\.(\d{2})\.(\d{4})$/);
            if (!dateRangeMatch) {
                await ctx.reply('❌ Noto\'g\'ri format! Iltimos, DD.MM.YYYY - DD.MM.YYYY formatida kiriting (masalan: 01.12.2025 - 31.12.2025)');
                return;
            }

            const [, startDay, startMonth, startYear, endDay, endMonth, endYear] = dateRangeMatch;
            const startDate = `${startYear}-${startMonth}-${startDay}`;
            const endDate = `${endYear}-${endMonth}-${endDay}`;
            
            // Store dates and move to next step
            state.startDate = startDate;
            state.endDate = endDate;
            state.step = 2;
            this.qazoInputService.inputStates.set(userId, state);

            await ctx.reply(
                '🗓️ Sana oralig\'i: ' + text + '\n\n' +
                'Qaysi namozlar uchun qazo ayirmoqchisiz?\n\n' +
                'Masalan:\n' +
                '• "bomdod peshin"\n' +
                '• "barchasi"\n' +
                '• "asr shom qufton"\n\n' +
                '❌ Bekor qilish uchun /cancel ni bosing'
            );
        } else if (state.step === 2) {
            // Parse prayers
            const prayers = this.parsePrayers(text);
            if (!prayers || prayers.length === 0) {
                await ctx.reply('❌ Noto\'g\'ri namozlar! Iltimos, "bomdod peshin asr shom qufton" yoki "barchasi" deb kiriting');
                return;
            }

            const qazoData = {};
            prayers.forEach(prayer => {
                qazoData[prayer] = -1; // 1 ta qazo ayirish
            });

            try {
                await this.qazoInputService.addQazoToDatabase(userId, qazoData);
                await ctx.reply(`✅ ${state.startDate} dan ${state.endDate} gacha ${prayers.join(', ')} namozi uchun qazo ayirildi!`, Markup.inlineKeyboard([
                    [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                ]));
                this.qazoInputService.inputStates.delete(userId);
            } catch (error) {
                console.error('Error in handleRemoveDateRangeInput:', error);
                await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urining.');
            }
        }
    }

    parsePrayers(text) {
        const prayerMap = {
            'bomdod': 'fajr',
            'peshin': 'dhuhr',
            'asr': 'asr',
            'shom': 'maghrib',
            'qufton': 'isha',
            'barchasi': ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha']
        };

        const words = text.toLowerCase().split(' ');
        const prayers = [];

        for (const word of words) {
            if (prayerMap[word]) {
                if (word === 'barchasi') {
                    return prayerMap[word];
                }
                prayers.push(prayerMap[word]);
            }
        }

        return prayers.length > 0 ? prayers : null;
    }

    async start() {
        await this.initialize();
        this.bot.launch();
        console.log('Qazo AI bot is running...');
    }

    async stop() {
        await this.reminderService.stop();
        await this.db.close();
        this.bot.stop();
    }
}

const bot = new QazoBot();
bot.start().catch(console.error);

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());
