# Recorder Status Parsing - Off-by-One Error in String Extraction (v3)

## Description

The `RecorderStateOfHealth.getStatus()` method contained an off-by-one error in substring extraction that caused incorrect parsing of recorder status messages. When extracting the numeric status value from status strings like "CALLRECORDS_TO_PACKAGE_10 5", the method was incorrectly including the leading underscore character in the substring, resulting in attempting to parse "_10" instead of "10".

This is the third iteration of fixes addressing this critical parsing bug that prevented the application from correctly reading recorder health status.

## Steps to Reproduce

1. Monitor recorder status messages with multi-digit numbers (e.g., "CALLRECORDS_TO_PACKAGE_10 5")
2. Attempt to parse the status using getStatus() method
3. Observe that integer parsing fails
4. Check that returned status value is 0 (failure default)

## Expected Behavior

When parsing status strings in the format "PREFIX_NUMBER REMAINING", the `getStatus()` method should:
1. Locate the last underscore in the string
2. Extract the numeric portion between the last underscore and the space
3. Successfully parse the extracted text as an integer
4. Return the parsed integer value representing the status

For "CALLRECORDS_TO_PACKAGE_10 5", should return: **10**

## Actual Behavior

The method extracts "_10" (including the leading underscore) instead of just "10". When Integer.parseInt() attempts to parse "_10", it fails with a NumberFormatException, causing the method to return 0 (the default error value).

## Root Cause

The substring extraction uses an incorrect starting index. The code was:
```java
int lastIndexOfUnderscore = string.lastIndexOf('_');
int firstIndexOfSpace = string.indexOf(' ');
String statusStr = string.substring(lastIndexOfUnderscore, firstIndexOfSpace);
// Results in: "_10" instead of "10"
```

The starting index should be `lastIndexOfUnderscore + 1` to exclude the underscore character.

## Solution

Corrected the substring extraction to start after the underscore:

```java
String statusStr = string.substring(lastIndexOfUnderscore + 1, firstIndexOfSpace);
// Now correctly results in: "10"
```

By incrementing the starting index by 1, the substring excludes the underscore and correctly extracts only the numeric portion.

## Testing

- Test: `UtilityTest.testGetStatusParsesAllDigitLengths()` passes
- Tests verify correct parsing for various digit counts (1-digit through multi-digit numbers)
- Tests validate strings with different prefix patterns
- Edge cases with single and double-digit status values all parse correctly

## Version History

- **v1**: Initial off-by-one error fix
- **v2**: Updated fix with improved string handling
- **v3**: Final iteration with comprehensive digit-length testing

## Related Issue

- Bug: Recorder status parsing fails with multi-digit numbers

## Environment

- Application: Call Recording System
- Component: Recorder Health Monitoring
- Utility: RecorderStateOfHealth status parser
