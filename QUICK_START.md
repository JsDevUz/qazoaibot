# 🚀 Quick Start Guide - Updated Bot Features

## Database Migration

The bot will automatically add the new columns on first run:

- `is_blocked` (default: 0)
- `last_activity_update_at` (default: CURRENT_TIMESTAMP)

No manual database migration needed!

## New Cron Jobs

These run automatically:

```
* Every 1 min   → Check prayer times & send reminders
* Every 10 min  → Check pending prayers & send pending reminders
* Every hour    → Check & block inactive users (48+ hours)
* At 23:59      → Auto-convert pending to missed, send final report
* At 00:00      → Clear daily reminder cache
```

## User Blocking Flow

### Normal User (Day 1-2)

```
User logs in → Activity tracked → Reminders sent normally
(last_activity_update_at updated with each button press)
```

### After 48 Hours of Inactivity

```
Cron job (hourly) detects inactive user
  ↓
User blocked (is_blocked = 1)
  ↓
Notification sent: "⚠️ Siz 2 kun davomida botdan foydalanmagan edingiz uchun bloklandingiz"
  ↓
Reminders STOP
```

### User Unblocks

```
User presses /start
  ↓
Check if blocked
  ↓
If blocked → Unblock (is_blocked = 0)
  ↓
Update last_activity_update_at = NOW
  ↓
Send: "✅ Blok o'chirildi. Yana botdan foydalanishingiz mumkin!"
  ↓
Reminders RESUME
```

## Daily Flow (23:59)

```
23:59:00 → handleEndOfDayAutoQazo() runs
           ├─ Get all non-blocked users
           ├─ For each user:
           │  ├─ Mark any "pending" prayers as "missed" (qazo)
           │  ├─ Increment qazo count
           │  ├─ Send status report (without buttons)
           │  └─ Send "Qazo holati saqlab qolindi!" with menu
           └─ Done
```

## Removed Features

- ❌ "⏰ Keyinroq" (Later) button - REMOVED
- ❌ "💾 Saqlab qolish" button from menu_qazo - REMOVED

## New Features

- ✅ Auto-block after 2 days inactivity
- ✅ Pending reminder NOT deleted when sending missed reminder
- ✅ Qazo status shows without buttons, then menu appears
- ✅ 23:40 evening deadline (not next day's Fajr)
- ✅ 23:59 automatic pending→missed conversion
- ✅ 23:59 daily report with main menu

## Testing

Start bot:

```bash
npm start
# or for development
npm run dev
```

Test blocking (requires waiting 48 hours):

```javascript
// Or manually test in database:
// UPDATE users SET last_activity_update_at = datetime('now', '-3 days')
// WHERE telegram_id = YOUR_ID;
```

## Database Queries for Testing

```sql
-- Check user's blocking status
SELECT telegram_id, is_blocked, last_activity_update_at
FROM users
WHERE telegram_id = USER_ID;

-- Find blocked users
SELECT * FROM users WHERE is_blocked = 1;

-- Find inactive users (48+ hours)
SELECT * FROM users
WHERE datetime('now', '-48 hours') > last_activity_update_at
AND is_blocked = 0;

-- Manually unblock user
UPDATE users SET is_blocked = 0 WHERE telegram_id = USER_ID;

-- Manually block user
UPDATE users SET is_blocked = 1 WHERE telegram_id = USER_ID;

-- Reset activity timestamp
UPDATE users
SET last_activity_update_at = CURRENT_TIMESTAMP
WHERE telegram_id = USER_ID;
```

## Error Handling

All new features have error handling:

- Try-catch blocks on all database operations
- Failed blocking notifications don't crash bot
- Failed end-of-day reports logged but don't affect bot

## Monitoring

Check logs for:

```
Blocking check: "Checking for inactive users..."
Block action: "User XXXX blocked: No activity for 2 days"
Block notify: Success/failure of notification
End-of-day: "Executing end-of-day auto-qazo conversion at 23:59..."
```
