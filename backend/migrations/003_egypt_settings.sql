UPDATE settings SET value = '{"name_ar":"بن العجوز","phone":"01000000000","address":"جمهورية مصر العربية","country":"مصر","currency":"EGP","currency_symbol":"ج.م","logo":"/logo.png"}'::jsonb WHERE key = 'company';
UPDATE settings SET value = '{"enabled":true,"rate":14}'::jsonb WHERE key = 'tax';
