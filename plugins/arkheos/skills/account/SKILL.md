---
name: account
description: Authorize an ArkheOS account, activate the no-card trial, inspect membership, create monthly or annual checkout, open the portal, or sign out.
---

# Operate ArkheOS account

Read [commerce and entitlements](../../references/commerce-and-entitlements.md). Inspect with `account_status` first when authorization or current mode is unknown.

For sign-in, call `authorization_begin`, present the verification URL and user code, then poll only after the user completes authorization. Tokens never enter chat. Activate the one-time no-card trial only on an explicit trial request. Create checkout only for exact `monthly` or `annual` choice. Opening a hosted URL is not payment completion; read back membership afterward.

Use `portal_create` for billing management and `sign_out` only on explicit sign-out intent. Recovery actions remain available after sign-out or expiry.
