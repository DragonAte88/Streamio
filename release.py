import os
import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

token = os.environ.get('GITHUB_TOKEN')
if not token:
    print("No GITHUB_TOKEN found!")
    exit(1)

repo = 'DragonAte88/Streamio'
version = 'v0.6.0'

print("Creating release...")
req = urllib.request.Request(f'https://api.github.com/repos/{repo}/releases', 
    data=json.dumps({
        "tag_name": version,
        "name": f"Streamio {version}",
        "body": "## ➕ Added\n- Added Recently Watched tab in Library to automatically track and resume recently viewed channels.\n- Formally provisioned Oracle Flex-2 for the upcoming Discord Bot and cleaned up all redundant scrapers and old Plex/Jellyfin containers.\n\nIncludes full source (Streamio-source-v0.6.0.zip) alongside the Windows installer."
    }).encode('utf-8'),
    headers={
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json'
    },
    method='POST')

res = urllib.request.urlopen(req, context=ctx)
rel_data = json.loads(res.read())
upload_url = rel_data['upload_url'].split('{')[0]

def upload_asset(name, filepath, content_type):
    with open(filepath, 'rb') as f:
        data = f.read()
    print(f'Uploading {name} ({len(data)} bytes)...')
    req = urllib.request.Request(f'{upload_url}?name={name}',
        data=data,
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': content_type
        },
        method='POST')
    urllib.request.urlopen(req, context=ctx)
    print(f'Uploaded {name}')

upload_asset('latest.yml', 'dist/latest.yml', 'application/x-yaml')
upload_asset(f'Streamio-source-{version}.zip', f'Streamio-source-{version}.zip', 'application/zip')
upload_asset(f'Streamio-Setup-0.6.0.exe', 'dist/Streamio-Setup-0.6.0.exe', 'application/octet-stream')

print("Release complete!")
