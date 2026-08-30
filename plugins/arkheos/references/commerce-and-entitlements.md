# Commerce and entitlements

Membership is USD 10 monthly or USD 99 annually. A verified account may activate one seven-day no-card trial. Trial activation is server-time authoritative, transactional, and never represented as a Stripe subscription or Stripe trial.

Paid checkout accepts only `monthly` or `annual`, maps those names to configured Stripe price bindings, creates an immediate subscription, and uses a bounded idempotency key. Stripe Checkout collects payment. Customer Portal owns payment-method and cancellation changes.

Membership modes are:

- `trial`: before `trial_ends_at`; paid mutations allowed.
- `paid`: subscription is paid and before `paid_through`; paid mutations allowed.
- `grace`: cancellation or terminal status, before `grace_through = paid_through + 30 days`; paid mutations allowed.
- `recovery`: all other states; only inspection, export, verification, recovery, rollback, removal, undo, receipt access, account export, and deletion remain.

The canonical Stripe route is `/v1/billing/webhook`; `/v1/stripe/webhook` is a compatibility alias. The admitted event set is `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.deleted`, `customer.subscription.trial_will_end`, `customer.subscription.updated`, `invoice.paid`, and `invoice.payment_failed`. Raw-body signatures are checked before JSON projection or D1 writes. Event IDs are idempotency keys.
