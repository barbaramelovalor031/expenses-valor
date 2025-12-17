"""
Script para categorizar despesas do Michael Card usando IA
Lê uma planilha Excel com o formato da Amex e gera uma nova versão categorizada
"""

import pandas as pd
from openai import OpenAI
from dotenv import load_dotenv
import os
import json

load_dotenv()

# Categorias válidas do sistema
VALID_CATEGORIES = [
    "Airfare",
    "Board meetings",
    "Brazil Insurance",
    "Catering - Event",
    "Computer Equipment",
    "Conferences & Seminars",
    "Delivery and Postage",
    "Due Diligence - New Deals",
    "Due Diligence - Portfolio Company",
    "Firm Uber",
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

# Mapeamento de categorias Amex para nossas categorias
CATEGORY_MAPPING = {
    "Travel-Airline": "Airfare",
    "Travel-Lodging": "Lodging",
    "Restaurant-Restaurant": "Meals & Entertainment - Travel",
    "Merchandise & Supplies-Groceries": "Meals & Entertainment - Travel",
    "Transportation-Fuel": "Ground Transportation - Travel",
    "Transportation-Taxis & Coach": "Ground Transportation - Travel",
    "Transportation-Other": "Ground Transportation - Travel",
    "Business Services-Other Services": "Miscellaneous",
    "Fees & Adjustments-Fees & Adjustments": "Miscellaneous",
    "Communications-Cable & Internet": "Telephone/Internet",
}


def get_openai_client():
    """Initialize OpenAI client"""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY not set")
    return OpenAI(api_key=api_key.strip())


def categorize_with_ai(client: OpenAI, description: str, original_category: str, notes: str = "") -> str:
    """Use AI to categorize an expense based on description"""
    
    # First try simple mapping
    if original_category in CATEGORY_MAPPING:
        mapped = CATEGORY_MAPPING[original_category]
        # For some categories, we can be more specific based on description
        if mapped == "Meals & Entertainment - Travel":
            # Check if it's actually local (no travel context in notes)
            if notes and ("local" in notes.lower() or "office" in notes.lower()):
                return "Meals & Entertainment - Local"
        return mapped
    
    # Use AI for complex cases
    try:
        response = client.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {
                    "role": "system",
                    "content": f"""You are an expense categorizer for a venture capital firm.
Given an expense description and optional notes, categorize it into ONE of these categories:

{json.dumps(VALID_CATEGORIES, indent=2)}

Rules:
1. Airlines, flights = "Airfare"
2. Hotels, accommodation = "Lodging"
3. Restaurants while traveling = "Meals & Entertainment - Travel"
4. Restaurants in local office area = "Meals & Entertainment - Local"
5. Uber, Lyft, taxi = "Ground Transportation - Travel" (if traveling) or "Ground Transportation - Local"
6. Software subscriptions (AWS, Google, Adobe, etc.) = "IT Subscriptions"
7. Phone, internet, wifi = "Telephone/Internet"
8. Conferences, events = "Conferences & Seminars"
9. Gym memberships like Wellhub = "Wellhub Reimbursement"
10. If unsure, use "Miscellaneous"

Return ONLY the category name, nothing else."""
                },
                {
                    "role": "user",
                    "content": f"Description: {description}\nOriginal Category: {original_category}\nNotes: {notes}"
                }
            ],
            temperature=0,
            max_tokens=50
        )
        
        category = response.choices[0].message.content.strip().strip('"\'')
        
        # Validate it's a valid category
        if category in VALID_CATEGORIES:
            return category
        
        # Try to find closest match
        category_lower = category.lower()
        for valid in VALID_CATEGORIES:
            if valid.lower() == category_lower:
                return valid
        
        return "Miscellaneous"
        
    except Exception as e:
        print(f"Error with AI categorization: {e}")
        return "Miscellaneous"


def process_michael_expenses(input_file: str, output_file: str):
    """Process Michael's expenses and categorize them"""
    
    print(f"Reading {input_file}...")
    df = pd.read_excel(input_file)
    
    print(f"Found {len(df)} expenses")
    print(f"Columns: {list(df.columns)}")
    
    # Initialize OpenAI client
    client = get_openai_client()
    
    # Add new category column
    new_categories = []
    
    for idx, row in df.iterrows():
        description = str(row.get('Description', ''))
        original_category = str(row.get('Category', ''))
        notes = str(row.get('Notes', ''))
        
        new_category = categorize_with_ai(client, description, original_category, notes)
        new_categories.append(new_category)
        
        print(f"[{idx+1}/{len(df)}] {description[:50]}... -> {new_category}")
    
    # Add the new category column
    df['Valor_Category'] = new_categories
    
    # Save to new file
    print(f"\nSaving categorized expenses to {output_file}...")
    df.to_excel(output_file, index=False)
    
    # Print summary
    print("\n=== Category Summary ===")
    category_counts = df['Valor_Category'].value_counts()
    for cat, count in category_counts.items():
        print(f"  {cat}: {count}")
    
    print(f"\nDone! Output saved to {output_file}")
    return df


if __name__ == "__main__":
    import sys
    
    if len(sys.argv) < 2:
        print("Usage: python categorize_michael.py <input_file.xlsx>")
        print("Output will be saved as michael_card.xlsx")
        sys.exit(1)
    
    input_file = sys.argv[1]
    output_file = "michael_card.xlsx"
    
    process_michael_expenses(input_file, output_file)
