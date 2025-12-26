# Recorder Status Parsing - Off-by-One Error in String Extraction (v2)

## Description

The `RecorderStateOfHealth.getStatus()` method contained a critical off-by-one error that prevented proper parsing of recorder status messages. The method was extracting the wrong substring when parsing status strings, including the leading underscore character in the numeric portion.

When parsing messages like "CALLRECORDS_TO_PACKAGE_10 5", the method would incorrectly extract "_10" instead of "10", causing Integer.parseInt() to fail. This resulted in the method always returning 0 (the default error value), preventing the application from accurately monitoring recorder health status.

This is the second iteration of the fix with improved handling of edge cases.

## Steps to Reproduce

1. Process a recorder status message (e.g., "CALLRECORDS_TO_PACKAGE_10 5")
2. Call getStatus() method to extract the numeric status
3. Observe that the method returns 0 instead of the expected 10
4. Check logs for NumberFormatException during parsing

## Expected Behavior

The `getStatus()` method should correctly extract and parse the numeric status value from formatted status strings. For a string like "CALLRECORDS_TO_PACKAGE_10 5":
1. Identify last underscore position (after PACKAGE)
2. Extract substring from after underscore to the space
3. Parse extracted text as integer
4. Return the parsed integer (10)

## Actual Behavior

The substring extraction includes the underscore character, so it attempts to parse "_10" instead of "10". This causes:
1. NumberFormatException during Integer.parseInt("_10")
2. Exception is caught and method returns 0
3. Recorder status appears as 0 when it should be 10
4. Incorrect recorder health monitoring

## Root Cause

The substring method call uses the wrong starting index:

```java
// INCORRECT - includes underscore
String statusStr = string.substring(lastIndexOfUnderscore, firstIndexOfSpace);
// substring(17, 20) extracts "_10" from position 17-19
```

The starting index needs to be incremented by 1 to skip the underscore character:

```java
// CORRECT - excludes underscore
String statusStr = string.substring(lastIndexOfUnderscore + 1, firstIndexOfSpace);
// substring(18, 20) extracts "10" from position 18-19
```

## Solution

Changed the substring extraction starting index from `lastIndexOfUnderscore` to `lastIndexOfUnderscore + 1`:

```java
int lastIndexOfUnderscore = string.lastIndexOf('_');
int firstIndexOfSpace = string.indexOf(' ');
String statusStr = string.substring(lastIndexOfUnderscore + 1, firstIndexOfSpace);
// Now correctly extracts "10" instead of "_10"
Integer.parseInt(statusStr); // Successfully parses as 10
```

## Testing

- Tests verify correct parsing for various message formats
- Regression tests ensure fix handles edge cases
- Tests validate messages with single and multi-digit status values
- Verified that recorder status values now parse correctly

## Version History

- **v1**: Initial off-by-one error fix
- **v2**: Enhanced fix with improved edge case handling

## Related Issue

- Bug: Recorder status parsing returns 0 for all messages

## Environment

- Application: Call Recording System
- Component: Recorder Health Status Monitoring
- Utility: RecorderStateOfHealth
