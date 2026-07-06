# mr-geopip

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run start
```

## Update free IP databases (latest)

This project now includes an updater that downloads the latest free DB-IP Lite databases for:

- city/location data (`dbip-city-lite.mmdb`)
- ASN/network/organization data (`dbip-asn-lite.mmdb`)

Run:

```bash
bun run update:ipdb
```

Optional flags:

```bash
bun run update:ipdb --months=18 --output-dir=data
bun run update:ipdb --city-url=https://.../city.mmdb.gz --asn-url=https://.../asn.mmdb.gz
bun run update:ipdb --dry-run
```

Notes:

- `location / geo / country / city / region / postal code / timezone` come from city DB.
- `network / organization` come from ASN DB.
- `landmark` and exact `wifi vs cellular` are usually not available from free offline IP databases; they typically require paid/commercial or live carrier signals.
