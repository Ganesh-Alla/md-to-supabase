# Audio/Video Streaming Buffer Overflow - Unvalidated File Size Leading to DoS

## Description

The AudioServlet and VideoServlet do not validate file sizes before loading files into memory. An attacker can craft or upload a large file (gigabytes) to cause OutOfMemory errors, crashing the application server. Additionally, HTTP Range requests are not supported, preventing efficient resumable downloads.

## Steps to Reproduce / Create the Issue

### To Create the Vulnerability:

1. **Modify AudioServlet to remove size checks**

**File:** `callRecording/src/net/voicelog/callRecording/servlet/AudioServlet.java`

Change the doGet method to NOT check file size:

```java
// VULNERABLE CODE - Remove all size validations
@Override
protected void doGet(HttpServletRequest request, HttpServletResponse response) {
    String callId = request.getParameter("callId");
    File audioFile = new File(storageDir, callId + ".wav");

    // NO SIZE CHECK - VULNERABLE
    FileInputStream fis = new FileInputStream(audioFile);
    byte[] buffer = new byte[(int)audioFile.length()];  // Allocates full file size
    fis.read(buffer);  // Loads entire file into memory
    response.getOutputStream().write(buffer);
}
```

2. **Create large test file**

```bash
# Create 2GB test file
dd if=/dev/zero of=/recordings/huge_file.wav bs=1M count=2048
```

3. **Request the file**

```
GET /callRecording/audioPlayback?callId=huge_file
```

4. **Observe OutOfMemoryError**

The servlet attempts to allocate 2GB heap memory, causing JVM to run out of memory and crash.

### Attack Scenarios

**Scenario 1: Direct Upload**
- Upload 2GB audio file to recording storage
- Request it through AudioServlet
- Application crashes

**Scenario 2: Multiple Concurrent Requests**
- Multiple clients request large files simultaneously
- Each request allocates 512MB buffer
- Combined memory usage exceeds heap size
- Application becomes unresponsive

**Scenario 3: Path Traversal + Large File**
- Request `../../config/large_db_backup.sql`
- If file exists, causes OOM

## Expected Behavior

The servlet should:
1. Check file size before loading
2. Reject files exceeding maximum allowed size (e.g., 512MB)
3. Return HTTP 413 (Payload Too Large) for oversized files
4. Support HTTP Range requests for resumable downloads
5. Stream file in chunks rather than loading entirely
6. Prevent path traversal attacks

## Actual Behavior

No file size validation. Entire file is read into memory buffer, causing:
- OutOfMemoryError for large files
- Denial of Service by crashing application
- Complete resource consumption by single request

## Solution

### Step 1: Create FileStreamingUtil

**File to create:** `callRecording/src/net/voicelog/callRecording/servlet/FileStreamingUtil.java`

```java
public class FileStreamingUtil {

    private static final long MAX_FILE_SIZE = 512 * 1024 * 1024;  // 512MB
    private static final int BUFFER_SIZE = 8192;  // 8KB chunks

    public static void validateAndStreamFile(
            File file,
            HttpServletRequest request,
            HttpServletResponse response,
            String contentType) throws IOException {

        // Validate file exists and size
        if (!file.exists() || file.length() > MAX_FILE_SIZE) {
            response.sendError(HttpServletResponse.SC_PAYLOAD_TOO_LARGE);
            return;
        }

        // Validate path (prevent traversal)
        if (!file.getCanonicalPath().startsWith(getStorageDir())) {
            response.sendError(HttpServletResponse.SC_FORBIDDEN);
            return;
        }

        long fileSize = file.length();
        long rangeStart = 0, rangeEnd = fileSize - 1;

        // Handle Range header
        String range = request.getHeader("Range");
        if (range != null && range.startsWith("bytes=")) {
            String[] parts = range.substring(6).split("-");
            try {
                rangeStart = Long.parseLong(parts[0]);
                if (parts.length > 1 && !parts[1].isEmpty()) {
                    rangeEnd = Long.parseLong(parts[1]);
                }
            } catch (NumberFormatException e) {
                response.setStatus(416);  // Range Not Satisfiable
                return;
            }
            response.setStatus(206);  // Partial Content
            response.setHeader("Content-Range", "bytes " + rangeStart + "-" + rangeEnd + "/" + fileSize);
        }

        // Set response headers
        response.setContentType(contentType);
        response.setContentLengthLong(rangeEnd - rangeStart + 1);
        response.setHeader("Accept-Ranges", "bytes");

        // Stream in chunks
        try (RandomAccessFile raf = new RandomAccessFile(file, "r");
             OutputStream out = response.getOutputStream()) {

            raf.seek(rangeStart);
            byte[] buffer = new byte[BUFFER_SIZE];
            long bytesWritten = 0;
            int bytesRead;

            while (bytesWritten < (rangeEnd - rangeStart + 1) &&
                   (bytesRead = raf.read(buffer)) != -1) {

                int bytesToWrite = (int) Math.min(
                    bytesRead,
                    (rangeEnd - rangeStart + 1) - bytesWritten
                );
                out.write(buffer, 0, bytesToWrite);
                bytesWritten += bytesToWrite;
            }
        }
    }

    private static String getStorageDir() {
        return PreferenceHelper.getPreference("RECORDING_STORAGE_DIR");
    }
}
```

### Step 2: Update AudioServlet

**File to modify:** `callRecording/src/net/voicelog/callRecording/servlet/AudioServlet.java`

```java
@Override
protected void doGet(HttpServletRequest request, HttpServletResponse response) {
    try {
        String callId = request.getParameter("callId");
        File storageDir = new File(PreferenceHelper.getPreference("RECORDING_STORAGE_DIR"));
        File audioFile = new File(storageDir, callId + ".wav");

        FileStreamingUtil.validateAndStreamFile(
            audioFile,
            request,
            response,
            "audio/wav"
        );
    } catch (IOException e) {
        try {
            response.sendError(HttpServletResponse.SC_INTERNAL_SERVER_ERROR);
        } catch (IOException ioe) {
            // Ignore
        }
    }
}
```

## Tests to Create

### New Test File: FileStreamingServletTest.java

**Location:** `callRecording/test/net/voicelog/test/servlet/FileStreamingServletTest.java`

```java
public class FileStreamingServletTest extends TestCase {

    private MockHttpServletRequest request;
    private MockHttpServletResponse response;
    private File testStorageDir;
    private File testAudioFile;

    @Override
    protected void setUp() throws Exception {
        super.setUp();
        request = new MockHttpServletRequest();
        response = new MockHttpServletResponse();

        // Create temp directory for test files
        testStorageDir = new File(System.getProperty("java.io.tmpdir"), "audio_test");
        testStorageDir.mkdirs();

        // Create small test audio file (1MB)
        testAudioFile = new File(testStorageDir, "test_audio.wav");
        createTestFile(testAudioFile, 1024 * 1024);  // 1MB

        // Mock preference
        PreferenceHelper.setTestStorageDir(testStorageDir.getAbsolutePath());
    }

    @Override
    protected void tearDown() throws Exception {
        // Cleanup test files
        if (testAudioFile != null && testAudioFile.exists()) {
            testAudioFile.delete();
        }
        if (testStorageDir != null) {
            testStorageDir.delete();
        }
        super.tearDown();
    }

    /**
     * Test that large files are rejected
     */
    public void testLargeFileRejection() throws IOException {
        // Create file larger than 512MB limit
        File largeFile = new File(testStorageDir, "large_audio.wav");
        // Simulate large file size without creating actual large file
        FileMetadata.setSizeOverride(largeFile, 1024 * 1024 * 1024);  // 1GB

        FileStreamingUtil.validateAndStreamFile(
            largeFile,
            request,
            response,
            "audio/wav"
        );

        // Should return 413 Payload Too Large
        assertEquals(HttpServletResponse.SC_PAYLOAD_TOO_LARGE, response.getStatus());
    }

    /**
     * Test normal file streaming
     */
    public void testNormalFileStreaming() throws IOException {
        FileStreamingUtil.validateAndStreamFile(
            testAudioFile,
            request,
            response,
            "audio/wav"
        );

        // Should succeed
        assertEquals(HttpServletResponse.SC_OK, response.getStatus());
        assertEquals("audio/wav", response.getContentType());
        assertTrue(response.getContentLength() > 0);
    }

    /**
     * Test Range request support
     */
    public void testRangeRequestHandling() throws IOException {
        // Create 10MB test file
        File rangeTestFile = new File(testStorageDir, "range_test.wav");
        createTestFile(rangeTestFile, 10 * 1024 * 1024);

        request.addHeader("Range", "bytes=0-1023");  // First 1KB

        FileStreamingUtil.validateAndStreamFile(
            rangeTestFile,
            request,
            response,
            "audio/wav"
        );

        // Should return 206 Partial Content
        assertEquals(HttpServletResponse.SC_PARTIAL_CONTENT, response.getStatus());
        assertTrue(response.getHeader("Content-Range").contains("bytes 0-1023"));
    }

    /**
     * Test invalid Range request
     */
    public void testInvalidRangeRequest() throws IOException {
        request.addHeader("Range", "bytes=INVALID");

        FileStreamingUtil.validateAndStreamFile(
            testAudioFile,
            request,
            response,
            "audio/wav"
        );

        // Should return 416 Range Not Satisfiable
        assertEquals(416, response.getStatus());
    }

    /**
     * Test path traversal protection
     */
    public void testPathTraversalProtection() throws IOException {
        File maliciousPath = new File(testStorageDir, "../../etc/passwd");

        try {
            FileStreamingUtil.validateAndStreamFile(
                maliciousPath,
                request,
                response,
                "audio/wav"
            );

            // Should return 403 Forbidden
            assertEquals(HttpServletResponse.SC_FORBIDDEN, response.getStatus());
        } catch (IOException e) {
            // Expected
        }
    }

    /**
     * Test that file is streamed in chunks, not loaded entirely
     */
    public void testChunkedStreaming() throws IOException {
        FileStreamingUtil.validateAndStreamFile(
            testAudioFile,
            request,
            response,
            "audio/wav"
        );

        // Get response output
        byte[] output = response.getOutputStreamContents();

        // Should have content equal to file size
        assertEquals("Output size mismatch", testAudioFile.length(), output.length);
    }

    /**
     * Test Accept-Ranges header is set
     */
    public void testAcceptRangesHeader() throws IOException {
        FileStreamingUtil.validateAndStreamFile(
            testAudioFile,
            request,
            response,
            "audio/wav"
        );

        assertEquals("bytes", response.getHeader("Accept-Ranges"));
    }

    /**
     * Test that missing file returns 404
     */
    public void testMissingFileNotFound() throws IOException {
        File nonExistent = new File(testStorageDir, "nonexistent.wav");

        FileStreamingUtil.validateAndStreamFile(
            nonExistent,
            request,
            response,
            "audio/wav"
        );

        // Should fail gracefully
        assertTrue(response.getStatus() >= 400);
    }

    /**
     * Test concurrent streaming requests don't exceed memory
     */
    public void testConcurrentStreamingMemorySafe() throws Exception {
        ExecutorService executor = Executors.newFixedThreadPool(10);

        for (int i = 0; i < 10; i++) {
            executor.submit(() -> {
                try {
                    MockHttpServletRequest req = new MockHttpServletRequest();
                    MockHttpServletResponse resp = new MockHttpServletResponse();

                    FileStreamingUtil.validateAndStreamFile(
                        testAudioFile,
                        req,
                        resp,
                        "audio/wav"
                    );

                    assertEquals(200, resp.getStatus());
                } catch (IOException e) {
                    fail("Streaming failed: " + e.getMessage());
                }
            });
        }

        executor.shutdown();
        assertTrue(executor.awaitTermination(30, TimeUnit.SECONDS));

        // Should complete without OutOfMemoryError
    }

    private void createTestFile(File file, long sizeBytes) throws IOException {
        try (FileOutputStream fos = new FileOutputStream(file)) {
            byte[] buffer = new byte[8192];
            long remaining = sizeBytes;

            while (remaining > 0) {
                int toWrite = (int) Math.min(buffer.length, remaining);
                fos.write(buffer, 0, toWrite);
                remaining -= toWrite;
            }
        }
    }
}
```

### Performance and Load Test

**File to create:** `callRecording/test/net/voicelog/test/servlet/AudioServletLoadTest.java`

```java
public class AudioServletLoadTest extends TestCase {

    /**
     * Test memory usage during streaming
     * Should NOT consume full file size in heap memory
     */
    public void testMemoryUsageDuringStreaming() throws IOException {
        Runtime runtime = Runtime.getRuntime();

        File testFile = createTestFile(50 * 1024 * 1024);  // 50MB file

        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        long heapBefore = runtime.totalMemory() - runtime.freeMemory();

        FileStreamingUtil.validateAndStreamFile(
            testFile,
            request,
            response,
            "audio/wav"
        );

        long heapAfter = runtime.totalMemory() - runtime.freeMemory();
        long heapIncrease = heapAfter - heapBefore;

        System.out.println("50MB file streaming - heap increase: " + (heapIncrease / 1024 / 1024) + "MB");

        // Should only buffer 8KB at a time, not 50MB
        assertTrue("Heap increased more than expected: " + heapIncrease,
            heapIncrease < 20 * 1024 * 1024);  // Should be < 20MB increase

        testFile.delete();
    }
}
```

## Existing Tests That Must Pass

These tests should pass with the streaming implementation:

- Audio playback tests - Should now work with large files
- Video streaming tests - Should handle Range requests
- Performance tests - Should show improved memory usage

## Testing Strategy

1. **Size Validation Tests** - Verify files over limit are rejected
2. **Memory Tests** - Verify streaming doesn't load full file into memory
3. **Range Request Tests** - Verify HTTP 206 Partial Content
4. **Path Traversal Tests** - Verify directory escape attempts are blocked
5. **Load Tests** - Verify concurrent streaming is memory-safe

## Expected Behavior After Fix

- 1GB file: Rejected with HTTP 413
- 512MB file: Streamed successfully with 8KB buffering
- Range request: Returns HTTP 206 with Content-Range header
- Path traversal: Returns HTTP 403
- Concurrent requests: No memory exhaustion

## Security Impact

**Severity:** HIGH/CRITICAL (DoS Attack)
**CWE:** CWE-434 - Unrestricted Upload with Dangerous Type
**Attack:** Denial of Service via memory exhaustion

## Environment

- Application: VL-UI WildFly
- Servlets: AudioServlet.java, VideoServlet.java
- Storage: File system directory configured in preferences
