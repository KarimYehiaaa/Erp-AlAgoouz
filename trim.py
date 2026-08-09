with open('backend/.env', 'r', encoding='utf-8') as f:
    text = f.read()

index = text.find('SUPPRESS_CONFIG_LOG=1')
if index != -1:
    # find the end of that line
    end_of_line = text.find('\n', index)
    if end_of_line != -1:
        clean_text = text[:end_of_line+1]
        
        # Add the backup key
        clean_text += '\nBACKUP_ENCRYPTION_KEY=e4ccaeb6a7c42327ef5e40f6e3a7b2e31904d6664b026c3a00ac355600c0000c\n'
        
        with open('backend/.env', 'w', encoding='utf-8') as f:
            f.write(clean_text)
