from .models import RoleAssignment

Role = RoleAssignment.Role


def is_institution_admin(user) -> bool:
    if not user.is_authenticated or user.institution_id is None:
        return False
    return RoleAssignment.objects.filter(
        user=user, role=Role.INSTITUTION_ADMIN, institution_id=user.institution_id
    ).exists()


def coordinated_department_ids(user) -> set[int]:
    if not user.is_authenticated or user.institution_id is None:
        return set()
    return set(
        RoleAssignment.objects.filter(
            user=user,
            role=Role.DEPARTMENT_COORDINATOR,
            institution_id=user.institution_id,
            department__isnull=False,
        ).values_list("department_id", flat=True)
    )
