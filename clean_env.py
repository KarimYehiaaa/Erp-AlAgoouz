import re

with open('backend/.env', 'r', encoding='utf-8') as f:
    lines = f.readlines()

clean_lines = []
for line in lines:
    if line.startswith('B A C K U P') or line.startswith(' BACKUP_ENCRYPTION_KEY') or line.startswith(' J W T'):
        continue
    if line.strip() == '':
        if len(clean_lines) > 0 and clean_lines[-1].strip() == '':
            continue
    # If the line has lots of space separated characters like ' B A C K U P ', skip it
    if re.match(r'^ ?([A-Z] )+[A-Z]', line):
        continue
    clean_lines.append(line)

# Now just append the proper BACKUP_ENCRYPTION_KEY at the end
clean_lines.append('\nBACKUP_ENCRYPTION_KEY=e4ccaeb6a7c42327ef5e40f6e3a7b2e31904d6664b026c3a00ac355600c0000c\n')

with open('backend/.env', 'w', encoding='utf-8') as f:
    f.writelines(clean_lines)

print("Cleaned .env")
