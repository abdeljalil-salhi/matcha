from .types import SeedIdentity

FIRST_NAMES = {
    "woman": tuple(
        "Lina Sofia Maya Amira Clara Ines Nora Leila Emma Sara Hana Camille "
        "Yasmine Amina Elena Lucia Alice Mila Zoe Nina Salma Jade Iris Eva "
        "Anya Fatima Louise Aya Julia Manon".split()
    ),
    "man": tuple(
        "Adam Elias Noah Sami Lucas Omar Gabriel Hugo Leo Karim Idris Theo "
        "Amine Louis Rayan Nabil Oscar Youssef Simon Yanis Daniel Amir Felix "
        "Mehdi Rafael Julien Victor Malik Isaac Ilyas".split()
    ),
    "neutral": tuple(
        "Alex Sam Charlie Robin Camille Sasha Noa Morgan Eden Lou Avery "
        "Riley Jordan Quinn River Remy Ari Rowan Taylor Jamie".split()
    ),
}
LAST_NAMES = tuple(
    "Benali Martin Laurent Haddad Moreau Rossi Bernard Diallo Nguyen Costa "
    "Petit Mansour Garcia Dubois Ibrahim Meyer Cohen Leroy Silva Roux "
    "Bennani Fontaine Lopez Mercier Saidi Pereira Girard Bakker Haddadi Simon".split()
)
INTEREST_LINES = {
    "art": "Gallery afternoons always give me something to talk about.",
    "books": "Usually carrying a novel and looking for a quiet reading spot.",
    "climbing": "Happiest solving a new route at the climbing gym.",
    "cooking": "I love cooking for friends and trying recipes that might go wrong.",
    "cycling": "My favourite way to explore a city is on two wheels.",
    "film": "Always up for a small cinema and a long conversation afterwards.",
    "gaming": "Cooperative games and friendly competition are my kind of evening.",
    "gardening": "Slow mornings watering plants are a little ritual of mine.",
    "hiking": "A weekend trail and a packed picnic make me happy.",
    "jazz": "I keep an eye out for small jazz gigs and live music.",
    "photography": "I enjoy wandering with a camera and noticing little details.",
    "running": "Early runs help me clear my head before a busy day.",
    "travel": "I like getting lost in new places and finding local favourites.",
    "vegan": "I enjoy discovering inventive plant-based food.",
    "yoga": "Yoga is my favourite excuse to slow down and breathe.",
}
INVITATIONS = (
    "Tell me about a place you would happily visit again.",
    "Looking for someone curious to share a new experience with.",
    "What is something you have always wanted to learn?",
    "A walk and a good conversation are a lovely place to start.",
    "Send me your favourite local recommendation.",
)


def seed_identity(number: int, gender: str, tags: list[str]) -> SeedIdentity:
    """Build a stable fictional name and interest-based demo biography.

    Args:
        number (int): One-based demo account number.
        gender (str): Seeded profile gender used to select a name pool.
        tags (list[str]): At least two seeded interest tags.

    Returns:
        SeedIdentity: Display names and an interest-based biography.
    """
    names = FIRST_NAMES.get(gender, FIRST_NAMES["neutral"])
    index = number - 1
    return {
        "first_name": names[index % len(names)],
        "last_name": LAST_NAMES[(index // len(names)) % len(LAST_NAMES)],
        "bio": " ".join(
            (
                INTEREST_LINES[tags[0]],
                INTEREST_LINES[tags[1]],
                INVITATIONS[index % len(INVITATIONS)],
            )
        ),
    }
