"""Run on the existing production host after uploading the reviewed source archive."""
import pathlib, subprocess, json, time, urllib.request, argparse, re
root=pathlib.Path('/opt/whoplaysnow/sports')
parser=argparse.ArgumentParser(description='Publish a reviewed WHOPLAYSNOW release and retain one running rollback')
parser.add_argument('--release',required=True)
parser.add_argument('--expected-release',required=True)
parser.add_argument('--port',required=True,type=int)
args=parser.parse_args()
assert re.fullmatch(r'[0-9]{8}-sports-v[0-9]+',args.release),'Invalid release'
assert 1024<args.port<65536,'Invalid loopback port'
release=args.release
version=release.rsplit('-',1)[-1]
image='whoplaysnow-sports:'+release
container='wpn-sports-web-'+version
port=args.port
target=root/'releases'/release
def run(*args):
    result=subprocess.run(args,check=True,text=True,capture_output=True)
    return result.stdout
previous=json.loads((root/'current-release.json').read_text())
assert previous['release']==args.expected_release,'Production changed; inspect before publishing'
assert not target.exists(),'Release already exists; inspect rather than overwrite'
target.mkdir(parents=True)
run('tar','-xzf','/tmp/wpn-sports-'+version+'.tar.gz','-C',str(target))
print('Building isolated release',flush=True)
run('docker','build','-t',image,str(target))
test_output=run('docker','run','--rm',image,'npm','test')
(root/(version+'-tests.txt')).write_text(test_output)
print('Container regression tests passed',flush=True)
if (target/'scripts'/'migrate-event-routes.ts').exists():
    print(run('docker','run','--rm','-v',str(root/'data')+':/data',image,'node','--import','tsx','scripts/migrate-event-routes.ts'),flush=True)
run('docker','run','-d','--name',container,'--restart','unless-stopped','--memory','512m','--cpus','1.5','--security-opt','no-new-privileges','--cap-drop','ALL','--read-only','--tmpfs','/tmp:rw,noexec,nosuid,size=32m','-p',f'127.0.0.1:{port}:3100','-v',str(root/'data')+':/data:ro',image)
base=f'http://127.0.0.1:{port}'
for attempt in range(30):
    try:
        with urllib.request.urlopen(base+'/healthz',timeout=5) as response: health=json.load(response)
        assert health['status']=='ok'
        break
    except Exception: time.sleep(1)
else: raise RuntimeError('Staging health failed; production is unchanged')
html=urllib.request.urlopen(base+'/').read().decode()
assert 'CHOOSE YOUR COMPETITION' in html and 'id="search-toggle"' in html
assert 'data-sport="all"' not in html and '<span>WHOPLAYS' not in html
for path in ['/competitions','/channels','/assets/social-card.png','/assets/refinements.css','/sitemap.xml','/robots.txt']:
    assert urllib.request.urlopen(base+path).status==200,path
nginx=pathlib.Path('/etc/nginx/sites-available/whoplaysnow')
old=nginx.read_text()
assert f"127.0.0.1:{previous['port']}" in old
backup=root/('rollback/nginx-'+previous['release'].rsplit('-',1)[-1]+'-before-'+version+'.conf');backup.write_text(old)
unit=pathlib.Path('/etc/systemd/system/wpn-sports-collect.service')
old_unit=unit.read_text();(root/('rollback/collector-'+previous['release'].rsplit('-',1)[-1]+'-before-'+version+'.service')).write_text(old_unit)
try:
    nginx.write_text(old.replace(f"127.0.0.1:{previous['port']}",f'127.0.0.1:{port}'))
    run('nginx','-t');run('systemctl','reload','nginx')
    actual=run('curl','--silent','--show-error','--fail','--resolve','whoplaysnow.com:443:127.0.0.1','https://whoplaysnow.com/')
    assert 'CHOOSE YOUR COMPETITION' in actual
    unit.write_text(old_unit.replace(previous['release'],release));run('systemctl','daemon-reload')
except Exception:
    nginx.write_text(old);unit.write_text(old_unit)
    run('nginx','-t');run('systemctl','reload','nginx');run('systemctl','daemon-reload')
    raise
current={**previous,'release':release,'image':image,'container':container,'port':port,'previousImage':previous['image'],'rollbackNginx':str(backup)}
(root/'current-release.json').write_text(json.dumps(current,indent=2))
print(json.dumps({'release':current,'health':health,'verifiedRoutes':True,'containerTests':'passed'},indent=2))

# Stopped containers, images and source releases remain available for recovery.
# Only the current and immediately previous website containers stay running.
names=run('docker','ps','--format','{{.Names}}').splitlines()
keep={container,previous['container']}
obsolete=[name for name in names if re.fullmatch(r'wpn-sports-web-v[0-9]+',name) and name not in keep]
if obsolete:
    print('Stopping obsolete release containers: '+', '.join(obsolete),flush=True)
    run('docker','stop','--timeout','10',*obsolete)
