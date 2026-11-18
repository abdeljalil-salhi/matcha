import secrets

from argon2 import PasswordHasher

ARGON2_TIME_COST = 3
ARGON2_MEMORY_KIB = 32 * 1024
ARGON2_PARALLELISM = 1

hasher = PasswordHasher(
    time_cost=ARGON2_TIME_COST,
    memory_cost=ARGON2_MEMORY_KIB,
    parallelism=ARGON2_PARALLELISM,
)


DUMMY_HASH = hasher.hash(secrets.token_urlsafe())
