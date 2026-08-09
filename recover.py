import sys

with open('backend/.env', 'rb') as f:
    utf8_bytes = f.read()

# Strip UTF-8 BOM if present
if utf8_bytes.startswith(b'\xef\xbb\xbf'):
    utf8_bytes = utf8_bytes[3:]

# Decode from UTF-8 to get the python string (which is exactly what PowerShell held in memory)
try:
    corrupted_str = utf8_bytes.decode('utf-8')
except UnicodeDecodeError as e:
    print(f"Decode error: {e}")
    sys.exit(1)

# Now encode back to UTF-16 LE to recover the original bytes
recovered_bytes = corrupted_str.encode('utf-16le')

# Now print the first 200 characters of recovered bytes to see if it makes sense
print("Recovered text snippet:")
print(recovered_bytes[:200].decode('ascii', errors='replace'))

with open('backend/.env.recovered', 'wb') as f:
    f.write(recovered_bytes)

print("Saved to backend/.env.recovered")
