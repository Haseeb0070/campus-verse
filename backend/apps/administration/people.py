"""People management for institution admins: invites, (de)activation and scoped roles.
Every change is audit-logged (SRS 9.5)."""

from allauth.account.forms import default_token_generator
from allauth.account.models import EmailAddress
from allauth.account.utils import user_pk_to_url_str
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import PermissionDenied, ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.db import transaction

from apps.academic.models import Department
from apps.governance import audit
from apps.identity.models import RoleAssignment
from apps.identity.roles import is_institution_admin

User = get_user_model()


def require_admin(user) -> None:
    if not is_institution_admin(user):
        raise PermissionDenied("Only institution admins can do this.")


def _same_institution(admin, person) -> None:
    if person.institution_id != admin.institution_id:
        raise PermissionDenied("That person isn't in your institution.")


def invite_link(user) -> str:
    """A set-your-password link using allauth's own reset key: it expires
    (PASSWORD_RESET_TIMEOUT) and stops working once the password is set."""
    key = f"{user_pk_to_url_str(user)}-{default_token_generator.make_token(user)}"
    return f"{settings.FRONTEND_URL}/account/password/reset/{key}"


def send_invite(user, invited_by) -> None:
    institution = user.institution.name
    send_mail(
        subject=f"You're invited to CampusVerse at {institution}",
        message=(
            f"Hi {user.first_name or 'there'},\n\n"
            f"{invited_by.get_full_name() or invited_by.email} added you to CampusVerse, "
            f"{institution}'s place for classes, notices, chat and coursework.\n\n"
            f"Set your password to get started:\n{invite_link(user)}\n\n"
            "This link works once and expires in a few days. If it has expired, ask your "
            "admin to resend the invite."
        ),
        from_email=None,
        recipient_list=[user.email],
    )


@transaction.atomic
def invite(admin, *, email: str, first_name: str, last_name: str, kind: str):
    require_admin(admin)
    email = (email or "").strip().lower()
    try:
        validate_email(email)
    except ValidationError:
        raise ValidationError("Enter a valid email address.") from None
    if kind not in User.Kind.values:
        raise ValidationError("Choose student, teacher or staff.")
    if User.objects.filter(email__iexact=email).exists():
        raise ValidationError("Someone with that email already has an account.")
    first_name, last_name = first_name.strip(), last_name.strip()
    if not first_name:
        raise ValidationError("Enter a first name.")

    # The kind only describes the person; it never grants admin or teaching rights by itself.
    user = User.objects.create_user(
        email=email, first_name=first_name, last_name=last_name, kind=kind,
        institution_id=admin.institution_id,
    )
    user.set_unusable_password()
    user.save(update_fields=["password"])
    # The admin vouches for the address and the reset link proves the person controls it.
    EmailAddress.objects.create(user=user, email=email, verified=True, primary=True)
    audit.record(actor=admin, action="person.invited", target=user,
                 changes={"email": email, "kind": kind})
    transaction.on_commit(lambda: send_invite(user, admin))
    return user


def resend_invite(admin, person) -> None:
    require_admin(admin)
    _same_institution(admin, person)
    if person.has_usable_password():
        raise ValidationError("This person has already set a password.")
    send_invite(person, admin)
    audit.record(actor=admin, action="person.invite_resent", target=person)


@transaction.atomic
def set_active(admin, person, active: bool) -> None:
    require_admin(admin)
    _same_institution(admin, person)
    if person.pk == admin.pk and not active:
        raise ValidationError("You can't deactivate your own account.")
    if person.is_active != active:
        person.is_active = active
        person.save(update_fields=["is_active"])
        # Ends their sessions on the next request: Django rejects inactive users.
        audit.record(actor=admin, action="person.activated" if active else "person.deactivated",
                     target=person)


@transaction.atomic
def grant_role(admin, person, *, role: str, department_id: int | None = None):
    require_admin(admin)
    _same_institution(admin, person)
    Role = RoleAssignment.Role
    if role not in Role.values:
        raise ValidationError("Unknown role.")
    department = None
    if role == Role.DEPARTMENT_COORDINATOR:
        department = Department.objects.filter(
            pk=department_id, institution_id=admin.institution_id
        ).first()
        if department is None:
            raise ValidationError("Choose the department they coordinate.")
    exists = RoleAssignment.objects.filter(user=person, role=role, department=department)
    if exists.exists():
        raise ValidationError("They already have that role.")
    assignment = RoleAssignment.objects.create(
        institution_id=admin.institution_id, user=person, role=role, department=department,
        granted_by=admin,
    )
    audit.record(actor=admin, action="role.granted", target=person,
                 changes={"role": role, "department": department_id})
    return assignment


@transaction.atomic
def revoke_role(admin, assignment: RoleAssignment) -> None:
    require_admin(admin)
    _same_institution(admin, assignment.user)
    if (
        assignment.user_id == admin.pk
        and assignment.role == RoleAssignment.Role.INSTITUTION_ADMIN
    ):
        raise ValidationError("You can't remove your own admin role. Ask another admin.")
    audit.record(actor=admin, action="role.revoked", target=assignment.user,
                 changes={"role": assignment.role, "department": assignment.department_id})
    assignment.delete()
