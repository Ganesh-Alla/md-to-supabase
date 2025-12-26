# Date Constraint "Today" - Incorrect End-of-Day Boundary

## Description

The `HQLDateConstraint.getLateDate()` method returns an incorrect end-of-day boundary value when processing "Today" date constraints. Instead of returning 23:59:59 of the current day, it returns 00:00:00 of the next day, causing date range queries to include records from the following day.

This issue affects all date-based filtering features, particularly when users filter call records by "Today", resulting in incorrect query results that include unwanted data from tomorrow.

## Steps to Reproduce

1. Navigate to the call search/filter interface
2. Select "Today" as the date filter option
3. Execute the query to retrieve call records
4. Observe that results include calls from tomorrow (starting at 00:00:00)
5. Compare the actual late date boundary in the query

## Expected Behavior

When filtering by "Today", the query should return all records from 00:00:00 through 23:59:59 of the current day. The `getLateDate()` method should return a Date object representing 23:59:59 of today, ensuring tomorrow's records are excluded.

## Actual Behavior

The `getLateDate()` method returns 00:00:00 of the next day instead of 23:59:59 of the current day. This is caused by missing or incorrect handling of the DateType.today case, causing the method to use a default boundary calculation that extends into the next day.

## Root Cause

The `getLateDate()` method in `HQLDateConstraint` is missing an explicit case for handling `DateType.today`. Without this case, the method either:
1. Falls through to a default case that calculates tomorrow's midnight
2. Uses a generic end-of-period calculation that doesn't properly handle the daily constraint

## Solution

Added explicit case handling for `DateType.today` that correctly calculates 23:59:59 of the current day:

```java
case DateType.today:
    Calendar todayEnd = Calendar.getInstance();
    todayEnd.set(Calendar.HOUR_OF_DAY, 23);
    todayEnd.set(Calendar.MINUTE, 59);
    todayEnd.set(Calendar.SECOND, 59);
    return new Date(todayEnd.getTimeInMillis());
```

This ensures the late date boundary is correctly set to end-of-day rather than tomorrow's start.

## Testing

- Added regression test: `HQLDateConstraintTodayTest` using reflection to test private method
- Test: `testTodayLateDateEndsAtEndOfDay()` verifies 23:59:59 boundary
- Updated `testToday()` to expect correct behavior
- Verified that tomorrow's records are excluded from today's results

## Related Issue

- Bug: "Today" filter includes tomorrow's records

## Environment

- Application: Call Recording System
- Component: Query Builder / Date Constraint Handler
- Timezone: Timezone-aware calculations
