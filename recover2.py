import sys

with open('backend/.env', 'rb') as f:
    utf8_bytes = f.read()

if utf8_bytes.startswith(b'\xef\xbb\xbf'):
    utf8_bytes = utf8_bytes[3:]

try:
    corrupted_str = utf8_bytes.decode('utf-8')
except UnicodeDecodeError as e:
    sys.exit(1)

recovered_bytes = corrupted_str.encode('utf-16le')

# Save to .env.recovered
with open('backend/.env.recovered', 'wb') as f:
    f.write(recovered_bytes)

# Try decoding the recovered bytes as utf-8, ignoring errors, and print the first 300 chars
print("Recovered text snippet:")
try:
    recovered_str = recovered_bytes.decode('utf-8', errors='ignore')
    # Print safely
    print(recovered_str[:300].encode('ascii', 'replace').decode('ascii'))
except Exception as e:
    pass
