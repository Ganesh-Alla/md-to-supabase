# HexCodec Data Corruption Bug - Bit-Shift Error

## Description

The `HexCodec` utility class contained a critical bit-shift error in the `hexToBytes()` method that caused data corruption when converting hexadecimal strings to byte arrays. The error manifested as incorrect byte values in the decoded output, making stored hex-encoded data unreadable and corrupted.

Additionally, the complementary `bytesToHex()` method was missing implementation, making round-trip encoding/decoding impossible. This prevented proper serialization and deserialization of binary data throughout the application.

## Steps to Reproduce

1. Encode binary data to hexadecimal using `HexCodec.bytesToHex()`
2. Decode the hexadecimal back to bytes using `HexCodec.hexToBytes()`
3. Compare original and decoded data
4. Observe data corruption - decoded bytes do not match original

## Expected Behavior

The `HexCodec` should support lossless round-trip encoding/decoding:
- `bytesToHex()` converts byte arrays to hexadecimal strings
- `hexToBytes()` converts hexadecimal strings back to byte arrays
- Original data should be recoverable after round-trip conversion

## Actual Behavior

The `hexToBytes()` method contains a bit-shift error that produces incorrect byte values during decoding. Additionally, `bytesToHex()` was not implemented, preventing any encoding operation.

Example: A byte with value 0xAB would decode incorrectly due to improper bit manipulation of the nibble (4-bit) values.

## Solution

### Fixed `hexToBytes()` Method
Corrected the bit-shift operation that combines high and low nibbles:
- High nibble (first hex character) is shifted left by 4 bits: `(high << 4)`
- Low nibble (second hex character) is added: `| low`
- Combined: `(high << 4) | low`

### Implemented `bytesToHex()` Method
Added complete implementation to convert byte arrays to hexadecimal strings, enabling bidirectional conversion.

### Comprehensive Testing
Added round-trip test cases that verify:
- Small byte arrays encode and decode correctly
- Large data sets maintain integrity
- Edge cases (0x00, 0xFF) are handled properly
- Round-trip encoding/decoding produces identical results

## Testing

- Test: `HexCodecRoundTripTest` verifies lossless round-trip conversion
- Tests validate multiple data sizes and edge cases
- 100% pass rate for round-trip encoding/decoding

## Related Issue

- Bug: HexCodec data corruption during hex encoding/decoding

## Environment

- Application: VL-UI WildFly
- Component: Encoding/Decoding Utility
- Data Type: Hexadecimal encoding of binary data
