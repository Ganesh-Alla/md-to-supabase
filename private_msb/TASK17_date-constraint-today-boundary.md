# Date Constraint "Today" - End-of-Day Boundary Fix

## Description

The `HQLDateConstraint.getLateDate()` method was returning an incorrect end-of-day boundary when processing date constraints for "Today" filters. Instead of returning 23:59:59 of the current day, the method was returning 00:00:00 of the next day, causing date range queries to incorrectly include records from the following day.

This bug affected all date-based filtering features in the application, particularly call record searches using the "Today" filter option, resulting in inaccurate query results.

## Steps to Reproduce

1. Navigate to call search/filter interface
2. Select "Today" as the date filter option
3. Execute the query
4. Review the query results
5. Observe that results include calls from the next day (starting at 00:00:00)

## Expected Behavior

When selecting "Today" filter, the query should return all records from the start of the current day (00:00:00) through the end of the current day (23:59:59). The `getLateDate()` method should return a Date object with time set to 23:59:59 of today.

## Actual Behavior

The `getLateDate()` method returns 00:00:00 of tomorrow instead of 23:59:59 of today. This causes the query's late date boundary to extend into the next day, incorrectly including tomorrow's records in the "Today" filter results.

## Root Cause

The `getLateDate()` method in `HQLDateConstraint` does not have proper handling for the DateType.today case. The method either:
1. Falls through to a default case that calculates tomorrow's start time
2. Uses generic end-of-period logic that doesn't account for daily boundaries

This results in a boundary that is exactly one day later than it should be.

## Solution

Modified the `getLateDate()` method to explicitly handle `DateType.today` and return 23:59:59 of the current day:

1. Added case statement for DateType.today
2. Calculate end of day (23:59:59) instead of start of next day (00:00:00)
3. Return the correctly calculated Date object

## Testing

- Updated `testToday()` test to expect correct behavior with 23:59:59 boundary
- Added regression test `testTodayLateDateEndsAtEndOfDay()` to verify boundary calculation
- Tests verify that tomorrow's date is properly excluded
- Confirmed fix works across different timezone configurations

## Related Issue

- Bug: "Today" filter boundary calculation incorrect

## Environment

- Application: Call Recording System
- Component: Query Builder / Date Constraint Handler
- Feature: Date-based call record filtering
