# Date Constraint "Today" Calculation - Missing DateType.today Case

## Description

The `HQLDateConstraint.getLateDate()` method was missing an explicit case for `DateType.today`, causing date constraint calculations to return incorrect end-of-day boundaries. When filtering records by "Today", the late date boundary was incorrectly calculated as 00:00:00 of the next day instead of 23:59:59 of the current day.

This bug affects all date-based filtering functionality in the application, particularly call record searches and reporting features that use the "Today" filter option.

## Steps to Reproduce

1. Navigate to the call search/filter interface
2. Select "Today" as the date filter option
3. Execute the query
4. Observe that the results may include calls from tomorrow
5. Verify the query parameters show late date boundary at 00:00:00 of next day

## Expected Behavior

When selecting "Today", the query should only return calls that occurred between 00:00:00 and 23:59:59 of the current day in the user's configured timezone. The `getLateDate()` method should return a timestamp representing 23:59:59 of the current day.

## Actual Behavior

The `getLateDate()` method does not have an explicit case for `DateType.today`. The method falls through to the default case, which incorrectly returns 00:00:00 of the next day instead of 23:59:59 of the current day. This causes the late date boundary to be one day later than intended.

## Root Cause

The `switch` statement in `HQLDateConstraint.getLateDate()` is missing the `case DateType.today:` clause. When a today constraint is processed, the method does not match any specific case and falls through to the default handling, which produces an incorrect boundary value that includes part of the next day.

## Solution

Added explicit case for `DateType.today` in the `getLateDate()` method:

```java
case DateType.today:
    return getTodayEndOfDay();  // Returns 23:59:59 of current day
```

This ensures that today constraints receive the correct end-of-day boundary value, preventing tomorrow's records from being included in today's results.

## Testing

- Updated existing `testToday()` to expect correct behavior with 23:59:59 boundary
- All related date filtering tests pass
- Verified across different timezone configurations

## Related Issue

- Issue: Date filtering for "today" includes tomorrow's records

## Environment

- Application: Call Recording System
- Component: Query Builder / Date Constraint Handler
- Timezone: Issue occurs across all timezones but affects all date-based queries
