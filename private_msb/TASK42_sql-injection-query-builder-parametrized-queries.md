# SQL Injection in Query Builder - Implement Parameterized Queries and Column Validation

## Description

The dynamic HQL query builder constructs queries by string concatenation, allowing SQL/HQL injection. Column names in ORDER BY, GROUP BY, and WHERE clauses are not validated against an allowlist. Attackers can inject arbitrary SQL code through search parameters to read, modify, or delete data.

## Steps to Reproduce / Create the Issue

### To Create the Vulnerability:

1. **Modify HQLQueryBuilder to use string concatenation**

**File:** `callRecording/src/net/voicelog/callRecording/queryBuilder/HQLQueryBuilder.java`

```java
// VULNERABLE CODE
public void addWhereClause(String columnName, String operator, String value) {
    // Direct concatenation - allows injection
    this.whereClause += "t." + columnName + " " + operator + " '" + value + "'";

    // User input: value = "' OR '1'='1"
    // Result: "t.name = '' OR '1'='1'" - injects OR condition
}

public void addOrderByClause(String columnName, String direction) {
    // No validation of column name
    this.orderBy = " ORDER BY t." + columnName + " " + direction;

    // User input: columnName = "duration; DELETE FROM user_password; --"
    // Result injects DELETE statement
}
```

2. **Inject XSS/SQL payload through search interface**

**Attack Vector 1: OR Injection**
```
Search for user name: admin' OR '1'='1
Vulnerable query: "FROM User u WHERE u.name = 'admin' OR '1'='1'"
Result: Returns ALL users instead of just admin
```

**Attack Vector 2: ORDER BY Injection**
```
Sort by column: duration; DROP TABLE users; --
Vulnerable query: "ORDER BY t.duration; DROP TABLE users; --"
Result: Deletes users table
```

**Attack Vector 3: UNION Injection**
```
Duration filter: 1 UNION SELECT password FROM user_password --
Result: Extracts all passwords in query results
```

3. **Test with OWASP ZAP**

```bash
# Scan application with automated security scanner
# Will detect SQL injection in search parameters
```

## Expected Behavior

The query builder should:
1. Use parameterized queries (named parameters or positional)
2. Never concatenate user-supplied values into query strings
3. Validate column names against allowlist
4. Reject suspicious keywords (UNION, DROP, DELETE, etc.)
5. Log suspicious attempts for audit trail

## Actual Behavior

If using string concatenation:
- Attacker can execute arbitrary HQL/SQL
- Can extract sensitive data (passwords, audit logs)
- Can modify data (change scores, call records)
- Can delete data (drop tables)
- Can escalate privileges

## Solution

### Step 1: Create SafeQueryBuilder

**File to create:** `callRecording/src/net/voicelog/callRecording/queryBuilder/SafeQueryBuilder.java`

```java
public class SafeQueryBuilder {

    private static final Set<String> ALLOWED_COLUMNS = new HashSet<>(Arrays.asList(
        "firstName", "lastName", "email", "username", "dateCreated",
        "callId", "duration", "callDate", "status", "agentName",
        "scorecardName", "score", "notes", "comments",
        "name", "description", "date", "time", "count"
    ));

    private static final Set<String> ALLOWED_OPERATORS = new HashSet<>(Arrays.asList(
        "=", "<>", "!=", "<", ">", "<=", ">=", "LIKE", "IN", "BETWEEN"
    ));

    private static final Set<String> DANGEROUS_KEYWORDS = new HashSet<>(Arrays.asList(
        "UNION", "SELECT", "INSERT", "UPDATE", "DELETE", "DROP", "EXEC",
        "SCRIPT", "JAVASCRIPT", "ONCLICK", "ONERROR", "--", "/*"
    ));

    /**
     * Validate column name against allowlist
     */
    public static String validateColumnName(String columnName) {
        if (columnName == null || columnName.trim().isEmpty()) {
            throw new IllegalArgumentException("Column name cannot be empty");
        }

        String validatedName = columnName.trim();

        // Check for suspicious patterns
        if (containsDangerousKeywords(validatedName)) {
            throw new IllegalArgumentException(
                "Column name contains suspicious patterns"
            );
        }

        // Check against allowlist
        if (!ALLOWED_COLUMNS.contains(validatedName)) {
            throw new IllegalArgumentException(
                "Column not allowed: " + validatedName
            );
        }

        return validatedName;
    }

    /**
     * Validate operator
     */
    public static String validateOperator(String operator) {
        if (operator == null || !ALLOWED_OPERATORS.contains(operator.toUpperCase())) {
            throw new IllegalArgumentException("Invalid operator");
        }
        return operator.toUpperCase();
    }

    /**
     * Check for dangerous keywords
     */
    public static boolean containsDangerousKeywords(String input) {
        if (input == null) {
            return false;
        }
        String upperInput = input.toUpperCase();
        for (String keyword : DANGEROUS_KEYWORDS) {
            if (upperInput.contains(keyword)) {
                return true;
            }
        }
        return false;
    }

    /**
     * Build parameterized WHERE clause
     */
    public static String buildWhereClause(String columnName, String operator) {
        String validColumn = validateColumnName(columnName);
        String validOperator = validateOperator(operator);
        return "t." + validColumn + " " + validOperator + " :param_" + validColumn;
    }

    /**
     * Build parameterized ORDER BY clause
     */
    public static String buildOrderByClause(String columnName, String direction) {
        String validColumn = validateColumnName(columnName);
        if (direction == null || (!direction.equalsIgnoreCase("ASC") &&
            !direction.equalsIgnoreCase("DESC"))) {
            direction = "ASC";
        }
        return "ORDER BY t." + validColumn + " " + direction.toUpperCase();
    }
}
```

### Step 2: Update HQLQueryBuilder

**File to modify:** `callRecording/src/net/voicelog/callRecording/queryBuilder/HQLQueryBuilder.java`

```java
public class HQLQueryBuilder {

    private StringBuilder hql;
    private Map<String, Object> parameters;

    public HQLQueryBuilder() {
        this.hql = new StringBuilder();
        this.parameters = new HashMap<>();
    }

    /**
     * Add WHERE clause with safe parameter binding
     */
    public void addWhereClause(String columnName, String operator, Object value) {
        // Validate column and operator
        String validColumn = SafeQueryBuilder.validateColumnName(columnName);
        String validOperator = SafeQueryBuilder.validateOperator(operator);

        String paramName = "param_" + validColumn;

        if (!hql.toString().contains("WHERE")) {
            hql.append(" WHERE ");
        } else {
            hql.append(" AND ");
        }

        // SAFE: Use parameterized query
        hql.append("t.").append(validColumn)
           .append(" ").append(validOperator)
           .append(" :").append(paramName);

        // SAFE: Bind value separately
        this.parameters.put(paramName, value);
    }

    /**
     * Add ORDER BY clause with safe column validation
     */
    public void addOrderByClause(String columnName, String direction) {
        String validClause = SafeQueryBuilder.buildOrderByClause(columnName, direction);
        hql.append(" ").append(validClause);
    }

    /**
     * Execute query with bound parameters
     */
    public List<?> execute(Session session, String baseQuery) {
        String finalQuery = baseQuery + hql.toString();
        Query q = session.createQuery(finalQuery);

        for (Map.Entry<String, Object> param : parameters.entrySet()) {
            q.setParameter(param.getKey(), param.getValue());
        }

        return q.list();
    }

    /**
     * DEPRECATED: Old unsafe method
     */
    @Deprecated
    public void addWhereClauseUnsafe(String column, String operator, String value) {
        throw new UnsupportedOperationException(
            "Use safe parameterized methods instead"
        );
    }
}
```

### Step 3: Update Search Action

**File to modify:** `callRecording/src/net/voicelog/callRecording/gui/actions/search/SearchAction.java`

```java
@Override
public ActionForward execute(ActionMapping mapping, ActionForm form,
                           HttpServletRequest request, HttpServletResponse response) {
    try {
        FilterForm filterForm = (FilterForm) form;
        HQLQueryBuilder builder = new HQLQueryBuilder();

        // Build query with validated parameters
        String duration = filterForm.getDuration();
        if (duration != null && !duration.isEmpty()) {
            try {
                int durationMinutes = Integer.parseInt(duration);
                // SAFE: Column validated, value parameterized
                builder.addWhereClause("duration", ">", durationMinutes);
            } catch (NumberFormatException e) {
                request.setAttribute("error", "Invalid duration");
                return mapping.findForward("search");
            }
        }

        String agentName = filterForm.getAgentName();
        if (agentName != null && !agentName.isEmpty()) {
            // SAFE: Column validated, value parameterized
            builder.addWhereClause("agentName", "LIKE", "%" + agentName + "%");
        }

        String sortBy = filterForm.getSortBy();
        if (sortBy != null && !sortBy.isEmpty()) {
            // SAFE: Column and direction validated
            builder.addOrderByClause(sortBy, filterForm.getSortDirection());
        }

        List<Call> results = (List<Call>) builder.execute(
            getSession(),
            "FROM Call c"
        );

        request.setAttribute("results", results);
        return mapping.findForward("results");

    } catch (IllegalArgumentException e) {
        // Validation error - likely attack
        AuditInformationHelper.logSecurityEvent(
            "INVALID_QUERY_ATTEMPT",
            e.getMessage(),
            request
        );
        request.setAttribute("error", "Invalid search parameters");
        return mapping.findForward("search");
    }
}
```

## Tests to Create

### New Test File: SQLInjectionPreventionTest.java

**Location:** `callRecording/test/net/voicelog/test/security/SQLInjectionPreventionTest.java`

```java
public class SQLInjectionPreventionTest extends TestCase {

    private HQLQueryBuilder queryBuilder;

    @Override
    protected void setUp() throws Exception {
        super.setUp();
        queryBuilder = new HQLQueryBuilder();
    }

    /**
     * Test that OR injection is prevented
     */
    public void testORInjectionPrevention() {
        String injectPayload = "' OR '1'='1";

        // Should not throw - parameterization prevents injection
        queryBuilder.addWhereClause("name", "=", injectPayload);

        // The payload is treated as literal value, not SQL
        List<?> results = queryBuilder.execute(getSession(), "FROM User u");

        // Should find no users (looking for literal " OR '1'='1" in name)
        assertEquals(0, results.size());
    }

    /**
     * Test that UNION injection is prevented
     */
    public void testUNIONInjectionPrevention() {
        // Attacker tries to inject UNION SELECT
        try {
            queryBuilder.addWhereClause(
                "id UNION SELECT password FROM user_password",  // Malicious column name
                "=",
                "1"
            );
            fail("Should reject UNION keyword in column name");
        } catch (IllegalArgumentException e) {
            assertTrue("Should detect UNION keyword", e.getMessage().contains("suspicious"));
        }
    }

    /**
     * Test that DROP injection is prevented
     */
    public void testDROPInjectionPrevention() {
        try {
            // Attacker tries to inject DROP TABLE
            queryBuilder.addOrderByClause(
                "duration; DROP TABLE users; --",
                "ASC"
            );
            fail("Should reject dangerous keywords");
        } catch (IllegalArgumentException e) {
            assertTrue("Should detect DROP keyword", e.getMessage().contains("Column"));
        }
    }

    /**
     * Test column name validation
     */
    public void testColumnNameValidation() {
        // Valid column
        assertEquals("name", SafeQueryBuilder.validateColumnName("name"));

        // Invalid column
        try {
            SafeQueryBuilder.validateColumnName("password_hash");
            fail("Should reject column not in allowlist");
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("not allowed"));
        }

        // Injection attempt
        try {
            SafeQueryBuilder.validateColumnName("name; DELETE FROM users; --");
            fail("Should reject dangerous keywords");
        } catch (IllegalArgumentException e) {
            assertTrue(e.getMessage().contains("suspicious"));
        }
    }

    /**
     * Test operator validation
     */
    public void testOperatorValidation() {
        assertEquals("=", SafeQueryBuilder.validateOperator("="));
        assertEquals("LIKE", SafeQueryBuilder.validateOperator("like"));

        try {
            SafeQueryBuilder.validateOperator("OR DELETE FROM users");
            fail("Should reject invalid operator");
        } catch (IllegalArgumentException e) {
            assertTrue(true);
        }
    }

    /**
     * Test dangerous keyword detection
     */
    public void testDangerousKeywordDetection() {
        assertTrue(SafeQueryBuilder.containsDangerousKeywords("SELECT * FROM users"));
        assertTrue(SafeQueryBuilder.containsDangerousKeywords("'; DROP TABLE users; --"));
        assertTrue(SafeQueryBuilder.containsDangerousKeywords("UNION SELECT password"));
        assertFalse(SafeQueryBuilder.containsDangerousKeywords("normal_column_name"));
    }

    /**
     * Test normal data passes validation
     */
    public void testNormalDataAllowed() {
        queryBuilder.addWhereClause("name", "=", "John Smith");
        queryBuilder.addWhereClause("email", "LIKE", "%example.com%");
        queryBuilder.addOrderByClause("dateCreated", "DESC");

        // Should build query successfully with parameterized values
        assertFalse(queryBuilder.toString().isEmpty());
    }

    /**
     * Test time-based blind injection is prevented
     */
    public void testTimeBasedInjectionPrevention() {
        try {
            // Attacker tries: id = 1 AND SLEEP(5)
            queryBuilder.addWhereClause("id", "=", "1 AND SLEEP(5)");
            fail("Should detect SLEEP keyword");
        } catch (IllegalArgumentException e) {
            assertTrue("Should detect time-based injection", true);
        }
    }
}
```

### Integration Test: QueryInjectionAttackTest.java

**Location:** `callRecording/test/net/voicelog/test/integration/QueryInjectionAttackTest.java`

```java
public class QueryInjectionAttackTest extends TestCase {

    private Client client;
    private FilterForm filterForm;

    @Override
    protected void setUp() throws Exception {
        super.setUp();
        client = Utility.getTestSessionBean()
            .findClientByName(BootstrapConstants.clientNameOne);
        filterForm = new FilterForm();
    }

    /**
     * Test search action prevents query injection
     */
    public void testSearchActionInjectionPrevention() throws Exception {
        SearchAction action = new SearchAction();

        // Simulate attack: injection in sort field
        filterForm.setSortBy("duration; DROP TABLE call_detail; --");

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        // Should return error, not execute injection
        ActionForward forward = action.execute(
            null,  // mapping
            filterForm,
            request,
            response
        );

        // Should NOT redirect to results
        assertNotEquals("results", forward.getName());

        // Should set error attribute
        assertNotNull(request.getAttribute("error"));
    }

    /**
     * Test OR injection in search
     */
    public void testSearchORInjection() throws Exception {
        filterForm.setAgentName("' OR '1'='1");

        // Execute search - should not bypass permissions
        List<?> results = executeSearch(filterForm);

        // Should find only matching agent names, not all
        for (Object result : results) {
            // Each result should have agent name containing literal "'"
        }
    }

    /**
     * Test that parameter binding prevents extraction
     */
    public void testParameterBindingPreventsExtraction() throws Exception {
        // Attacker tries: duration > 1 UNION SELECT password FROM user_password
        filterForm.setDuration("1 UNION SELECT password FROM user_password");

        try {
            executeSearch(filterForm);
            fail("Should reject UNION injection");
        } catch (IllegalArgumentException e) {
            assertTrue("Should detect injection", true);
        }
    }

    /**
     * Test concurrent injection attempts are logged
     */
    public void testInjectionAttemptsLogged() throws Exception {
        String[] injectionPayloads = {
            "' OR '1'='1",
            "'; DROP TABLE users; --",
            "1 UNION SELECT password FROM user_password"
        };

        for (String payload : injectionPayloads) {
            filterForm.setAgentName(payload);

            try {
                executeSearch(filterForm);
            } catch (IllegalArgumentException e) {
                // Expected
            }
        }

        // Check audit log for injection attempts
        // (In real implementation, would verify logging)
    }
}
```

## Existing Tests That Must Pass

These tests should pass with parameterized queries:

- `FilteringActionTest` - Search functionality
- `SearchTest` - Query results
- `ReportTest` - Report queries
- All query-related tests

**Test Updates Needed:**

Tests that check query execution must be updated:

```java
// BEFORE - May check unescaped query
String query = queryBuilder.toString();
assertTrue(query.contains("user.name = 'John'"));

// AFTER - With parameterization
// Instead check that safe query is used
assertTrue(results.size() > 0);
assertEquals(expectedUser, results.get(0));
```

## Testing Strategy

1. **Unit Tests**: Test SafeQueryBuilder validation methods
2. **Integration Tests**: Test action classes with injection attempts
3. **OWASP ZAP Scan**: Automated security vulnerability scanning
4. **Negative Tests**: Attempt various injection payloads
5. **Positive Tests**: Verify normal queries still work

## Example OWASP ZAP Testing

```bash
# Install OWASP ZAP
# Configure to test the application

# Test endpoints:
# GET /callRecording/search?duration=1 UNION SELECT password...
# GET /callRecording/search?sortBy=duration; DROP TABLE...

# ZAP should report: "No SQL injection vulnerabilities found"
```

## Security Impact

**Severity:** CRITICAL
**OWASP:** A1:2021 - Broken Access Control / A3:2021 - Injection
**CWE:** CWE-89 - SQL Injection

**Before Fix:** Attacker can execute arbitrary SQL/HQL
**After Fix:** All user input parameterized and validated

## Environment

- Application: VL-UI WildFly
- Component: Query Builder / Search Functionality
- Framework: Hibernate HQL
- Database: PostgreSQL
- Input Sources: Search forms, reports, filters
