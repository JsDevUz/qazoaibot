class AdminService {
    constructor(bot, userService) {
        this.bot = bot;
        this.userService = userService;
        this.ADMIN_ID = 7792937377;
    }

    async sendNewUserNotification(user) {
        const message = `🆕 Yangi user qo'shildi!

👤 Ism: ${user.first_name || 'Noma\'lum'}
🔹 Username: ${user.username || '@username yo\'q'}
🆔 Telegram ID: ${user.telegram_id}
📅 Qo'shilgan vaqti: ${user.created_at}

📊 Jami userlar sonini ko'rish uchun: /stats`;

        try {
            await this.bot.telegram.sendMessage(this.ADMIN_ID, message);
            console.log(`Admin notification sent for new user: ${user.telegram_id}`);
        } catch (error) {
            console.error('Error sending admin notification:', error);
        }
    }

    async sendStatsNotification() {
        try {
            const allUsers = await this.userService.getAllUsers();
            const totalUsers = allUsers.length;
            
            const message = `📊 Bot statistikasi:

👥 Jami userlar: ${totalUsers} ta
📅 Hisoblanish vaqti: ${new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}

🔹 Har bir user uchun xabar yuborish: /broadcast <xabar>
🔹 Statistikani yangilash: /stats`;

            await this.bot.telegram.sendMessage(this.ADMIN_ID, message);
            console.log(`Stats notification sent: ${totalUsers} users`);
        } catch (error) {
            console.error('Error sending stats notification:', error);
        }
    }

    async sendBroadcastToAllUsers(message) {
        try {
            const allUsers = await this.userService.getAllUsers();
            let successCount = 0;
            let errorCount = 0;

            console.log(`Starting broadcast to ${allUsers.length} users...`);

            for (const user of allUsers) {
                try {
                    await this.bot.telegram.sendMessage(user.telegram_id, message);
                    successCount++;
                    console.log(`✅ Sent to user ${user.telegram_id} (${successCount}/${allUsers.length})`);
                    
                    // Har bir userdan keyin 100ms kutamiz (DDOS dan saqlanish uchun)
                    await new Promise(resolve => setTimeout(resolve, 100));
                    
                } catch (error) {
                    console.error(`❌ Failed to send to user ${user.telegram_id}:`, error.message);
                    errorCount++;
                    
                    // Agar user botni bloklagan bo'lsa, keyingisiga o'tamiz
                    if (error.message.includes('chat not found') || error.message.includes('bot was blocked')) {
                        console.log(`⚠️ User ${user.telegram_id} blocked the bot, skipping...`);
                        continue;
                    }
                }
            }

            const reportMessage = `📢 Broadcast xabari yuborildi:

✅ Muvaffaqiyatli: ${successCount} ta userga
❌ Xatolik: ${errorCount} ta userga
📊 Jami: ${allUsers.length} ta user

🔹 Xabar matni: "${message}"
🔹 Yuborilgan vaqt: ${new Date().toLocaleString('uz-UZ', { timeZone: 'Asia/Tashkent' })}`;

            await this.bot.telegram.sendMessage(this.ADMIN_ID, reportMessage);
            console.log(`Broadcast completed: ${successCount} success, ${errorCount} errors`);
            
            return { successCount, errorCount, total: allUsers.length };
        } catch (error) {
            console.error('Error sending broadcast:', error);
            throw error;
        }
    }

    isAdmin(userId) {
        return userId === this.ADMIN_ID;
    }
}

module.exports = AdminService;
