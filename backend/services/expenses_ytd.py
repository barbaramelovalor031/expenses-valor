"""
Expenses YTD service - 2025 YTD Expenses consolidated view
"""
from google.cloud import bigquery
from google.oauth2 import service_account
from typing import Dict, List, Any
import os

# Configurações BigQuery
SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), "..", "credentials", "bq-service-account.json")
PROJECT_ID = "automatic-bond-462415-h6"
DATASET_ID = "finance"
TABLE_ID = "expenses_ytd_2025"
FULL_TABLE_ID = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"

# Todas as categorias de despesas
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


def get_bigquery_client():
    """Cria cliente BigQuery usando service account"""
    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE,
        scopes=["https://www.googleapis.com/auth/bigquery"]
    )
    return bigquery.Client(credentials=credentials, project=PROJECT_ID)


def category_to_field_name(category: str) -> str:
    """Converte nome da categoria para nome do campo no BigQuery"""
    return category.lower().replace(' ', '_').replace('-', '_').replace('&', 'and').replace('/', '_')


def field_name_to_category(field_name: str) -> str:
    """Converte nome do campo de volta para nome da categoria"""
    for cat in EXPENSE_CATEGORIES:
        if category_to_field_name(cat) == field_name:
            return cat
    return field_name


def get_all_expenses(year: int = None) -> List[Dict[str, Any]]:
    """Busca todos os dados de despesas YTD"""
    client = get_bigquery_client()
    
    # Construir lista de campos
    category_fields = [category_to_field_name(cat) for cat in EXPENSE_CATEGORIES]
    
    where_clause = f"WHERE year = {year}" if year else ""
    
    query = f"""
        SELECT 
            employee_name,
            employee_type,
            year,
            {', '.join(category_fields)},
            total_expenses
        FROM `{FULL_TABLE_ID}`
        {where_clause}
        ORDER BY employee_name
    """
    
    try:
        result = client.query(query).result()
        expenses = []
        for row in result:
            expense = {
                "employee_name": row.employee_name,
                "employee_type": row.employee_type,
                "year": row.year,
                "total": float(row.total_expenses) if row.total_expenses else 0.0,
                "categories": {}
            }
            
            for cat in EXPENSE_CATEGORIES:
                field_name = category_to_field_name(cat)
                val = getattr(row, field_name, 0.0)
                expense["categories"][cat] = float(val) if val else 0.0
            
            expenses.append(expense)
        
        return expenses
    except Exception as e:
        print(f"[ERROR] Failed to fetch expenses: {e}")
        return []


def get_expenses_summary(year: int = None) -> Dict[str, Any]:
    """Retorna resumo consolidado das despesas por categoria"""
    client = get_bigquery_client()
    
    # Construir lista de SUM para cada categoria
    category_sums = [f"SUM({category_to_field_name(cat)}) as {category_to_field_name(cat)}" for cat in EXPENSE_CATEGORIES]
    
    where_clause = f"WHERE year = {year}" if year else ""
    
    query = f"""
        SELECT 
            {', '.join(category_sums)},
            SUM(total_expenses) as grand_total,
            COUNT(*) as employee_count
        FROM `{FULL_TABLE_ID}`
        {where_clause}
    """
    
    try:
        result = client.query(query).result()
        for row in result:
            summary = {
                "grand_total": float(row.grand_total) if row.grand_total else 0.0,
                "employee_count": row.employee_count,
                "by_category": {}
            }
            
            for cat in EXPENSE_CATEGORIES:
                field_name = category_to_field_name(cat)
                val = getattr(row, field_name, 0.0)
                summary["by_category"][cat] = float(val) if val else 0.0
            
            return summary
    except Exception as e:
        print(f"[ERROR] Failed to fetch summary: {e}")
        return {"grand_total": 0, "employee_count": 0, "by_category": {}}


def get_expenses_by_employee_type(year: int = None) -> Dict[str, Any]:
    """Retorna despesas agrupadas por tipo de funcionário"""
    client = get_bigquery_client()
    
    category_sums = [f"SUM({category_to_field_name(cat)}) as {category_to_field_name(cat)}" for cat in EXPENSE_CATEGORIES]
    
    where_clause = f"WHERE year = {year}" if year else ""
    
    query = f"""
        SELECT 
            employee_type,
            {', '.join(category_sums)},
            SUM(total_expenses) as total,
            COUNT(*) as employee_count
        FROM `{FULL_TABLE_ID}`
        {where_clause}
        GROUP BY employee_type
        ORDER BY employee_type
    """
    
    try:
        result = client.query(query).result()
        by_type = []
        for row in result:
            type_data = {
                "employee_type": row.employee_type,
                "total": float(row.total) if row.total else 0.0,
                "employee_count": row.employee_count,
                "categories": {}
            }
            
            for cat in EXPENSE_CATEGORIES:
                field_name = category_to_field_name(cat)
                val = getattr(row, field_name, 0.0)
                type_data["categories"][cat] = float(val) if val else 0.0
            
            by_type.append(type_data)
        
        return by_type
    except Exception as e:
        print(f"[ERROR] Failed to fetch by type: {e}")
        return []


def get_expense_categories() -> List[str]:
    """Retorna lista de categorias de despesas"""
    return EXPENSE_CATEGORIES


def get_available_years() -> List[int]:
    """Retorna lista de anos disponíveis na tabela"""
    client = get_bigquery_client()
    
    query = f"""
        SELECT DISTINCT year
        FROM `{FULL_TABLE_ID}`
        WHERE year IS NOT NULL
        ORDER BY year DESC
    """
    
    try:
        result = client.query(query).result()
        years = [row.year for row in result]
        return years if years else [2025]  # Default to 2025 if no years found
    except Exception as e:
        print(f"[ERROR] Failed to fetch years: {e}")
        return [2025]


def add_expenses_to_consolidated(transactions: List[Dict], year: int) -> Dict[str, Any]:
    """
    Adiciona transações do cartão de crédito à base consolidada.
    Agrupa por funcionário e categoria, somando os valores.
    
    Args:
        transactions: Lista de transações com employee_name, category e amount
        year: Ano para registrar as despesas
        
    Returns:
        Resumo da operação
    """
    client = get_bigquery_client()
    
    # Agrupar transações por funcionário e categoria
    expenses_by_employee: Dict[str, Dict[str, float]] = {}
    
    for tx in transactions:
        employee = tx.get('employee_name', '').strip()
        category = tx.get('category', '').strip()
        amount = float(tx.get('amount', 0))
        
        if not employee or not category:
            continue
            
        if employee not in expenses_by_employee:
            expenses_by_employee[employee] = {}
        
        if category not in expenses_by_employee[employee]:
            expenses_by_employee[employee][category] = 0.0
            
        expenses_by_employee[employee][category] += amount
    
    if not expenses_by_employee:
        return {"success": False, "error": "No valid transactions to process"}
    
    # Para cada funcionário, atualizar ou criar registro
    updated_count = 0
    created_count = 0
    errors = []
    
    for employee_name, categories_amounts in expenses_by_employee.items():
        try:
            # Verificar se o funcionário já existe no ano
            check_query = f"""
                SELECT employee_name, employee_type
                FROM `{FULL_TABLE_ID}`
                WHERE employee_name = @employee_name AND year = @year
            """
            job_config = bigquery.QueryJobConfig(
                query_parameters=[
                    bigquery.ScalarQueryParameter("employee_name", "STRING", employee_name),
                    bigquery.ScalarQueryParameter("year", "INT64", year),
                ]
            )
            result = client.query(check_query, job_config=job_config).result()
            existing = list(result)
            
            if existing:
                # Atualizar registro existente - somar valores às categorias
                set_clauses = []
                params = [
                    bigquery.ScalarQueryParameter("employee_name", "STRING", employee_name),
                    bigquery.ScalarQueryParameter("year", "INT64", year),
                ]
                
                for cat, amount in categories_amounts.items():
                    field_name = category_to_field_name(cat)
                    if field_name:
                        param_name = f"amt_{field_name}"
                        set_clauses.append(f"{field_name} = COALESCE({field_name}, 0) + @{param_name}")
                        params.append(bigquery.ScalarQueryParameter(param_name, "FLOAT64", amount))
                
                # Recalcular o total
                all_category_fields = [category_to_field_name(c) for c in EXPENSE_CATEGORIES]
                total_calc = " + ".join([f"COALESCE({f}, 0)" for f in all_category_fields])
                
                if set_clauses:
                    update_query = f"""
                        UPDATE `{FULL_TABLE_ID}`
                        SET {', '.join(set_clauses)},
                            total_expenses = (SELECT {total_calc} FROM `{FULL_TABLE_ID}` WHERE employee_name = @employee_name AND year = @year) + {sum(categories_amounts.values())}
                        WHERE employee_name = @employee_name AND year = @year
                    """
                    job_config = bigquery.QueryJobConfig(query_parameters=params)
                    client.query(update_query, job_config=job_config).result()
                    updated_count += 1
            else:
                # Criar novo registro para este funcionário
                # Primeiro, buscar o employee_type da tabela rippling_employees
                type_query = """
                    SELECT employee_type
                    FROM `automatic-bond-462415-h6.finance.rippling_employees`
                    WHERE rippling_name = @employee_name
                    LIMIT 1
                """
                type_config = bigquery.QueryJobConfig(
                    query_parameters=[
                        bigquery.ScalarQueryParameter("employee_name", "STRING", employee_name),
                    ]
                )
                type_result = client.query(type_query, job_config=type_config).result()
                type_rows = list(type_result)
                employee_type = type_rows[0].employee_type if type_rows else "Partner"  # Default to Partner for cardholders
                
                # Construir campos para INSERT
                fields = ["employee_name", "employee_type", "year", "total_expenses"]
                values = [employee_name, employee_type, year, sum(categories_amounts.values())]
                
                for cat in EXPENSE_CATEGORIES:
                    field_name = category_to_field_name(cat)
                    fields.append(field_name)
                    values.append(categories_amounts.get(cat, 0.0))
                
                # Usar SQL INSERT com parâmetros
                placeholders = ", ".join([f"@p{i}" for i in range(len(values))])
                insert_query = f"""
                    INSERT INTO `{FULL_TABLE_ID}` ({', '.join(fields)})
                    VALUES ({placeholders})
                """
                
                params = [
                    bigquery.ScalarQueryParameter(f"p{i}", 
                        "STRING" if isinstance(v, str) else "INT64" if isinstance(v, int) and i == 2 else "FLOAT64", 
                        v
                    ) for i, v in enumerate(values)
                ]
                job_config = bigquery.QueryJobConfig(query_parameters=params)
                client.query(insert_query, job_config=job_config).result()
                created_count += 1
                
        except Exception as e:
            errors.append(f"{employee_name}: {str(e)}")
            print(f"[ERROR] Failed to update {employee_name}: {e}")
    
    return {
        "success": len(errors) == 0,
        "updated": updated_count,
        "created": created_count,
        "total_employees": len(expenses_by_employee),
        "total_transactions": len(transactions),
        "errors": errors
    }


def undo_expenses_from_consolidated(transactions: list, year: int) -> dict:
    """
    Undo/subtract the transactions from the consolidated database.
    This reverses the effect of add_expenses_to_consolidated.
    
    Args:
        transactions: List of dicts with employee_name, category, and amount
        year: The year for the expenses
        
    Returns:
        dict with success status and details
    """
    if not transactions:
        return {"success": False, "error": "No transactions provided"}
    
    client = get_bigquery_client()
    
    # Agrupar por funcionário e categoria, somando os valores
    expenses_by_employee = {}
    for tx in transactions:
        employee = tx.get("employee_name")
        category = tx.get("category")
        amount = tx.get("amount", 0)
        
        if not employee or not category:
            continue
            
        if employee not in expenses_by_employee:
            expenses_by_employee[employee] = {}
        
        if category not in expenses_by_employee[employee]:
            expenses_by_employee[employee][category] = 0.0
            
        expenses_by_employee[employee][category] += amount
    
    if not expenses_by_employee:
        return {"success": False, "error": "No valid transactions to undo"}
    
    # Para cada funcionário, subtrair os valores
    updated_count = 0
    errors = []
    
    for employee_name, categories_amounts in expenses_by_employee.items():
        try:
            # Subtrair valores das categorias
            set_clauses = []
            params = [
                bigquery.ScalarQueryParameter("employee_name", "STRING", employee_name),
                bigquery.ScalarQueryParameter("year", "INT64", year),
            ]
            
            for cat, amount in categories_amounts.items():
                field_name = category_to_field_name(cat)
                if field_name:
                    param_name = f"amt_{field_name}"
                    # Subtrair ao invés de somar
                    set_clauses.append(f"{field_name} = GREATEST(0, COALESCE({field_name}, 0) - @{param_name})")
                    params.append(bigquery.ScalarQueryParameter(param_name, "FLOAT64", amount))
            
            # Recalcular o total
            all_category_fields = [category_to_field_name(c) for c in EXPENSE_CATEGORIES]
            total_calc = " + ".join([f"COALESCE({f}, 0)" for f in all_category_fields])
            
            if set_clauses:
                update_query = f"""
                    UPDATE `{FULL_TABLE_ID}`
                    SET {', '.join(set_clauses)},
                        total_expenses = (SELECT {total_calc} FROM `{FULL_TABLE_ID}` WHERE employee_name = @employee_name AND year = @year) - {sum(categories_amounts.values())}
                    WHERE employee_name = @employee_name AND year = @year
                """
                job_config = bigquery.QueryJobConfig(query_parameters=params)
                client.query(update_query, job_config=job_config).result()
                updated_count += 1
                
        except Exception as e:
            errors.append(f"{employee_name}: {str(e)}")
            print(f"[ERROR] Failed to undo for {employee_name}: {e}")
    
    return {
        "success": len(errors) == 0,
        "updated": updated_count,
        "total_employees": len(expenses_by_employee),
        "errors": errors
    }
