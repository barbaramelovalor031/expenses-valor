"""
Name normalizer service - Standardizes cardholder names across the application
"""

# Canonical names (the standard format we want) - MUST MATCH CONSOLIDATED DATABASE
CANONICAL_NAMES = [
    "Scott Sobel",
    "Clifford Sobel",
    "Doug Smith",  # Changed from "John Douglas Smith"
    "Michael Nicklas",
    "Paulo Passoni",
    "Antoine Colaco",  # Changed from "Antoine Colaço" (no cedilla)
    "Carlos Costa",
    "Daniel Schulman",
    "Kelli Spangler-Ballard",
    "Felipe Mendes",  # Bradesco card - FELIPE M SANTOS
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
    
    # Doug Smith (J. Douglas Smith variations on AMEX)
    "doug smith": "Doug Smith",
    "john douglas smith": "Doug Smith",
    "j. douglas smith": "Doug Smith",
    "j douglas smith": "Doug Smith",
    "j.douglas smith": "Doug Smith",
    "j.d. smith": "Doug Smith",
    "j.d smith": "Doug Smith",
    "jd smith": "Doug Smith",
    "john d. smith": "Doug Smith",
    "john d smith": "Doug Smith",
    "douglas smith": "Doug Smith",
    "smith, john": "Doug Smith",
    "smith, j. douglas": "Doug Smith",
    "smith, john douglas": "Doug Smith",
    "smith, doug": "Doug Smith",
    "d. smith": "Doug Smith",
    "d smith": "Doug Smith",
    
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
    
    # Antoine Colaco (without cedilla in consolidated DB)
    "antoine colaco": "Antoine Colaco",
    "antoine colaço": "Antoine Colaco",  # With cedilla -> maps to no cedilla
    "a. colaço": "Antoine Colaco",
    "a. colaco": "Antoine Colaco",
    "a colaço": "Antoine Colaco",
    "a colaco": "Antoine Colaco",
    "a.colaço": "Antoine Colaco",
    "a.colaco": "Antoine Colaco",
    "colaço, antoine": "Antoine Colaco",
    "colaco, antoine": "Antoine Colaco",
    
    "dan schulman": "Daniel Schulman",

    # Carlos Costa
    "carlos costa": "Carlos Costa",
    "c. costa": "Carlos Costa",
    "c costa": "Carlos Costa",
    "c.costa": "Carlos Costa",
    "costa, carlos": "Carlos Costa",
    
    # Kelli Spangler-Ballard
    "kelli spangler-ballard": "Kelli Spangler-Ballard",
    "kelli spanglerballard": "Kelli Spangler-Ballard",
    "kelli spangler ballard": "Kelli Spangler-Ballard",
    "kelli spangler": "Kelli Spangler-Ballard",  # AMEX may show shorter name
    "k. spangler": "Kelli Spangler-Ballard",
    "k spangler": "Kelli Spangler-Ballard",
    "k.spangler": "Kelli Spangler-Ballard",
    "spangler, kelli": "Kelli Spangler-Ballard",
    "spanglerballard, kelli": "Kelli Spangler-Ballard",
    "spangler-ballard, kelli": "Kelli Spangler-Ballard",
    
    # Felipe Mendes (Bradesco card - AMEX style name)
    "felipe mendes": "Felipe Mendes",
    "felipe m santos": "Felipe Mendes",
    "felipe m. santos": "Felipe Mendes",
    "f. mendes": "Felipe Mendes",
    "f mendes": "Felipe Mendes",
    "f.mendes": "Felipe Mendes",
    "mendes, felipe": "Felipe Mendes",
    "santos, felipe m": "Felipe Mendes",
    "santos, felipe": "Felipe Mendes",
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
    
    # Remove card type suffixes (e.g., "- AMEX", "- VISA", "- MASTERCARD")
    for suffix in [" - amex", " - visa", " - mastercard", " - mc", " - bradesco"]:
        if cleaned.endswith(suffix):
            cleaned = cleaned[:-len(suffix)].strip()
    
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
