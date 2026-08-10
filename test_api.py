import urllib.request, re
try:
    html = urllib.request.urlopen('https://agoouz.vercel.app').read().decode('utf-8')
    m = re.search(r'src="(/assets/index-[^"]+\.js)"', html)
    if m:
        print('JS:', m.group(1))
        js = urllib.request.urlopen('https://agoouz.vercel.app' + m.group(1)).read().decode('utf-8')
        m2 = re.search(r'baseURL:"([^"]+)"', js)
        if m2:
            print('API:', m2.group(1))
        else:
            print('No API found')
    else:
        print('No JS found')
except Exception as e:
    print(e)
