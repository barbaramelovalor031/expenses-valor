from google.cloud import bigquery
from datetime import datetime
import os
import json
import re

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv()

PROJECT_ID = "automatic-bond-462415-h6"
DATASET_ID = "finance"

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
        api_key = api_key.strip()
        print(f"[INFO] Initializing OpenAI client for IT Subscriptions with key: {api_key[:8]}...{api_key[-4:]}")
        _openai_client = OpenAI(api_key=api_key)
    return _openai_client

# Lazy initialization of BigQuery client
_bq_client = None

def get_bq_client():
    """Get or create BigQuery client with lazy initialization"""
    global _bq_client
    if _bq_client is None:
        _bq_client = bigquery.Client(project=PROJECT_ID)
    return _bq_client


def ensure_vendor_extracted_column():
    """Ensure the vendor_extracted column exists in credit_card_expenses table."""
    try:
        # Try to add the column - it will fail if already exists
        query = f"""
        ALTER TABLE `{PROJECT_ID}.{DATASET_ID}.credit_card_expenses`
        ADD COLUMN IF NOT EXISTS vendor_extracted STRING
        """
        get_bq_client().query(query).result()
        return True
    except Exception as e:
        # Column might already exist or other issue
        print(f"Note when checking vendor_extracted column: {e}")
        return False


def get_it_subscriptions(year: int = None, start_date: str = None, end_date: str = None):
    """Get IT Subscriptions expenses from credit_card_expenses and rippling_expenses tables."""
    
    # First ensure the vendor_extracted column exists
    ensure_vendor_extracted_column()
    
    # Build date condition
    if start_date and end_date:
        # Date range filter takes precedence over year
        date_condition_cc = f"date >= '{start_date}' AND date <= '{end_date}'"
        date_condition_rippling = f"r.date >= '{start_date}' AND r.date <= '{end_date}'"
    elif year:
        date_condition_cc = f"EXTRACT(YEAR FROM date) = {year}"
        date_condition_rippling = f"EXTRACT(YEAR FROM r.date) = {year}"
    else:
        # Default to current year
        current_year = datetime.now().year
        date_condition_cc = f"EXTRACT(YEAR FROM date) = {current_year}"
        date_condition_rippling = f"EXTRACT(YEAR FROM r.date) = {current_year}"
    
    # Query for credit card expenses with IT Subscriptions category
    credit_card_query = f"""
    SELECT 
        id,
        date,
        description,
        user,
        category,
        amount,
        credit_card,
        COALESCE(vendor_extracted, '') as vendor_extracted,
        'credit_card' as source
    FROM `{PROJECT_ID}.{DATASET_ID}.credit_card_expenses`
    WHERE category = 'IT Subscriptions'
    AND {date_condition_cc}
    """
    
    # Query for rippling expenses with IT Subscriptions category
    # Note: rippling_expenses uses 'date', 'name' (employee display name), 'vendor_name', 'amount', 'employee_original'
    # JOIN with rippling_employees to get display_name mapping
    rippling_query = f"""
    SELECT 
        r.id,
        r.date,
        COALESCE(r.vendor_name, '') as description,
        COALESCE(e.display_name, r.name, r.employee_original, '') as user,
        r.category,
        r.amount,
        '' as credit_card,
        COALESCE(r.vendor_name, '') as vendor_extracted,
        'rippling' as source
    FROM `{PROJECT_ID}.{DATASET_ID}.rippling_expenses` r
    LEFT JOIN `{PROJECT_ID}.{DATASET_ID}.rippling_employees` e
        ON LOWER(TRIM(r.employee_original)) = LOWER(TRIM(e.rippling_name))
    WHERE r.category = 'IT Subscriptions'
    AND {date_condition_rippling}
    """
    
    # Execute both queries
    expenses = []
    
    try:
        credit_card_results = get_bq_client().query(credit_card_query).result()
        for row in credit_card_results:
            expenses.append({
                "id": row.id,
                "date": row.date.isoformat() if row.date else None,
                "description": row.description,
                "user": row.user or "",
                "category": row.category,
                "amount": float(row.amount) if row.amount else 0,
                "credit_card": row.credit_card or "",
                "vendor_extracted": row.vendor_extracted or "",
                "source": row.source
            })
    except Exception as e:
        print(f"Error querying credit_card_expenses: {e}")
    
    try:
        rippling_results = get_bq_client().query(rippling_query).result()
        for row in rippling_results:
            expenses.append({
                "id": row.id,
                "date": row.date.isoformat() if row.date else None,
                "description": row.description,
                "user": row.user or "",
                "category": row.category,
                "amount": float(row.amount) if row.amount else 0,
                "credit_card": row.credit_card or "",
                "vendor_extracted": row.vendor_extracted or "",
                "source": row.source
            })
    except Exception as e:
        print(f"Error querying rippling_expenses: {e}")
    
    # Query for manual expenses from valor_expenses (not linked to credit_card or rippling)
    # These are expenses added manually directly to consolidated expenses
    # source IS NULL means it's a manual entry (not synced from credit_card, rippling, or uber)
    manual_query = f"""
    SELECT 
        id,
        date,
        COALESCE(vendor, name, '') as description,
        COALESCE(name, '') as user,
        category,
        amount,
        '' as credit_card,
        COALESCE(vendor, name, '') as vendor_extracted,
        'manual' as source_type
    FROM `{PROJECT_ID}.{DATASET_ID}.valor_expenses`
    WHERE category = 'IT Subscriptions'
    AND EXTRACT(YEAR FROM date) = {year}
    AND source IS NULL
    """
    
    try:
        manual_results = get_bq_client().query(manual_query).result()
        for row in manual_results:
            expenses.append({
                "id": row.id,
                "date": row.date.isoformat() if row.date else None,
                "description": row.description or "",
                "user": row.user or "",
                "category": row.category,
                "amount": float(row.amount) if row.amount else 0,
                "credit_card": row.credit_card or "",
                "vendor_extracted": row.vendor_extracted or "",
                "source": "manual"
            })
    except Exception as e:
        print(f"Error querying valor_expenses (manual): {e}")
    
    # Sort by date descending
    expenses.sort(key=lambda x: x["date"] or "", reverse=True)
    
    return expenses


def extract_vendor_from_description(description: str) -> str:
    """Use OpenAI to extract a clean vendor name from a credit card description."""
    
    try:
        openai_client = get_openai_client()
        response = openai_client.chat.completions.create(
            model="gpt-4.1",
            messages=[
                {
                    "role": "system",
                    "content": """You are an expert at extracting vendor/company names from credit card transaction descriptions.
                    
Given a credit card description, extract ONLY the clean vendor/company name.

Rules:
1. Remove any transaction codes, dates, reference numbers
2. Remove location information (city, state, country codes)
3. Remove payment method indicators (VISA, MC, AMEX, etc.)
4. Return just the clean company/vendor name
5. If you recognize a known company (AWS, Google, Microsoft, Adobe, etc.), use their standard name
6. For subscription services, use the service name (Netflix, Spotify, GitHub, etc.)
7. If you cannot determine the vendor, return empty string

Examples:
- "AMZN WEB SERVICES AWS.AMAZON.COBILL.AMAZON.COMM" -> "Amazon Web Services"
- "GOOGLE *CLOUD GSUITE cc@google.com" -> "Google Cloud"
- "MSFT * AZURE" -> "Microsoft Azure"
- "GITHUB INC" -> "GitHub"
- "ADOBE CREATIVE*CLOUD" -> "Adobe Creative Cloud"
- "ZOOM.US 888-799-9666 CA" -> "Zoom"
- "SLACK TECHNOLOGIES" -> "Slack"
- "NOTION LABS INC" -> "Notion"
- "FIGMA INC" -> "Figma"
- "1PASSWORD" -> "1Password"
- "DROPBOX*CLTSWLZJ9VHS" -> "Dropbox"

Return ONLY the vendor name, nothing else."""
                },
                {
                    "role": "user",
                    "content": f"Extract the vendor name from: {description}"
                }
            ],
            temperature=0,
            max_tokens=50
        )
        
        vendor = response.choices[0].message.content.strip()
        # Clean up any quotes that might be in the response
        vendor = vendor.strip('"\'')
        return vendor
        
    except Exception as e:
        print(f"Error extracting vendor with OpenAI: {e}")
        return ""


def extract_vendors_for_expenses(expense_ids: list = None):
    """Extract vendors for IT Subscription expenses and update the database."""
    
    # First ensure the vendor_extracted column exists
    ensure_vendor_extracted_column()
    
    # First, get all IT Subscriptions expenses that don't have vendor_extracted set
    if expense_ids:
        # Extract for specific expenses
        ids_str = ", ".join([f"'{id}'" for id in expense_ids])
        query = f"""
        SELECT 
            id,
            date,
            description,
            COALESCE(vendor_extracted, '') as vendor_extracted
        FROM `{PROJECT_ID}.{DATASET_ID}.credit_card_expenses`
        WHERE category = 'IT Subscriptions'
        AND id IN ({ids_str})
        """
    else:
        # Extract for all expenses without vendor
        query = f"""
        SELECT 
            id,
            date,
            description,
            COALESCE(vendor_extracted, '') as vendor_extracted
        FROM `{PROJECT_ID}.{DATASET_ID}.credit_card_expenses`
        WHERE category = 'IT Subscriptions'
        AND (vendor_extracted IS NULL OR vendor_extracted = '')
        """
    
    results = []
    
    try:
        rows = get_bq_client().query(query).result()
        
        for row in rows:
            description = row.description
            vendor = extract_vendor_from_description(description)
            
            if vendor:
                # Update the database
                update_query = f"""
                UPDATE `{PROJECT_ID}.{DATASET_ID}.credit_card_expenses`
                SET vendor_extracted = @vendor
                WHERE id = @id
                """
                
                job_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("vendor", "STRING", vendor),
                        bigquery.ScalarQueryParameter("id", "STRING", row.id),
                    ]
                )
                
                get_bq_client().query(update_query, job_config=job_config).result()
                
                results.append({
                    "id": row.id,
                    "description": description,
                    "vendor_extracted": vendor,
                    "status": "updated"
                })
            else:
                results.append({
                    "id": row.id,
                    "description": description,
                    "vendor_extracted": "",
                    "status": "no_vendor_found"
                })
                
    except Exception as e:
        print(f"Error extracting vendors: {e}")
        raise e
    
    return results


def get_it_subscriptions_summary(year: int = None):
    """Get summary statistics for IT Subscriptions."""
    
    if year is None:
        year = datetime.now().year
    
    # First ensure the vendor_extracted column exists
    ensure_vendor_extracted_column()
    
    # Summary by vendor
    vendor_query = f"""
    SELECT 
        COALESCE(NULLIF(vendor_extracted, ''), 'Unknown') as vendor,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount
    FROM `{PROJECT_ID}.{DATASET_ID}.credit_card_expenses`
    WHERE category = 'IT Subscriptions'
    AND EXTRACT(YEAR FROM date) = {year}
    GROUP BY vendor
    ORDER BY total_amount DESC
    """
    
    # Summary by user
    user_query = f"""
    SELECT 
        COALESCE(user, 'Unknown') as user,
        COUNT(*) as transaction_count,
        SUM(amount) as total_amount
    FROM `{PROJECT_ID}.{DATASET_ID}.credit_card_expenses`
    WHERE category = 'IT Subscriptions'
    AND EXTRACT(YEAR FROM date) = {year}
    GROUP BY user
    ORDER BY total_amount DESC
    """
    
    # Monthly totals
    monthly_query = f"""
    SELECT 
        FORMAT_DATE('%Y-%m', date) as month,
        SUM(amount) as total_amount,
        COUNT(*) as transaction_count
    FROM `{PROJECT_ID}.{DATASET_ID}.credit_card_expenses`
    WHERE category = 'IT Subscriptions'
    AND EXTRACT(YEAR FROM date) = {year}
    GROUP BY month
    ORDER BY month
    """
    
    summary = {
        "by_vendor": [],
        "by_user": [],
        "by_month": [],
        "total": 0,
        "transaction_count": 0
    }
    
    try:
        # By vendor
        vendor_results = get_bq_client().query(vendor_query).result()
        for row in vendor_results:
            summary["by_vendor"].append({
                "vendor": row.vendor,
                "transaction_count": row.transaction_count,
                "total_amount": float(row.total_amount) if row.total_amount else 0
            })
        
        # By user
        user_results = get_bq_client().query(user_query).result()
        for row in user_results:
            summary["by_user"].append({
                "user": row.user,
                "transaction_count": row.transaction_count,
                "total_amount": float(row.total_amount) if row.total_amount else 0
            })
        
        # By month
        monthly_results = get_bq_client().query(monthly_query).result()
        for row in monthly_results:
            summary["by_month"].append({
                "month": row.month,
                "transaction_count": row.transaction_count,
                "total_amount": float(row.total_amount) if row.total_amount else 0
            })
        
        # Calculate totals
        summary["total"] = sum(v["total_amount"] for v in summary["by_vendor"])
        summary["transaction_count"] = sum(v["transaction_count"] for v in summary["by_vendor"])
        
    except Exception as e:
        print(f"Error getting IT subscriptions summary: {e}")
    
    return summary
