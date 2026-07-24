import os
import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

token = os.environ.get("GITHUB_TOKEN")
if not token:
    print("No GITHUB_TOKEN found!")
    exit(1)

repo = 'DragonAte88/Streamio'
version = 'v0.6.5'

print("Fetching release...")
req = urllib.request.Request(f'https://api.github.com/repos/{repo}/releases/tags/{version}', 
    headers={
        'Authorization': f'Bearer {token}',
        'Accept': 'application/vnd.github.v3+json'
    },
    method='GET')

try:
    res = urllib.request.urlopen(req, context=ctx)
    rel_data = json.loads(res.read())
    upload_url = rel_data['upload_url'].split('{')[0]
except urllib.error.HTTPError as e:
    print(f"Error fetching release: {e}")
    exit(1)

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

print("Release complete!")
