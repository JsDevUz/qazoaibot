# Technical Specifications - Qazo AI Bot Updates

## Architecture Overview

### Components Modified

1. **Database Layer** (database.js, userService.js)
2. **Reminder Service** (reminderService.js)
3. **Bot Controller** (index.js)

### Data Model Changes

#### Users Table

```sql
ALTER TABLE users ADD COLUMN is_blocked INTEGER DEFAULT 0;
ALTER TABLE users ADD COLUMN last_activity_update_at DATETIME DEFAULT CURRENT_TIMESTAMP;
```

## Feature Implementation Details

### 1. User Blocking System

#### Activity Tracking

- **Where**: Every callback_query handler in index.js
- **Method**: `updateLastActivity(telegramId)`
- **Frequency**: Every button press
- **Field Updated**: `users.last_activity_update_at`

#### Inactivity Detection

- **Cron Schedule**: `0 * * * *` (Every hour)
- **Method**: `checkAndBlockInactiveUsers()`
- **Threshold**: 48 hours (configurable in getInactiveUsers)
- **Query**: Checks users where `last_activity_update_at < NOW - 48 hours`

#### Blocking Action

```javascript
1. Get inactive users from database
2. For each user:
   - Call userService.blockUser(telegramId)
   - Sets is_blocked = 1
   - Try to send notification message
   - Log result
```

#### Unblocking

- **Trigger**: User presses /start
- **Check**: existingUser.is_blocked === 1
- **Action**: Call userService.unblockUser(telegramId)
- **Result**:
  - Sets is_blocked = 0
  - Updates last_activity_update_at = NOW
  - Sends confirmation message

### 2. Pending Reminder Preservation

#### Issue

When missed reminder was sent, it deleted ALL reminders including pending ones.

#### Solution

Modified `sendMissedPrayerReminder()`:

- Only deletes previous MISSED reminders (from this.missedReminders)
- Preserves PENDING reminders (from this.pendingReminders)
- Still deletes original prayer time reminder

#### Impact

Users see pending reminder every 10 minutes until they respond or it becomes missed.

### 3. Qazo Status Button Flow

#### Before (Old Behavior)

```
User clicks "Qazo holati" → Message edited with qazo status + "Save" button
```

#### After (New Behavior)

```
User clicks "Qazo holati"
  ↓
editMessageText() - Shows status WITHOUT buttons
  ↓
bot.telegram.sendMessage() - Sends main menu WITH buttons
```

#### Code Location

- File: src/index.js
- Handler: `this.bot.action('menu_qazo', ...)`
- Line: ~537-570

### 4. Evening Time Deadline Change

#### Previous Implementation

- Xufton (Isha) deadline was next day's Fajr
- Checked: `current.isAfter(moment('23:59', 'HH:mm'))`

#### New Implementation

- Xufton deadline is 23:40
- Checked: `current.isAfter(moment('23:40', 'HH:mm'))`

#### Logic

```
If nextPrayer exists:
  shouldSendMissed = current > nextPrayerTime
Else (after Isha):
  shouldSendMissed = current > 23:40  ← CHANGED
```

#### Impact

- Prayers still pending at 23:40 are treated as "missed"
- User gets missed reminder from 23:40-23:59
- At 23:59, auto-converted to qazo

### 5. Auto-Qazo Conversion at 23:59

#### Cron Job

```javascript
cron.schedule("59 23 * * *", async () => {
  await this.handleEndOfDayAutoQazo();
});
```

#### Process

```
1. Get all non-blocked users
2. For each user:
   a. Get today's prayer record
   b. For each prayer (fajr, dhuhr, asr, maghrib, isha):
      - If status === 'pending':
        - Update to 'missed'
        - Increment qazo count
   c. Send end-of-day report
```

#### Implementation Details

- **File**: src/services/reminderService.js
- **Method**: `handleEndOfDayAutoQazo()`
- **Helper Method**: `sendEndOfDayQazoStatus(user, date)`

### 6. End-of-Day Qazo Status Report

#### Message Format (without buttons)

```
🕌 2026-01-21 Sizning namoz holatingiz:

🌅 Bomdod: ✅ / ❌ / ⏳
☀️ Peshin: ✅ / ❌ / ⏳
🌇 Asr: ✅ / ❌ / ⏳
🌆 Shom: ✅ / ❌ / ⏳
🌙 Xufton: ✅ / ❌ / ⏳

📊 Jami qazo: X
```

#### Confirmation Message (with button)

```
Text: "💾 Qazo holati saqlab qolindi!"
Button: "🏠 Bosh menu" → callback_data: 'menu_main'
```

### 7. Removed "Keyinroq" Buttons

#### Locations Removed

1. **Prayer Time Reminder** (sendPrayerReminder)
   - Before: ["✅ Ha, o'qidim", "⏰ Keyinroq"]
   - After: ["✅ Ha, o'qidim"]

2. **Pending Prayer Reminder** (sendPendingPrayerReminder)
   - Before: ["✅ Ha, o'qidim", "⏰ Keyinroq"]
   - After: ["✅ Ha, o'qidim"]

Note: Missed prayer reminder still has "❌ Qazo bo'ldi" button.

## Database Schema

### Modified Table: users

```sql
CREATE TABLE users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_id INTEGER UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    timezone TEXT DEFAULT 'Asia/Tashkent',
    city TEXT DEFAULT 'Tashkent',
    country TEXT DEFAULT 'UZ',
    is_blocked INTEGER DEFAULT 0,                     -- NEW
    last_activity_update_at DATETIME DEFAULT CURRENT_TIMESTAMP,  -- NEW
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

## Cron Schedule

| Schedule        | Time                 | Purpose                             |
| --------------- | -------------------- | ----------------------------------- |
| _/1 _ \* \* \*  | Every minute         | Check prayer times & send reminders |
| _/10 _ \* \* \* | Every 10 minutes     | Check pending prayers & remind      |
| 0 \* \* \* \*   | Hourly (top of hour) | Block inactive users                |
| 59 23 \* \* \*  | Daily at 23:59       | Auto-convert pending to missed      |
| 0 0 \* \* \*    | Daily at 00:00       | Clear daily reminder maps           |

## Error Handling

### Graceful Degradation

- All blocking/unblocking wrapped in try-catch
- Failed message sends logged but don't crash bot
- Missing database fields handled with defaults

### Logging

```javascript
// Block action
console.log(`User ${telegramId} blocked: ${blockReason}`);

// Unblock action
console.log(`User ${telegramId} unblocked`);

// Inactive check
console.log("Checking for inactive users...");

// Auto-qazo
console.log("Executing end-of-day auto-qazo conversion at 23:59...");
```

## Performance Considerations

### Database Queries

- Hourly inactive check: O(n) scan + batch operations
- Per-user auto-qazo: O(1) lookups with indexed telegram_id
- Activity update: O(1) indexed WHERE clause

### Memory

- No new in-memory caches added
- Existing Maps preserved
- Reminder maps still cleared daily

## Testing Strategies

### Unit Testing

```javascript
// Mock user with old last_activity_update_at
const mockUser = {
  telegram_id: 123,
  is_blocked: 0,
  last_activity_update_at: Date.now() - 48 * 60 * 60 * 1000, // 48 hours ago
};
```

### Integration Testing

```javascript
// Set user's activity to 3 days ago
UPDATE users SET last_activity_update_at =
    datetime('now', '-3 days') WHERE telegram_id = TEST_USER_ID;

// Run hour cron job manually
await reminderService.checkAndBlockInactiveUsers();

// Verify user is blocked
const user = await userService.getUser(TEST_USER_ID);
assert(user.is_blocked === 1);
```

### Manual Testing (23:59 behavior)

1. Set system time to 23:58
2. Mark some prayers as "pending"
3. Wait until 23:59 (or mock cron)
4. Verify prayers auto-converted to "missed"
5. Verify messages sent without buttons

## Backwards Compatibility

- Existing users get new columns with defaults
- No breaking changes to existing APIs
- Old reminder behavior not affected except:
  - Pending reminders preserved (not deleted)
  - "Keyinroq" button removed
  - Menu qazo sends two messages instead of one
