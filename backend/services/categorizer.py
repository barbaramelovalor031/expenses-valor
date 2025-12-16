"""
AI Categorization service using OpenAI (optimized version)
"""

import os
import json
from typing import List, Dict, Optional

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

# Lazy initialization of OpenAI client
_openai_client = None

def get_openai_client():
    """Get or create OpenAI client with better error handling"""
    global _openai_client
    if _openai_client is None:
        api_key = os.getenv("OPENAI_API_KEY")
        if not api_key:
            print("[ERROR] OPENAI_API_KEY environment variable is not set!")
            raise ValueError("OPENAI_API_KEY not configured")
        # Remove any trailing newlines/whitespace from the API key
        api_key = api_key.strip()
        print(f"[INFO] Initializing OpenAI client with key: {api_key[:8]}...{api_key[-4:]}")
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client

# -----------------------------
# 1. CONSTANTES E CONFIGURAÇÃO
# -----------------------------

EXPENSE_CATEGORIES = [
    "Airfare",
    "Board meetings",
    "Brazil Insurance",
    "Catering - Event",
    "Computer Equipment",
    "Conferences & Seminars",
    "Delivery and Postage",
    "Due Diligence - New Deals",
    "Due Diligence - Portfolio Company",
    "Gifts",
    "Ground Transportation - Local",
    "Ground Transportation - Travel",
    "IT Subscriptions",
    "Lodging",
    "Meals & Entertainment - Local",
    "Meals & Entertainment - Travel",
    "Membership Dues",
    "Miscellaneous",
    "Office Supplies",
    "Other - Event",
    "Pantry Food",
    "Personal Expenses",
    "Printing",
    "Printing - Event",
    "Rippling Wire Deduction",
    "Tech/AV - Event",
    "Telephone/Internet",
    "Training",
    "Travel Agent Fees",
    "Venue - Event",
    "Wellhub Reimbursement",
]

# Palavras e marcas para regras
IT_KEYWORDS = [
    "SPOTIFY",
    "INTUIT QUICKBOOKS",
    "AMAZON WEB SERVICES",
    "AWS ",
    "MICROSOFT 365",
    "MICROSOFT AZURE",
    "GOOGLE CLOUD",
    "ZOOM.US",
    "SLACK",
    "NOTION",
    "FIGMA",
    "GITHUB",
    "DROPBOX",
    "SALESFORCE",
    "ADOBE",
    "INTERMEDIA",
    "GETRO",
    "HYGRAPH",
    "TYPEFORM",
    "SMALLPDF",
    "DOCUSIGN",
    "DROPBOX",
    "EDITORA O GLOBO",
    "FINANCIAL TIMES",
    "THE ECONOMIST",
    "THE NEW YORK TIMES",
    "WALL STREET JOURNAL",     

]

GROUND_TRANSPORT_KEYWORDS = [
    "LYFT",
    "CABIFY",
    "99 TAXI",
    "99 POP",
    "99 APP",
    "TAXI",
    "LIRR",
    "MTA ",
    "ETIX",
    "BLACKLANE.COM",
    "EASYSAVING CREDIT",
]

RESTAURANT_BRANDS = [
    "FIVE GUYS",
    "SHAKE SHACK",
    "MCDONALD",
    "BURGER KING",
    "SUBWAY",
    "PIZZA HUT",
    "DOMINO",
    "KFC",
    "STARBUCKS",
    "CHIPOTLE",
    "RAPPI",
    "IFOOD",
]

RESTAURANT_GENERIC_KEYWORDS = [
    "RESTAURANT",
    "REST.",
    "BURGER",
    "PIZZA",
    "GRILL",
    "STEAK",
    "CAFE",
    "COFFEE",
    "BISTRO",
    "DINER",
    "BAR ",
    " BAR",
    "KITCHEN",
    "FOOD",
    "SUSHI",
    "BAGUETTE",
]

DELIVERY_KEYWORDS = [
    "FEDEX",
    "USPS",
    " UPS",
    "UPS ",
    "DHL",
    "CORREIOS",
]

TELECOM_KEYWORDS = [
    "AT&T",
    "VERIZON",
    "T-MOBILE",
    "SPRINT",
    "CLARO",
    "VIVO",
    "TIM ",
    " OI ",
]

TRAINING_KEYWORDS = [
    "LINKEDIN LEARNING",
    "COURSERA",
    "UDEMY",
    "SKILLSHARE",
]

OFFICE_SUPPLIES_KEYWORDS = [
    "STAPLES",
    "OFFICE DEPOT",
    "OFFICEWORKS",
]

COMPUTER_EQUIPMENT_KEYWORDS = [
    "APPLE.COM",
    "APPLE STORE",
    "BEST BUY",
    "B&H PHOTO",
]

AIRLINE_KEYWORDS = [
    "AMERICAN AIRLINES",
    "DELTA AIR",
    "UNITED AIR",
    "SOUTHWEST",
    "JETBLUE",
    "LATAM",
    "GOL LINHAS",
    "AZUL LINHAS",
    "AVIANCA",
    "QATAR AIRWAYS",
    "AIRLINE",
    "AIRWAYS",
]

HOTEL_KEYWORDS = [
    "HILTON",
    "MARRIOTT",
    "HYATT",
    "IHG",
    "AIRBNB",
    "VRBO",
    " HOTEL",
    "MOTEL",
    " INN",
]


# -----------------------------
# 2. FUNÇÕES AUXILIARES
# -----------------------------

def normalize_category(raw: str) -> str:
    """
    Normaliza a categoria retornada pelo modelo:
    - remove espaços extras
    - faz comparação case-insensitive com a lista de categorias válidas
    """
    if not raw:
        return ""

    normalized = raw.strip()

    for valid in EXPENSE_CATEGORIES:
        if normalized.lower() == valid.lower():
            return valid

    # Se nada bateu exatamente, devolve string vazia (melhor ser conservador)
    return ""


def rule_based_category(description: str) -> Optional[str]:
    """
    Aplica regras de categorização determinísticas.
    Retorna a categoria ou None se não conseguir decidir.
    """
    desc_upper = (description or "").upper()

    if not desc_upper:
        return None

    # --- Regras específicas de Uber / Lyft / etc ---
    if "UBER" in desc_upper and "TRIP" in desc_upper:
        return "Ground Transportation - Travel"

    if "UBER" in desc_upper and "VIAGEM" in desc_upper:
        return "Ground Transportation - Travel"

    if "UBER" in desc_upper and "EATS" in desc_upper:
        return "Meals & Entertainment - Travel"

    if "LYFT" in desc_upper:
        return "Ground Transportation - Travel"

    if any(k in desc_upper for k in GROUND_TRANSPORT_KEYWORDS):
        return "Ground Transportation - Travel"

    # --- Comida & restaurantes (incluindo Five Guys, Shake Shack, etc.) ---
    if any(brand in desc_upper for brand in RESTAURANT_BRANDS):
        return "Meals & Entertainment - Travel"

    if any(keyword in desc_upper for keyword in RESTAURANT_GENERIC_KEYWORDS):
        return "Meals & Entertainment - Travel"

    # --- Airfare ---
    if any(air in desc_upper for air in AIRLINE_KEYWORDS):
        return "Airfare"

    # --- Lodging ---
    if any(hotel in desc_upper for hotel in HOTEL_KEYWORDS):
        return "Lodging"

    # --- IT Subscriptions ---
    # Aqui usamos um match um pouco mais cuidadoso para evitar falsos positivos
    for kw in IT_KEYWORDS:
        # se começar com a palavra ou tiver espaço antes (evita achar "GYM" em "GUYS")
        if desc_upper.startswith(kw) or f" {kw}" in desc_upper:
            return "IT Subscriptions"

    # --- Delivery and Postage ---
    if any(d in desc_upper for d in DELIVERY_KEYWORDS):
        return "Delivery and Postage"

    # --- Telephone/Internet ---
    if any(t in desc_upper for t in TELECOM_KEYWORDS):
        return "Telephone/Internet"

    # --- Training ---
    if any(t in desc_upper for t in TRAINING_KEYWORDS):
        return "Training"

    # --- Wellhub Reimbursement ---
    if "WELLHUB" in desc_upper or "GYMPASS" in desc_upper:
        return "Wellhub Reimbursement"

    # --- Travel Agent Fees ---
    if "AGENT FE" in desc_upper:
        return "Travel Agent Fees"

    # --- Office Supplies ---
    if any(o in desc_upper for o in OFFICE_SUPPLIES_KEYWORDS):
        return "Office Supplies"

    # --- Computer Equipment ---
    if any(c in desc_upper for c in COMPUTER_EQUIPMENT_KEYWORDS):
        return "Computer Equipment"

    # Nenhuma regra bateu
    return None


def build_llm_prompt(batch_descriptions: List[str]) -> str:
    """
    Constrói o prompt a ser enviado ao modelo para um batch de descrições.
    """
    categories_list = "\n".join(f"- {cat}" for cat in EXPENSE_CATEGORIES)

    examples = """
Here are some examples of how to categorize expenses:
Description: UBER *TRIP -> Category: Ground Transportation
Description: UBER UBER *TRIP -> Category: Ground Transportation
Description: UBER* TRIP -> Category: Ground Transportation
Description: UBER *TRIP HELP.U -> Category: Ground Transportation
Description: UBER EATS -> Category: Meals & Entertainment
Description: UBER* EATS -> Category: Meals & Entertainment
Description: AMERICAN AIRLINES -> Category: Airfare
Description: DELTA AIR LINES -> Category: Airfare
Description: UNITED AIRLINES -> Category: Airfare
Description: LATAM AIRLINES -> Category: Airfare
Description: GOL LINHAS -> Category: Airfare
Description: AZUL LINHAS -> Category: Airfare
Description: QATAR AIRWAYS -> Category: Airfare
Description: HILTON HOTELS -> Category: Lodging
Description: MARRIOTT -> Category: Lodging
Description: HYATT -> Category: Lodging
Description: IHG HOTELS -> Category: Lodging
Description: AIRBNB -> Category: Lodging
Description: AMAZON WEB SERVICES -> Category: IT Subscriptions
Description: AWS -> Category: IT Subscriptions
Description: MICROSOFT 365 -> Category: IT Subscriptions
Description: MICROSOFT AZURE -> Category: IT Subscriptions
Description: GOOGLE CLOUD -> Category: IT Subscriptions
Description: ZOOM.US -> Category: IT Subscriptions
Description: SLACK -> Category: IT Subscriptions
Description: NOTION -> Category: IT Subscriptions
Description: FIGMA -> Category: IT Subscriptions
Description: GITHUB -> Category: IT Subscriptions
Description: STARBUCKS -> Category: Meals & Entertainment
Description: CHIPOTLE -> Category: Meals & Entertainment
Description: DOORDASH -> Category: Meals & Entertainment
Description: GRUBHUB -> Category: Meals & Entertainment
Description: RAPPI -> Category: Meals & Entertainment
Description: IFOOD -> Category: Meals & Entertainment
Description: RESTAURANT -> Category: Meals & Entertainment
Description: APPLE.COM -> Category: Computer Equipment
Description: APPLE STORE -> Category: Computer Equipment
Description: BEST BUY -> Category: Computer Equipment
Description: FEDEX -> Category: Delivery and Postage
Description: USPS -> Category: Delivery and Postage
Description: UPS -> Category: Delivery and Postage
Description: DHL -> Category: Delivery and Postage
Description: CORREIOS -> Category: Delivery and Postage
Description: STAPLES -> Category: Office Supplies
Description: OFFICE DEPOT -> Category: Office Supplies
Description: AT&T -> Category: Telephone/Internet
Description: VERIZON -> Category: Telephone/Internet
Description: T-MOBILE -> Category: Telephone/Internet
Description: CLARO -> Category: Telephone/Internet
Description: VIVO -> Category: Telephone/Internet
Description: LINKEDIN LEARNING -> Category: Training
Description: COURSERA -> Category: Training
Description: UDEMY -> Category: Training
Description: WELLHUB -> Category: Wellhub Reimbursement
Description: GYMPASS -> Category: Wellhub Reimbursement
Description: LYFT -> Category: Ground Transportation
Description: TAXI -> Category: Ground Transportation
Description: 99 TAXI -> Category: Ground Transportation
Description: CABIFY -> Category: Ground Transportation
Description: SMALLPDF -> Category: IT Subscriptions
Description: TYPEFORM  -> Category: IT Subscriptions
Description: DOCUSIGN -> Category: IT Subscriptions
Description: ADOBE -> Category: IT Subscriptions
Description: GETRO -> Category: IT Subscriptions
Description: HYGRAPH -> Category: IT Subscriptions
Description: INTERMEDIA -> Category: IT Subscriptions
"""

    rules = f"""
IMPORTANT RULES:
1. Return ONLY a JSON array with the category for each expense, in the same order as the input.
2. If you cannot determine the category with confidence, return an empty string "" for that item.
3. Match categories EXACTLY as they appear in the list above.
4. Consider common abbreviations and merchant names.
5. ANY transaction containing "UBER" and "TRIP" (in any format) is ALWAYS "Ground Transportation - Travel".
6. ANY transaction containing "UBER" and "EATS" is ALWAYS "Meals & Entertainment - Travel".
7. ANY transaction containing "LYFT" is ALWAYS "Ground Transportation - Travel".
8. ANY transaction containing "ADOBE" OR "INTERMEDIA" OR "GETRO" OR "HYGRAPH" OR "TYPEFORM" is ALWAYS "IT Subscriptions".
9. Be aggressive in categorizing - prefer to categorize than leave empty.
10. Any restaurant, fast-food chain, coffee shop or food establishment (e.g. Five Guys, Shake Shack, McDonald's, Burger King, Starbucks, Costa, etc.) is ALWAYS "Meals & Entertainment - Travel".
11. For Ground Transportation and Meals & Entertainment, always use the "- Travel" suffix as default.
"""

    prompt = f"""You are an expense categorization assistant. Categorize each expense description into one of the following categories:

{categories_list}

{examples}
{rules}

Here are the {len(batch_descriptions)} expense descriptions to categorize:
{json.dumps(batch_descriptions)}

Return ONLY a valid JSON array of {len(batch_descriptions)} strings, nothing else.
Example: ["Airfare", "Meals & Entertainment - Travel", "", "IT Subscriptions"]
"""
    return prompt


# -----------------------------
# 3. LLM CATEGORIZATION
# -----------------------------

def categorize_with_llm(descriptions: List[str]) -> List[str]:
    """
    Chama o modelo para categorizar uma lista de descrições.
    Retorna uma lista de strings (pode conter vazios).
    """
    if not descriptions:
        return []

    batch_size = 25
    all_categories: List[str] = []

    for i in range(0, len(descriptions), batch_size):
        batch_descriptions = descriptions[i:i + batch_size]
        batch_prompt = build_llm_prompt(batch_descriptions)

        try:
            openai_client = get_openai_client()
            response = openai_client.chat.completions.create(
                model="gpt-4.1",
                messages=[
                    {
                        "role": "system",
                        "content": "You are an expense categorization assistant. You respond ONLY with valid JSON arrays."
                    },
                    {
                        "role": "user",
                        "content": batch_prompt
                    }
                ],
                temperature=0.1,
                max_tokens=2000
            )    

            result_text = response.choices[0].message.content.strip()

            # Em teoria, com response_format=json_array já vem 100% válido
            batch_categories = json.loads(result_text)

            if not isinstance(batch_categories, list):
                raise ValueError("Model response is not a JSON array")

            # Ajusta tamanho se vier errado
            if len(batch_categories) != len(batch_descriptions):
                print(
                    f"[WARN] LLM returned {len(batch_categories)} items for "
                    f"{len(batch_descriptions)} descriptions. Adjusting..."
                )
                # Trunca ou completa com vazio
                if len(batch_categories) > len(batch_descriptions):
                    batch_categories = batch_categories[:len(batch_descriptions)]
                else:
                    batch_categories += [""] * (len(batch_descriptions) - len(batch_categories))

        except Exception as e:
            import traceback
            print(f"[ERROR] LLM batch categorization failed: {type(e).__name__}: {e}")
            print(f"[ERROR] Full traceback: {traceback.format_exc()}")
            batch_categories = [""] * len(batch_descriptions)

        all_categories.extend(batch_categories)
        print(f"Categorized batch {i // batch_size + 1}: {len(batch_categories)} items")

    return all_categories


# -----------------------------
# 4. API PÚBLICA
# -----------------------------

def categorize_transactions(transactions: List[Dict]) -> List[Dict]:
    """
    Categorize a list of transactions using rule-based logic + OpenAI.

    Args:
        transactions: List of transaction dicts with 'description' field

    Returns:
        List of transactions with added 'ai_category' field
    """
    if not transactions:
        return transactions

    # 1ª passada: regras determinísticas
    uncategorized_indices: List[int] = []

    for i, tx in enumerate(transactions):
        description = tx.get("description", "") or ""
        rule_category = rule_based_category(description)

        if rule_category:
            tx["ai_category"] = rule_category
        else:
            tx["ai_category"] = None
            uncategorized_indices.append(i)

    print(
        f"Rule-based: {len(transactions) - len(uncategorized_indices)} categorized, "
        f"{len(uncategorized_indices)} need AI"
    )

    if not uncategorized_indices:
        return transactions

    # 2ª passada: chama LLM só para os não categorizados
    descriptions_for_llm = [transactions[i].get("description", "") or "" for i in uncategorized_indices]
    llm_raw_categories = categorize_with_llm(descriptions_for_llm)

    # 3ª passada: aplica categorias, com normalização + sanity checks
    for idx, tx_index in enumerate(uncategorized_indices):
        raw_cat = llm_raw_categories[idx] if idx < len(llm_raw_categories) else ""
        normalized = normalize_category(raw_cat)

        description_upper = (transactions[tx_index].get("description", "") or "").upper()

        # SANITY CHECK adicional para restaurantes/fast-food
        if any(brand in description_upper for brand in RESTAURANT_BRANDS):
            normalized = "Meals & Entertainment - Travel"

        # Se ainda não bateu nada, mas o modelo retornou algo, loga para depuração
        if not normalized and raw_cat:
            print(
                f"Unmatched category from LLM: '{raw_cat}' "
                f"for description: '{transactions[tx_index].get('description', '')[:80]}'"
            )

        transactions[tx_index]["ai_category"] = normalized or ""

    return transactions


def categorize_single(description: str) -> str:
    """
    Categorize a single transaction description.

    Args:
        description: The expense description

    Returns:
        The category string or empty string if inconclusive
    """
    result = categorize_transactions([{"description": description}])
    return result[0].get("ai_category", "") if result else ""
