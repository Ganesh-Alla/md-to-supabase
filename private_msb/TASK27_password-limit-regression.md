# Password Length Limit Increase

## Description

The application had a password length constraint of 20 characters maximum, which is overly restrictive and reduces security. Password length is a critical factor in password strength, and limiting passwords to 20 characters unnecessarily weakens the security posture of the application.

Modern security best practices recommend allowing longer passwords to enable users to create stronger passphrases. The 20-character limit prevented users from creating passwords with adequate entropy and forced them to use more complex character combinations to compensate.

## Steps to Reproduce

1. Navigate to user password change/creation interface
2. Attempt to enter a password longer than 20 characters (e.g., 25 characters)
3. Observe that password is rejected or truncated
4. Check validation rules for maximum password length

## Expected Behavior

Users should be able to set passwords up to 40 characters in length, allowing for stronger security through longer passphrases while still maintaining practical usability. The system should:
1. Accept passwords up to 40 characters
2. Properly store and authenticate with longer passwords
3. Validate that passwords meet all security requirements including the increased length limit

## Actual Behavior

The password length validation limit is set to 20 characters maximum. Passwords longer than 20 characters are rejected by the system validation, preventing users from creating longer, more secure passwords.

## Solution

Increased the password length limit from 20 to 40 characters:

1. Updated password validation constraint to accept lengths up to 40 characters
2. Updated database schema if necessary to ensure field can store 40-character passwords
3. Updated related UI validation rules and error messages
4. Updated all associated tests to reflect the new limit

## Testing

- Updated existing password validation tests
- Tests verify that passwords up to 40 characters are accepted
- Tests verify that passwords longer than 40 characters are still rejected
- Password authentication still works correctly with longer passwords

## Security Considerations

- Increased password length enhances security by allowing longer passphrases
- 40-character limit is still practical and doesn't create usability issues
- Users can now create passwords with better entropy and complexity

## Related Issue

- Regression: Password length limit too restrictive

## Environment

- Application: VL-UI WildFly
- Component: User Authentication / Password Management
- Feature: Password validation and storage
