# Date Constraint "Today" Calculation - Missing DateType.today Case (v3)

## Description

The `HQLDateConstraint.getLateDate()` method was missing an explicit case for `DateType.today`, causing date constraint calculations to return incorrect end-of-day boundaries. When filtering records by "Today", the late date boundary was incorrectly calculated as 00:00:00 of the next day instead of 23:59:59 of the current day.

This is the third iteration of fixes addressing this issue, with different implementation attempts to properly handle the DateType.today case.

## Steps to Reproduce

1. Navigate to the call search/filter interface
2. Select "Today" as the date filter option
3. Execute the query
4. Observe that the results may include calls from tomorrow (starting at 00:00:00)
5. Compare the late date boundary parameter in the query

## Expected Behavior

When selecting "Today", the query should only return calls that occurred between 00:00:00 and 23:59:59 of the current day in the user's configured timezone. The `getLateDate()` method should return a timestamp representing 23:59:59 of the current day.

## Actual Behavior

The `getLateDate()` method does not have an explicit case for `DateType.today`. The method falls through to the default case, which incorrectly returns 00:00:00 of the next day instead of 23:59:59 of the current day. This causes the late date boundary to be one day later than intended.

## Root Cause

The `switch` statement in `getLateDate()` is missing the `case DateType.today:` clause, so when a today constraint is processed, it falls through to default handling that produces the wrong boundary value.

## Solution

Add explicit case for `DateType.today` in the `getLateDate()` method:

```java
case DateType.today:
    return getTodayEndOfDay();  // Returns 23:59:59 of current day
```

This ensures that today constraints receive the correct end-of-day boundary value.

## Testing

- Added regression test: `testTodayLateDateEndsAtEndOfDay()`
- Test uses reflection to access private `getLateDate()` method
- Verifies that DateType.today returns end-of-day boundary (23:59:59)
- Validates that tomorrow's date is excluded from today's results

## Version History

- **v1**: Initial fix attempt for missing DateType.today case
- **v2**: Updated fix with improved date handling
- **v3**: Final iteration with comprehensive regression testing

## Related Issue

- Issue: Date filtering for "today" includes tomorrow's records

## Environment

- Application: Call Recording System
- Component: Query Builder / Date Constraint Handler
- Timezone: Issue occurs across all timezones
