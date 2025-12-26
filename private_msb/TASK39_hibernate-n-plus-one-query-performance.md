# Hibernate N+1 Query Problem - Performance Degradation from Lazy Loading

## Description

The application suffers from N+1 query performance issues due to lazy loading of Hibernate entity relationships. When loading parent entities with collections, a separate database query executes for each parent entity's child collection. Loading 100 users with roles results in 100+ queries instead of 2-3, causing severe performance degradation.

## Steps to Reproduce

### Enable Query Logging

**File:** `callRecordingHAR/bin/config/hibernate.cfg.xml`

```xml
<property name="hibernate.show_sql">true</property>
<property name="hibernate.format_sql">true</property>
<property name="hibernate.generate_statistics">true</property>
```

### Reproduce the Issue

1. Navigate to User Administration page
2. Load page with 50+ users
3. Watch hibernate SQL logs
4. Count queries executed - expect 100+ queries for 50 users
5. Measure page load time - expect 5-10 seconds

### Affected Code Paths

- `AdminSessionBean.getAllUsers()` - 1 query for users + N queries for roles
- `ScoreSessionBean.getScoreCards()` - 1 query + N queries for scorecard questions/results
- `CallRecordingSessionBean.getCallDetails()` - Similar N+1 pattern
- `AdminSessionBean.getSites()` - 1 query + N queries for teams and agents

## Expected Behavior

Complex queries should fetch all needed data with optimized number of queries:
- Loading 100 users with roles: 2-3 queries total
- Page load time: <500ms
- Database CPU: <10%
- Network traffic: Minimal

## Actual Behavior

Each user's roles are lazy-loaded:
- Query 1: SELECT * FROM users (50 users)
- Query 2-51: SELECT * FROM roles WHERE user_id = X (one per user)
- Additional queries for permissions, teams, etc.
- Total: 100+ queries
- Page load time: 5-10 seconds
- Database CPU: 80-90%

## Root Cause

Hibernate entity mappings use `lazy="true"` (default), deferring collection loading. When code accesses `user.getRoles()`, Hibernate issues a query for that specific user's roles. In loops or list rendering, this creates N queries for N entities.

## Solution

### Step 1: Create Query Optimization Helper

**File to create:** `callRecording/src/net/voicelog/callRecording/queryBuilder/HQLFetchHelper.java`

```java
public class HQLFetchHelper {

    /**
     * Build optimized query with JOIN FETCH for common relationships
     */
    public static Query createUserQueryWithRoles(Session session) {
        String hql = "FROM User u " +
                    "LEFT JOIN FETCH u.roles r " +
                    "ORDER BY u.lastName";
        return session.createQuery(hql);
    }

    /**
     * Load sites with teams and agents
     */
    public static Query createSiteQueryWithTeams(Session session) {
        String hql = "FROM Site s " +
                    "LEFT JOIN FETCH s.teams t " +
                    "LEFT JOIN FETCH t.agents a " +
                    "ORDER BY s.name";
        return session.createQuery(hql);
    }

    /**
     * Load scorecards with questions and results
     */
    public static Query createScorecardQueryWithDetails(Session session, Client client) {
        String hql = "FROM Scorecard sc " +
                    "LEFT JOIN FETCH sc.sections sec " +
                    "LEFT JOIN FETCH sec.questions q " +
                    "LEFT JOIN FETCH q.questionEntries qe " +
                    "WHERE sc.client = :client " +
                    "ORDER BY sc.name";
        Query query = session.createQuery(hql);
        query.setParameter("client", client);
        return query;
    }
}
```

### Step 2: Update AdminSessionBean

**File to modify:** `callRecording/src/net/voicelog/callRecording/ejb/AdminSessionBean.java`

```java
public List<User> getAllUsers() {
    // BEFORE: Lazy-loaded roles
    // Query q = getSession().createQuery("FROM User u ORDER BY u.lastName");
    // return q.list();  // N+1 on roles access

    // AFTER: Eager fetch with JOIN FETCH
    String hql = "FROM User u " +
                "LEFT JOIN FETCH u.roles r " +
                "ORDER BY u.lastName";
    Query q = getSession().createQuery(hql);
    return q.list();  // Roles loaded in same query
}

public List<Site> getSites() {
    // BEFORE
    // return getSession().createQuery("FROM Site s").list();

    // AFTER: Eager fetch teams and agents
    String hql = "FROM Site s " +
                "LEFT JOIN FETCH s.teams t " +
                "LEFT JOIN FETCH t.agents a " +
                "ORDER BY s.name";
    return getSession().createQuery(hql).list();
}
```

### Step 3: Update ScoreSessionBean

**File to modify:** `callRecording/src/net/voicelog/callRecording/ejb/ScoreSessionBean.java`

```java
public List<Scorecard> getScorecards(Client client) {
    // BEFORE: Lazy-loaded questions and results
    // Query q = session.createQuery(
    //     "FROM Scorecard sc WHERE sc.client = :client"
    // );
    // q.setParameter("client", client);
    // return q.list();  // N+1 on questions

    // AFTER: Eager fetch all related data
    String hql = "FROM Scorecard sc " +
                "LEFT JOIN FETCH sc.sections sec " +
                "LEFT JOIN FETCH sec.questions q " +
                "LEFT JOIN FETCH q.questionEntries qe " +
                "WHERE sc.client = :client " +
                "ORDER BY sc.name";
    Query q = session.createQuery(hql);
    q.setParameter("client", client);
    return q.list();
}
```

### Step 4: Update Hibernat Mappings with Batch Loading

**Files to modify:** `callRecordingHAR/src/net/voicelog/callRecording/entities/*.hbm.xml`

For frequently accessed collections, add `batch-size`:

```xml
<!-- User.hbm.xml -->
<bag name="roles" lazy="true" batch-size="50">
    <key column="user_id"/>
    <one-to-many class="Role"/>
</bag>

<!-- Site.hbm.xml -->
<bag name="teams" lazy="true" batch-size="50">
    <key column="site_id"/>
    <one-to-many class="Team"/>
</bag>

<!-- Scorecard.hbm.xml -->
<bag name="questions" lazy="true" batch-size="50">
    <key column="scorecard_id"/>
    <one-to-many class="ScorecardQuestion"/>
</bag>
```

## Tests to Create

### New Test File: HibernateN1QueryPerformanceTest.java

**Location:** `callRecording/test/net/voicelog/test/performance/HibernateN1QueryPerformanceTest.java`

```java
public class HibernateN1QueryPerformanceTest extends TestCase {

    private Client client;
    private List<Long> createdUserIds = new ArrayList<>();

    @Override
    protected void setUp() throws Exception {
        super.setUp();
        client = Utility.getTestSessionBean()
            .findClientByName(BootstrapConstants.clientNameOne);
    }

    @Override
    protected void tearDown() throws Exception {
        // Cleanup: Delete test users
        for (Long userId : createdUserIds) {
            User user = Utility.getTestSessionBean().findUserById(userId);
            if (user != null) {
                Utility.getTestSessionBean().deleteUser(user);
            }
        }
        super.tearDown();
    }

    /**
     * Test that getAllUsers() executes minimal number of queries
     * BEFORE FIX: Would expect 50+ queries for 50 users
     * AFTER FIX: Should execute 2-3 queries
     */
    public void testGetAllUsersQueryCount() {
        // Enable Hibernate statistics
        SessionFactory factory = HibernateUtil.getSessionFactory();
        factory.getStatistics().setStatisticsEnabled(true);
        factory.getStatistics().clear();

        // Execute query
        List<User> users = Utility.getAdminSessionBean().getAllUsers();

        // Verify results
        assertFalse(users.isEmpty());

        // Check query count
        Statistics stats = factory.getStatistics();
        int queryCount = (int) stats.getQueryExecutionCount();

        System.out.println("Query count for getAllUsers(): " + queryCount);

        // AFTER FIX: Should be 2-3 queries
        assertTrue("Too many queries executed: " + queryCount,
            queryCount <= 5);
    }

    /**
     * Test that accessing user roles doesn't trigger additional queries
     */
    public void testUserRolesAccessWithoutLazyLoading() {
        SessionFactory factory = HibernateUtil.getSessionFactory();
        factory.getStatistics().setStatisticsEnabled(true);
        factory.getStatistics().clear();

        // Get users
        List<User> users = Utility.getAdminSessionBean().getAllUsers();
        long queriesAfterLoad = factory.getStatistics().getQueryExecutionCount();

        // Access roles for each user
        for (User user : users) {
            Set<Role> roles = user.getRoles();
            assertNotNull(roles);
        }

        // Check that accessing roles didn't trigger new queries
        long queriesAfterAccess = factory.getStatistics().getQueryExecutionCount();
        long additionalQueries = queriesAfterAccess - queriesAfterLoad;

        System.out.println("Additional queries when accessing roles: " + additionalQueries);

        // AFTER FIX: Should be 0 additional queries
        assertEquals("Roles triggered lazy-loading queries", 0, additionalQueries);
    }

    /**
     * Test getSites() performance
     */
    public void testGetSitesQueryPerformance() {
        SessionFactory factory = HibernateUtil.getSessionFactory();
        factory.getStatistics().setStatisticsEnabled(true);
        factory.getStatistics().clear();

        // Get sites with teams and agents
        List<Site> sites = Utility.getAdminSessionBean().getSites();

        Statistics stats = factory.getStatistics();
        int queryCount = (int) stats.getQueryExecutionCount();

        System.out.println("Query count for getSites(): " + queryCount);

        // AFTER FIX: Should be 2-3 queries regardless of sites/teams/agents count
        assertTrue("Too many queries for getSites(): " + queryCount,
            queryCount <= 5);

        // Verify data was loaded
        for (Site site : sites) {
            Set<Team> teams = site.getTeams();
            assertNotNull(teams);
            for (Team team : teams) {
                Set<Agent> agents = team.getAgents();
                assertNotNull(agents);
            }
        }

        // Should not have additional queries from accessing teams/agents
        long finalCount = factory.getStatistics().getQueryExecutionCount();
        assertEquals("Accessing teams/agents triggered new queries",
            queryCount, finalCount);
    }

    /**
     * Test performance with large dataset
     */
    public void testPerformanceWithLargeDataset() throws Exception {
        // Create 100 test users
        createTestUsers(100);

        SessionFactory factory = HibernateUtil.getSessionFactory();
        factory.getStatistics().setStatisticsEnabled(true);

        long startTime = System.currentTimeMillis();
        factory.getStatistics().clear();

        // Load all users
        List<User> users = Utility.getAdminSessionBean().getAllUsers();

        long endTime = System.currentTimeMillis();
        long queryCount = factory.getStatistics().getQueryExecutionCount();
        long executionTime = endTime - startTime;

        System.out.println("100 users loaded in " + executionTime + "ms with " + queryCount + " queries");

        // AFTER FIX: Should load 100 users in minimal queries
        assertTrue("Query count too high: " + queryCount, queryCount < 10);
        assertTrue("Execution too slow: " + executionTime + "ms", executionTime < 1000);

        assertEquals("Not all users loaded", 100, users.size());
    }

    /**
     * Test scorecard query optimization
     */
    public void testScorecardQueryOptimization() throws Exception {
        ScoreCard scorecard = Utility.getTestSessionBean()
            .findCardByName(BootstrapConstants.scorecardNameOne);

        SessionFactory factory = HibernateUtil.getSessionFactory();
        factory.getStatistics().setStatisticsEnabled(true);
        factory.getStatistics().clear();

        // Get scorecards
        List<Scorecard> scorecards = Utility.getScoreSessionBean()
            .getScorecards(client);

        long queryCount = factory.getStatistics().getQueryExecutionCount();
        System.out.println("Query count for getScorecards(): " + queryCount);

        // AFTER FIX: Should be 2-3 queries
        assertTrue("Too many queries: " + queryCount, queryCount <= 5);

        // Access sections and questions - should not trigger new queries
        factory.getStatistics().clear();
        for (Scorecard card : scorecards) {
            Set<Section> sections = card.getSections();
            for (Section section : sections) {
                Set<Question> questions = section.getQuestions();
                for (Question question : questions) {
                    List<?> entries = question.getQuestionEntries();
                    assertNotNull(entries);
                }
            }
        }

        long additionalQueries = factory.getStatistics().getQueryExecutionCount();
        assertEquals("Accessing scorecard details triggered queries",
            0, additionalQueries);
    }

    private void createTestUsers(int count) throws Exception {
        for (int i = 0; i < count; i++) {
            User user = new User();
            user.setUserName("testuser" + i);
            user.setFirstName("Test");
            user.setLastName("User" + i);
            user.setClient(client);

            Long userId = Utility.getAdminSessionBean().createUser(user, "password");
            createdUserIds.add(userId);
        }
    }
}
```

### Performance Benchmark Test

**File to create:** `callRecording/test/net/voicelog/test/performance/QueryPerformanceBenchmark.java`

```java
public class QueryPerformanceBenchmark extends TestCase {

    private SessionFactory sessionFactory;

    @Override
    protected void setUp() throws Exception {
        super.setUp();
        sessionFactory = HibernateUtil.getSessionFactory();
    }

    /**
     * Benchmark: Load users before and after fix
     * BEFORE FIX metrics:
     *   - 50 users: ~2500ms, 51 queries
     *   - 100 users: ~5000ms, 101 queries
     * AFTER FIX metrics:
     *   - 50 users: ~50ms, 2 queries
     *   - 100 users: ~100ms, 2 queries
     */
    public void testUserLoadingBenchmark() {
        System.out.println("\n===== USER LOADING BENCHMARK =====");

        int[] userCounts = {10, 50, 100};

        for (int count : userCounts) {
            sessionFactory.getStatistics().setStatisticsEnabled(true);
            sessionFactory.getStatistics().clear();

            long startTime = System.nanoTime();

            List<User> users = Utility.getAdminSessionBean().getAllUsers();
            // Limit to first 'count' users for benchmark
            if (users.size() > count) {
                users = users.subList(0, count);
            }

            // Access roles to simulate real usage
            for (User user : users) {
                Set<Role> roles = user.getRoles();
                // Just access to trigger loading if lazy
            }

            long endTime = System.nanoTime();
            long executionTimeMs = (endTime - startTime) / 1_000_000;
            long queryCount = sessionFactory.getStatistics().getQueryExecutionCount();

            System.out.println(String.format(
                "%d users: %d ms, %d queries",
                count, executionTimeMs, queryCount
            ));

            // AFTER FIX: Should be <200ms and <5 queries
            assertTrue("Too slow for " + count + " users",
                executionTimeMs < 200);
            assertTrue("Too many queries for " + count + " users",
                queryCount < 5);
        }
    }
}
```

## Existing Tests That Must Pass

These tests should pass with improved performance:

- `ScoreEjbTest.testGetScores()` - Should execute fewer queries
- `ScoreEjbTest.testPersistScore()` - Should have better performance
- User admin tests - Page loads should be faster
- Client management tests - Faster data loading

### Test Updates Needed

Update any test that counts queries:

```java
// BEFORE - Expected high query count
assertEquals("Expected 50+ queries", 51, queryCount);

// AFTER - Expect much lower count
assertTrue("Should execute <5 queries", queryCount < 5);
```

## Testing Strategy

1. **Enable Hibernate Statistics** in test setup
2. **Count Queries** using `SessionFactory.getStatistics().getQueryExecutionCount()`
3. **Benchmark Performance** - Measure execution time before and after fix
4. **Verify Data Integrity** - Ensure all data is loaded correctly
5. **Regression Testing** - Run existing tests to ensure no breakage

## Expected Performance Improvement

**Before Fix:**
- 100 users with roles: 100+ queries, 5-10 seconds

**After Fix:**
- 100 users with roles: 2-3 queries, <500ms
- Performance improvement: 10-20x faster

## Environment

- Application: VL-UI WildFly
- ORM: Hibernate 3.x
- Database: PostgreSQL
- Configuration: `callRecordingHAR/bin/config/hibernate.cfg.xml`
- Mappings: `callRecordingHAR/src/net/voicelog/callRecording/entities/*.hbm.xml`
