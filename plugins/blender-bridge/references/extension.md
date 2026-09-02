# Extension protocol

The extension reads the active coordinator discovery record, requires loopback HTTP plus a 256-bit bearer token, connects with Blender/add-on/project identity, and reverse-polls bounded jobs from `bpy.app.timers`. Jobs execute on Blender's main thread. Completion contains bounded JSON readback or an error classification. Animation readback includes complete semantic digests only while the fixed channel/key budgets are satisfied; otherwise it reports `limit-exceeded` without a partial digest.

The UI panel exposes paired/disconnected status, last bounded diagnostic, and disconnect. It exposes no mutation buttons or arbitrary input. Reconnect invalidates old coordinator tokens and binds the exact open `.blend` path.
