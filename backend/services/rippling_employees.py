"""
Rippling employees service - Gerencia mapeamento de funcionários no BigQuery
"""
from google.cloud import bigquery
from google.oauth2 import service_account
from typing import Dict, List, Any, Optional
from datetime import datetime
import hashlib
import os

from .bigquery_client import get_bigquery_client, PROJECT_ID, DATASET_ID

# Configurações BigQuery
TABLE_ID = "rippling_employees"
FULL_TABLE_ID = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"

# Tipos de funcionários válidos
EMPLOYEE_TYPES = ["Partner", "Employee", "Contractor", "Advisor"]


# get_bigquery_client is now imported from bigquery_client module


def get_all_employees() -> List[Dict[str, Any]]:
    """Busca todos os funcionários da tabela"""
    client = get_bigquery_client()
    
    query = f"""
        SELECT 
            id,
            rippling_name,
            display_name,
            employee_type,
            created_at,
            updated_at
        FROM `{FULL_TABLE_ID}`
        ORDER BY display_name, rippling_name
    """
    
    try:
        result = client.query(query).result()
        employees = []
        for row in result:
            employees.append({
                "id": row.id,
                "rippling_name": row.rippling_name,
                "display_name": row.display_name,
                "employee_type": row.employee_type,
                "created_at": row.created_at.isoformat() if row.created_at else None,
                "updated_at": row.updated_at.isoformat() if row.updated_at else None,
            })
        return employees
    except Exception as e:
        print(f"[ERROR] Failed to fetch employees: {e}")
        return []


def get_unique_display_names() -> List[Dict[str, Any]]:
    """Busca lista única de display_names com seus tipos"""
    client = get_bigquery_client()
    
    query = f"""
        SELECT 
            display_name,
            employee_type,
            COUNT(*) as alias_count
        FROM `{FULL_TABLE_ID}`
        GROUP BY display_name, employee_type
        ORDER BY display_name
    """
    
    try:
        result = client.query(query).result()
        employees = []
        for row in result:
            employees.append({
                "display_name": row.display_name,
                "employee_type": row.employee_type,
                "alias_count": row.alias_count,
            })
        return employees
    except Exception as e:
        print(f"[ERROR] Failed to fetch unique employees: {e}")
        return []


def add_employee(rippling_name: str, display_name: str, employee_type: str) -> Dict[str, Any]:
    """Adiciona um novo mapeamento de funcionário"""
    if employee_type not in EMPLOYEE_TYPES:
        return {"success": False, "error": f"Tipo inválido. Use: {', '.join(EMPLOYEE_TYPES)}"}
    
    client = get_bigquery_client()
    row_id = hashlib.md5(rippling_name.encode()).hexdigest()[:16]
    now = datetime.utcnow().isoformat()
    
    # Verificar se já existe
    check_query = f"""
        SELECT id FROM `{FULL_TABLE_ID}` 
        WHERE rippling_name = @rippling_name
    """
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("rippling_name", "STRING", rippling_name)
        ]
    )
    result = client.query(check_query, job_config=job_config).result()
    if list(result):
        return {"success": False, "error": f"Funcionário '{rippling_name}' já existe"}
    
    # Inserir novo registro
    row = {
        "id": row_id,
        "rippling_name": rippling_name,
        "display_name": display_name,
        "employee_type": employee_type,
        "created_at": now,
        "updated_at": now,
    }
    
    errors = client.insert_rows_json(FULL_TABLE_ID, [row])
    if errors:
        return {"success": False, "error": str(errors)}
    
    return {"success": True, "message": f"Funcionário '{rippling_name}' adicionado com sucesso", "data": row}


def update_employee(id: str, rippling_name: Optional[str] = None, display_name: Optional[str] = None, employee_type: Optional[str] = None) -> Dict[str, Any]:
    """Atualiza um mapeamento existente"""
    if employee_type and employee_type not in EMPLOYEE_TYPES:
        return {"success": False, "error": f"Tipo inválido. Use: {', '.join(EMPLOYEE_TYPES)}"}
    
    client = get_bigquery_client()
    
    # Construir query dinamicamente baseado nos campos fornecidos
    set_clauses = []
    query_params = [bigquery.ScalarQueryParameter("id", "STRING", id)]
    
    if rippling_name is not None:
        set_clauses.append("rippling_name = @rippling_name")
        query_params.append(bigquery.ScalarQueryParameter("rippling_name", "STRING", rippling_name))
    
    if display_name is not None:
        set_clauses.append("display_name = @display_name")
        query_params.append(bigquery.ScalarQueryParameter("display_name", "STRING", display_name))
    
    if employee_type is not None:
        set_clauses.append("employee_type = @employee_type")
        query_params.append(bigquery.ScalarQueryParameter("employee_type", "STRING", employee_type))
    
    if not set_clauses:
        return {"success": False, "error": "Nenhum campo para atualizar"}
    
    set_clauses.append("updated_at = CURRENT_TIMESTAMP()")
    
    query = f"""
        UPDATE `{FULL_TABLE_ID}`
        SET {', '.join(set_clauses)}
        WHERE id = @id
    """
    
    job_config = bigquery.QueryJobConfig(query_parameters=query_params)
    
    try:
        client.query(query, job_config=job_config).result()
        return {"success": True, "message": "Funcionário atualizado com sucesso"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def delete_employee(id: str) -> Dict[str, Any]:
    """Remove um mapeamento de funcionário"""
    client = get_bigquery_client()
    
    query = f"""
        DELETE FROM `{FULL_TABLE_ID}`
        WHERE id = @id
    """
    
    job_config = bigquery.QueryJobConfig(
        query_parameters=[
            bigquery.ScalarQueryParameter("id", "STRING", id),
        ]
    )
    
    try:
        client.query(query, job_config=job_config).result()
        return {"success": True, "message": "Funcionário removido com sucesso"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def get_employee_types() -> List[str]:
    """Retorna lista de tipos de funcionários válidos"""
    return EMPLOYEE_TYPES
