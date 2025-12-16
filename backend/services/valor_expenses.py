"""
Valor Expenses Service - New format for expense tracking
Table: valor_expenses with columns: id, name, amount, category, date, vendor, year, month
"""
from google.cloud import bigquery
from google.oauth2 import service_account
from typing import Dict, List, Any, Optional
import os
import uuid
import json
import io
from io import BytesIO
from datetime import datetime

from .bigquery_client import get_bigquery_client, PROJECT_ID, DATASET_ID

# BigQuery configuration
TABLE_ID = "valor_expenses"
FULL_TABLE_ID = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"


# get_bigquery_client is now imported from bigquery_client module


def get_all_expenses(year: Optional[int] = None, month: Optional[int] = None, 
                     name: Optional[str] = None, category: Optional[str] = None,
                     limit: int = 5000) -> List[Dict[str, Any]]:
    """
    Get all expenses with optional filters
    """
    client = get_bigquery_client()
    
    conditions = []
    if year:
        conditions.append(f"year = {year}")
    if month:
        conditions.append(f"month = {month}")
    if name:
        conditions.append(f"name = '{name}'")
    if category:
        conditions.append(f"category = '{category}'")
    
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    
    query = f"""
        SELECT 
            id, name, amount, category, date, vendor, year, month, created_at, source, project
        FROM `{FULL_TABLE_ID}`
        {where_clause}
        ORDER BY date DESC, name
        LIMIT {limit}
    """
    
    try:
        result = client.query(query).result()
        expenses = []
        for row in result:
            expenses.append({
                "id": row.id,
                "name": row.name,
                "amount": float(row.amount) if row.amount else 0.0,
                "category": row.category,
                "date": str(row.date) if row.date else None,
                "vendor": row.vendor or "",
                "year": row.year,
                "month": row.month,
                "source": row.source or "",
                "project": row.project or "",
            })
        return expenses
    except Exception as e:
        print(f"Error getting expenses: {e}")
        return []


def get_expenses_by_employee(year: Optional[int] = None) -> List[Dict[str, Any]]:
    """
    Get expenses aggregated by employee (name) and category
    Similar to the old expenses_ytd format
    """
    client = get_bigquery_client()
    
    where_clause = f"WHERE year = {year}" if year else ""
    
    query = f"""
        SELECT 
            name,
            category,
            SUM(amount) as total_amount
        FROM `{FULL_TABLE_ID}`
        {where_clause}
        GROUP BY name, category
        ORDER BY name, category
    """
    
    try:
        result = client.query(query).result()
        
        # Aggregate by employee
        by_employee = {}
        for row in result:
            name = row.name
            if name not in by_employee:
                by_employee[name] = {
                    "employee_name": name,
                    "employee_type": "Partner",  # Default, can be extended later
                    "total": 0.0,
                    "categories": {}
                }
            by_employee[name]["categories"][row.category] = float(row.total_amount)
            by_employee[name]["total"] += float(row.total_amount)
        
        return list(by_employee.values())
    except Exception as e:
        print(f"Error getting expenses by employee: {e}")
        return []


def get_summary(year: Optional[int] = None) -> Dict[str, Any]:
    """
    Get summary statistics
    """
    client = get_bigquery_client()
    
    where_clause = f"WHERE year = {year}" if year else ""
    
    query = f"""
        SELECT 
            SUM(amount) as grand_total,
            COUNT(DISTINCT name) as employee_count,
            COUNT(*) as transaction_count
        FROM `{FULL_TABLE_ID}`
        {where_clause}
    """
    
    cat_query = f"""
        SELECT 
            category,
            SUM(amount) as total
        FROM `{FULL_TABLE_ID}`
        {where_clause}
        GROUP BY category
        ORDER BY total DESC
    """
    
    try:
        result = list(client.query(query).result())[0]
        cat_result = client.query(cat_query).result()
        
        by_category = {}
        for row in cat_result:
            by_category[row.category] = float(row.total)
        
        return {
            "grand_total": float(result.grand_total) if result.grand_total else 0.0,
            "employee_count": result.employee_count or 0,
            "transaction_count": result.transaction_count or 0,
            "by_category": by_category
        }
    except Exception as e:
        print(f"Error getting summary: {e}")
        return {"grand_total": 0, "employee_count": 0, "transaction_count": 0, "by_category": {}}


def get_available_years() -> List[int]:
    """Get list of years with data"""
    client = get_bigquery_client()
    
    query = f"""
        SELECT DISTINCT year
        FROM `{FULL_TABLE_ID}`
        WHERE year IS NOT NULL
        ORDER BY year DESC
    """
    
    try:
        result = client.query(query).result()
        return [row.year for row in result]
    except Exception as e:
        print(f"Error getting years: {e}")
        return [2025]


def get_categories() -> List[str]:
    """Get list of unique categories"""
    client = get_bigquery_client()
    
    query = f"""
        SELECT DISTINCT category
        FROM `{FULL_TABLE_ID}`
        WHERE category IS NOT NULL AND category != ''
        ORDER BY category
    """
    
    try:
        result = client.query(query).result()
        return [row.category for row in result]
    except Exception as e:
        print(f"Error getting categories: {e}")
        return []


def get_names() -> List[str]:
    """Get list of unique employee names"""
    client = get_bigquery_client()
    
    query = f"""
        SELECT DISTINCT name
        FROM `{FULL_TABLE_ID}`
        WHERE name IS NOT NULL AND name != ''
        ORDER BY name
    """
    
    try:
        result = client.query(query).result()
        return [row.name for row in result]
    except Exception as e:
        print(f"Error getting names: {e}")
        return []


def get_vendors() -> List[str]:
    """Get list of unique vendors"""
    client = get_bigquery_client()
    
    query = f"""
        SELECT DISTINCT vendor
        FROM `{FULL_TABLE_ID}`
        WHERE vendor IS NOT NULL AND vendor != ''
        ORDER BY vendor
    """
    
    try:
        result = client.query(query).result()
        return [row.vendor for row in result]
    except Exception as e:
        print(f"Error getting vendors: {e}")
        return []


def get_monthly_breakdown(year: int, name: Optional[str] = None) -> List[Dict[str, Any]]:
    """
    Get expenses broken down by month
    """
    client = get_bigquery_client()
    
    name_filter = f"AND name = '{name}'" if name else ""
    
    query = f"""
        SELECT 
            month,
            category,
            SUM(amount) as total
        FROM `{FULL_TABLE_ID}`
        WHERE year = {year} {name_filter}
        GROUP BY month, category
        ORDER BY month, category
    """
    
    try:
        result = client.query(query).result()
        
        # Organize by month
        by_month = {}
        for row in result:
            month = row.month
            if month not in by_month:
                by_month[month] = {"month": month, "total": 0.0, "categories": {}}
            by_month[month]["categories"][row.category] = float(row.total)
            by_month[month]["total"] += float(row.total)
        
        return [by_month[m] for m in sorted(by_month.keys())]
    except Exception as e:
        print(f"Error getting monthly breakdown: {e}")
        return []


def add_expenses(expenses: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Add new expenses to the table
    """
    if not expenses:
        return {"success": False, "error": "No expenses provided"}
    
    client = get_bigquery_client()
    
    rows = []
    for exp in expenses:
        date_str = exp.get("date")
        if date_str:
            try:
                date_obj = datetime.strptime(date_str, "%Y-%m-%d")
                year = date_obj.year
                month = date_obj.month
            except:
                year = None
                month = None
        else:
            year = None
            month = None
        
        rows.append({
            "id": str(uuid.uuid4()),
            "created_at": datetime.utcnow().isoformat(),
            "name": exp.get("name", ""),
            "amount": float(exp.get("amount", 0)),
            "category": exp.get("category", ""),
            "date": date_str,
            "vendor": exp.get("vendor", ""),
            "year": year,
            "month": month,
        })
    
    try:
        # Use NDJSON for robust insertion
        ndjson_data = "\n".join(json.dumps(row) for row in rows)
        json_file = io.BytesIO(ndjson_data.encode('utf-8'))
        
        job_config = bigquery.LoadJobConfig(
            source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
            write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        )
        
        load_job = client.load_table_from_file(
            json_file,
            FULL_TABLE_ID,
            job_config=job_config
        )
        load_job.result()
        
        return {"success": True, "inserted": len(rows)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def delete_expense(expense_id: str) -> Dict[str, Any]:
    """Delete a single expense by ID"""
    client = get_bigquery_client()
    
    query = f"""
        DELETE FROM `{FULL_TABLE_ID}`
        WHERE id = '{expense_id}'
    """
    
    try:
        client.query(query).result()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def clear_vendor_for_credit_card_expenses() -> Dict[str, Any]:
    """
    Clear the vendor field for all Credit Card expenses.
    Credit card expenses should not have vendor - only description (which is not in valor_expenses).
    """
    client = get_bigquery_client()
    
    query = f"""
        UPDATE `{FULL_TABLE_ID}`
        SET vendor = ''
        WHERE source LIKE 'Credit Card%' AND vendor != ''
    """
    
    try:
        result = client.query(query).result()
        return {"success": True, "message": "Cleared vendor for all Credit Card expenses"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def fix_category_case() -> Dict[str, Any]:
    """
    Fix category case issues in valor_expenses.
    Converts lowercase categories to proper case (e.g., 'airfare' -> 'Airfare').
    """
    client = get_bigquery_client()
    
    # Map of wrong case -> correct case
    category_fixes = {
        'airfare': 'Airfare',
        'lodging': 'Lodging',
        'gifts': 'Gifts',
        'miscellaneous': 'Miscellaneous',
        'training': 'Training',
    }
    
    total_fixed = 0
    errors = []
    
    for wrong, correct in category_fixes.items():
        query = f"""
            UPDATE `{FULL_TABLE_ID}`
            SET category = '{correct}'
            WHERE LOWER(category) = '{wrong}' AND category != '{correct}'
        """
        
        try:
            client.query(query).result()
            
            # Count how many were fixed
            count_query = f"""
                SELECT COUNT(*) as cnt FROM `{FULL_TABLE_ID}`
                WHERE category = '{correct}'
            """
            # This is approximate but gives an idea
            total_fixed += 1
        except Exception as e:
            errors.append(f"Error fixing {wrong}: {str(e)}")
    
    return {
        "success": True,
        "message": f"Fixed category case issues",
        "categories_checked": list(category_fixes.keys()),
        "errors": errors if errors else None
    }


def update_expense(expense_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """
    Update a single valor expense by ID.
    Allowed fields: name, amount, category, date, vendor
    """
    client = get_bigquery_client()
    
    # Build SET clause with only allowed fields
    allowed_fields = ["name", "amount", "category", "date", "vendor", "project"]
    set_parts = []
    
    for field in allowed_fields:
        if field in updates:
            value = updates[field]
            if field == "amount":
                set_parts.append(f"{field} = {float(value)}")
            elif value is None:
                set_parts.append(f"{field} = NULL")
            else:
                # Escape single quotes
                escaped_value = str(value).replace("'", "\\'")
                set_parts.append(f"{field} = '{escaped_value}'")
    
    # Update year/month if date changed
    if "date" in updates and updates["date"]:
        try:
            date_obj = datetime.strptime(updates["date"], "%Y-%m-%d")
            set_parts.append(f"year = {date_obj.year}")
            set_parts.append(f"month = {date_obj.month}")
        except:
            pass
    
    if not set_parts:
        return {"success": False, "error": "No valid fields to update"}
    
    query = f"""
        UPDATE `{FULL_TABLE_ID}`
        SET {', '.join(set_parts)}
        WHERE id = '{expense_id}'
    """
    
    try:
        client.query(query).result()
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


def delete_expenses_batch(expense_ids: List[str]) -> Dict[str, Any]:
    """Delete multiple expenses by IDs in a single query"""
    if not expense_ids:
        return {"success": False, "error": "No expense IDs provided"}
    
    client = get_bigquery_client()
    
    # Build IN clause with escaped IDs
    ids_list = ", ".join([f"'{eid}'" for eid in expense_ids])
    
    query = f"""
        DELETE FROM `{FULL_TABLE_ID}`
        WHERE id IN ({ids_list})
    """
    
    try:
        client.query(query).result()
        return {"success": True, "deleted_count": len(expense_ids)}
    except Exception as e:
        return {"success": False, "error": str(e)}


def export_consolidated_by_category(year: int) -> BytesIO:
    """
    Export consolidated expenses by category to Excel with multiple sheets:
    - Summary: Total by category
    - One sheet per category with all transactions
    """
    import pandas as pd
    
    client = get_bigquery_client()
    
    # Get all expenses for the year
    query = f"""
        SELECT 
            id, name, amount, category, date, vendor, year, month, source, project
        FROM `{FULL_TABLE_ID}`
        WHERE year = {year}
        ORDER BY category, date DESC, name
    """
    
    result = client.query(query).result()
    
    expenses = []
    for row in result:
        expenses.append({
            "Name": row.name,
            "Amount": float(row.amount) if row.amount else 0.0,
            "Category": row.category,
            "Date": str(row.date) if row.date else "",
            "Vendor": row.vendor or "",
            "Source": row.source or "",
            "Project": row.project or "",
        })
    
    df = pd.DataFrame(expenses)
    
    # Create Excel file with multiple sheets
    output = BytesIO()
    
    with pd.ExcelWriter(output, engine='openpyxl') as writer:
        # Summary sheet - totals by category
        summary_df = df.groupby('Category').agg({
            'Amount': 'sum',
            'Name': 'count'
        }).rename(columns={'Name': 'Count'}).reset_index()
        summary_df = summary_df.sort_values('Amount', ascending=False)
        summary_df['Amount'] = summary_df['Amount'].round(2)
        
        # Add total row
        total_row = pd.DataFrame({
            'Category': ['TOTAL'],
            'Amount': [summary_df['Amount'].sum()],
            'Count': [summary_df['Count'].sum()]
        })
        summary_df = pd.concat([summary_df, total_row], ignore_index=True)
        
        summary_df.to_excel(writer, sheet_name='Summary', index=False)
        
        # Format Summary sheet
        ws_summary = writer.sheets['Summary']
        ws_summary.column_dimensions['A'].width = 40
        ws_summary.column_dimensions['B'].width = 15
        ws_summary.column_dimensions['C'].width = 10
        
        # One sheet per category
        categories = df['Category'].unique()
        for category in sorted(categories):
            cat_df = df[df['Category'] == category].copy()
            cat_df = cat_df.drop(columns=['Category'])  # Already in sheet name
            cat_df['Amount'] = cat_df['Amount'].round(2)
            
            # Clean sheet name (Excel has restrictions)
            sheet_name = category[:31].replace('/', '-').replace('\\', '-').replace('*', '').replace('?', '').replace('[', '').replace(']', '')
            
            cat_df.to_excel(writer, sheet_name=sheet_name, index=False)
            
            # Format sheet
            ws = writer.sheets[sheet_name]
            ws.column_dimensions['A'].width = 25  # Name
            ws.column_dimensions['B'].width = 12  # Amount
            ws.column_dimensions['C'].width = 12  # Date
            ws.column_dimensions['D'].width = 30  # Vendor
            ws.column_dimensions['E'].width = 15  # Source
            ws.column_dimensions['F'].width = 15  # Project
        
        # All transactions sheet
        all_df = df.copy()
        all_df['Amount'] = all_df['Amount'].round(2)
        all_df = all_df.sort_values(['Category', 'Date', 'Name'])
        all_df.to_excel(writer, sheet_name='All Transactions', index=False)
        
        ws_all = writer.sheets['All Transactions']
        ws_all.column_dimensions['A'].width = 25
        ws_all.column_dimensions['B'].width = 12
        ws_all.column_dimensions['C'].width = 40
        ws_all.column_dimensions['D'].width = 12
        ws_all.column_dimensions['E'].width = 30
        ws_all.column_dimensions['F'].width = 15
        ws_all.column_dimensions['G'].width = 15
    
    output.seek(0)
    return output

