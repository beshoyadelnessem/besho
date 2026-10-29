# Inlines the web build (and its audio) into one HTML file: python3 tools/single-file.py dist out.html
import sys, glob, json, base64, os
dist, out = sys.argv[1], sys.argv[2]
css = open(glob.glob(f'{dist}/assets/*.css')[0]).read()
js = open(glob.glob(f'{dist}/assets/*.js')[0]).read().replace('</script', '<\\/script')
audio = {f'audio/{f}': 'data:audio/mpeg;base64,' + base64.b64encode(open(f'{dist}/audio/{f}', 'rb').read()).decode()
         for f in sorted(os.listdir(f'{dist}/audio'))}
head = '''<title>تمارين البيت</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap">
'''
open(out, 'w').write(head + '<style>' + css + '</style>\n<div id="root"></div>\n<script>window.__AUDIO_INLINE__=' + json.dumps(audio)
                     + ';</script>\n<script type="module">' + js + '</script>\n')
print(len(audio), 'tracks,', os.path.getsize(out) // 1024, 'KB')
