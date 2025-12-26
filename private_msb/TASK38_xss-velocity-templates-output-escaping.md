# XSS Vulnerability in Velocity Templates - Missing Output Escaping

## Description

Velocity templates in the view layer render user-supplied data without HTML escaping, creating Cross-Site Scripting (XSS) vulnerabilities. User input from profiles, comments, notes, and search results is directly interpolated into HTML without sanitization, allowing attackers to inject and execute arbitrary JavaScript in victim browsers.

## Steps to Reproduce

### Vulnerable Input Fields:
- User profile: firstName, lastName, email fields
- Comments in scorecards and coaching forms
- Call recording notes and metadata
- Search query displays

### Attack Scenario:
1. User navigates to edit profile page
2. In "First Name" field, enters: `<img src=x onerror="alert('XSS')">`
3. Save profile
4. When another user views user management or user details, JavaScript executes
5. Attacker can steal session cookies, perform actions, or redirect users

## Expected Behavior

All user-supplied data should be HTML-escaped when rendered in templates:
- `<` becomes `&lt;`
- `>` becomes `&gt;`
- `"` becomes `&quot;`
- `&` becomes `&amp;`

Data should render literally as text, not executable HTML.

## Actual Behavior

Velocity templates use unescaped variable interpolation:
```velocity
<!-- VULNERABLE -->
<input value="$user.firstName" />  <!-- Direct user data -->
<p>$comment.text</p>                <!-- No escaping -->
<h1>$callDetail.notes</h1>         <!-- Raw output -->
```

User data containing JavaScript tags executes in the browser.

## Root Cause

Velocity's `$variableName` syntax outputs raw values without escaping by default. Escaping must be explicitly enabled via:
1. Template escaping configuration in Velocity
2. Explicit escape directives in templates
3. Pre-escaping in Java before passing to templates

None of these approaches are currently applied consistently.

## Solution

### Step 1: Enable Velocity HTML Escaping Configuration

**File to modify:** `callRecording/WEB-INF/struts-config.xml` or Velocity initialization

```xml
<!-- Add to struts-config.xml -->
<init-param>
    <param-name>velocity.eventhandler.include.class</param-name>
    <param-value>org.apache.velocity.app.event.implement.EscapeHtmlReference</param-value>
</init-param>
```

### Step 2: Create EscapingUtil for Templates

**File to create:** `callRecording/src/net/voicelog/callRecording/utility/EscapeUtil.java`

```java
public class EscapeUtil {

    public static String escapeHtml(String input) {
        if (input == null) {
            return null;
        }
        return input
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace("\"", "&quot;")
            .replace("'", "&#39;");
    }

    public static String escapeJavaScript(String input) {
        if (input == null) {
            return null;
        }
        return input
            .replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("'", "\\'")
            .replace("\n", "\\n")
            .replace("\r", "\\r");
    }
}
```

### Step 3: Update Action Classes to Escape Data

**File to modify:** `callRecording/src/net/voicelog/callRecording/gui/actions/admin/MyProfileAction.java`

```java
public ActionForward init(...) {
    // Before passing to view, escape user data
    User user = getUser();

    // Create escaped copy for display
    UserDisplayDTO displayUser = new UserDisplayDTO();
    displayUser.setFirstName(EscapeUtil.escapeHtml(user.getFirstName()));
    displayUser.setLastName(EscapeUtil.escapeHtml(user.getLastName()));
    displayUser.setEmail(EscapeUtil.escapeHtml(user.getEmail()));

    request.setAttribute("user", displayUser);
    return mapping.findForward("profile");
}
```

### Step 4: Update Velocity Macro Libraries

**File to modify:** `callRecording/docroot/macros/*.vm`

```velocity
<!-- BEFORE -->
#macro(displayUserName $user)
  <span>$user.name</span>
#end

<!-- AFTER - Use escaped output -->
#macro(displayUserName $user)
  #set($escapedName = $user.name.replace('<', '&lt;').replace('>', '&gt;'))
  <span>$escapedName</span>
#end
```

### Step 5: Update Critical Templates

**Files to modify:**
- `callRecording/docroot/pages/admin/myProfile.vm`
- `callRecording/docroot/pages/admin/userAdmin.vm`
- `callRecording/docroot/pages/admin/scoring/scorecard.vm`
- `callRecording/docroot/pages/review/callDetail.vm`
- All Velocity templates displaying user data (40+ files)

```velocity
<!-- BEFORE -->
<input type="text" name="firstName" value="$form.firstName" />

<!-- AFTER -->
<input type="text" name="firstName" value="$!esc.html($form.firstName)" />
```

## Tests to Create

### New Test File: XSSVelocityTemplatesTest.java

**Location:** `callRecording/test/net/voicelog/test/utility/XSSVelocityTemplatesTest.java`

```java
public class XSSVelocityTemplatesTest extends TestCase {

    private EscapeUtil escapeUtil;
    private UserDisplayDTO displayUser;

    @Override
    protected void setUp() throws Exception {
        super.setUp();
        escapeUtil = new EscapeUtil();
        displayUser = new UserDisplayDTO();
    }

    /**
     * Test that HTML special characters are escaped
     */
    public void testHtmlEscapingBasic() {
        String xssPayload = "<img src=x onerror=\"alert('XSS')\">";
        String escaped = EscapeUtil.escapeHtml(xssPayload);

        assertFalse(escaped.contains("<"));
        assertFalse(escaped.contains(">"));
        assertFalse(escaped.contains("onerror"));
        assertTrue(escaped.contains("&lt;"));
        assertTrue(escaped.contains("&gt;"));
        assertEquals(
            "&lt;img src=x onerror=&quot;alert('XSS')&quot;&gt;",
            escaped
        );
    }

    /**
     * Test escaping prevents JavaScript execution
     */
    public void testXSSPayloadEscaping() {
        String[] xssPayloads = {
            "<script>alert('XSS')</script>",
            "<img src=x onerror=\"alert('XSS')\">",
            "<svg onload=\"alert('XSS')\">",
            "'\"><script>alert('XSS')</script>",
            "onmouseover=\"alert('XSS')\""
        };

        for (String payload : xssPayloads) {
            String escaped = EscapeUtil.escapeHtml(payload);
            assertFalse("Payload not properly escaped: " + payload,
                escaped.toLowerCase().contains("<script"));
            assertFalse("Payload not properly escaped: " + payload,
                escaped.toLowerCase().contains("onerror"));
            assertFalse("Payload not properly escaped: " + payload,
                escaped.toLowerCase().contains("onload"));
        }
    }

    /**
     * Test user profile data is escaped before rendering
     */
    public void testUserProfileDataEscaping() throws Exception {
        User testUser = Utility.getTestSessionBean()
            .findUserByUserName(
                Utility.getTestSessionBean().findClientByName("Test"),
                "testuser"
            );

        String xssName = "<script>alert('XSS')</script>";
        testUser.setFirstName(xssName);

        // Simulate action escaping
        UserDisplayDTO displayUser = new UserDisplayDTO();
        displayUser.setFirstName(EscapeUtil.escapeHtml(testUser.getFirstName()));

        // Verify escaped output
        assertFalse(displayUser.getFirstName().contains("<script"));
        assertTrue(displayUser.getFirstName().contains("&lt;script"));
    }

    /**
     * Test that normal user input is preserved after escaping
     */
    public void testNormalDataPreservation() {
        String[] normalInputs = {
            "John Smith",
            "john.smith@example.com",
            "New York",
            "O'Reilly"  // Single quote
        };

        for (String input : normalInputs) {
            String escaped = EscapeUtil.escapeHtml(input);
            // Content should be readable
            assertTrue("Content lost in escaping: " + input,
                escaped.contains("Smith") || escaped.contains("example") ||
                escaped.contains("York") || escaped.contains("O"));
        }
    }

    /**
     * Test comment escaping in scorecard
     */
    public void testScorecardCommentEscaping() throws Exception {
        Client client = Utility.getTestSessionBean()
            .findClientByName(BootstrapConstants.clientNameOne);
        User user = Utility.getTestSessionBean()
            .findUserByUserName(client, BootstrapConstants.adminUserName);

        String xssComment = "Good call<script>alert('XSS')</script>";
        ScoreResultDO score = new ScoreResultDO();
        score.setComments(xssComment);

        // Simulate escaping before storing/displaying
        String escapedComment = EscapeUtil.escapeHtml(score.getComments());

        assertFalse(escapedComment.contains("<script"));
        assertTrue(escapedComment.contains("Good call&lt;script"));
    }

    /**
     * Test null and empty string handling
     */
    public void testNullAndEmptyHandling() {
        assertNull(EscapeUtil.escapeHtml(null));
        assertEquals("", EscapeUtil.escapeHtml(""));
    }

    /**
     * Test entity references in user data
     */
    public void testEntityReferenceEscaping() {
        String input = "John & Mary <Engaged>";
        String escaped = EscapeUtil.escapeHtml(input);

        assertEquals("John &amp; Mary &lt;Engaged&gt;", escaped);
        assertFalse(escaped.contains(" & "));
        assertFalse(escaped.contains("<"));
    }

    /**
     * Simulate template rendering with escaped data
     */
    public void testVelocityTemplateRendering() throws Exception {
        // This test would require Velocity template engine setup
        // For now, test the escaping logic that would be used in templates

        String userInput = "<img src=x onerror=\"alert('XSS')\">";
        String escaped = EscapeUtil.escapeHtml(userInput);

        // Template would render like: <input value="$escaped" />
        String renderedHtml = "<input value=\"" + escaped + "\" />";

        // Verify HTML is safe
        assertFalse(renderedHtml.contains("onerror"));
        assertFalse(renderedHtml.contains("<img"));
        assertTrue(renderedHtml.contains("&lt;img"));
    }
}
```

### Existing Tests That Must Pass After Fix

The following existing tests must still pass and may need template updates:

- `CreateClientTest` - Client name displayed without escaping
- `EditUserTest` - User name fields displayed
- `ViewUserListTest` - User list rendering
- `FilteringActionTest` - Filter criteria displayed
- Search result tests - Search queries and results displayed

These tests may need to:
1. Remove assertions that check for unescaped content
2. Update expected values to include escape sequences
3. Add new assertions verifying escaped output

### Example of Test Update Needed

**File:** `callRecording/test/net/voicelog/test/struts/user/ViewUserListTest.java`

```java
// BEFORE
public void testUserNameDisplayed() {
    String responseText = response.getResponseAsText();
    assertTrue(responseText.contains(user.getFirstName()));
}

// AFTER - With escaping
public void testUserNameDisplayed() {
    String responseText = response.getResponseAsText();
    String escapedName = EscapeUtil.escapeHtml(user.getFirstName());
    assertTrue(responseText.contains(escapedName));
}

// NEW TEST - Verify no dangerous HTML
public void testNoXSSInResponse() {
    String responseText = response.getResponseAsText();
    assertFalse("Unescaped script tag found",
        responseText.contains("<script") &&  !responseText.contains("&lt;script"));
    assertFalse("Unescaped event handler found",
        responseText.contains("onerror=") && !responseText.contains("onerror=") == false);
}
```

## Testing Strategy

1. **Unit Tests**: Test EscapeUtil methods with various payloads
2. **Integration Tests**: Test action classes properly escape before rendering
3. **Template Tests**: Verify Velocity templates render escaped output
4. **Regression Tests**: Run existing tests and update assertions
5. **Security Tests**: Test with OWASP ZAP or Burp Suite

### Manual Security Testing

Test with these payloads in user input fields:

```html
<img src=x onerror="alert('XSS')">
<svg onload="alert('XSS')">
"><script>alert('XSS')</script>
<iframe src="javascript:alert('XSS')"></iframe>
<body onload="alert('XSS')">
javascript:alert('XSS')
```

After fix, all should render as text, not execute.

## Security Impact

**Severity:** HIGH/CRITICAL
**OWASP:** A7:2017 - Cross-Site Scripting
**CWE:** CWE-79 - Improper Neutralization of Input

## Environment

- Application: VL-UI WildFly
- Framework: Velocity 1.4
- Layer: View templates (40+ files)
- Input Sources: User profiles, comments, notes, searches
