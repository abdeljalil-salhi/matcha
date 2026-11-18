from .types import Place

# City centers make the development and evaluation flow usable offline.
PLACES: tuple[Place, ...] = (
    ("Paris", "Montmartre", "FR", 48.8867, 2.3431),
    ("Paris", "Latin Quarter", "FR", 48.8494, 2.3471),
    ("Paris", None, "FR", 48.8566, 2.3522),
    ("Lyon", "Croix-Rousse", "FR", 45.7750, 4.8317),
    ("Lyon", None, "FR", 45.7640, 4.8357),
    ("Marseille", "Le Panier", "FR", 43.2998, 5.3680),
    ("Marseille", None, "FR", 43.2965, 5.3698),
    ("Rabat", "Agdal", "MA", 33.9955, -6.8520),
    ("Rabat", None, "MA", 34.0209, -6.8416),
    ("Casablanca", "Maarif", "MA", 33.5800, -7.6360),
    ("Casablanca", None, "MA", 33.5731, -7.5898),
    ("London", "Soho", "GB", 51.5137, -0.1352),
    ("London", None, "GB", 51.5074, -0.1278),
)
