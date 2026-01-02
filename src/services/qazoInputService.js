const { Markup } = require('telegraf');

class QazoInputService {
    constructor(bot, qazoService, userService, db) {
        this.bot = bot;
        this.qazoService = qazoService;
        this.userService = userService;
        this.db = db;
        this.inputStates = new Map();
    }

    setupHandlers() {
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

        this.bot.action('qazo_by_period', async (ctx) => {
            const userId = ctx.from.id;
            this.inputStates.set(userId, { mode: 'period', step: 1 });
            
            await ctx.reply(
                '📅 Oy/Yil bo\'yicha qazo kiritish:\n\n' +
                'Qancha vaqt qazo qilgansiz?\n\n' +
                'Masalan:\n' +
                '• "2 yil 3 oy"\n' +
                '• "6 oy"\n' +
                '• "1 yil"\n\n' +
                'Format: "X yil Y oy" yoki "X oy" yoki "X yil"'
            );
            await ctx.answerCbQuery();
        });

        this.bot.action('qazo_by_count', async (ctx) => {
            const userId = ctx.from.id;
            this.inputStates.set(userId, { mode: 'count', step: 1 });
            
            await ctx.reply(
                '🔢 Har bir namoz uchun qazo soni:\n\n' +
                '🌅 Bomdod: nechta qazo?\n\n' +
                'Faqat sonni kiriting (masalan: 45)'
            );
            await ctx.answerCbQuery();
        });

        this.bot.on('message', async (ctx) => {
            const userId = ctx.from.id;
            const state = this.inputStates.get(userId);
            
            if (!state) return;
            
            const text = ctx.message.text.trim();
            
            if (state.mode === 'period') {
                await this.handlePeriodInput(ctx, userId, text, state);
            } else if (state.mode === 'count') {
                await this.handleCountInput(ctx, userId, text, state);
            }
        });
    }

    async handlePeriodInput(ctx, userId, text, state) {
        if (state.step === 1) {
            const periodData = this.parsePeriod(text);
            
            if (!periodData) {
                await ctx.reply(
                    '❌ Noto\'g\'ri format! Qaytadan urining:\n\n' +
                    'Masalan: "2 yil 3 oy" yoki "6 oy" yoki "1 yil"'
                );
                return;
            }
            
            const totalDays = this.calculateTotalDays(periodData);
            const qazoCount = Math.floor(totalDays * 5); // 5 namoz kuniga
            
            await ctx.reply(
                `📊 Hisoblash natijasi:\n\n` +
                `📅 ${periodData.years} yil ${periodData.months} oy = ${totalDays} kun\n` +
                `🕌 Jami qazo: ${qazoCount} ta namoz\n\n` +
                `Har bir namoz uchun taqsimlash:\n` +
                `🌅 Bomdod: ${qazoCount} ta\n` +
                `☀️ Peshin: ${qazoCount} ta\n` +
                `🌇 Asr: ${qazoCount} ta\n` +
                `🌆 Shom: ${qazoCount} ta\n` +
                `🌙 Qufton: ${qazoCount} ta\n\n` +
                `Bu qazolarni qo\'shishni tasdiqlaysizmi?`,
                Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Tasdiqlash', `confirm_period_${qazoCount}`)],
                    [Markup.button.callback('❌ Bekor qilish', 'cancel_qazo')]
                ])
            );
            
            this.inputStates.set(userId, { ...state, step: 2, qazoCount });
        }
    }

    async handleCountInput(ctx, userId, text, state) {
        const prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
        const prayerNames = {
            fajr: '🌅 Bomdod',
            dhuhr: '☀️ Peshin',
            asr: '🌇 Asr',
            maghrib: '🌆 Shom',
            isha: '🌙 Qufton'
        };
        
        const currentPrayer = prayers[state.step - 1];
        const count = parseInt(text);
        
        if (isNaN(count) || count < 0) {
            await ctx.reply('❌ Iltimos, faqat musbat son kiriting!');
            return;
        }
        
        if (!state.counts) state.counts = {};
        state.counts[currentPrayer] = count;
        
        if (state.step < 5) {
            const nextPrayer = prayers[state.step];
            state.step++;
            this.inputStates.set(userId, state);
            
            await ctx.reply(`${prayerNames[nextPrayer]}: nechta qazo?`);
        } else {
            // Barcha namozlar kiritildi
            let summary = '📊 Kiritilgan qazolar:\n\n';
            let total = 0;
            
            for (const prayer of prayers) {
                summary += `${prayerNames[prayer]}: ${state.counts[prayer]} ta\n`;
                total += state.counts[prayer];
            }
            
            summary += `\n🔢 Jami: ${total} ta\n\n`;
            summary += 'Bu qazolarni qo\'shishni tasdiqlaysizmi?';
            
            await ctx.reply(
                summary,
                Markup.inlineKeyboard([
                    [Markup.button.callback('✅ Tasdiqlash', 'confirm_count')],
                    [Markup.button.callback('❌ Bekor qilish', 'cancel_qazo')]
                ])
            );
            
            this.inputStates.set(userId, { ...state, step: 6 });
        }
    }

    parsePeriod(text) {
        const yearMatch = text.match(/(\d+)\s*yil/i);
        const monthMatch = text.match(/(\d+)\s*oy/i);
        
        const years = yearMatch ? parseInt(yearMatch[1]) : 0;
        const months = monthMatch ? parseInt(monthMatch[1]) : 0;
        
        if (years === 0 && months === 0) {
            return null;
        }
        
        return { years, months };
    }

    calculateTotalDays(period) {
        return period.years * 365 + period.months * 30;
    }

    async addQazoToDatabase(userId, qazoData) {
        try {
            // First ensure user exists and get their database ID
            const userQuery = 'SELECT id FROM users WHERE telegram_id = ?';
            const user = await this.db.get(userQuery, [userId]);
            
            if (!user) {
                throw new Error('User not found in database');
            }
            
            const dbUserId = user.id;
            
            // Ensure qazo_count record exists
            await this.qazoService.getOrCreateQazoCount(userId);
            
            // Update qazo counts
            for (const [prayer, count] of Object.entries(qazoData)) {
                const query = `
                    UPDATE qazo_count 
                    SET ${prayer}_count = ${prayer}_count + ?,
                        total_count = total_count + ?,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE user_id = ?
                `;
                await this.db.run(query, [count, count, dbUserId]);
            }
            
            return await this.qazoService.getOrCreateQazoCount(userId);
        } catch (error) {
            console.error('Error adding qazo:', error);
            throw error;
        }
    }

    setupConfirmationHandlers() {
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
                await this.addQazoToDatabase(userId, qazoData);
                await ctx.reply('✅ Qazolar muvaffaqiyatli qo\'shildi!');
                this.inputStates.delete(userId);
            } catch (error) {
                await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urining.');
            }
            
            await ctx.answerCbQuery();
        });

        this.bot.action('confirm_count', async (ctx) => {
            const userId = ctx.from.id;
            const state = this.inputStates.get(userId);
            
            if (!state || !state.counts) {
                await ctx.reply('❌ Ma\'lumotlar topilmadi. Qaytadan boshlang.');
                await ctx.answerCbQuery();
                return;
            }
            
            try {
                await this.addQazoToDatabase(userId, state.counts);
                await ctx.reply('✅ Qazolar muvaffaqiyatli qo\'shildi!');
                this.inputStates.delete(userId);
            } catch (error) {
                await ctx.reply('❌ Xatolik yuz berdi. Qaytadan urining.');
            }
            
            await ctx.answerCbQuery();
        });

        this.bot.action('cancel_qazo', async (ctx) => {
            const userId = ctx.from.id;
            this.inputStates.delete(userId);
            await ctx.reply('❌ Qazo kiritish bekor qilindi.');
            await ctx.answerCbQuery();
        });
    }
}

module.exports = QazoInputService;
