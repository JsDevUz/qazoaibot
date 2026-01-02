# Qazo AI Telegram Bot

Telegram bot for tracking missed prayers (qazo) with prayer time reminders.

## Features

- 🕌 **Prayer Time Reminders**: Automatic notifications when prayer times begin
- 📊 **Qazo Tracking**: Counts and tracks missed prayers
- 🔔 **10-Minute Intervals**: Checks every 10 minutes for pending prayers
- 🌍 **Location Support**: Multiple Uzbekistan cities with accurate prayer times
- 📱 **Interactive Interface**: Easy-to-use Telegram bot interface
- 💾 **Persistent Storage**: SQLite database for user data and prayer records

## Technology Stack

- **Telegraf.js** - Telegram bot framework
- **SQLite3** - Database for user and prayer data
- **Node-cron** - Scheduled tasks and reminders
- **Adhan** - Islamic prayer times calculation
- **Moment-timezone** - Timezone handling

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd qazo-ai-telegram-bot
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
cp .env.example .env
```

4. Configure your bot token in `.env`:
```
BOT_TOKEN=your_telegram_bot_token_here
DB_PATH=./database/qazo_bot.db
TIMEZONE=Asia/Tashkent
COUNTRY=UZ
CITY=Tashkent
```

5. Create database directory:
```bash
mkdir -p database
```

## Usage

### Starting the Bot

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

### Bot Commands

- `/start` - Start the bot and register user
- `/settings` - Configure location and timezone
- `/qazo` - View current qazo (missed prayers) count
- `/today` - View today's prayer status
- `/help` - Show help information

### Bot Features

1. **Automatic Reminders**: Bot sends notifications when prayer times begin
2. **Prayer Tracking**: Users can mark prayers as read or missed
3. **Qazo Calculation**: Automatically counts missed prayers
4. **Location Settings**: Support for major Uzbekistan cities
5. **Persistent Storage**: All data saved in SQLite database

## Project Structure

```
src/
├── index.js                 # Main bot entry point
├── database/
│   ├── database.js          # Database connection and setup
│   ├── userService.js       # User management
│   ├── prayerService.js     # Prayer tracking
│   └── qazoService.js       # Qazo calculation
├── services/
│   ├── prayerTimesService.js # Prayer times calculation
│   └── reminderService.js   # Reminder system
└── utils/
    └── (utility functions)
```

## Database Schema

### Users Table
- `telegram_id` - User's Telegram ID
- `username` - Telegram username
- `first_name` - User's first name
- `timezone` - User's timezone
- `city` - User's city
- `country` - User's country

### Prayer Records Table
- `user_id` - Reference to user
- `date` - Date of prayer record
- `fajr_status` - Bomdod prayer status
- `dhuhr_status` - Peshin prayer status
- `asr_status` - Asr prayer status
- `maghrib_status` - Shom prayer status
- `isha_status` - Qufton prayer status

### Qazo Count Table
- `user_id` - Reference to user
- `fajr_count` - Missed bomdod count
- `dhuhr_count` - Missed peshin count
- `asr_count` - Missed asr count
- `maghrib_count` - Missed shom count
- `isha_count` - Missed qufton count
- `total_count` - Total missed prayers

### Prayer Times Table
- `user_id` - Reference to user
- `date` - Date of prayer times
- `fajr_time` - Bomdod time
- `dhuhr_time` - Peshin time
- `asr_time` - Asr time
- `maghrib_time` - Shom time
- `isha_time` - Qufton time

## Supported Cities

- Toshkent (Tashkent)
- Samarqand (Samarkand)
- Buxoro (Bukhara)
- Farg'ona (Fergana)
- Namangan
- Andijan
- Karshi
- Nukus

## Prayer Status Values

- `pending` - Prayer time hasn't passed or not yet marked
- `read` - Prayer has been read
- `missed` - Prayer was missed (becomes qazo)

## Cron Jobs

The bot uses two cron jobs:

1. **Every minute** (`*/1 * * * *`): Check if prayer times have begun
2. **Every 10 minutes** (`*/10 * * * *`): Check for pending prayers and send reminders

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License

## Support

For issues and questions, please create an issue in the repository.
# qazoaibot
