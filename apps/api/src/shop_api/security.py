from dataclasses import dataclass


@dataclass(frozen=True)
class AuthenticatedUser:
    subject: str
    email: str | None
    roles: frozenset[str]

    @property
    def is_admin(self) -> bool:
        return "admin" in self.roles
