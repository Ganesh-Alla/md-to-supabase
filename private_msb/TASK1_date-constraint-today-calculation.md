# Date Constraint "Today" Calculation Returns Incorrect End Date

## Description

When filtering call records by date using the "Today" option, the system incorrectly calculates the end date boundary. The query constraint for "today" should include all calls from the start of today (00:00:00) through the end of today (23:59:59) in the user's timezone, but currently the late date parameter is being set to the beginning of the next day instead of the end of the current day.

This causes queries for "today" to potentially include records from tomorrow, leading to incorrect call counts and filtering results.

## Steps to Reproduce

1. Navigate to the call search/filter interface
2. Select "Today" as the date filter option
3. Execute the query
4. Observe that the results may include calls from tomorrow

## Expected Behavior

When selecting "Today", the query should only return calls that occurred between 00:00:00 and 23:59:59 of the current day in the user's configured timezone.

## Actual Behavior

The query includes calls from the next day (starting at 00:00:00 of tomorrow) because the late date boundary is incorrectly set.

## Environment

- Application: Call Recording System
- Component: Query Builder / Date Constraint Handler
- Timezone: Issue occurs across all timezones but is more noticeable in certain timezone configurations
