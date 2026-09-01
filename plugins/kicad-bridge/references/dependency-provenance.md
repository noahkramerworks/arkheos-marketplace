# Dependency provenance

Bound local runtime on 2026-08-31:

- `pcbnew.exe` 10.0.5.50609: `44d67ed60b3e5b8a99fa0df0eb7a5d986372258b8d650bf0214db03161d09ee8`
- `kicad-cli.exe` 10.0.5: `fc142e3b4c13af868501fcbc9312dd94ad62d3c05882f97a23b6fd9f8118d0c3`
- bundled `python.exe`: `2930134f11de75eaa1827e7f05d2500ad94155f79bc489bcd7d597e247548d81`
- installed `api.v1.schema.json`: `a51ecc9cc4166fc857a0378b6361909c66a7957451146bd50123d52313fdea96`

The offline environment is created from the exact wheel files and hashes in `kicad-adapter/vendor/PROVENANCE.json`. The first-party contract wheel is `kicad_python-0.7.1-py3-none-any.whl` with SHA-256 `e3e518301cc7b5d8c4a8f0715de8826ca7d78aebb42352fc55c23df081248724`. No network resolution occurs during setup.
