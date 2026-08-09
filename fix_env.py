import sys

with open('backend/.env.recovered', 'rb') as f:
    raw = f.read()

# Decode as UTF-8 (the original file was UTF-8)
text = raw.decode('utf-8', errors='ignore')

# The original file didn't have BACKUP_ENCRYPTION_KEY, it was appended by me
# So I'll find where the bad appended part starts (e.g. B\x00A\x00C\x00K\x00U\x00P)
# Actually, I'll just write it as clean UTF-8 and strip the end manually if needed.

# Since Add-Content added it, it's near the end. Let's just save it.
with open('backend/.env', 'w', encoding='utf-8') as f:
    f.write(text)

print("Saved to backend/.env")
