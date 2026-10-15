# Contributing

Use Node.js 22+ and npm. Run `npm ci`, `npm run build`, `npm test`, and browser tests described in the README. Add behavior tests for changes and keep dependencies within their package boundaries. Avoid importing renderers or provider SDKs into core.

Open an issue for bugs with reproduction steps and expected behavior. Propose public API changes in an RFC before implementation. Submit focused pull requests with validation evidence. Maintain experimental API documentation and use semantic versioning. Contributions are licensed under Apache-2.0; by submitting a contribution you agree to license your contribution under these terms.


Marketing and connector changes should include tenant/permission failure checks, schema normalization tests, and idempotency/reconciliation behavior for writes. Run PostgreSQL tests against an isolated database. Test vendor write operations only in explicitly authorized sandbox tenants. Do not claim live vendor compatibility based solely on fixtures.
