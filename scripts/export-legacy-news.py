"""Read-only public Neos news export. Requires beautifulsoup4 and markdownify."""
import json, re, sys, hashlib
from pathlib import Path
from datetime import datetime, timezone
from urllib.request import urlopen, Request
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from markdownify import MarkdownConverter
class NewsMarkdown(MarkdownConverter):
    def convert_p(self, el, text, parent_tags):
        # A written date such as "07. & 08.12." must not become list item 1.
        result=super().convert_p(el,text,parent_tags)
        return re.sub(r'(?m)^(\s*\d+)\.(?=\s)',r'\1\\.',result)
BASE = 'https://konglomerat.org'
target = Path(sys.argv[1] if len(sys.argv)>1 else '.migration-backups/legacy-news')
target.mkdir(parents=True, exist_ok=True)
def fetch(url):
    assert urlparse(url).hostname == 'konglomerat.org'
    name = hashlib.sha256(url.encode()).hexdigest()+'.html'
    p=target/name
    if not p.exists():
        with urlopen(Request(url,headers={'User-Agent':'Konglomerat content migration (read-only)'}),timeout=30) as response:
            body=response.read().decode('utf8')
        p.write_text(body)
    return BeautifulSoup(p.read_text(),'html.parser')
def absolute(value, base=BASE):
    return urljoin(base,value.replace('konglomerat.org:', 'konglomerat.org'))
pages=[BASE+'/aktuelles']; seen=set(); articles={}
while pages:
    url=pages.pop(0)
    if url in seen: continue
    seen.add(url); soup=fetch(url)
    for a in soup.select('.Pagination a[href]'):
        link=absolute(a['href'])
        if link not in seen: pages.append(link)
    for a in soup.select('a.blog-post-preview[href]'):
        link=absolute(a['href']).split('?')[0]
        assert re.search(r'/aktuelles/\d{4}/',link),link
        articles[link]=a.select_one('.blog-post-preview__title').get_text(' ',strip=True)
    print(f'Index pages {len(seen)}, articles {len(articles)}',flush=True)
rows=[]
for url, title in articles.items():
    soup=fetch(url); header=soup.select_one('.blog-post-header'); main=soup.select_one('main')
    assert header and main,url
    actual=header.select_one('h1').get_text(' ',strip=True)
    date_node=header.select_one('.blog-post-header__date')
    date=date_node.get_text(strip=True) if date_node else ''
    year=re.search(r'/aktuelles/(\d{4})/',url).group(1)
    published=datetime.strptime(date or '01.01.'+year,'%d.%m.%Y').replace(tzinfo=timezone.utc).isoformat()
    tags=[e.get_text(' ',strip=True) for e in header.select('.blog-tag')]
    for el in main.select('button,script,style,source'): el.decompose()
    for img in main.select('img[src]'):
        if re.search(r'/Lines_[^/]+\.svg$',img['src'],re.I): img.decompose()
    images=[]
    for img in main.select('img[src]'):
        src=absolute(img['src'],url)
        if src not in images: images.append(src)
    header.extract()
    body=main
    assert body is not None,url
    # Preserve all original text/captions and links; collect images in the editable gallery.
    for el in body.select('script,style,source'): el.decompose()
    embeds=[]
    for el in body.select('iframe[src],video[src],audio[src]'):
        src=absolute(el['src'],url); embeds.append(src)
        replacement=soup.new_tag('a',href=src); replacement.string='Eingebetteten Inhalt öffnen'; el.replace_with(replacement)
    for a in body.select('a[href]'): a['href']=absolute(a['href'],url)
    for img in body.select('img'):
        if img.get('alt'):
            caption=soup.new_tag('p');caption.string=img['alt'];img.replace_with(caption)
        else: img.decompose()
    markdown=NewsMarkdown(heading_style='ATX',bullets='-',strip=['picture']).convert(str(body)).strip()
    plain=body.get_text(' ',strip=True)
    rows.append({'sourceUrl':url,'title':actual,'publishedAt':published,'dateLabel':date or year+' (genaues Datum nicht angegeben)','tags':tags,'gallery':images,'markdown':markdown,'sourceText':plain,'excerpt':plain[:280],'embeds':embeds})
    print(f'Article {len(rows)}/{len(articles)}: {actual}',flush=True)
assert len(rows)==len(articles)
result={'source':BASE+'/aktuelles','exportedAt':datetime.now(timezone.utc).isoformat(),'indexPages':sorted(seen),'rows':rows}
(target/'export.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
print(json.dumps({'articles':len(rows),'pages':len(seen),'images':sum(len(r['gallery']) for r in rows),'emptyBodies':sum(not r['markdown'] for r in rows)}))
