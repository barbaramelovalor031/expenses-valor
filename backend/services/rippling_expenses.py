"""
Rippling Expenses Service - New format compatible with valor_expenses
Syncs with valor_expenses table (main consolidated expenses)
Uses batch load (load_table_from_file) instead of streaming for immediate DML operations
"""

from google.cloud import bigquery
from google.oauth2 import service_account
import os
import uuid
import json
import io
from datetime import datetime
from typing import List, Dict, Optional
import pandas as pd
from io import BytesIO

# BigQuery configuration
PROJECT_ID = "automatic-bond-462415-h6"
DATASET_ID = "finance"
RIPPLING_TABLE = "rippling_expenses"
EMPLOYEES_TABLE = "rippling_employees"
VALOR_TABLE = "valor_expenses"  # Main consolidated table

FULL_RIPPLING_TABLE = f"{PROJECT_ID}.{DATASET_ID}.{RIPPLING_TABLE}"
FULL_EMPLOYEES_TABLE = f"{PROJECT_ID}.{DATASET_ID}.{EMPLOYEES_TABLE}"
FULL_VALOR_TABLE = f"{PROJECT_ID}.{DATASET_ID}.{VALOR_TABLE}"


def get_bigquery_client():
    """Get BigQuery client with credentials"""
    credentials_path = os.path.join(os.path.dirname(__file__), '..', 'credentials', 'bq-service-account.json')
    if os.path.exists(credentials_path):
        credentials = service_account.Credentials.from_service_account_file(credentials_path)
        return bigquery.Client(credentials=credentials, project=PROJECT_ID)
    return bigquery.Client(project=PROJECT_ID)


def get_employee_mapping() -> Dict[str, dict]:
    """
    Busca mapeamento de funcionários do BigQuery.
    Retorna dict: rippling_name (lowercase) -> {display_name, employee_type}
    """
    client = get_bigquery_client()
    query = f"""
        SELECT rippling_name, display_name, employee_type
        FROM `{FULL_EMPLOYEES_TABLE}`
    """
    try:
        result = client.query(query).result()
        mapping = {}
        for row in result:
            key = row.rippling_name.strip().lower() if row.rippling_name else ""
            mapping[key] = {
                "display_name": row.display_name,
                "employee_type": row.employee_type,
                "original": row.rippling_name
            }
        return mapping
    except Exception as e:
        print(f"[ERROR] Failed to get employee mapping: {e}")
        return {}


def normalize_name(name: str) -> str:
    """Normaliza nome para comparação"""
    if not name:
        return ""
    return name.strip().lower()


def parse_rippling_file(file_content: bytes, filename: str) -> List[Dict]:
    """
    Parse arquivo Rippling (xlsx ou csv).
    Formato esperado:
    Employee | Vendor name | Amount - Currency | Amount | Category name | Purchase date | Object type | Approval state | Receipt filepath
    """
    try:
        if filename.lower().endswith('.csv'):
            df = pd.read_csv(BytesIO(file_content))
        else:
            df = pd.read_excel(BytesIO(file_content))
        
        # Mapear colunas
        column_mapping = {
            'Employee': 'employee',
            'Vendor name': 'vendor_name',
            'Amount - Currency': 'currency',
            'Amount': 'amount',
            'Category name': 'category',
            'Purchase date': 'purchase_date',
            'Object type': 'object_type',
            'Approval state': 'approval_state',
            'Receipt filepath': 'receipt_filepath'
        }
        
        df = df.rename(columns=column_mapping)
        
        transactions = []
        for _, row in df.iterrows():
            # Parse date
            purchase_date = None
            date_value = row.get('purchase_date')
            if pd.notna(date_value):
                if isinstance(date_value, str):
                    try:
                        purchase_date = datetime.strptime(date_value, '%Y-%m-%d').date()
                    except:
                        try:
                            purchase_date = datetime.strptime(date_value, '%m/%d/%Y').date()
                        except:
                            pass
                elif hasattr(date_value, 'date'):
                    purchase_date = date_value.date()
            
            tx = {
                'employee': str(row.get('employee', '')).strip() if pd.notna(row.get('employee')) else '',
                'vendor_name': str(row.get('vendor_name', '')).strip() if pd.notna(row.get('vendor_name')) else '',
                'currency': str(row.get('currency', 'USD')).strip() if pd.notna(row.get('currency')) else 'USD',
                'amount': float(row.get('amount', 0)) if pd.notna(row.get('amount')) else 0,
                'category': str(row.get('category', '')).strip() if pd.notna(row.get('category')) else '',
                'purchase_date': purchase_date,
                'object_type': str(row.get('object_type', '')).strip() if pd.notna(row.get('object_type')) else '',
                'approval_state': str(row.get('approval_state', '')).strip() if pd.notna(row.get('approval_state')) else '',
                'receipt_filepath': str(row.get('receipt_filepath', '')).strip() if pd.notna(row.get('receipt_filepath')) else ''
            }
            
            # Criar chave única
            date_str = str(purchase_date) if purchase_date else ''
            tx['unique_key'] = f"{tx['employee']}|{tx['vendor_name']}|{tx['amount']}|{date_str}|{tx['category']}"
            
            transactions.append(tx)
        
        return transactions
        
    except Exception as e:
        print(f"[ERROR] Failed to parse file: {e}")
        raise


def check_existing_records(unique_keys: List[str]) -> set:
    """Verifica quais registros já existem"""
    if not unique_keys:
        return set()
    
    client = get_bigquery_client()
    
    query = f"""
        SELECT unique_key
        FROM `{FULL_RIPPLING_TABLE}`
        WHERE unique_key IN UNNEST(@keys)
    """
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ArrayQueryParameter("keys", "STRING", unique_keys)
        ]
    )
    
    result = client.query(query, job_config=job_config).result()
    return {row.unique_key for row in result}


def upload_rippling_expenses(transactions: List[Dict], year: int = None) -> Dict:
    """
    Upload transações do Rippling.
    1. Faz mapping de employees
    2. Insere em rippling_expenses
    3. Sincroniza com valor_expenses (tabela principal)
    
    Usa load_table_from_file (batch) para permitir DELETE/UPDATE imediatos
    """
    if not transactions:
        return {"success": False, "error": "No transactions provided"}
    
    client = get_bigquery_client()
    employee_mapping = get_employee_mapping()
    
    # Verificar duplicatas
    unique_keys = [tx.get('unique_key', '') for tx in transactions]
    existing_keys = check_existing_records(unique_keys)
    
    # Filtrar novas transações
    new_transactions = [tx for tx in transactions if tx.get('unique_key') not in existing_keys]
    
    if not new_transactions:
        return {
            "success": True,
            "message": "All transactions already exist",
            "total": len(transactions),
            "duplicates": len(transactions),
            "inserted": 0
        }
    
    batch_id = str(uuid.uuid4())[:8]
    rippling_rows = []
    valor_rows = []
    unmapped_employees = set()
    
    for tx in new_transactions:
        tx_id = str(uuid.uuid4())
        valor_id = str(uuid.uuid4())
        
        # Employee mapping
        employee_original = tx.get('employee_original') or tx.get('employee', '')
        employee_key = normalize_name(employee_original)
        
        if tx.get('name'):
            # Já mapeado pelo frontend
            mapped_name = tx['name']
            employee_type = tx.get('employee_type', 'Unknown')
        elif employee_key in employee_mapping:
            mapped_name = employee_mapping[employee_key]['display_name']
            employee_type = employee_mapping[employee_key]['employee_type']
        else:
            mapped_name = employee_original
            employee_type = 'Unknown'
            if employee_original:
                unmapped_employees.add(employee_original)
        
        # Parse date
        purchase_date = tx.get('purchase_date')
        if purchase_date:
            if isinstance(purchase_date, str):
                date_str = purchase_date[:10]
                try:
                    dt = datetime.strptime(date_str, '%Y-%m-%d')
                    tx_year = dt.year
                    tx_month = dt.month
                except:
                    tx_year = year or datetime.now().year
                    tx_month = None
            else:
                date_str = purchase_date.isoformat() if hasattr(purchase_date, 'isoformat') else str(purchase_date)[:10]
                tx_year = purchase_date.year if hasattr(purchase_date, 'year') else (year or datetime.now().year)
                tx_month = purchase_date.month if hasattr(purchase_date, 'month') else None
        else:
            date_str = None
            tx_year = year or datetime.now().year
            tx_month = None
        
        category = tx.get('category', '')
        amount = float(tx.get('amount', 0) or 0)
        
        # Row para rippling_expenses
        rippling_rows.append({
            "id": tx_id,
            "created_at": datetime.utcnow().isoformat(),
            "name": mapped_name,
            "amount": amount,
            "category": category,
            "date": date_str,
            "vendor": "",  # Rippling não tem vendor separado
            "year": tx_year,
            "month": tx_month,
            "batch_id": batch_id,
            "employee_original": employee_original,
            "employee_type": employee_type,
            "vendor_name": tx.get('vendor_name', ''),
            "currency": tx.get('currency', 'USD'),
            "object_type": tx.get('object_type', ''),
            "approval_state": tx.get('approval_state', ''),
            "receipt_filepath": tx.get('receipt_filepath', ''),
            "unique_key": tx.get('unique_key', ''),
            "valor_expense_id": valor_id,
        })
        
        # Row para valor_expenses (tabela principal)
        vendor_name = tx.get('vendor_name', '') or ''
        valor_rows.append({
            "id": valor_id,
            "created_at": datetime.utcnow().isoformat(),
            "name": mapped_name,
            "amount": amount,
            "category": category,
            "date": date_str,
            "vendor": vendor_name,  # Usar o nome real do vendor
            "year": tx_year,
            "month": tx_month,
            "source": "Rippling",  # Identificar origem
        })
    
    try:
        # 1. Inserir em rippling_expenses (batch load)
        ndjson_rippling = "\n".join(json.dumps(row) for row in rippling_rows)
        json_file = io.BytesIO(ndjson_rippling.encode('utf-8'))
        
        job_config = bigquery.LoadJobConfig(
            source_format=bigquery.SourceFormat.NEWLINE_DELIMITED_JSON,
            write_disposition=bigquery.WriteDisposition.WRITE_APPEND,
        )
        
        load_job = client.load_table_from_file(json_file, FULL_RIPPLING_TABLE, job_config=job_config)
        load_job.result()
        
        # 2. Inserir em valor_expenses (sync)
        ndjson_valor = "\n".join(json.dumps(row) for row in valor_rows)
        valor_file = io.BytesIO(ndjson_valor.encode('utf-8'))
        
        valor_job = client.load_table_from_file(valor_file, FULL_VALOR_TABLE, job_config=job_config)
        valor_job.result()
        
        return {
            "success": True,
            "batch_id": batch_id,
            "total": len(transactions),
            "duplicates": len(existing_keys),
            "inserted": len(rippling_rows),
            "unmapped_employees": list(unmapped_employees),
            "synced_to_valor": len(valor_rows)
        }
        
    except Exception as e:
        import traceback
        print(f"[ERROR] Upload failed: {e}")
        print(traceback.format_exc())
        return {"success": False, "error": str(e)}


def get_rippling_expenses(batch_id: Optional[str] = None, year: Optional[int] = None, limit: int = 1000) -> List[Dict]:
    """Busca despesas do Rippling"""
    client = get_bigquery_client()
    
    conditions = []
    if batch_id:
        conditions.append(f"batch_id = '{batch_id}'")
    if year:
        conditions.append(f"year = {year}")
    
    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    
    query = f"""
        SELECT *
        FROM `{FULL_RIPPLING_TABLE}`
        {where_clause}
        ORDER BY date DESC, created_at DESC
        LIMIT {limit}
    """
    
    result = client.query(query).result()
    
    expenses = []
    for row in result:
        expenses.append({
            "id": row.id,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "name": row.name,
            "amount": float(row.amount) if row.amount else 0,
            "category": row.category,
            "date": str(row.date) if row.date else None,
            "vendor": row.vendor,
            "year": row.year,
            "month": row.month,
            "batch_id": row.batch_id,
            "employee_original": row.employee_original,
            "employee_type": row.employee_type,
            "vendor_name": row.vendor_name,
            "currency": row.currency,
            "object_type": row.object_type,
            "approval_state": row.approval_state,
            "receipt_filepath": row.receipt_filepath,
            "valor_expense_id": row.valor_expense_id,
        })
    
    return expenses


def get_rippling_batches() -> List[Dict]:
    """Busca batches de upload"""
    client = get_bigquery_client()
    
    query = f"""
        SELECT 
            batch_id,
            MIN(created_at) as created_at,
            COUNT(*) as transaction_count,
            COUNT(DISTINCT name) as employee_count,
            SUM(amount) as total_amount,
            STRING_AGG(DISTINCT category, ', ' LIMIT 5) as categories
        FROM `{FULL_RIPPLING_TABLE}`
        GROUP BY batch_id
        ORDER BY created_at DESC
    """
    
    result = client.query(query).result()
    
    batches = []
    for row in result:
        batches.append({
            "batch_id": row.batch_id,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "transaction_count": row.transaction_count,
            "employee_count": row.employee_count,
            "total_amount": float(row.total_amount) if row.total_amount else 0,
            "categories": row.categories
        })
    
    return batches


def delete_rippling_batch(batch_id: str) -> Dict:
    """
    Deleta um batch do Rippling E os registros correspondentes em valor_expenses
    """
    client = get_bigquery_client()
    
    # Buscar valor_expense_ids do batch
    fetch_query = f"""
        SELECT id, valor_expense_id, amount
        FROM `{FULL_RIPPLING_TABLE}`
        WHERE batch_id = '{batch_id}'
    """
    records = list(client.query(fetch_query).result())
    
    if not records:
        return {"success": False, "error": "Batch not found"}
    
    valor_ids = [r.valor_expense_id for r in records if r.valor_expense_id]
    total_amount = sum(r.amount or 0 for r in records)
    
    try:
        # 1. Deletar de rippling_expenses
        delete_rippling = f"""
            DELETE FROM `{FULL_RIPPLING_TABLE}`
            WHERE batch_id = '{batch_id}'
        """
        client.query(delete_rippling).result()
        
        # 2. Deletar de valor_expenses (sync)
        if valor_ids:
            delete_valor = f"""
                DELETE FROM `{FULL_VALOR_TABLE}`
                WHERE id IN UNNEST(@ids)
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ArrayQueryParameter("ids", "STRING", valor_ids)
                ]
            )
            client.query(delete_valor, job_config=job_config).result()
        
        return {
            "success": True,
            "deleted_count": len(records),
            "total_amount": float(total_amount),
            "synced_valor_deletes": len(valor_ids)
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}


def delete_rippling_expense(expense_id: str) -> Dict:
    """
    Deleta uma despesa individual do Rippling E da valor_expenses
    """
    client = get_bigquery_client()
    
    # Buscar valor_expense_id
    fetch_query = f"""
        SELECT valor_expense_id
        FROM `{FULL_RIPPLING_TABLE}`
        WHERE id = '{expense_id}'
    """
    records = list(client.query(fetch_query).result())
    
    if not records:
        return {"success": False, "error": "Expense not found"}
    
    valor_id = records[0].valor_expense_id
    
    try:
        # 1. Deletar de rippling_expenses
        client.query(f"DELETE FROM `{FULL_RIPPLING_TABLE}` WHERE id = '{expense_id}'").result()
        
        # 2. Deletar de valor_expenses
        if valor_id:
            client.query(f"DELETE FROM `{FULL_VALOR_TABLE}` WHERE id = '{valor_id}'").result()
        
        return {"success": True, "synced_valor": valor_id is not None}
        
    except Exception as e:
        return {"success": False, "error": str(e)}


def update_rippling_expense(expense_id: str, updates: Dict) -> Dict:
    """
    Atualiza uma despesa do Rippling E sincroniza com valor_expenses
    """
    client = get_bigquery_client()
    
    # Buscar registro atual
    fetch_query = f"""
        SELECT *
        FROM `{FULL_RIPPLING_TABLE}`
        WHERE id = '{expense_id}'
    """
    records = list(client.query(fetch_query).result())
    
    if not records:
        return {"success": False, "error": "Expense not found"}
    
    record = records[0]
    # Usar o padrão rippling_<id> para o valor_expenses
    valor_id = f"rippling_{expense_id}"
    
    # Campos permitidos para update
    allowed_fields = ['name', 'amount', 'category', 'date', 'vendor', 'project']
    set_clauses = []
    
    for field in allowed_fields:
        if field in updates:
            value = updates[field]
            if isinstance(value, str):
                escaped = value.replace("'", "\\'")
                set_clauses.append(f"{field} = '{escaped}'")
            elif value is None:
                set_clauses.append(f"{field} = NULL")
            else:
                set_clauses.append(f"{field} = {value}")
    
    if not set_clauses:
        return {"success": False, "error": "No valid fields to update"}
    
    # Recalcular year/month se date mudou
    if 'date' in updates and updates['date']:
        try:
            dt = datetime.strptime(updates['date'], '%Y-%m-%d')
            set_clauses.append(f"year = {dt.year}")
            set_clauses.append(f"month = {dt.month}")
        except:
            pass
    
    try:
        # 1. Update em rippling_expenses
        update_rippling = f"""
            UPDATE `{FULL_RIPPLING_TABLE}`
            SET {', '.join(set_clauses)}
            WHERE id = '{expense_id}'
        """
        client.query(update_rippling).result()
        
        # 2. Update em valor_expenses (sempre sync com rippling_<id>)
        update_valor = f"""
            UPDATE `{FULL_VALOR_TABLE}`
            SET {', '.join(set_clauses)}
            WHERE id = '{valor_id}'
        """
        client.query(update_valor).result()
        
        return {"success": True, "synced_valor": True}
        
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_rippling_summary(year: Optional[int] = None) -> Dict:
    """Resumo das despesas Rippling"""
    client = get_bigquery_client()
    
    where_clause = f"WHERE year = {year}" if year else ""
    
    query = f"""
        SELECT 
            COUNT(*) as total_records,
            COUNT(DISTINCT batch_id) as total_batches,
            COUNT(DISTINCT name) as total_employees,
            SUM(amount) as total_amount,
            MIN(date) as min_date,
            MAX(date) as max_date
        FROM `{FULL_RIPPLING_TABLE}`
        {where_clause}
    """
    
    result = list(client.query(query).result())[0]
    
    # Por categoria
    cat_query = f"""
        SELECT category, SUM(amount) as total, COUNT(*) as count
        FROM `{FULL_RIPPLING_TABLE}`
        {where_clause}
        GROUP BY category
        ORDER BY total DESC
    """
    cat_result = client.query(cat_query).result()
    
    by_category = []
    for row in cat_result:
        by_category.append({
            "category": row.category,
            "total": float(row.total) if row.total else 0,
            "count": row.count
        })
    
    return {
        "total_records": result.total_records or 0,
        "total_batches": result.total_batches or 0,
        "total_employees": result.total_employees or 0,
        "total_amount": float(result.total_amount) if result.total_amount else 0,
        "date_range": {
            "min": str(result.min_date) if result.min_date else None,
            "max": str(result.max_date) if result.max_date else None
        },
        "by_category": by_category
    }


def resync_all_rippling_to_valor() -> Dict:
    """
    Re-sincroniza TODOS os registros do rippling_expenses com valor_expenses usando MERGE.
    - Se rippling_<id> existe -> UPDATE
    - Se não existe -> INSERT
    Usa o employee mapping para converter nomes.
    """
    client = get_bigquery_client()
    
    try:
        # Buscar employee mapping
        employee_map = get_employee_mapping()
        
        # Buscar todos os registros do rippling_expenses
        query = f"""
            SELECT id, name, amount, category, date, vendor_name, year, month, project, employee_original
            FROM `{FULL_RIPPLING_TABLE}`
        """
        result = list(client.query(query).result())
        
        if not result:
            return {"success": True, "synced_count": 0, "message": "No Rippling expenses to sync"}
        
        # Preparar dados para MERGE
        valor_rows = []
        for row in result:
            # O name já deve estar mapeado, mas vamos garantir
            mapped_name = row.name
            if row.employee_original:
                key = normalize_name(row.employee_original)
                if key in employee_map:
                    mapped_name = employee_map[key]["display_name"]
            
            # Usar rippling_<id> como ID no valor_expenses
            valor_id = f"rippling_{row.id}"
            
            date_str = str(row.date) if row.date else "1900-01-01"
            year = row.year or 2024
            month = row.month or 1
            vendor = row.vendor_name or ""
            project = row.project or ""
            category = row.category or "Miscellaneous"
            
            valor_rows.append({
                "id": valor_id,
                "name": mapped_name,
                "amount": float(row.amount) if row.amount else 0,
                "category": category,
                "date": date_str,
                "vendor": vendor,
                "year": year,
                "month": month,
                "source": "Rippling",
                "project": project,
            })
        
        # Use MERGE em batches
        batch_size = 100
        total_synced = 0
        
        for i in range(0, len(valor_rows), batch_size):
            batch = valor_rows[i:i+batch_size]
            
            values_parts = []
            for r in batch:
                name = (r["name"] or "").replace("'", "\\'")
                vendor = (r["vendor"] or "").replace("'", "\\'")
                category = (r["category"] or "").replace("'", "\\'")
                project = (r["project"] or "").replace("'", "\\'")
                
                values_parts.append(f"""
                    ('{r["id"]}', '{name}', {r["amount"]}, '{category}', '{r["date"]}', '{vendor}', {r["year"]}, {r["month"]}, '{r["source"]}', '{project}')
                """)
            
            values_sql = ",".join(values_parts)
            
            merge_query = f"""
                MERGE `{FULL_VALOR_TABLE}` AS target
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
                        vendor = source.vendor,
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
        
        # Atualizar valor_expense_id no rippling_expenses para manter o link
        for row in result:
            valor_id = f"rippling_{row.id}"
            update_link = f"""
                UPDATE `{FULL_RIPPLING_TABLE}`
                SET valor_expense_id = '{valor_id}'
                WHERE id = '{row.id}'
            """
            client.query(update_link).result()
        
        return {
            "success": True,
            "synced_count": total_synced,
            "message": f"Synced {total_synced} Rippling expenses to valor_expenses (using MERGE - no duplicates)"
        }
        
    except Exception as e:
        import traceback
        print(traceback.format_exc())
        return {"success": False, "error": str(e)}
