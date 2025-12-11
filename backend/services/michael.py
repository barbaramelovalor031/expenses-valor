"""
Michael Credit Card processor - categorizes expenses using AI
"""
import pandas as pd
from io import BytesIO
from typing import Dict, List, Any, Optional
import json
import os

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Mesmas categorias do categorizer.py
EXPENSE_CATEGORIES = [
    "Airfare",
    "Computer Equipment",
    "Travel - Event",
    "Gifts",
    "Lodging",
    "Miscellaneous",
    "Office Supplies",
    "IT Subscriptions",
    "Training",
    "Brazil Insurance",
    "Personal Expenses",
    "Membership Dues",
    "Printing",
    "Rippling Wire Deduction",
    "Ground Transportation",
    "Meals & Entertainment",
    "Conferences & Seminars",
    "Telephone/Internet",
    "Wellhub Reimbursement",
    "Pantry Food",
    "Travel Agent Fees",
    "Delivery and Postage",
    "Venue - Event",
    "Catering - Event",
    "Printing - Event",
    "Tech/AV - Event",
    "Other - Event",
    "Board meetings",
    "Due Diligence - Portfolio Company",
    "Due Diligence - New Deals",
]

# Mapeamento de categorias do Amex para nossas categorias
AMEX_CATEGORY_MAPPING = {
    "Travel-Airline": "Airfare",
    "Travel-Lodging": "Lodging",
    "Travel-Travel Agencies": "Travel Agent Fees",
    "Transportation-Taxis & Coach": "Ground Transportation",
    "Restaurant-Restaurant": "Meals & Entertainment",
    "Communications-Telephone Comm": "Telephone/Internet",
    "Merchandise & Supplies-Computer Supplies": "Computer Equipment",
    "Merchandise & Supplies-General Retail": "Miscellaneous",
    "Merchandise & Supplies-Mail Order": "Delivery and Postage",
    "Business Services-Professional Services": "Miscellaneous",
    "Business Services-Other Services": "Miscellaneous",
    "Other-Miscellaneous": "Miscellaneous",
}

# Keywords para regras baseadas em Extended Details
AIRLINE_KEYWORDS = ["AIRLINE", "AIRWAYS", "AMERICAN AIR", "DELTA AIR", "UNITED AIR", "LATAM", "GOL LINHAS", "GOL AIR", "AZUL", "JETBLUE", "SOUTHWEST", "PASSENGER TICKET", "FLIGHT", "AIR CANADA", "BRITISH AIR", "LUFTHANSA", "EMIRATES", "QATAR", "TAM ", "TAP ", "AVIANCA"]
HOTEL_KEYWORDS = ["HOTEL", "MARRIOTT", "HILTON", "HYATT", "IHG", "AIRBNB", "VRBO", "LODGING", "MELIA", "RESORT", "SUITES", "INN ", " INN", "MOTEL", "HOSTEL", "POUSADA", "SHERATON", "WESTIN", "INTERCONTINENTAL", "HOLIDAY INN", "BEST WESTERN", "RADISSON", "COSTA BAVARO"]
RESTAURANT_KEYWORDS = ["RESTAURANT", "CAFE", "COFFEE", "STARBUCKS", "BURGER", "PIZZA", "GRILL", "BAR ", " BAR", "BISTRO", "DINER", "FOOD", "EATERY", "BAKERY", "PADARIA", "LANCHONETE", "CHURRASCARIA", "STEAKHOUSE", "SUSHI", "JAPANESE", "ITALIAN", "CHINESE", "MEXICAN", "THAI"]
GROUND_TRANSPORT_KEYWORDS = ["UBER", "LYFT", "TAXI", "CAB ", "LIMO", "CABIFY", "99 ", "TAXIS", "99APP", "YELLOW CAB", "SHUTTLE", "TRANSFER", "CAR SERVICE", "BLACK CAR"]
IT_KEYWORDS = ["AMAZON WEB", "AWS", "MICROSOFT", "GOOGLE CLOUD", "ZOOM", "SLACK", "NOTION", "GITHUB", "ADOBE", "DROPBOX", "OPENAI", "CHATGPT", "STRIPE", "TWILIO", "HEROKU", "DIGITAL OCEAN"]
TRAVEL_AGENCY_KEYWORDS = ["EXPEDIA", "BOOKING.COM", "HOTELS.COM", "KAYAK", "TRAVEL AGENCY", "PRICELINE", "ORBITZ", "TRAVELOCITY", "DESPEGAR", "DECOLAR", "CVC VIAGENS"]
TELECOM_KEYWORDS = ["AT&T", "VERIZON", "T-MOBILE", "SPRINT", "CLARO", "VIVO", "TIM ", "OI ", "TELEFONICA", "COMCAST", "SPECTRUM", "TELECOM"]


def rule_based_category(extended_details: str, amex_category: str) -> Optional[str]:
    """
    Aplica regras determinísticas baseadas em Extended Details e Category do Amex
    """
    details_upper = (extended_details or "").upper()
    amex_cat = (amex_category or "").strip()
    
    # 1. Regras baseadas em Extended Details (prioridade máxima)
    if any(kw in details_upper for kw in AIRLINE_KEYWORDS):
        return "Airfare"
    
    if any(kw in details_upper for kw in HOTEL_KEYWORDS):
        return "Lodging"
    
    if any(kw in details_upper for kw in TRAVEL_AGENCY_KEYWORDS):
        return "Travel Agent Fees"
    
    if any(kw in details_upper for kw in RESTAURANT_KEYWORDS):
        return "Meals & Entertainment"
    
    if any(kw in details_upper for kw in GROUND_TRANSPORT_KEYWORDS):
        return "Ground Transportation"
    
    if any(kw in details_upper for kw in IT_KEYWORDS):
        return "IT Subscriptions"
    
    if any(kw in details_upper for kw in TELECOM_KEYWORDS):
        return "Telephone/Internet"
    
    # 2. Fallback para categoria do Amex (se disponível)
    if amex_cat and amex_cat in AMEX_CATEGORY_MAPPING:
        return AMEX_CATEGORY_MAPPING[amex_cat]
    
    # 3. Se não encontrou nada, retorna None para ir para AI
    return None


def normalize_category(raw: str) -> str:
    """Normaliza categoria retornada pelo modelo"""
    if not raw:
        return ""
    normalized = raw.strip()
    for valid in EXPENSE_CATEGORIES:
        if normalized.lower() == valid.lower():
            return valid
    return ""


def build_llm_prompt(batch_data: List[Dict]) -> str:
    """Constrói prompt para o LLM categorizar"""
    categories_list = "\n".join(f"- {cat}" for cat in EXPENSE_CATEGORIES)
    
    items_text = "\n".join([
        f"{i+1}. Extended Details: \"{item['extended_details']}\" | Amex Category: \"{item['amex_category']}\""
        for i, item in enumerate(batch_data)
    ])
    
    prompt = f"""You are an expense categorization assistant. Categorize each expense into one of these categories:

{categories_list}

RULES:
1. "Travel-Airline" or anything with airlines -> "Airfare"
2. "Travel-Lodging" or hotels -> "Lodging"
3. "Restaurant-Restaurant" or food places -> "Meals & Entertainment"
4. "Transportation-Taxis & Coach" or Uber/Lyft/Taxi -> "Ground Transportation"
5. "Communications-Telephone Comm" -> "Telephone/Internet"
6. "Travel-Travel Agencies" -> "Travel Agent Fees"
7. "Merchandise & Supplies-Computer Supplies" -> "Computer Equipment"
8. If you can't determine confidently, use "Miscellaneous"

Here are {len(batch_data)} expenses to categorize:
{items_text}

Return ONLY a valid JSON array with {len(batch_data)} category strings.
Example: ["Airfare", "Lodging", "Meals & Entertainment"]
"""
    return prompt


def categorize_with_llm(items: List[Dict]) -> List[str]:
    """Chama o LLM para categorizar itens"""
    if not items:
        return []
    
    batch_size = 25
    all_categories = []
    
    for i in range(0, len(items), batch_size):
        batch = items[i:i + batch_size]
        prompt = build_llm_prompt(batch)
        
        try:
            response = client.chat.completions.create(
                model="gpt-4.1",
                messages=[
                    {"role": "system", "content": "You are an expense categorization assistant. Respond ONLY with valid JSON arrays."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=2000
            )
            
            result_text = response.choices[0].message.content.strip()
            batch_categories = json.loads(result_text)
            
            if not isinstance(batch_categories, list):
                raise ValueError("Response is not a JSON array")
            
            # Ajusta tamanho se necessário
            if len(batch_categories) != len(batch):
                if len(batch_categories) > len(batch):
                    batch_categories = batch_categories[:len(batch)]
                else:
                    batch_categories += ["Miscellaneous"] * (len(batch) - len(batch_categories))
                    
        except Exception as e:
            print(f"[ERROR] LLM categorization failed: {e}")
            batch_categories = ["Miscellaneous"] * len(batch)
        
        all_categories.extend(batch_categories)
        print(f"Categorized batch {i // batch_size + 1}: {len(batch_categories)} items")
    
    return all_categories


def process_michael_file(file_content: bytes, filename: str) -> Dict[str, Any]:
    """
    Processa arquivo Excel do Michael e retorna transações com categorias originais
    """
    # Ler arquivo
    if filename.endswith('.csv'):
        df = pd.read_csv(BytesIO(file_content))
    else:
        df = pd.read_excel(BytesIO(file_content))
    
    # Debug: mostrar colunas disponíveis
    print(f"[DEBUG] Colunas do arquivo: {df.columns.tolist()}")
    print(f"[DEBUG] Primeira linha: {df.iloc[0].to_dict() if len(df) > 0 else 'vazio'}")
    
    # Remover linhas de cabeçalho duplicado
    df = df[df['Date'] != 'Date']
    df = df.dropna(subset=['Date'])
    
    # Resetar índice para garantir IDs únicos
    df = df.reset_index(drop=True)
    
    # Converter para lista de transações
    transactions = []
    for idx, row in df.iterrows():
        ext_details = str(row.get('Extended Details', '')) if pd.notna(row.get('Extended Details')) else ''
        amex_cat = str(row.get('Category', '')) if pd.notna(row.get('Category')) else ''
        
        tx = {
            "id": idx + 1,
            "date": str(row.get('Date', '')),
            "description": str(row.get('Description', '')),
            "notes": str(row.get('Unnamed: 0', row.get('Notes', ''))),
            "amount": float(row.get('Amount', 0)) if pd.notna(row.get('Amount')) else 0,
            "extended_details": ext_details,
            "amex_category": amex_cat,
            "city_state": str(row.get('City/State', '')) if pd.notna(row.get('City/State')) else '',
            "ai_category": ""
        }
        
        # Debug primeiras transações
        if idx < 3:
            print(f"[DEBUG] TX {idx+1}: extended_details[:50]='{ext_details[:50] if ext_details else ''}', amex_category='{amex_cat}'")
        
        transactions.append(tx)
    
    return {
        "transactions": transactions,
        "total_transactions": len(transactions),
        "total_amount": sum(t["amount"] for t in transactions)
    }


def categorize_michael_transactions(transactions: List[Dict]) -> List[Dict]:
    """
    Categoriza transações usando regras + AI
    """
    if not transactions:
        return transactions
    
    uncategorized_indices = []
    
    # 1ª passada: regras determinísticas
    for i, tx in enumerate(transactions):
        rule_cat = rule_based_category(tx.get("extended_details", ""), tx.get("amex_category", ""))
        if rule_cat:
            tx["ai_category"] = rule_cat
        else:
            tx["ai_category"] = ""
            uncategorized_indices.append(i)
    
    print(f"Rule-based: {len(transactions) - len(uncategorized_indices)} categorized, {len(uncategorized_indices)} need AI")
    
    if not uncategorized_indices:
        return transactions
    
    # 2ª passada: LLM para os não categorizados
    items_for_llm = [
        {
            "extended_details": transactions[i].get("extended_details", ""),
            "amex_category": transactions[i].get("amex_category", "")
        }
        for i in uncategorized_indices
    ]
    
    llm_categories = categorize_with_llm(items_for_llm)
    
    # 3ª passada: aplica categorias do LLM
    for idx, tx_index in enumerate(uncategorized_indices):
        raw_cat = llm_categories[idx] if idx < len(llm_categories) else "Miscellaneous"
        normalized = normalize_category(raw_cat)
        transactions[tx_index]["ai_category"] = normalized or "Miscellaneous"
    
    return transactions


def export_michael_to_excel(transactions: List[Dict]) -> bytes:
    """
    Exporta transações categorizadas para Excel
    """
    # Criar DataFrame
    df = pd.DataFrame(transactions)
    
    # Reordenar e renomear colunas
    columns_order = ['date', 'description', 'notes', 'amount', 'extended_details', 'amex_category', 'ai_category', 'city_state']
    columns_rename = {
        'date': 'Date',
        'description': 'Description',
        'notes': 'Notes',
        'amount': 'Amount',
        'extended_details': 'Extended Details',
        'amex_category': 'Original Category',
        'ai_category': 'AI Category',
        'city_state': 'City/State'
    }
    
    df = df[[c for c in columns_order if c in df.columns]]
    df = df.rename(columns=columns_rename)
    
    # Criar Excel
    output = BytesIO()
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        df.to_excel(writer, index=False, sheet_name='Categorized Expenses')
        
        # Formatar
        from openpyxl.styles import Font, PatternFill, Alignment
        from openpyxl.utils import get_column_letter
        
        worksheet = writer.sheets['Categorized Expenses']
        
        # Ajustar largura das colunas
        for idx, col in enumerate(df.columns, 1):
            max_length = max(
                df[col].astype(str).apply(len).max(),
                len(str(col))
            ) + 2
            worksheet.column_dimensions[get_column_letter(idx)].width = min(max_length, 40)
        
        # Header style
        header_fill = PatternFill(start_color='1e3a5f', end_color='1e3a5f', fill_type='solid')
        header_font = Font(color='FFFFFF', bold=True)
        
        for cell in worksheet[1]:
            cell.fill = header_fill
            cell.font = header_font
            cell.alignment = Alignment(horizontal='center')
        
        # Number format for Amount column
        amount_col = None
        for idx, col in enumerate(df.columns, 1):
            if col == 'Amount':
                amount_col = idx
                break
        
        if amount_col:
            for row in range(2, len(df) + 2):
                cell = worksheet.cell(row=row, column=amount_col)
                if isinstance(cell.value, (int, float)):
                    cell.number_format = '#,##0.00'
    
    output.seek(0)
    return output.getvalue()
