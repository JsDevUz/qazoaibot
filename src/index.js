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
            // Command larni olib tashlaymiz, faqat action lar bilan ishlamiz
        });

        this.bot.command('qazo', async (ctx) => {
            // Command larni olib tashlaymiz, faqat action lar bilan ishlamiz
        });

        this.bot.command('help', async (ctx) => {
            // Command larni olib tashlaymiz, faqat action lar bilan ishlamiz
        });

        this.bot.action('save_qazo_status', async (ctx) => {
            await ctx.reply('✅ Qazo holati saqlab qolindi!', Markup.inlineKeyboard([
                [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
            ]));
            await ctx.answerCbQuery();
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

        this.bot.action(/confirm_remove_period_(.+)/, async (ctx) => {
            const userId = ctx.from.id;
            const qazoCount = parseInt(ctx.match[1]);
            
            const qazoData = {
                fajr: -qazoCount,
                dhuhr: -qazoCount,
                asr: -qazoCount,
                maghrib: -qazoCount,
                isha: -qazoCount
            };
            
            try {
                await this.qazoInputService.addQazoToDatabase(userId, qazoData);
                await ctx.editMessageText('✅ Qazolar muvaffaqiyatli ayirildi!', Markup.inlineKeyboard([
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

        this.bot.action(/confirm_remove_count_(.+)/, async (ctx) => {
            const userId = ctx.from.id;
            const count = parseInt(ctx.match[1]);
            
            const state = this.qazoInputService.inputStates.get(userId);
            
            if (!state || !state.counts) {
                await ctx.editMessageText('❌ Ma\'lumotlar topilmadi. Qaytadan boshlang.', Markup.inlineKeyboard([
                    [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                ]));
                await ctx.answerCbQuery();
                return;
            }
            
            const qazoData = {};
            for (const [prayer, prayerCount] of Object.entries(state.counts)) {
                qazoData[prayer] = -prayerCount;
            }
            
            try {
                await this.qazoInputService.addQazoToDatabase(userId, qazoData);
                await ctx.editMessageText('✅ Qazolar muvaffaqiyatli ayirildi!', Markup.inlineKeyboard([
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
            const user = await this.userService.getUser(userId);
            const currentTime = new Date().toLocaleString('uz-UZ', { 
                hour: '2-digit', 
                minute: '2-digit', 
                second: '2-digit',
                hour12: false,
                timeZone: user.timezone || 'Asia/Tashkent'
            });
            
            const prayerNames = {
                fajr: '🌅 Bomdod',
                dhuhr: '☀️ Peshin',
                asr: '🌇 Asr',
                maghrib: '🌆 Shom',
                isha: '🌙 Qufton'
            };
            
            let message = '📊 Sizning qazo holatingiz:\n\n';
            message += `🔢 Jami qazo: ${qazoSummary.total}\n`;
            message += `🕐 Vaqt: ${currentTime}\n\n`;
            
            for (const [prayer, count] of Object.entries(qazoSummary.details)) {
                message += `${prayerNames[prayer]}: ${count} ta\n`;
            }
            
            await ctx.editMessageText(message, Markup.inlineKeyboard([
                [Markup.button.callback('💾 Saqlab qolish', 'save_qazo_status')]            ]));
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

        this.bot.action('remove_qazo_count', async (ctx) => {
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
                'Vaqtni zonalarni va shaharni sozlash uchun tugmalardan foydalaning:\n\n' +
                '📍 Yoki lokatsiyangizni yuboring - avtomatik aniqlanadi!',
                Markup.inlineKeyboard([
                    [Markup.button.callback('🌍 Toshkent', 'set_tashkent')],
                    [Markup.button.callback('🌍 Samarqand', 'set_samarkand')],
                    [Markup.button.callback('🌍 Buxoro', 'set_bukhara')],
                    [Markup.button.callback('🌍 Farg\'ona', 'set_fergana')],
                    [Markup.button.callback('📍 Lokatsiya yuborish', 'request_location')],
                    [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                ])
            );
            await ctx.answerCbQuery();
        });

        this.bot.action('request_location', async (ctx) => {
            await ctx.reply(
                '📍 Lokatsiyangizni yuboring:\n\n' +
                'Quyidagi tugmani bosing va lokatsiyangizni tanlang:',
                Markup.keyboard([
                    [Markup.button.locationRequest('📍 Lokatsiya yuborish')]
                ]).resize().oneTime()
            );
            await ctx.answerCbQuery();
        });

        this.bot.on('location', async (ctx) => {
            const userId = ctx.from.id;
            const location = ctx.message.location;
            
            try {
                // Lokatsiya bo'yicha shaharni aniqlaymiz
                const cityInfo = await this.getCityFromLocation(location.latitude, location.longitude);
                
                if (cityInfo) {
                    // User ma'lumotlarini yangilaymiz
                    await this.userService.updateUserLocation(userId, cityInfo.city, cityInfo.timezone, cityInfo.country);
                    
                    await ctx.reply(
                        `✅ Lokatsiya aniqlandi!\n\n` +
                        `🏙️ Shahar: ${cityInfo.city}\n` +
                        `🌍 Davlat: ${cityInfo.country}\n` +
                        `⏰ Vaqt zonasi: ${cityInfo.timezone}\n\n` +
                        `Namoz vaqtlari ${cityInfo.city} uchun sozlandi!`,
                        Markup.inlineKeyboard([
                            [Markup.button.callback('🏠 Bosh menu', 'menu_main')]
                        ])
                    );
                } else {
                    await ctx.reply(
                        '❌ Kechirasiz, bu lokatsiya uchun shaharni aniqlab bo\'lmadi.\n\n' +
                        'Iltimos, qo\'lda shaharni tanlang:',
                        Markup.inlineKeyboard([
                            [Markup.button.callback('🌍 Toshkent', 'set_tashkent')],
                            [Markup.button.callback('🌍 Samarqand', 'set_samarkand')],
                            [Markup.button.callback('🌍 Buxoro', 'set_bukhara')],
                            [Markup.button.callback('🌍 Farg\'ona', 'set_fergona')]
                        ])
                    );
                }
            } catch (error) {
                console.error('Error processing location:', error);
                await ctx.reply(
                    '❌ Xatolik yuz berdi. Iltimos, qaytadan urining yoki shaharni qo\'lda tanlang.',
                    Markup.inlineKeyboard([
                        [Markup.button.callback('🌍 Toshkent', 'set_tashkent')],
                        [Markup.button.callback('🌍 Samarqand', 'set_samarkand')],
                        [Markup.button.callback('🌍 Buxoro', 'set_bukhara')],
                        [Markup.button.callback('🌍 Farg\'ona', 'set_fergana')]
                    ])
                );
            }
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
                '🔹 Bot faqat tugmalar (action) orqali ishlaydi\n\n' +
                '� Asosiy funksiyalar:\n' +
                '• � Qazo holati - qazolaringizni ko\'rish\n' +
                '• � Bugungi namozlar - kunlik namoz holati\n' +
                '• � Namoz vaqtlari - bugungi vaqtlar\n' +
                '• � Qazo qo\'shish - eski qazolarni kiritish\n' +
                '• ⚙️ Sozlamalar - shahar va vaqt zonasi\n\n' +
                '🤖 Bot avtomatik ravishda:\n' +
                '• Namoz vaqtlarida eslatish yuboradi\n' +
                '• Har 10 daqiqada so\'rab boradi\n' +
                '• Lokatsiya orqali shaharni aniqlaydi\n\n' +
                '📍 Lokatsiya yuborish orqali avtomatik shaharni aniqlashingiz mumkin!',
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
                
                // Eslatmani tozalash
                const key = `${userId}_${prayer}`;
                this.reminderService.pendingReminders.delete(key);
                
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
                } else if (state.mode === 'remove_period') {
                    await this.handleRemovePeriodInput(ctx, userId, text, state);
                    return;
                } else if (state.mode === 'remove_count') {
                    await this.handleRemoveCountInput(ctx, userId, text, state);
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

    async handleRemovePeriodInput(ctx, userId, text, state) {
        if (state.step === 1) {
            const periodData = this.qazoInputService.parsePeriod(text);
            
            if (!periodData) {
                await ctx.reply(
                    '❌ Noto\'g\'ri format! Qaytadan urining:\n\n' +
                    'Masalan: "2 yil 3 oy 5 kun" yoki "6 oy 10 kun" yoki "15 kun" yoki "1 yil"'
                );
                return;
            }
            
            const totalDays = this.qazoInputService.calculateTotalDays(periodData);
            const qazoCount = Math.floor(totalDays * 5); // 5 namoz kuniga
            
            await ctx.reply(
                `📊 Hisoblash natijasi:\n\n` +
                `📅 ${periodData.years} yil ${periodData.months} oy ${periodData.days} kun = ${totalDays} kun\n` +
                `🕌 Jami qazo: ${qazoCount} ta namoz\n\n` +
                `Har bir namoz uchun taqsimlash:\n` +
                `🌅 Bomdod: ${qazoCount} ta\n` +
                `☀️ Peshin: ${qazoCount} ta\n` +
                `🌇 Asr: ${qazoCount} ta\n` +
                `🌆 Shom: ${qazoCount} ta\n` +
                `🌙 Qufton: ${qazoCount} ta\n\n` +
                `Bu qazolarni ayirishni tasdiqlaysizmi?`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Tasdiqlash', `confirm_remove_period_${qazoCount}`)],
                    [Markup.button.callback('❌ Bekor qilish', 'cancel_qazo')]
                ])
            );
            
            this.qazoInputService.inputStates.set(userId, { ...state, step: 2, qazoCount, periodData });
        }
    }

    async handleRemoveCountInput(ctx, userId, text, state) {
        if (state.step === 1) {
            const count = parseInt(text.trim());
            
            if (isNaN(count) || count <= 0) {
                await ctx.reply('❌ Noto\'g\'ri son! Iltimos, musbat son kiriting:');
                return;
            }
            
            await ctx.reply(
                `🔢 Qazo ayirish:\n\n` +
                `🌅 Bomdod: ${count} ta\n` +
                `☀️ Peshin: ${count} ta\n` +
                `🌇 Asr: ${count} ta\n` +
                `🌆 Shom: ${count} ta\n` +
                `🌙 Qufton: ${count} ta\n\n` +
                `Jami: ${count * 5} ta qazo ayiriladi\n\n` +
                `Tasdiqlaysizmi?`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Tasdiqlash', `confirm_remove_count_${count}`)],
                    [Markup.button.callback('❌ Bekor qilish', 'cancel_qazo')]
                ])
            );
            
            this.qazoInputService.inputStates.set(userId, { ...state, step: 2, count });
        }
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

    async getCityFromLocation(latitude, longitude) {
        // O'zbekiston shaharlari koordinatalari
        const uzbekistanCities = [
            { name: 'Toshkent', lat: 41.2995, lon: 69.2401, timezone: 'Asia/Tashkent', country: 'Uzbekistan' },
            { name: 'Samarqand', lat: 39.6542, lon: 66.9597, timezone: 'Asia/Samarkand', country: 'Uzbekistan' },
            { name: 'Buxoro', lat: 39.7681, lon: 64.4555, timezone: 'Asia/Samarkand', country: 'Uzbekistan' },
            { name: 'Farg\'ona', lat: 40.3842, lon: 71.7845, timezone: 'Asia/Tashkent', country: 'Uzbekistan' },
            { name: 'Andijon', lat: 40.7821, lon: 72.3442, timezone: 'Asia/Tashkent', country: 'Uzbekistan' },
            { name: 'Namangan', lat: 40.9983, lon: 71.6726, timezone: 'Asia/Tashkent', country: 'Uzbekistan' },
            { name: 'Qarshi', lat: 38.8606, lon: 65.7896, timezone: 'Asia/Samarkand', country: 'Uzbekistan' },
            { name: 'Nukus', lat: 42.4531, lon: 59.6103, timezone: 'Asia/Tashkent', country: 'Uzbekistan' },
            { name: 'Jizzax', lat: 40.1153, lon: 67.8422, timezone: 'Asia/Tashkent', country: 'Uzbekistan' },
            { name: 'Guliston', lat: 39.4954, lon: 67.3745, timezone: 'Asia/Tashkent', country: 'Uzbekistan' },
            { name: 'Termiz', lat: 37.2242, lon: 67.2783, timezone: 'Asia/Samarkand', country: 'Uzbekistan' },
            { name: 'Navoiy', lat: 40.0947, lon: 65.3777, timezone: 'Asia/Samarkand', country: 'Uzbekistan' }
        ];

        // Eng yaqin shaharni topamiz
        let closestCity = null;
        let minDistance = Infinity;

        for (const city of uzbekistanCities) {
            const distance = this.calculateDistance(latitude, longitude, city.lat, city.lon);
            
            if (distance < minDistance && distance < 100) { // 100 km radius ichida
                minDistance = distance;
                closestCity = {
                    city: city.name,
                    timezone: city.timezone,
                    country: city.country
                };
            }
        }

        return closestCity;
    }

    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    toRad(deg) {
        return deg * (Math.PI/180);
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
