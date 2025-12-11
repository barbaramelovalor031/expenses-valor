"""
Name normalizer service - Standardizes cardholder names across the application
"""

# Canonical names (the standard format we want)
CANONICAL_NAMES = [
    "Scott Sobel",
    "Clifford Sobel",
    "John Douglas Smith",
    "Michael Nicklas",
    "Paulo Passoni",
    "Antoine Colaço",
    "Carlos Costa",
    "Kelli Spangler",
]

# Map all variations to canonical names (case-insensitive lookup)
NAME_ALIASES = {
    # Scott Sobel
    "scott sobel": "Scott Sobel",
    "s. sobel": "Scott Sobel",
    "s sobel": "Scott Sobel",
    "s.sobel": "Scott Sobel",
    "sobel, scott": "Scott Sobel",
    
    # Clifford Sobel
    "clifford sobel": "Clifford Sobel",
    "c. sobel": "Clifford Sobel",
    "c sobel": "Clifford Sobel",
    "c.sobel": "Clifford Sobel",
    "cliff sobel": "Clifford Sobel",
    "sobel, clifford": "Clifford Sobel",
    
    # John Douglas Smith (J. Douglas Smith variations)
    "john douglas smith": "John Douglas Smith",
    "j. douglas smith": "John Douglas Smith",
    "j douglas smith": "John Douglas Smith",
    "j.douglas smith": "John Douglas Smith",
    "j.d. smith": "John Douglas Smith",
    "j.d smith": "John Douglas Smith",
    "jd smith": "John Douglas Smith",
    "john d. smith": "John Douglas Smith",
    "john d smith": "John Douglas Smith",
    "douglas smith": "John Douglas Smith",
    "smith, john": "John Douglas Smith",
    "smith, j. douglas": "John Douglas Smith",
    "smith, john douglas": "John Douglas Smith",
    "j.douglas smith": "John Douglas Smith",
    
    # Michael Nicklas
    "michael nicklas": "Michael Nicklas",
    "m. nicklas": "Michael Nicklas",
    "m nicklas": "Michael Nicklas",
    "m.nicklas": "Michael Nicklas",
    "mike nicklas": "Michael Nicklas",
    "nicklas, michael": "Michael Nicklas",
    
    # Paulo Passoni
    "paulo passoni": "Paulo Passoni",
    "p. passoni": "Paulo Passoni",
    "p passoni": "Paulo Passoni",
    "p.passoni": "Paulo Passoni",
    "passoni, paulo": "Paulo Passoni",
    
    # Antoine Colaço
    "antoine colaço": "Antoine Colaço",
    "antoine colaco": "Antoine Colaço",
    "a. colaço": "Antoine Colaço",
    "a. colaco": "Antoine Colaço",
    "a colaço": "Antoine Colaço",
    "a colaco": "Antoine Colaço",
    "a.colaço": "Antoine Colaço",
    "a.colaco": "Antoine Colaço",
    "colaço, antoine": "Antoine Colaço",
    "colaco, antoine": "Antoine Colaço",
    
    # Carlos Costa
    "carlos costa": "Carlos Costa",
    "c. costa": "Carlos Costa",
    "c costa": "Carlos Costa",
    "c.costa": "Carlos Costa",
    "costa, carlos": "Carlos Costa",
    
    # Kelli Spangler
    "kelli spangler": "Kelli Spangler",
    "k. spangler": "Kelli Spangler",
    "k spangler": "Kelli Spangler",
    "k.spangler": "Kelli Spangler",
    "spangler, kelli": "Kelli Spangler",
}


def normalize_name(name: str) -> str:
    """
    Normalize a cardholder name to its canonical form.
    
    Args:
        name: The name to normalize (any format/case)
        
    Returns:
        The canonical name if found, otherwise the original name in Title Case
    """
    if not name:
        return name
    
    # Clean up the name
    cleaned = name.strip().lower()
    # Remove extra spaces
    cleaned = " ".join(cleaned.split())
    
    # Direct lookup
    if cleaned in NAME_ALIASES:
        return NAME_ALIASES[cleaned]
    
    # Try without periods
    no_periods = cleaned.replace(".", " ").replace("  ", " ").strip()
    if no_periods in NAME_ALIASES:
        return NAME_ALIASES[no_periods]
    
    # Try to match by surname (last word)
    parts = cleaned.split()
    if parts:
        surname = parts[-1]
        # Find all canonical names with this surname
        for canonical in CANONICAL_NAMES:
            if canonical.lower().endswith(surname):
                # Check if first name/initial matches
                first_part = parts[0] if parts else ""
                canonical_first = canonical.split()[0].lower()
                if first_part.startswith(canonical_first[0]):
                    return canonical
    
    # Fallback: return in Title Case
    return name.title()


def get_canonical_names() -> list:
    """Return the list of canonical names for dropdowns"""
    return CANONICAL_NAMES.copy()


def add_alias(alias: str, canonical: str) -> bool:
    """
    Add a new alias mapping (runtime only, not persisted)
    
    Args:
        alias: The variation to map
        canonical: The canonical name to map to
        
    Returns:
        True if added successfully
    """
    if canonical not in CANONICAL_NAMES:
        return False
    
    NAME_ALIASES[alias.strip().lower()] = canonical
    return True
