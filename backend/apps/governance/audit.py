from .models import AuditLog


def record(*, actor, action: str, target=None, changes: dict | None = None) -> AuditLog:
    institution_id = getattr(target, "institution_id", None) or getattr(
        actor, "institution_id", None
    )
    return AuditLog.objects.create(
        institution_id=institution_id,
        actor=actor if actor is not None and actor.is_authenticated else None,
        action=action,
        target_type=target._meta.label if target is not None else "",
        target_id=str(target.pk) if target is not None else "",
        changes=changes or {},
    )
