# Architecture decisions

These replace the stack in the original SRS (Laravel, Livewire, MySQL). The product
requirements in the SRS still apply.

## 1. Shape

- **Modular monolith.** One Django project, one app per area. Apps talk through services and
  signals, not by reaching into each other's tables.
- **Thin API views.** Ninja endpoints validate input and call a service such as
  `notices.services.publish_notice`. Business rules live in services, so a mobile app or
  another client reuses them.
- **Next.js is only the UI.** The browser talks to Next.js, which proxies `/api` and
  `/_allauth` to Django. Session cookies stay same-origin.

## 2. Tenancy

Every institution-owned record inherits `core.InstitutionScopedModel` and carries
`institution_id`. Scoping is explicit (`.for_institution()` or the audience resolver),
never implicit thread-local magic. Cross-institution access is a bug, and tests check for it.

## 3. Membership and visibility

- The **section** is the unit of membership. Students enroll in sections, teachers are
  assigned to sections. A `CourseOffering` is one course in one term.
- `core.AudienceTarget` attaches any content (notices, posts and resources now; events later)
  to scopes: institution, campus, department, program, offering or section.
- `core.audience.context_keys(user)` builds the set of scopes a user belongs to from active
  enrollments and assignments. It is cached and cleared when enrollment changes.
- **Visible** means at least one target is in the user's context set. Pages, downloads,
  search and notifications all use `visible_q` and `can_view`; nothing filters on its own.
- **Who may publish where** (`can_target`): institution admins anywhere in their institution,
  department coordinators inside their departments, teachers only to sections they teach.

## 4. Roles

`User.kind` (student, teacher, staff) only describes a person. Elevated access comes from
`RoleAssignment`, which is granted by staff, scoped (institution or department) and kept in
history. Public sign-up is closed by default (`OPEN_SIGNUP=false`), and nobody can pick a
role for themselves.

## 5. Audit and history

- `governance.AuditLog` is append-only: the model refuses updates and deletes. In
  production, also revoke UPDATE and DELETE on the table from the app's database role.
- Never log passwords, tokens or message contents.
- `django-simple-history` keeps edit history on courses, sections, enrollments, teacher
  assignments, roles and notices.

## 6. Real-time chat

```
browser ──POST message──▶ Django: check membership → save → publish ──▶ Centrifugo
browser ◀──WebSocket── Centrifugo (delivery, presence, history, catch-up)
```

Django issues short-lived connection and channel tokens (`core.realtime`) only after a
membership check. Typing indicators and presence never touch the database. Each message
carries a client-generated ID, so a retried send never creates a duplicate.

## 7. Smart Sync engine (next)

Source adapter (API, CSV/XLSX, scheduled feed) → staging rows with a hash → validate →
match through `external_refs` (source, entity, external ID → local ID) → dry-run diff →
admin approves → apply in transactions → run log. Rows missing from a feed are flagged,
never deleted. Retries are safe because of the row hashes.

## 8. Frontend

- Theme tokens in `web/src/app/globals.css`: light and dark, system font,
  size-specific tracking, glass materials, course colours.
- Motion follows `SKILL.md`: springs (no bounce by default, a little only after a flick),
  interruptible from the current on-screen value, velocity handed off at release. Use the
  Motion library for this.
- Honour `prefers-reduced-motion`, `prefers-reduced-transparency` and `prefers-contrast`.
