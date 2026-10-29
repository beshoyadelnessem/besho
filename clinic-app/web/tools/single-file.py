# Inlines the web build into one HTML file for a shareable demo page:
#   python3 tools/single-file.py dist out.html [--role patient|therapist|admin|owner] [--title "..."] [--no-audio]
# --role opens the page signed in as that demo role and hides the other roles' buttons.
import argparse, base64, glob, json, os

ap = argparse.ArgumentParser()
ap.add_argument('dist'); ap.add_argument('out')
ap.add_argument('--role', choices=['patient', 'therapist', 'admin', 'owner'])
ap.add_argument('--title', default='تمارين البيت')
ap.add_argument('--no-audio', action='store_true')
a = ap.parse_args()

css = open(glob.glob(f'{a.dist}/assets/*.css')[0]).read()
js = open(glob.glob(f'{a.dist}/assets/*.js')[0]).read().replace('</script', '<\\/script')
audio = {} if a.no_audio else {
    f'audio/{f}': 'data:audio/mpeg;base64,' + base64.b64encode(open(f'{a.dist}/audio/{f}', 'rb').read()).decode()
    for f in sorted(os.listdir(f'{a.dist}/audio'))}
boot = f'window.__AUDIO_INLINE__={json.dumps(audio)};'
if a.role:
    boot += f'window.__DEMO_ROLE__={json.dumps(a.role)};'
head = f'''<title>{a.title}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap">
'''
open(a.out, 'w').write(head + '<style>' + css + '</style>\n<div id="root"></div>\n<script>' + boot
                       + '</script>\n<script type="module">' + js + '</script>\n')
print(a.out, len(audio), 'tracks,', os.path.getsize(a.out) // 1024, 'KB')
