# Reverse-polling PyQGIS adapter

The extension reverse-polls an authenticated ephemeral loopback coordinator and executes only `inspect`, `apply`, `export_layout`, `reload`, and `shutdown` on the QGIS application thread. It binds QGIS 4.2.0 / API integer 40200 and contains no eval, Processing, SQL, provider-string, raw-protocol, shell, or UI-automation route.
