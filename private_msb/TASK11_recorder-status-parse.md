# Recorder Status Parsing - Off-by-One Error in String Extraction

## Description

The `RecorderStateOfHealth.getStatus()` method contained an off-by-one error in substring extraction that caused the method to fail when parsing recorder status messages. The method was incorrectly extracting a substring that included the leading underscore character instead of just the numeric portion.

When processing status strings like "CALLRECORDS_TO_PACKAGE_10 5", the method would extract "_10" instead of "10", causing the Integer.parseInt() call to throw a NumberFormatException. The exception was caught and the method returned 0 (the default error value), making recorder health monitoring completely non-functional.

## Steps to Reproduce

1. Obtain a recorder status message string (e.g., "CALLRECORDS_TO_PACKAGE_10 5")
2. Call the RecorderStateOfHealth.getStatus(statusMessage) method
3. Observe that the method returns 0 instead of the expected numeric value
4. Check application logs for NumberFormatException

## Expected Behavior

The `getStatus()` method should parse the numeric status value from formatted recorder status messages:

For input: "CALLRECORDS_TO_PACKAGE_10 5"
- Expected output: 10 (the numeric status value)

The method should:
1. Find the position of the last underscore in the string
2. Find the position of the space character
3. Extract the substring between these positions
4. Parse the extracted text as an integer
5. Return the parsed integer value

## Actual Behavior

The method extracts the substring starting at the underscore position, not after it. This results in:
- Extracting: "_10" (including underscore)
- Attempting: Integer.parseInt("_10")
- Failing with: NumberFormatException (underscore is not a valid digit)
- Returning: 0 (exception handler default)

## Root Cause

The substring extraction uses the wrong starting index:

```java
// INCORRECT
int lastIndexOfUnderscore = string.lastIndexOf('_');
int firstIndexOfSpace = string.indexOf(' ');
String statusStr = string.substring(lastIndexOfUnderscore, firstIndexOfSpace);
// This includes character at index lastIndexOfUnderscore (the underscore itself)
```

The substring() method includes the character at the starting index, so using `lastIndexOfUnderscore` includes the underscore in the extracted substring. To exclude the underscore, the starting index should be `lastIndexOfUnderscore + 1`.

## Solution

Change the substring starting index to exclude the underscore:

```java
// CORRECT
int lastIndexOfUnderscore = string.lastIndexOf('_');
int firstIndexOfSpace = string.indexOf(' ');
String statusStr = string.substring(lastIndexOfUnderscore + 1, firstIndexOfSpace);
// Now correctly extracts "10" without the underscore
Integer statusValue = Integer.parseInt(statusStr); // Successfully parses as 10
return statusValue;
```

By incrementing the starting index by 1, the substring now contains only the numeric portion without the underscore.

## Testing

- Unit tests verify correct parsing of various status message formats
- Tests validate single-digit and multi-digit numbers
- Regression tests ensure messages with different patterns parse correctly
- Verified that recorder status values are now correctly extracted and parsed

## Related Issue

- Bug: Recorder status parsing fails with NumberFormatException

## Environment

- Application: Call Recording System
- Component: Recorder State of Health Monitoring
- Utility Class: RecorderStateOfHealth
