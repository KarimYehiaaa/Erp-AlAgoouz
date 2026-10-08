-- Supply missing defaults without replacing an operator's existing configuration.
UPDATE settings SET value = '{"name_ar":"بن العجوز","phone":"01000000000","address":"جمهورية مصر العربية","country":"مصر","currency":"EGP","currency_symbol":"ج.م","logo":"/logo.png"}'::jsonb || value WHERE key = 'company';
UPDATE settings SET value = '{"enabled":true,"rate":14}'::jsonb || value WHERE key = 'tax';
