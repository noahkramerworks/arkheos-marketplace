# Krita 5.3.3 API contract

The admitted native surface is the installed PyKrita 5.3.3 contract at `C:\Program Files\Krita (x64)\lib\krita-python-libs\PyKrita\krita.pyi` (SHA-256 `9246ab2133d16f4662f4fd094b88be35715a8809d4deb3b170069c1f5ba7850c`) backed by `krita.pyd` (SHA-256 `7fd53d08f60ed2b72fd70df1592431cfb21398eddb2803e600a0091574f3b661`). Live admission additionally requires `Krita.instance().version()` to begin `5.3.3`.

Typed reads use `Krita.activeDocument`, `Document.fileName`, `modified`, `waitForDone`, dimensions, color model/depth/profile, `rootNode`, `Node.childNodes`, `uniqueId`, `name`, `type`, `visible`, `opacity`, `position`, and `colorLabel`. Typed writes use `Document.createNode`, `Node.addChildNode`, `setPixelData` with bridge-owned deterministic pixels, `setName`, `setOpacity`, `setVisible`, `move`, and `Document.save`. Closed PNG export uses `Document.projection` and the returned native `QImage.save`. Rollback restores sealed bytes outside Krita, then uses `Document.close`, `Krita.openDocument`, window `addView`, and a separate observation.

No API maps caller input to Python source, Krita action IDs, filters, scripts, arbitrary pixel buffers, generic properties, shell commands, raw protocol payloads, or unrestricted paths.
