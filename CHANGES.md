# Qazo AI Bot - Feature Updates Summary

## Changes Implemented

### 1. **User Blocking System** ✅

- Added `is_blocked` and `last_activity_update_at` columns to users table
- Users are automatically blocked after 2 days (48 hours) of inactivity
- Blocking is checked every hour via cron job
- Blocked users receive a notification: "Siz 2 kun davomida botdan foydalanmagan edingiz uchun bloklandingiz"
- Users can unblock themselves by pressing `/start` command

### 2. **Pending Reminder Fix** ✅

- Fixed issue where pending reminders were deleted when sending missed reminders
- Now only deletes the last missed reminder, not pending ones
- Pending reminders continue to appear every 10 minutes

### 3. **Qazo Status Button Behavior** ✅

- When user presses "Qazo holati" button:
  - First sends qazo status WITHOUT any buttons
  - Then sends main menu with buttons
  - No "💾 Saqlab qolish" button anymore

### 4. **Remove "Keyinroq" (Later) Buttons** ✅

- Removed "⏰ Keyinroq" buttons from:
  - Prayer time reminders
  - Pending prayer reminders
- Now users only have "✅ Ha, o'qidim" and "❌ Qazo bo'ldi" buttons

### 5. **Evening Time Deadline Change** ✅

- Changed xufton (evening) deadline from next day's Fajr to 23:40
- After 23:40, pending prayers are treated as "missed"
- Missed reminder logic updated accordingly

### 6. **Auto-Qazo Conversion at 23:59** ✅

- Added cron job for 23:59 every day
- At 23:59, any prayers with "pending" status are automatically marked as "missed"
- Automatically adds to user's qazo count

### 7. **End-of-Day Qazo Status Report** ✅

- At 23:59, sends final qazo status for the day WITHOUT buttons
- Shows all prayers and their statuses
- Followed by confirmation message "💾 Qazo holati saqlab qolindi!" with main menu button

### 8. **User Activity Tracking** ✅

- `updateLastActivity()` called whenever user presses any button
- Used to determine blocking eligibility

## Files Modified

### Database & Services

1. **src/database/database.js**
   - Added `is_blocked` and `last_activity_update_at` columns to users table

2. **src/database/userService.js**
   - Added `updateLastActivity()` - updates last_activity_update_at timestamp
   - Added `blockUser()` - blocks user with reason
   - Added `unblockUser()` - unblocks user and updates activity timestamp
   - Added `isUserBlocked()` - checks if user is blocked
   - Added `getInactiveUsers()` - gets users inactive for X hours

### Reminder Service

3. **src/services/reminderService.js**
   - Added blocking check in `checkPrayerTimes()` and `checkPendingPrayers()`
   - Added cron job for 23:59: `handleEndOfDayAutoQazo()`
   - Added cron job for hourly check: `checkAndBlockInactiveUsers()`
   - Changed evening deadline from 23:59 to 23:40
   - Removed "Keyinroq" buttons from reminders
   - Added `sendEndOfDayQazoStatus()` method
   - Fixed `sendMissedPrayerReminder()` to preserve pending reminders

### Main Bot

4. **src/index.js**
   - Updated `/start` handler to:
     - Unblock users if they were blocked
     - Update last activity for existing users
   - Updated `menu_qazo` action to send status without buttons, then send menu with buttons
   - Added `updateLastActivity()` call in callback_query handler

## Cron Jobs Added

```javascript
// 23:59 - Auto-convert pending to missed
cron.schedule("59 23 * * *", async () => {
  await this.handleEndOfDayAutoQazo();
});

// Hourly - Check and block inactive users
cron.schedule("0 * * * *", async () => {
  await this.checkAndBlockInactiveUsers();
});
```

## Database Schema Changes

Users table now includes:

```sql
is_blocked INTEGER DEFAULT 0,
last_activity_update_at DATETIME DEFAULT CURRENT_TIMESTAMP,
```

## Testing Notes

- The database will automatically create new columns when updated
- Existing users will have `is_blocked = 0` by default
- `last_activity_update_at` will be set to current time for activity tracking
- Blocking happens automatically after 48 hours without activity
