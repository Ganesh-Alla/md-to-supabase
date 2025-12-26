# Date Type Binding in HQL Query Parameter Handling

## Description

When executing HQL (Hibernate Query Language) queries that include date filter parameters, the query builder failed to properly handle `java.util.Date` objects. The `bindParameters()` method in `HQLQueryBuilder` was missing type-specific handling for Date objects, causing it to throw an `error.unknownObjectType` exception when attempting to bind date parameters to the query.

This prevented users from executing queries with date range filters, breaking the date filtering functionality across the application.

## Steps to Reproduce

1. Navigate to a search/filter interface with date range options
2. Select a date range filter
3. Execute the query
4. Observe error: `error.unknownObjectType` or similar exception

## Expected Behavior

When executing queries with date filter parameters, the query builder should recognize `java.util.Date` objects and properly bind them to the query using the appropriate Hibernate method (`setTimestamp()`), allowing the query to execute successfully.

## Actual Behavior

The `bindParameters()` method does not have a case to handle `java.util.Date` type objects. When a Date parameter is encountered, it either:
1. Throws an `error.unknownObjectType` exception
2. Falls through to an error condition
3. Fails to bind the parameter correctly

## Solution

Added explicit type checking and handling for `java.util.Date` in the `HQLQueryBuilder.bindParameters()` method:

```java
if (parameter instanceof java.util.Date) {
    q.setTimestamp(parameterName, (java.util.Date) parameter);
}
```

This allows the query builder to recognize Date objects and bind them using Hibernate's `setTimestamp()` method, which is the appropriate way to handle temporal types in HQL queries.

## Testing

- Added unit tests to verify Date type handling
- Tests ensure that date parameters are correctly bound before query execution
- Verified that queries with date ranges now execute without errors

## Related Issue

- Issue #34: Date filter queries throw unknownObjectType error

## Environment

- Application: VL-UI WildFly
- Component: Query Builder / HQL Handler
- Framework: Hibernate ORM
- Data Type: java.util.Date
