# PostgreSQL RefCursor OUT Parameter Type Handling

## Description

When executing stored procedures with RefCursor OUT parameters in PostgreSQL, the `ReportSessionBean` was registering the output parameter using `Types.REF` instead of the correct `Types.OTHER` constant. This caused the database driver to fail when processing the RefCursor return value, preventing stored procedure execution and report generation.

PostgreSQL's JDBC driver requires RefCursor OUT parameters to be registered with `Types.OTHER` rather than `Types.REF`, as RefCursor is a PostgreSQL-specific type that doesn't map to standard SQL types.

## Steps to Reproduce

1. Execute a stored procedure that returns a RefCursor OUT parameter
2. Observe database driver error or null return value
3. Check database logs for type mismatch errors

## Expected Behavior

When executing stored procedures with RefCursor OUT parameters, the parameter should be registered using `Types.OTHER`, allowing the PostgreSQL JDBC driver to correctly process and return the RefCursor result set.

## Actual Behavior

The code registers RefCursor OUT parameters using `Types.REF`, which is incorrect for PostgreSQL. The JDBC driver either:
1. Throws a type mismatch exception
2. Returns null instead of the RefCursor
3. Fails to properly read the cursor result

## Solution

Changed the parameter registration from:
```java
callableStatement.registerOutParameter(parameterName, Types.REF);
```

To:
```java
callableStatement.registerOutParameter(parameterName, Types.OTHER);
```

This uses the correct type constant that PostgreSQL's JDBC driver expects for RefCursor parameters.

## Testing

- Added regression test to verify correct Types constant usage
- Tests ensure stored procedures with RefCursor return values execute successfully
- Verified with PostgreSQL database driver

## Related Issue

- Bug: PostgreSQL RefCursor parameters not handled correctly

## Environment

- Application: VL-UI WildFly
- Component: Report Session Bean / Database Access
- Database: PostgreSQL
- Framework: Hibernate / JDBC
- Data Type: RefCursor (PostgreSQL-specific)
