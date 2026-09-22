import re, html, json, sys

src = open('lib/nuances.html', encoding='utf-8', errors='replace').read()
src = re.sub(r'<script.*?</script>', '', src, flags=re.S)
src = re.sub(r'<style.*?</style>', '', src, flags=re.S)
src = re.sub(r'<svg.*?</svg>', '', src, flags=re.S)

def text(h):
    t = re.sub(r'<br\s*/?>', ' ', h)
    t = re.sub(r'<[^>]+>', ' ', t)
    t = html.unescape(t)
    return re.sub(r'\s+', ' ', t).strip()

DISPO = {'q': 'qualified', 'nq': 'not_qualified', 'esc': 'escalate',
         'cond': 'conditional', 'screen': 'screen'}

# track section (h2) positions
sections = [(m.start(), text(m.group(1))) for m in re.finditer(r'<h2[^>]*>(.*?)</h2>', src, flags=re.S)]
def section_for(pos):
    cur = 'General'
    for p, name in sections:
        if p < pos: cur = name
        else: break
    return cur

out = []
for m in re.finditer(r'<article class="card[^"]*"[^>]*id="([^"]+)"[^>]*data-disp="([^"]+)"[^>]*>(.*?)</article>', src, flags=re.S):
    cid, disp, body = m.group(1), m.group(2), m.group(3)
    title_m = re.search(r'<h3[^>]*>(.*?)</h3>', body, flags=re.S)
    num_m   = re.search(r'<span class="card-num">(.*?)</span>', body, flags=re.S)
    story_m = re.search(r'<div class="frow frow-story">.*?<p>(.*?)</p>', body, flags=re.S)
    nuance_m= re.search(r'<span class="flabel flabel-nuance">.*?</span>\s*<p>(.*?)</p>', body, flags=re.S)
    reason_m= re.search(r'<span class="dispo-text">(.*?)</span>\s*</div>', body, flags=re.S)
    if not (title_m and story_m):
        continue
    reason = text(reason_m.group(1)) if reason_m else ''
    reason = re.sub(r'^The Reason:\s*', '', reason)
    out.append({
        'id': cid,
        'num': text(num_m.group(1)) if num_m else '',
        'title': text(title_m.group(1)),
        'category': section_for(m.start()),
        'disposition': DISPO.get(disp, disp),
        'story': text(story_m.group(1)),
        'nuance': text(nuance_m.group(1)) if nuance_m else '',
        'reason': reason,
    })

print(f'extracted {len(out)} scenarios', file=sys.stderr)
by_d = {}
for s in out: by_d[s['disposition']] = by_d.get(s['disposition'], 0) + 1
print('dispositions:', by_d, file=sys.stderr)
cats = {}
for s in out: cats[s['category']] = cats.get(s['category'], 0) + 1
print(f'categories: {len(cats)}', file=sys.stderr)
missing = [s['id'] for s in out if not s['nuance'] or not s['reason']]
print('missing nuance/reason:', len(missing), missing[:6], file=sys.stderr)
json.dump(out, open('/dev/stdout', 'w'), indent=1)
