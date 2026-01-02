class QazoService {
    constructor(db) {
        this.db = db;
        this.prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    }

    async getOrCreateQazoCount(userId) {
        const query = 'SELECT * FROM qazo_count WHERE user_id = ?';
        try {
            let qazo = await this.db.get(query, [userId]);
            
            if (!qazo) {
                const insertQuery = `
                    INSERT INTO qazo_count (user_id, total_count)
                    VALUES (?, 0)
                `;
                await this.db.run(insertQuery, [userId]);
                qazo = await this.db.get(query, [userId]);
            }
            
            return qazo;
        } catch (error) {
            console.error('Error getting/creating qazo count:', error);
            throw error;
        }
    }

    async addQazo(userId, prayerName) {
        const qazo = await this.getOrCreateQazoCount(userId);
        const query = `
            UPDATE qazo_count 
            SET ${prayerName}_count = ${prayerName}_count + 1,
                total_count = total_count + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `;
        try {
            await this.db.run(query, [userId]);
            return await this.getOrCreateQazoCount(userId);
        } catch (error) {
            console.error('Error adding qazo:', error);
            throw error;
        }
    }

    async getQazoSummary(userId) {
        const qazo = await this.getOrCreateQazoCount(userId);
        const summary = {
            total: qazo.total_count,
            details: {}
        };
        
        for (const prayer of this.prayers) {
            summary.details[prayer] = qazo[`${prayer}_count`] || 0;
        }
        
        return summary;
    }

    async resetQazo(userId) {
        const query = `
            UPDATE qazo_count 
            SET fajr_count = 0, dhuhr_count = 0, asr_count = 0,
                maghrib_count = 0, isha_count = 0, total_count = 0,
                updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ?
        `;
        try {
            await this.db.run(query, [userId]);
            return await this.getOrCreateQazoCount(userId);
        } catch (error) {
            console.error('Error resetting qazo:', error);
            throw error;
        }
    }
}

module.exports = QazoService;
