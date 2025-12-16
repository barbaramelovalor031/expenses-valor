"""
Credit Card Expenses Service - Manages credit card expenses with sync to valor_expenses.
Table structure: id, created_at, date, credit_card, description, user, category, amount, year, month, synced_to_valor
"""

from google.cloud import bigquery
from google.oauth2 import service_account
import os
import io
import json
import uuid
from datetime import datetime
from typing import List, Optional, Dict, Any

# BigQuery configuration
PROJECT_ID = "automatic-bond-462415-h6"
DATASET_ID = "finance"
CREDIT_CARD_TABLE = "credit_card_expenses"
VALOR_TABLE = "valor_expenses"
FULL_CC_TABLE_ID = f"{PROJECT_ID}.{DATASET_ID}.{CREDIT_CARD_TABLE}"
FULL_VALOR_TABLE_ID = f"{PROJECT_ID}.{DATASET_ID}.{VALOR_TABLE}"

# Valid credit cards
VALID_CREDIT_CARDS = ["Amex", "SVB", "Bradesco"]


def get_bigquery_client():
    """Get BigQuery client with credentials"""
    credentials_path = os.path.join(os.path.dirname(__file__), '..', 'credentials', 'bq-service-account.json')
    if os.path.exists(credentials_path):
        credentials = service_account.Credentials.from_service_account_file(credentials_path)
        return bigquery.Client(credentials=credentials, project=PROJECT_ID)
    return bigquery.Client(project=PROJECT_ID)


def get_all_credit_card_expenses(
    year: Optional[int] = None,
    credit_card: Optional[str] = None,
    user: Optional[str] = None,
    category: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get all credit card expenses with optional filters.
    """
    client = get_bigquery_client()
    
    conditions = []
    params = []
    
    if year:
        conditions.append("year = @year")
        params.append(bigquery.ScalarQueryParameter("year", "INT64", year))
    
    if credit_card:
        conditions.append("credit_card = @credit_card")
        params.append(bigquery.ScalarQueryParameter("credit_card", "STRING", credit_card))
    
    if user:
        conditions.append("user = @user")
        params.append(bigquery.ScalarQueryParameter("user", "STRING", user))
    
    if category:
        conditions.append("category = @category")
        params.append(bigquery.ScalarQueryParameter("category", "STRING", category))
    
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    
    query = f"""
        SELECT id, created_at, date, credit_card, description, user, category, amount, year, month, synced_to_valor, comments, project
        FROM `{FULL_CC_TABLE_ID}`
        {where_clause}
        ORDER BY date DESC, created_at DESC
    """
    
    job_config = bigquery.QueryJobConfig(query_parameters=params) if params else None
    result = client.query(query, job_config=job_config).result()
    
    return [
        {
            "id": row.id,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "date": row.date.isoformat() if row.date else None,
            "credit_card": row.credit_card,
            "description": row.description,
            "user": row.user,
            "category": row.category,
            "amount": float(row.amount) if row.amount else 0,
            "year": row.year,
            "month": row.month,
            "synced_to_valor": row.synced_to_valor or False,
            "comments": row.comments or "",
            "project": row.project or ""
        }
        for row in result
    ]


def get_credit_card_summary() -> Dict[str, Any]:
    """Get summary statistics for credit card expenses."""
    client = get_bigquery_client()
    
    query = f"""
        SELECT 
            credit_card,
            COUNT(*) as count,
            SUM(amount) as total,
            COUNT(DISTINCT user) as unique_users,
            COUNT(DISTINCT category) as unique_categories
        FROM `{FULL_CC_TABLE_ID}`
        GROUP BY credit_card
        ORDER BY total DESC
    """
    
    result = list(client.query(query).result())
    
    by_card = {
        row.credit_card: {
            "count": row.count,
            "total": float(row.total) if row.total else 0,
            "unique_users": row.unique_users,
            "unique_categories": row.unique_categories
        }
        for row in result
    }
    
    # Get totals
    total_query = f"""
        SELECT 
            COUNT(*) as total_count,
            SUM(amount) as total_amount,
            COUNT(DISTINCT user) as total_users,
            SUM(CASE WHEN synced_to_valor THEN 1 ELSE 0 END) as synced_count
        FROM `{FULL_CC_TABLE_ID}`
    """
    
    total_result = list(client.query(total_query).result())[0]
    
    return {
        "by_card": by_card,
        "totals": {
            "count": total_result.total_count or 0,
            "amount": float(total_result.total_amount) if total_result.total_amount else 0,
            "users": total_result.total_users or 0,
            "synced": total_result.synced_count or 0
        }
    }


def get_unique_users() -> List[str]:
    """Get list of unique users from credit card expenses."""
    client = get_bigquery_client()
    
    query = f"""
        SELECT DISTINCT user
        FROM `{FULL_CC_TABLE_ID}`
        WHERE user IS NOT NULL AND user != ''
        ORDER BY user
    """
    
    result = client.query(query).result()
    return [row.user for row in result]


def get_unique_categories() -> List[str]:
    """Get list of unique categories from credit card expenses."""
    client = get_bigquery_client()
    
    query = f"""
        SELECT DISTINCT category
        FROM `{FULL_CC_TABLE_ID}`
        WHERE category IS NOT NULL AND category != ''
        ORDER BY category
    """
    
    result = client.query(query).result()
    return [row.category for row in result]


def get_available_years() -> List[int]:
    """Get list of years with credit card expenses."""
    client = get_bigquery_client()
    
    query = f"""
        SELECT DISTINCT year
        FROM `{FULL_CC_TABLE_ID}`
        WHERE year IS NOT NULL
        ORDER BY year DESC
    """
    
    result = client.query(query).result()
    return [row.year for row in result]


def add_credit_card_expense(
    date: str,
    credit_card: str,
    description: str,
    user: str,
    category: str,
    amount: float,
    comments: str = ""
) -> Dict[str, Any]:
    """
    Add a single credit card expense.
    """
    client = get_bigquery_client()
    
    # Parse date
    try:
        dt = datetime.strptime(date, "%Y-%m-%d")
        year = dt.year
        month = dt.month
    except:
        return {"success": False, "error": "Invalid date format. Use YYYY-MM-DD"}
    
    # Validate credit card
    if credit_card not in VALID_CREDIT_CARDS:
        return {"success": False, "error": f"Invalid credit card. Use: {', '.join(VALID_CREDIT_CARDS)}"}
    
    expense_id = str(uuid.uuid4())
    
    row = {
        "id": expense_id,
        "created_at": datetime.utcnow().isoformat(),
        "date": date,
        "credit_card": credit_card,
        "description": description or "",
        "user": user,
        "category": category,
        "amount": float(amount),
        "year": year,
        "month": month,
        "synced_to_valor": False,
        "comments": comments or ""
    }
    
    try:
        ndjson_data = json.dumps(row)
        json_file = io.BytesIO(ndjson_data.encode('utf-8'))
        
        job_config = bigquery.LoadJobConfig(
            source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
            write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        )
        
        load_job = client.load_table_from_file(
            json_file,
            FULL_CC_TABLE_ID,
            job_config=job_config
        )
        load_job.result()
        
        return {"success": True, "id": expense_id, "expense": row}
        
    except Exception as e:
        return {"success": False, "error": str(e)}


def add_credit_card_expenses_batch(expenses: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Add multiple credit card expenses at once.
    """
    client = get_bigquery_client()
    
    rows_to_insert = []
    errors = []
    
    for i, exp in enumerate(expenses):
        try:
            date = exp.get("date")
            dt = datetime.strptime(date, "%Y-%m-%d")
            year = dt.year
            month = dt.month
            
            credit_card = exp.get("credit_card")
            if credit_card not in VALID_CREDIT_CARDS:
                errors.append(f"Row {i+1}: Invalid credit card '{credit_card}'")
                continue
            
            rows_to_insert.append({
                "id": str(uuid.uuid4()),
                "created_at": datetime.utcnow().isoformat(),
                "date": date,
                "credit_card": credit_card,
                "description": exp.get("description", "") or "",
                "user": exp.get("user", ""),
                "category": exp.get("category", ""),
                "amount": float(exp.get("amount", 0)),
                "year": year,
                "month": month,
                "synced_to_valor": False,
                "comments": exp.get("comments", "") or ""
            })
        except Exception as e:
            errors.append(f"Row {i+1}: {str(e)}")
    
    if not rows_to_insert:
        return {"success": False, "error": "No valid expenses to add", "errors": errors}
    
    try:
        ndjson_data = "\n".join(json.dumps(row) for row in rows_to_insert)
        json_file = io.BytesIO(ndjson_data.encode('utf-8'))
        
        job_config = bigquery.LoadJobConfig(
            source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
            write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        )
        
        load_job = client.load_table_from_file(
            json_file,
            FULL_CC_TABLE_ID,
            job_config=job_config
        )
        load_job.result()
        
        return {
            "success": True,
            "added_count": len(rows_to_insert),
            "errors": errors if errors else None
        }
        
    except Exception as e:
        return {"success": False, "error": str(e), "errors": errors}


def update_credit_card_expense(
    expense_id: str,
    updates: Dict[str, Any]
) -> Dict[str, Any]:
    """
    Update a credit card expense.
    If the expense is already synced to valor_expenses and category/user/amount changes,
    also updates the valor_expenses record.
    """
    client = get_bigquery_client()
    
    # First, get current expense data to check if synced
    get_query = f"""
        SELECT id, date, credit_card, user, category, amount, synced_to_valor
        FROM `{FULL_CC_TABLE_ID}`
        WHERE id = @id
    """
    get_config = bigquery.QueryJobConfig(
        query_parameters=[bigquery.ScalarQueryParameter("id", "STRING", expense_id)]
    )
    current_result = list(client.query(get_query, job_config=get_config).result())
    
    if not current_result:
        return {"success": False, "error": "Expense not found"}
    
    current_expense = current_result[0]
    was_synced = current_expense.synced_to_valor
    
    # Build SET clause
    set_clauses = []
    params = [bigquery.ScalarQueryParameter("id", "STRING", expense_id)]
    
    allowed_fields = ["date", "credit_card", "description", "user", "category", "amount", "comments", "project"]
    
    for field, value in updates.items():
        if field not in allowed_fields:
            continue
            
        if field == "date":
            try:
                dt = datetime.strptime(value, "%Y-%m-%d")
                set_clauses.append(f"date = @date")
                set_clauses.append(f"year = {dt.year}")
                set_clauses.append(f"month = {dt.month}")
                params.append(bigquery.ScalarQueryParameter("date", "DATE", value))
            except:
                return {"success": False, "error": "Invalid date format"}
        elif field == "credit_card":
            if value not in VALID_CREDIT_CARDS:
                return {"success": False, "error": f"Invalid credit card. Use: {', '.join(VALID_CREDIT_CARDS)}"}
            set_clauses.append(f"credit_card = @credit_card")
            params.append(bigquery.ScalarQueryParameter("credit_card", "STRING", value))
        elif field == "amount":
            set_clauses.append(f"amount = @amount")
            params.append(bigquery.ScalarQueryParameter("amount", "FLOAT64", float(value)))
        else:
            set_clauses.append(f"{field} = @{field}")
            params.append(bigquery.ScalarQueryParameter(field, "STRING", str(value)))
    
    if not set_clauses:
        return {"success": False, "error": "No valid fields to update"}
    
    try:
        # Update credit_card_expenses (keep synced_to_valor = TRUE if was synced)
        query = f"""
            UPDATE `{FULL_CC_TABLE_ID}`
            SET {', '.join(set_clauses)}
            WHERE id = @id
        """
        
        job_config = bigquery.QueryJobConfig(query_parameters=params)
        client.query(query, job_config=job_config).result()
        
        # Always update valor_expenses using cc_{id} pattern (sync)
        valor_updated = False
        valor_id = f"cc_{expense_id}"
        valor_set_clauses = []
        valor_params = [bigquery.ScalarQueryParameter("valor_id", "STRING", valor_id)]
        
        # Update fields that changed
        if 'category' in updates:
            valor_set_clauses.append("category = @new_category")
            valor_params.append(bigquery.ScalarQueryParameter("new_category", "STRING", updates['category']))
        
        if 'user' in updates:
            valor_set_clauses.append("name = @new_name")
            valor_params.append(bigquery.ScalarQueryParameter("new_name", "STRING", updates['user']))
        
        if 'amount' in updates:
            valor_set_clauses.append("amount = @new_amount")
            valor_params.append(bigquery.ScalarQueryParameter("new_amount", "FLOAT64", float(updates['amount'])))
        
        if 'project' in updates:
            valor_set_clauses.append("project = @new_project")
            valor_params.append(bigquery.ScalarQueryParameter("new_project", "STRING", updates['project']))
        
        if 'date' in updates:
            valor_set_clauses.append("date = @new_date")
            valor_params.append(bigquery.ScalarQueryParameter("new_date", "DATE", updates['date']))
            # Also update year and month
            try:
                dt = datetime.strptime(updates['date'], "%Y-%m-%d")
                valor_set_clauses.append(f"year = {dt.year}")
                valor_set_clauses.append(f"month = {dt.month}")
            except:
                pass
        
        if valor_set_clauses:
            valor_update_query = f"""
                UPDATE `{FULL_VALOR_TABLE_ID}`
                SET {', '.join(valor_set_clauses)}
                WHERE id = @valor_id
            """
            
            valor_config = bigquery.QueryJobConfig(query_parameters=valor_params)
            result = client.query(valor_update_query, job_config=valor_config).result()
            valor_updated = True
        
        return {"success": True, "id": expense_id, "valor_updated": valor_updated}
        
    except Exception as e:
        return {"success": False, "error": str(e)}


def delete_credit_card_expense(expense_id: str) -> Dict[str, Any]:
    """
    Delete a credit card expense. Also removes from valor_expenses if synced.
    """
    client = get_bigquery_client()
    
    try:
        # First get the expense to check if synced
        query = f"""
            SELECT id, date, user, category, amount, synced_to_valor
            FROM `{FULL_CC_TABLE_ID}`
            WHERE id = @id
        """
        job_config = bigquery.QueryJobConfig(
            query_parameters=[bigquery.ScalarQueryParameter("id", "STRING", expense_id)]
        )
        result = list(client.query(query, job_config=job_config).result())
        
        if not result:
            return {"success": False, "error": "Expense not found"}
        
        expense = result[0]
        
        # Delete from credit_card_expenses
        delete_query = f"""
            DELETE FROM `{FULL_CC_TABLE_ID}`
            WHERE id = @id
        """
        client.query(delete_query, job_config=job_config).result()
        
        # If synced, also delete from valor_expenses
        valor_deleted = False
        if expense.synced_to_valor:
            try:
                valor_query = f"""
                    DELETE FROM `{FULL_VALOR_TABLE_ID}`
                    WHERE source LIKE 'Credit Card%'
                    AND name = @name
                    AND date = @date
                    AND amount = @amount
                    AND category = @category
                """
                valor_params = [
                    bigquery.ScalarQueryParameter("name", "STRING", expense.user),
                    bigquery.ScalarQueryParameter("date", "DATE", expense.date),
                    bigquery.ScalarQueryParameter("amount", "FLOAT64", expense.amount),
                    bigquery.ScalarQueryParameter("category", "STRING", expense.category),
                ]
                valor_config = bigquery.QueryJobConfig(query_parameters=valor_params)
                client.query(valor_query, job_config=valor_config).result()
                valor_deleted = True
            except Exception as e:
                print(f"Warning: Could not delete from valor_expenses: {e}")
        
        return {
            "success": True,
            "id": expense_id,
            "valor_deleted": valor_deleted
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}


def delete_credit_card_expenses_batch(expense_ids: List[str]) -> Dict[str, Any]:
    """
    Delete multiple credit card expenses at once. Much faster than individual deletes.
    Also removes from valor_expenses if synced.
    """
    if not expense_ids:
        return {"success": True, "deleted_count": 0, "valor_deleted_count": 0}
    
    client = get_bigquery_client()
    
    try:
        # Get all expenses to check which are synced
        placeholders = ", ".join([f"'{id}'" for id in expense_ids])
        
        query = f"""
            SELECT id, date, user, category, amount, synced_to_valor
            FROM `{FULL_CC_TABLE_ID}`
            WHERE id IN ({placeholders})
        """
        expenses = list(client.query(query).result())
        
        if not expenses:
            return {"success": True, "deleted_count": 0, "valor_deleted_count": 0}
        
        # Collect synced expenses for valor deletion
        synced_expenses = [e for e in expenses if e.synced_to_valor]
        
        # Delete all from credit_card_expenses in one query
        delete_query = f"""
            DELETE FROM `{FULL_CC_TABLE_ID}`
            WHERE id IN ({placeholders})
        """
        client.query(delete_query).result()
        
        # Delete synced ones from valor_expenses
        valor_deleted_count = 0
        if synced_expenses:
            # Build OR conditions for each expense
            conditions = []
            for exp in synced_expenses:
                date_str = exp.date.strftime('%Y-%m-%d') if hasattr(exp.date, 'strftime') else str(exp.date)
                conditions.append(
                    f"(name = '{exp.user}' AND date = '{date_str}' AND amount = {exp.amount} AND category = '{exp.category}')"
                )
            
            if conditions:
                valor_query = f"""
                    DELETE FROM `{FULL_VALOR_TABLE_ID}`
                    WHERE source LIKE 'Credit Card%'
                    AND ({' OR '.join(conditions)})
                """
                try:
                    client.query(valor_query).result()
                    valor_deleted_count = len(synced_expenses)
                except Exception as e:
                    print(f"Warning: Could not delete from valor_expenses: {e}")
        
        return {
            "success": True,
            "deleted_count": len(expenses),
            "valor_deleted_count": valor_deleted_count
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}


def sync_to_valor_expenses() -> Dict[str, Any]:
    """
    Sync all credit card expenses to valor_expenses table using MERGE (upsert).
    - If cc_<id> exists in valor_expenses -> UPDATE the record
    - If cc_<id> doesn't exist -> INSERT new record
    Source will be 'Credit Card - {card_type}' (e.g., 'Credit Card - Amex')
    NOTE: Expenses with category 'Firm Uber' or empty category are excluded from sync.
    """
    client = get_bigquery_client()
    
    try:
        # Get all expenses that should be synced (excluding 'Firm Uber' and empty categories)
        query = f"""
            SELECT id, date, credit_card, description, user, category, amount, year, month, project
            FROM `{FULL_CC_TABLE_ID}`
            WHERE category != 'Firm Uber'
            AND category IS NOT NULL
            AND TRIM(category) != ''
        """
        
        result = list(client.query(query).result())
        
        if not result:
            return {"success": True, "synced_count": 0, "message": "No expenses to sync"}
        
        # Use MERGE to upsert - this prevents duplicates!
        # Process in batches
        batch_size = 100
        total_synced = 0
        
        for i in range(0, len(result), batch_size):
            batch = result[i:i+batch_size]
            
            # Build VALUES for the merge
            values_parts = []
            for row in batch:
                valor_id = f"cc_{row.id}"
                date_str = row.date.isoformat() if row.date else None
                amount = float(row.amount) if row.amount else 0
                # Escape single quotes in strings
                name = (row.user or "").replace("'", "\\'")
                category = (row.category or "").replace("'", "\\'")
                project = (row.project or "").replace("'", "\\'")
                source = f"Credit Card - {row.credit_card}"
                
                values_parts.append(f"""
                    ('{valor_id}', '{name}', {amount}, '{category}', '{date_str}', '', {row.year}, {row.month}, '{source}', '{project}')
                """)
            
            values_sql = ",".join(values_parts)
            
            merge_query = f"""
                MERGE `{FULL_VALOR_TABLE_ID}` AS target
                USING (
                    SELECT * FROM UNNEST([
                        STRUCT<id STRING, name STRING, amount FLOAT64, category STRING, date STRING, vendor STRING, year INT64, month INT64, source STRING, project STRING>
                        {values_sql}
                    ])
                ) AS source
                ON target.id = source.id
                WHEN MATCHED THEN
                    UPDATE SET
                        name = source.name,
                        amount = source.amount,
                        category = source.category,
                        date = PARSE_DATE('%Y-%m-%d', source.date),
                        year = source.year,
                        month = source.month,
                        source = source.source,
                        project = source.project
                WHEN NOT MATCHED THEN
                    INSERT (id, created_at, name, amount, category, date, vendor, year, month, source, project)
                    VALUES (source.id, CURRENT_TIMESTAMP(), source.name, source.amount, source.category, 
                            PARSE_DATE('%Y-%m-%d', source.date), source.vendor, source.year, source.month, source.source, source.project)
            """
            
            client.query(merge_query).result()
            total_synced += len(batch)
        
        # Mark all as synced in credit_card_expenses
        cc_ids = [row.id for row in result]
        batch_size = 500
        for i in range(0, len(cc_ids), batch_size):
            batch = cc_ids[i:i+batch_size]
            ids_str = ", ".join(f"'{id}'" for id in batch)
            
            update_query = f"""
                UPDATE `{FULL_CC_TABLE_ID}`
                SET synced_to_valor = TRUE
                WHERE id IN ({ids_str})
            """
            client.query(update_query).result()
        
        return {
            "success": True,
            "synced_count": total_synced,
            "message": f"Synced {total_synced} expenses to valor_expenses (using MERGE - no duplicates)"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}


# Legacy functions for backward compatibility
def get_credit_card_expenses(year: Optional[int] = None, batch_id: Optional[str] = None) -> dict:
    """Legacy function - returns expenses in old format."""
    expenses = get_all_credit_card_expenses(year=year)
    return {"expenses": expenses}


def get_credit_card_batches(year: Optional[int] = None) -> dict:
    """Legacy function - returns batches grouped by credit card."""
    summary = get_credit_card_summary()
    batches = []
    
    for card, data in summary.get("by_card", {}).items():
        batches.append({
            "batch_id": card.lower(),
            "year": year or datetime.now().year,
            "source": card,
            "created_at": datetime.utcnow().isoformat(),
            "transaction_count": data["count"],
            "employee_count": data["unique_users"],
            "total_amount": data["total"],
            "categories": []
        })
    
    return {"batches": batches}


def delete_credit_card_batch(batch_id: str) -> dict:
    """Legacy function - delete by credit card type."""
    # This function is not used in new implementation
    return {"success": False, "error": "Use delete_credit_card_expense instead"}


def add_credit_card_expenses(transactions: list, year: int, source: str = "AMEX") -> dict:
    """Legacy function for backward compatibility."""
    expenses = []
    for tx in transactions:
        expenses.append({
            "date": tx.get("transaction_date", f"{year}-01-01"),
            "credit_card": source if source in VALID_CREDIT_CARDS else "Amex",
            "description": tx.get("description", ""),
            "user": tx.get("employee_name", ""),
            "category": tx.get("category", ""),
            "amount": tx.get("amount", 0)
        })
    
    return add_credit_card_expenses_batch(expenses)


def apply_firm_uber_rule() -> Dict[str, Any]:
    """
    Apply the Firm Uber rule: 
    If description contains 'UBER' and user is 'Doug Smith', set category to 'Firm Uber'.
    This category is invalid and won't be synced to consolidated expenses.
    """
    client = get_bigquery_client()
    
    try:
        # Update all matching records
        query = f"""
            UPDATE `{FULL_CC_TABLE_ID}`
            SET category = 'Firm Uber'
            WHERE UPPER(description) LIKE '%UBER%'
            AND user = 'Doug Smith'
            AND category != 'Firm Uber'
        """
        
        result = client.query(query).result()
        
        # Count how many were updated
        count_query = f"""
            SELECT COUNT(*) as count
            FROM `{FULL_CC_TABLE_ID}`
            WHERE category = 'Firm Uber'
        """
        count_result = list(client.query(count_query).result())
        total_firm_uber = count_result[0].count if count_result else 0
        
        return {
            "success": True,
            "message": f"Applied Firm Uber rule. Total 'Firm Uber' transactions: {total_firm_uber}"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}
