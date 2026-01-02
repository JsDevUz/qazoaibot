class PrayerService {
    constructor(db) {
        this.db = db;
        this.prayers = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'];
    }

    async getOrCreatePrayerRecord(userId, date) {
        const query = 'SELECT * FROM prayer_records WHERE user_id = ? AND date = ?';
        try {
            let record = await this.db.get(query, [userId, date]);
            
            if (!record) {
                const insertQuery = `
                    INSERT INTO prayer_records (user_id, date)
                    VALUES (?, ?)
                `;
                await this.db.run(insertQuery, [userId, date]);
                record = await this.db.get(query, [userId, date]);
            }
            
            return record;
        } catch (error) {
            console.error('Error getting/creating prayer record:', error);
            throw error;
        }
    }

    async updatePrayerStatus(userId, date, prayerName, status) {
        const query = `
            UPDATE prayer_records 
            SET ${prayerName}_status = ?, updated_at = CURRENT_TIMESTAMP
            WHERE user_id = ? AND date = ?
        `;
        try {
            await this.db.run(query, [status, userId, date]);
            return await this.getOrCreatePrayerRecord(userId, date);
        } catch (error) {
            console.error('Error updating prayer status:', error);
            throw error;
        }
    }

    async getTodayPrayerRecord(userId) {
        const today = new Date().toISOString().split('T')[0];
        return await this.getOrCreatePrayerRecord(userId, today);
    }

    async getPendingPrayers(userId, date) {
        const record = await this.getOrCreatePrayerRecord(userId, date);
        const pending = [];
        
        for (const prayer of this.prayers) {
            if (record[`${prayer}_status`] === 'pending') {
                pending.push(prayer);
            }
        }
        
        return pending;
    }

    async savePrayerTimes(userId, date, times) {
        const query = `
            INSERT OR REPLACE INTO prayer_times 
            (user_id, date, fajr_time, dhuhr_time, asr_time, maghrib_time, isha_time)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        `;
        try {
            await this.db.run(query, [
                userId, date,
                times.fajr, times.dhuhr, times.asr, times.maghrib, times.isha
            ]);
        } catch (error) {
            console.error('Error saving prayer times:', error);
            throw error;
        }
    }

    async getPrayerTimes(userId, date) {
        const query = 'SELECT * FROM prayer_times WHERE user_id = ? AND date = ?';
        try {
            return await this.db.get(query, [userId, date]);
        } catch (error) {
            console.error('Error getting prayer times:', error);
            throw error;
        }
    }
}

module.exports = PrayerService;
