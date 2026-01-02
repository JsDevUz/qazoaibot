const adhan = require('adhan');
const moment = require('moment-timezone');

class PrayerTimesService {
    constructor(db) {
        this.db = db;
    }

    calculatePrayerTimes(date, latitude, longitude, timezone) {
        const coordinates = new adhan.Coordinates(latitude, longitude);
        const params = adhan.CalculationMethod.MuslimWorldLeague();
        params.madhab = adhan.Madhab.Hanafi;
        
        const prayerTimes = new adhan.PrayerTimes(coordinates, date, params);
        
        return {
            fajr: moment(prayerTimes.fajr).tz(timezone).format('HH:mm'),
            dhuhr: moment(prayerTimes.dhuhr).tz(timezone).format('HH:mm'),
            asr: moment(prayerTimes.asr).tz(timezone).format('HH:mm'),
            maghrib: moment(prayerTimes.maghrib).tz(timezone).format('HH:mm'),
            isha: moment(prayerTimes.isha).tz(timezone).format('HH:mm')
        };
    }

    getCityCoordinates(city) {
        const cities = {
            'Tashkent': { lat: 41.2649, lng: 69.2163 },
            'Samarkand': { lat: 39.6542, lng: 66.9597 },
            'Bukhara': { lat: 39.7681, lng: 64.4554 },
            'Fergana': { lat: 40.3745, lng: 71.7847 },
            'Namangan': { lat: 40.9983, lng: 71.6726 },
            'Andijan': { lat: 40.7821, lng: 72.3442 },
            'Karshi': { lat: 38.8606, lng: 65.7896 },
            'Nukus': { lat: 42.4531, lng: 59.6102 }
        };
        
        return cities[city] || cities['Tashkent'];
    }

    async getTodayPrayerTimes(userId, userCity = 'Tashkent', userTimezone = 'Asia/Tashkent') {
        const today = new Date();
        const date = today.toISOString().split('T')[0];
        
        const coords = this.getCityCoordinates(userCity);
        const times = this.calculatePrayerTimes(today, coords.lat, coords.lng, userTimezone);
        
        return times;
    }

    async savePrayerTimesForUser(userId, userCity, userTimezone) {
        const today = new Date();
        const date = today.toISOString().split('T')[0];
        
        const times = await this.getTodayPrayerTimes(userId, userCity, userTimezone);
        
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
            return times;
        } catch (error) {
            console.error('Error saving prayer times:', error);
            throw error;
        }
    }

    isPrayerTime(currentTime, prayerTime, toleranceMinutes = 5) {
        const current = moment(currentTime, 'HH:mm');
        const prayer = moment(prayerTime, 'HH:mm');
        const diff = current.diff(prayer, 'minutes');
        
        return diff >= -toleranceMinutes && diff <= toleranceMinutes;
    }

    getNextPrayer(times, currentTime) {
        const prayers = [
            { name: 'fajr', time: times.fajr, displayName: '🌅 Bomdod' },
            { name: 'dhuhr', time: times.dhuhr, displayName: '☀️ Peshin' },
            { name: 'asr', time: times.asr, displayName: '🌇 Asr' },
            { name: 'maghrib', time: times.maghrib, displayName: '🌆 Shom' },
            { name: 'isha', time: times.isha, displayName: '🌙 Qufton' }
        ];
        
        const current = moment(currentTime, 'HH:mm');
        
        for (const prayer of prayers) {
            const prayerTime = moment(prayer.time, 'HH:mm');
            if (current.isBefore(prayerTime) || current.isSame(prayerTime)) {
                return prayer;
            }
        }
        
        return null;
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
}

module.exports = PrayerTimesService;
