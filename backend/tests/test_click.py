"""test-click.py — Test nhanh trang / cua backend."""
import urllib.request, html.parser

class P(html.parser.HTMLParser):
    def __init__(self):
        super().__init__()
        self.buttons = []
    def handle_starttag(self, tag, attrs):
        d = dict(attrs)
        if tag == 'button' and d.get('class','') and 'tab-btn' in d.get('class',''):
            self.buttons.append(d)

url = "http://localhost:8000/"
resp = urllib.request.urlopen(url)
html = resp.read().decode('utf-8')

p = P()
p.feed(html)
print("Tab buttons found:", len(p.buttons))
for b in p.buttons:
    print(f"  class={b.get('class')} data-tab={b.get('data-tab')} text=...")

# Check CSS
import urllib.request
css_url = "http://localhost:8000/static/css/styles.css"
css = urllib.request.urlopen(css_url).read().decode('utf-8')
if 'pointer-events: none' in css:
    print("OK: marquee-container has pointer-events:none")
if 'pointer-events: auto' in css:
    print("OK: service-card has pointer-events:auto")
if 'overflow: hidden' in css and 'tab-panel' in css:
    print("OK: tab-panel has overflow:hidden")
