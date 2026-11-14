"""Prepare an isolated migration directory; never connect or execute SQL."""
import hashlib
import json
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parents[1]
if len(sys.argv) != 2:
    raise SystemExit('Usage: python scripts/materialize-supabase-baseline.py NEW_DIRECTORY')
destination = pathlib.Path(sys.argv[1]).resolve()
if destination.exists():
    raise SystemExit('Refusing to overwrite an existing destination')
manifest = json.loads((root / 'deploy/supabase/baseline-kyhxgxogokwnblsxzxjo.json').read_text())
entries = []
for entry in manifest['migrations']:
    data = (root / entry['source']).read_bytes()
    if hashlib.sha256(data).hexdigest() != entry['sha256']:
        raise SystemExit('Historical migration changed: ' + entry['source'])
    entries.append((entry['version'] + '_' + entry['name'] + '.sql', data))
if len(entries) != 33 or len({name for name, _ in entries}) != 33:
    raise SystemExit('Unexpected baseline mapping')
migrations = destination / 'supabase/migrations'
migrations.mkdir(parents=True)
for name, data in entries:
    (migrations / name).write_bytes(data)
(destination / 'BASELINE-ONLY.txt').write_text(
    'Target: kyhxgxogokwnblsxzxjo. 33 previously applied migrations.\n'
    'No database command was executed. Initialize/link CLI configuration explicitly,\n'
    'then review migration list and db push --dry-run before any deployment.\n'
    'Four historical optional runtime migrations deliberately excluded.\n'
)
print(f'Prepared {len(entries)} mapped migrations at {destination}; no SQL executed.')
