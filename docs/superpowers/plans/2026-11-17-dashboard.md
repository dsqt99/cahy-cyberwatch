# Dashboard accuracy and review implementation

Approved scope: the user accepted the previous UI/data review on 2026-11-17.

- [x] Unify refresh, expose request failures, preserve last successful snapshot and guard stale requests.
- [x] Replace capped post aggregation with SQL analytics; include unknown classification and prior-period counts.
- [x] Compact overview, label scopes and summary completion accurately, provide drill-through.
- [x] Extract articles with table/cards, details, pagination, URL filters and request guards.
- [x] Enhance analytics with period comparisons, coverage and source contributions.
- [x] Verify calculation regression tests, API syntax/tests, TypeScript and production build.

Architecture: PostgreSQL aggregates feed a single client snapshot. React components render overview and analytics from the same snapshot. Articles remain independently server paginated. No collector-health assertions are inferred from zero counts.

Validation: TypeScript, production build, five regression tests including temporary PostgreSQL fixture >5000 rows; local API smoke for analytics, unknown filter, sorting and invalid range. Desktop overview and article table visually inspected. Browser bundle size and legacy CSS/Browserslist warnings remain.
