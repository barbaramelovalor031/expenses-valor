"""
Uber expenses service - Upload incremental para BigQuery com conversão BRL→USD
Sincroniza com valor_expenses (tabela principal)
"""
import pandas as pd
from io import BytesIO, StringIO
from typing import Dict, List, Any, Optional
import requests
from datetime import datetime, timedelta
import re
import uuid
import json
import io

from google.cloud import bigquery
from google.oauth2 import service_account
import os

from .bigquery_client import get_bigquery_client, PROJECT_ID, DATASET_ID

# Configurações BigQuery
TABLE_ID = "uber_expenses"
VALOR_TABLE_ID = "valor_expenses"
FULL_TABLE_ID = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"
FULL_VALOR_TABLE_ID = f"{PROJECT_ID}.{DATASET_ID}.{VALOR_TABLE_ID}"

# Cache de cotações PTAX
PTAX_CACHE = {}


# get_bigquery_client is now imported from bigquery_client module


def get_cotacao_dolar_ptax(data_iso: str) -> Optional[float]:
    """
    Busca cotação do dólar PTAX do Banco Central.
    data_iso no formato YYYY-MM-DD.
    """
    if data_iso in PTAX_CACHE:
        return PTAX_CACHE[data_iso]

    try:
        dt = datetime.strptime(data_iso, "%Y-%m-%d")
    except:
        PTAX_CACHE[data_iso] = None
        return None
    
    for _ in range(7):
        data_bcb = dt.strftime("%m-%d-%Y")
        url = (
            "https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/"
            f"CotacaoDolarDia(dataCotacao=@dataCotacao)?"
            f"@dataCotacao='{data_bcb}'&$top=100&$format=json"
        )

        try:
            resp = requests.get(url, timeout=10)
            resp.raise_for_status()
            data = resp.json()
        except Exception as e:
            print(f"[WARN] Erro ao buscar PTAX para {data_iso}: {e}")
            PTAX_CACHE[data_iso] = None
            return None

        valores = data.get("value", [])
        if valores:
            ultimo = valores[-1]
            rate = float(ultimo["cotacaoVenda"])
            PTAX_CACHE[data_iso] = rate
            return rate

        dt = dt - timedelta(days=1)

    PTAX_CACHE[data_iso] = None
    return None


def clean_column_name(col: str) -> str:
    """Limpa nome da coluna para BigQuery"""
    new_name = col.lower()
    new_name = new_name.replace(" ", "_")
    new_name = new_name.replace("/", "_")
    new_name = new_name.replace("-", "_")
    new_name = new_name.replace("#", "num")
    new_name = re.sub(r'[^a-z0-9_]', '', new_name)
    new_name = re.sub(r'_+', '_', new_name)
    new_name = new_name.strip('_')
    return new_name[:300]


# Mapeamento de nomes para normalizar (remove acentos e corrige sobrenomes)
# Format: first_name: {old_last_name: new_last_name}
UBER_NAME_NORMALIZATIONS = {
    "Antoine": {"Colaço": "Colaco"},
    "Lana": {"Brandão": "Brandao"},
    "Kelli": {"Spangler": "SpanglerBallard"},
}

# Mapeamento para normalizar first_name (remove acentos)
# Format: old_first_name: new_first_name
UBER_FIRST_NAME_NORMALIZATIONS = {
    "José": "Jose",
}


def normalize_uber_name(first_name: str, last_name: str) -> tuple:
    """
    Normaliza nomes do Uber para manter consistência.
    Retorna (first_name, last_name) normalizados.
    """
    if not first_name:
        first_name = ""
    if not last_name:
        last_name = ""
    
    first_name = first_name.strip()
    last_name = last_name.strip()
    
    # Normaliza first_name (ex: José -> Jose)
    if first_name in UBER_FIRST_NAME_NORMALIZATIONS:
        first_name = UBER_FIRST_NAME_NORMALIZATIONS[first_name]
    
    # Verifica se há normalização para este nome (last_name)
    if first_name in UBER_NAME_NORMALIZATIONS:
        name_map = UBER_NAME_NORMALIZATIONS[first_name]
        if last_name in name_map:
            last_name = name_map[last_name]
    
    return first_name, last_name


def parse_uber_csv(file_content: bytes) -> pd.DataFrame:
    """
    Parseia CSV do Uber, pulando as linhas de cabeçalho especial.
    O CSV tem 5 linhas antes dos headers reais:
    - Company
    - Administrator
    - Report Date
    - linha vazia
    - "Transactions"
    """
    # Decodifica o conteúdo
    try:
        content = file_content.decode('utf-8')
    except:
        content = file_content.decode('latin-1')
    
    # Pula as 5 primeiras linhas
    lines = content.split('\n')
    
    # Encontra onde começa os dados reais (linha com "Trip/Eats ID")
    header_line = 0
    for i, line in enumerate(lines):
        if 'Trip/Eats ID' in line or 'trip_eats_id' in line.lower():
            header_line = i
            break
    
    # Reconstrói o CSV a partir da linha do header
    clean_csv = '\n'.join(lines[header_line:])
    
    # Lê o DataFrame
    df = pd.read_csv(StringIO(clean_csv))
    
    # Limpa nomes das colunas
    df.columns = [clean_column_name(col) for col in df.columns]
    
    return df


def get_existing_trip_ids() -> set:
    """Busca todos os trip_eats_id existentes na tabela do BigQuery"""
    client = get_bigquery_client()
    
    query = f"""
        SELECT DISTINCT trip_eats_id 
        FROM `{FULL_TABLE_ID}`
        WHERE trip_eats_id IS NOT NULL
    """
    
    try:
        result = client.query(query).result()
        existing_ids = {row.trip_eats_id for row in result}
        print(f"[INFO] {len(existing_ids)} trip IDs existentes no BigQuery")
        return existing_ids
    except Exception as e:
        print(f"[WARN] Erro ao buscar IDs existentes: {e}")
        return set()


def convert_brl_to_usd(df: pd.DataFrame) -> pd.DataFrame:
    """Converte valores BRL para USD usando cotação PTAX"""
    
    timestamp_col = 'transaction_timestamp_utc'
    brl_col = 'transaction_amount_brl'
    
    if timestamp_col not in df.columns or brl_col not in df.columns:
        df['transaction_amount_usd'] = None
        df['ptax_rate'] = None
        return df
    
    # Extrair datas únicas
    df['_temp_date'] = pd.to_datetime(df[timestamp_col], errors='coerce').dt.strftime('%Y-%m-%d')
    unique_dates = df['_temp_date'].dropna().unique()
    
    # Buscar cotações
    cotacoes = {}
    for data in unique_dates:
        if pd.notna(data) and data != 'NaT':
            cotacoes[data] = get_cotacao_dolar_ptax(data)
    
    # Aplicar conversão
    def convert_row(row):
        date = row['_temp_date']
        try:
            brl_amount = float(row[brl_col]) if pd.notna(row[brl_col]) else None
        except:
            brl_amount = None
        
        if pd.isna(date) or brl_amount is None:
            return pd.Series({'transaction_amount_usd': None, 'ptax_rate': None})
        
        rate = cotacoes.get(date)
        if rate and rate > 0:
            usd_amount = round(brl_amount / rate, 2)
            return pd.Series({'transaction_amount_usd': usd_amount, 'ptax_rate': rate})
        
        return pd.Series({'transaction_amount_usd': None, 'ptax_rate': None})
    
    converted = df.apply(convert_row, axis=1)
    df['transaction_amount_usd'] = converted['transaction_amount_usd']
    df['ptax_rate'] = converted['ptax_rate']
    df = df.drop(columns=['_temp_date'])
    
    return df


def process_uber_csv(file_content: bytes, filename: str) -> Dict[str, Any]:
    """
    Processa CSV do Uber:
    1. Parseia o CSV
    2. Identifica linhas novas (não existentes no BigQuery)
    3. Converte BRL para USD
    4. Retorna preview das novas linhas
    """
    # 1. Parsear CSV
    df = parse_uber_csv(file_content)
    total_rows = len(df)
    
    print(f"[INFO] CSV parseado: {total_rows} linhas, {len(df.columns)} colunas")
    
    # 2. Buscar IDs existentes
    existing_ids = get_existing_trip_ids()
    
    # 3. Filtrar apenas novas linhas
    if 'trip_eats_id' in df.columns:
        df_new = df[~df['trip_eats_id'].isin(existing_ids)]
    else:
        df_new = df  # Se não tem a coluna, considera tudo como novo
    
    new_rows = len(df_new)
    duplicate_rows = total_rows - new_rows
    
    print(f"[INFO] {new_rows} novas linhas, {duplicate_rows} duplicadas (ignoradas)")
    
    # 4. Converter BRL para USD nas novas linhas
    if new_rows > 0:
        df_new = convert_brl_to_usd(df_new)
    
    # 5. Calcular totais
    total_brl = df_new['transaction_amount_brl'].sum() if 'transaction_amount_brl' in df_new.columns and new_rows > 0 else 0
    total_usd = df_new['transaction_amount_usd'].sum() if 'transaction_amount_usd' in df_new.columns and new_rows > 0 else 0
    
    # 6. Preparar preview (primeiras 50 linhas)
    preview_cols = ['trip_eats_id', 'transaction_timestamp_utc', 'first_name', 'last_name', 
                    'service', 'city', 'program', 'pickup_address', 'dropoff_address',
                    'transaction_amount_brl', 'transaction_amount_usd', 'ptax_rate']
    preview_cols = [c for c in preview_cols if c in df_new.columns]
    
    preview = df_new[preview_cols].head(50).to_dict('records') if new_rows > 0 else []
    
    return {
        "total_rows_in_csv": total_rows,
        "new_rows": new_rows,
        "duplicate_rows": duplicate_rows,
        "total_brl": round(total_brl, 2) if pd.notna(total_brl) else 0,
        "total_usd": round(total_usd, 2) if pd.notna(total_usd) else 0,
        "preview": preview,
        "columns": list(df_new.columns)
    }


def upload_new_rows_to_bigquery(file_content: bytes, projects_map: Dict[str, str] = None) -> Dict[str, Any]:
    """
    Faz upload das novas linhas para o BigQuery usando MERGE para evitar duplicados.
    Também sincroniza com valor_expenses (tabela principal).
    
    Args:
        file_content: bytes do arquivo CSV
        projects_map: dict mapeando trip_eats_id para o valor do project (preenchido pelo usuário)
    """
    if projects_map is None:
        projects_map = {}
    
    # 1. Parsear e processar
    df = parse_uber_csv(file_content)
    
    if len(df) == 0:
        return {
            "success": True,
            "message": "CSV vazio",
            "rows_inserted": 0,
            "synced_to_valor": 0
        }
    
    # 2. Buscar IDs existentes para saber quais são novos
    existing_ids = get_existing_trip_ids()
    
    # 3. Converter BRL para USD
    df = convert_brl_to_usd(df)
    
    # 3.5 Aplicar valores de project do usuário
    if 'project' not in df.columns:
        df['project'] = ''
    
    # Aplicar projects do mapa fornecido pelo usuário
    for trip_id, project_value in projects_map.items():
        if trip_id and project_value:
            df.loc[df['trip_eats_id'] == trip_id, 'project'] = project_value
    
    # Identificar novas linhas antes de converter para string
    if 'trip_eats_id' in df.columns:
        new_mask = ~df['trip_eats_id'].isin(existing_ids)
        df_new_for_valor = df[new_mask].copy()
    else:
        df_new_for_valor = df.copy()
    
    # 4. Converter todas as colunas para string (para evitar problemas de tipo)
    for col in df.columns:
        df[col] = df[col].apply(lambda x: str(x) if pd.notna(x) and x != '' else None)
    
    client = get_bigquery_client()
    
    # 5. Criar tabela temporária com os dados do CSV
    temp_table_id = f"{PROJECT_ID}.{DATASET_ID}.uber_expenses_temp_{int(pd.Timestamp.now().timestamp())}"
    
    try:
        # Upload para tabela temporária
        job_config = bigquery.LoadJobConfig(
            write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,
            autodetect=True,
        )
        
        job = client.load_table_from_dataframe(df, temp_table_id, job_config=job_config)
        job.result()
        
        print(f"[INFO] {len(df)} linhas carregadas na tabela temporária")
        
        # 6. MERGE: inserir apenas registros que não existem (baseado em trip_eats_id)
        merge_query = f"""
            MERGE `{FULL_TABLE_ID}` AS target
            USING `{temp_table_id}` AS source
            ON target.trip_eats_id = source.trip_eats_id
            WHEN NOT MATCHED THEN
                INSERT ROW
        """
        
        merge_job = client.query(merge_query)
        merge_result = merge_job.result()
        
        # Pegar número de linhas inseridas
        rows_inserted = merge_job.num_dml_affected_rows or 0
        
        print(f"[INFO] MERGE concluído: {rows_inserted} novas linhas inseridas")
        
        # 7. Deletar tabela temporária
        client.delete_table(temp_table_id, not_found_ok=True)
        
        # 8. Sincronizar novas linhas com valor_expenses
        synced_count = 0
        if rows_inserted > 0 and len(df_new_for_valor) > 0:
            synced_count = sync_uber_to_valor(df_new_for_valor, client)
        
        return {
            "success": True,
            "message": f"{rows_inserted} linhas inseridas com sucesso (duplicados ignorados)",
            "rows_inserted": rows_inserted,
            "synced_to_valor": synced_count
        }
        
    except Exception as e:
        print(f"[ERROR] Falha no upload: {e}")
        # Tentar limpar tabela temporária em caso de erro
        try:
            client.delete_table(temp_table_id, not_found_ok=True)
        except:
            pass
        return {
            "success": False,
            "message": str(e),
            "rows_inserted": 0,
            "synced_to_valor": 0
        }


def sync_uber_to_valor(df_new: pd.DataFrame, client=None) -> int:
    """
    Sincroniza dados do Uber com a tabela valor_expenses usando MERGE (upsert).
    - Se uber_<trip_id> existe -> UPDATE
    - Se não existe -> INSERT
    Todas as viagens Uber vão para categoria 'Ground Transportation - Travel'.
    """
    if client is None:
        client = get_bigquery_client()
    
    if len(df_new) == 0:
        return 0
    
    valor_rows = []
    
    for _, row in df_new.iterrows():
        # Extrair dados relevantes
        trip_id = row.get('trip_eats_id', '')
        first_name = row.get('first_name', '') or ''
        last_name = row.get('last_name', '') or ''
        # Normalizar nomes (remover acentos, etc.)
        first_name, last_name = normalize_uber_name(first_name, last_name)
        full_name = f"{first_name} {last_name}".strip()
        
        # Usar USD se disponível, senão BRL
        amount_usd = row.get('transaction_amount_usd')
        amount_brl = row.get('transaction_amount_brl')
        
        try:
            amount = float(amount_usd) if pd.notna(amount_usd) else (float(amount_brl) if pd.notna(amount_brl) else 0)
        except:
            amount = 0
        
        # Extrair data
        timestamp = row.get('transaction_timestamp_utc', '')
        try:
            if timestamp and pd.notna(timestamp):
                dt = pd.to_datetime(timestamp)
                date_str = dt.strftime('%Y-%m-%d')
                year = dt.year
                month = dt.month
            else:
                date_str = None
                year = None
                month = None
        except:
            date_str = None
            year = None
            month = None
        
        # Determinar vendor (cidade + serviço)
        service = row.get('service', '') or ''
        city = row.get('city', '') or ''
        vendor = f"Uber {service}".strip() if service else "Uber"
        
        # Project field
        project = row.get('project', '') or ''
        
        # Usar trip_eats_id como ID para manter link entre tabelas
        valor_id = f"uber_{trip_id}" if trip_id else str(uuid.uuid4())
        
        valor_rows.append({
            "id": valor_id,
            "name": full_name,
            "amount": amount,
            "category": "Ground Transportation - Travel",  # SEMPRE essa categoria para Uber
            "date": date_str,
            "vendor": vendor,
            "year": year,
            "month": month,
            "source": "Uber",
            "project": project,
        })
    
    if not valor_rows:
        return 0
    
    try:
        # Use MERGE to upsert - prevents duplicates!
        batch_size = 100
        total_synced = 0
        
        for i in range(0, len(valor_rows), batch_size):
            batch = valor_rows[i:i+batch_size]
            
            values_parts = []
            for row in batch:
                # Escape single quotes
                name = (row["name"] or "").replace("'", "\\'")
                vendor = (row["vendor"] or "").replace("'", "\\'")
                category = (row["category"] or "").replace("'", "\\'")
                project = (row["project"] or "").replace("'", "\\'")
                date_str = row["date"] or "1900-01-01"
                year = row["year"] or 2024
                month = row["month"] or 1
                
                values_parts.append(f"""
                    ('{row["id"]}', '{name}', {row["amount"]}, '{category}', '{date_str}', '{vendor}', {year}, {month}, '{row["source"]}', '{project}')
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
        
        print(f"[INFO] {total_synced} linhas sincronizadas com valor_expenses (MERGE)")
        return total_synced
        
    except Exception as e:
        print(f"[ERROR] Falha ao sincronizar com valor_expenses: {e}")
        return 0


def get_uber_dashboard_data() -> Dict[str, Any]:
    """
    Busca dados agregados do BigQuery para o dashboard
    """
    client = get_bigquery_client()
    
    # Query para dados do dashboard
    query = f"""
        WITH base AS (
            SELECT 
                trip_eats_id,
                transaction_timestamp_utc,
                first_name,
                last_name,
                CONCAT(first_name, ' ', last_name) as full_name,
                service,
                program,
                city,
                country,
                SAFE_CAST(transaction_amount_brl AS FLOAT64) as amount_brl,
                SAFE_CAST(transaction_amount_usd AS FLOAT64) as amount_usd,
                SAFE_CAST(distance_mi AS FLOAT64) as distance_mi,
                SAFE_CAST(duration_min AS FLOAT64) as duration_min
            FROM `{FULL_TABLE_ID}`
            WHERE trip_eats_id IS NOT NULL
        )
        SELECT 
            COUNT(*) as total_trips,
            COUNT(DISTINCT full_name) as unique_users,
            ROUND(SUM(amount_brl), 2) as total_brl,
            ROUND(SUM(amount_usd), 2) as total_usd,
            ROUND(AVG(amount_brl), 2) as avg_trip_brl,
            ROUND(AVG(amount_usd), 2) as avg_trip_usd,
            ROUND(SUM(distance_mi), 2) as total_distance_mi,
            ROUND(SUM(duration_min), 2) as total_duration_min
        FROM base
    """
    
    try:
        result = client.query(query).result()
        summary = list(result)[0]
        
        # Buscar gastos por usuário
        user_query = f"""
            SELECT 
                CONCAT(first_name, ' ', last_name) as user_name,
                COUNT(*) as trips,
                ROUND(SUM(SAFE_CAST(transaction_amount_brl AS FLOAT64)), 2) as total_brl,
                ROUND(SUM(SAFE_CAST(transaction_amount_usd AS FLOAT64)), 2) as total_usd
            FROM `{FULL_TABLE_ID}`
            WHERE trip_eats_id IS NOT NULL
            GROUP BY 1
            ORDER BY total_brl DESC
        """
        user_result = client.query(user_query).result()
        by_user = [dict(row) for row in user_result]
        
        # Buscar gastos por cidade
        city_query = f"""
            SELECT 
                city,
                COUNT(*) as trips,
                ROUND(SUM(SAFE_CAST(transaction_amount_brl AS FLOAT64)), 2) as total_brl,
                ROUND(SUM(SAFE_CAST(transaction_amount_usd AS FLOAT64)), 2) as total_usd
            FROM `{FULL_TABLE_ID}`
            WHERE trip_eats_id IS NOT NULL AND city IS NOT NULL
            GROUP BY 1
            ORDER BY total_brl DESC
            LIMIT 10
        """
        city_result = client.query(city_query).result()
        by_city = [dict(row) for row in city_result]
        
        # Buscar gastos por mês
        monthly_query = f"""
            SELECT 
                FORMAT_TIMESTAMP('%Y-%m', PARSE_TIMESTAMP('%Y-%m-%d %H:%M:%S', transaction_timestamp_utc)) as month,
                COUNT(*) as trips,
                ROUND(SUM(SAFE_CAST(transaction_amount_brl AS FLOAT64)), 2) as total_brl,
                ROUND(SUM(SAFE_CAST(transaction_amount_usd AS FLOAT64)), 2) as total_usd
            FROM `{FULL_TABLE_ID}`
            WHERE trip_eats_id IS NOT NULL
            GROUP BY 1
            ORDER BY 1 DESC
            LIMIT 12
        """
        try:
            monthly_result = client.query(monthly_query).result()
            by_month = [dict(row) for row in monthly_result]
        except:
            by_month = []
        
        # All transactions with pickup and dropoff addresses
        all_transactions_query = f"""
            SELECT 
                trip_eats_id,
                transaction_timestamp_utc,
                CONCAT(first_name, ' ', last_name) as user_name,
                first_name,
                last_name,
                service,
                program,
                city,
                pickup_address,
                drop_off_address as dropoff_address,
                request_time_local,
                drop_off_time_local,
                ROUND(SAFE_CAST(transaction_amount_brl AS FLOAT64), 2) as amount_brl,
                ROUND(SAFE_CAST(transaction_amount_usd AS FLOAT64), 2) as amount_usd,
                ROUND(SAFE_CAST(ptax_rate AS FLOAT64), 4) as ptax_rate,
                ROUND(SAFE_CAST(distance_mi AS FLOAT64), 2) as distance_mi,
                ROUND(SAFE_CAST(duration_min AS FLOAT64), 0) as duration_min
            FROM `{FULL_TABLE_ID}`
            WHERE trip_eats_id IS NOT NULL
            ORDER BY transaction_timestamp_utc DESC
        """
        all_transactions_result = client.query(all_transactions_query).result()
        all_transactions = [dict(row) for row in all_transactions_result]
        
        return {
            "summary": {
                "total_trips": summary.total_trips,
                "unique_users": summary.unique_users,
                "total_brl": summary.total_brl or 0,
                "total_usd": summary.total_usd or 0,
                "avg_trip_brl": summary.avg_trip_brl or 0,
                "avg_trip_usd": summary.avg_trip_usd or 0,
                "total_distance_mi": summary.total_distance_mi or 0,
                "total_duration_min": summary.total_duration_min or 0
            },
            "by_user": by_user,
            "by_city": by_city,
            "by_month": by_month,
            "all_transactions": all_transactions
        }
        
    except Exception as e:
        print(f"[ERROR] Failed to fetch dashboard data: {e}")
        return {
            "summary": {
                "total_trips": 0,
                "unique_users": 0,
                "total_brl": 0,
                "total_usd": 0,
                "avg_trip_brl": 0,
                "avg_trip_usd": 0,
                "total_distance_mi": 0,
                "total_duration_min": 0
            },
            "by_user": [],
            "by_city": [],
            "by_month": [],
            "all_transactions": [],
            "error": str(e)
        }


def update_uber_expense(trip_id: str, updates: Dict[str, Any]) -> Dict[str, Any]:
    """
    Atualiza uma despesa Uber por trip_eats_id.
    Também atualiza o registro correspondente em valor_expenses.
    """
    client = get_bigquery_client()
    
    # Campos permitidos para atualização no uber_expenses
    uber_allowed_fields = ["user_name", "first_name", "last_name", "service", "city", "project"]
    uber_set_parts = []
    
    for field in uber_allowed_fields:
        if field in updates:
            value = updates[field]
            if value is None:
                uber_set_parts.append(f"{field} = NULL")
            else:
                escaped_value = str(value).replace("'", "\\'")
                uber_set_parts.append(f"{field} = '{escaped_value}'")
    
    errors = []
    
    # 1. Atualizar uber_expenses se houver campos relevantes
    if uber_set_parts:
        uber_query = f"""
            UPDATE `{FULL_TABLE_ID}`
            SET {', '.join(uber_set_parts)}
            WHERE trip_eats_id = '{trip_id}'
        """
        try:
            client.query(uber_query).result()
        except Exception as e:
            errors.append(f"Erro ao atualizar uber_expenses: {str(e)}")
    
    # 2. Atualizar valor_expenses
    valor_id = f"uber_{trip_id}"
    valor_allowed_fields = ["name", "amount", "category", "vendor", "project"]
    valor_set_parts = []
    
    # Mapear campos do uber para valor
    if "first_name" in updates or "last_name" in updates:
        # Normalizar nomes se fornecidos
        if "first_name" in updates:
            updates["first_name"], _ = normalize_uber_name(updates["first_name"], "")
        if "last_name" in updates:
            _, updates["last_name"] = normalize_uber_name("", updates["last_name"])
        
        # Buscar nome completo atual se não tiver ambos
        if "first_name" in updates and "last_name" in updates:
            full_name = f"{updates['first_name']} {updates['last_name']}".strip()
        else:
            # Buscar o valor atual
            name_query = f"""
                SELECT first_name, last_name FROM `{FULL_TABLE_ID}`
                WHERE trip_eats_id = '{trip_id}'
            """
            try:
                result = list(client.query(name_query).result())
                if result:
                    first = updates.get("first_name", result[0].first_name or "")
                    last = updates.get("last_name", result[0].last_name or "")
                    full_name = f"{first} {last}".strip()
                else:
                    full_name = updates.get("first_name", "") + " " + updates.get("last_name", "")
            except:
                full_name = updates.get("first_name", "") + " " + updates.get("last_name", "")
        
        escaped_name = full_name.replace("'", "\\'")
        valor_set_parts.append(f"name = '{escaped_name}'")
    
    if "category" in updates:
        escaped_cat = str(updates["category"]).replace("'", "\\'")
        valor_set_parts.append(f"category = '{escaped_cat}'")
    
    if "amount" in updates:
        valor_set_parts.append(f"amount = {float(updates['amount'])}")
    
    if "vendor" in updates:
        escaped_vendor = str(updates["vendor"]).replace("'", "\\'")
        valor_set_parts.append(f"vendor = '{escaped_vendor}'")
    
    if "project" in updates:
        escaped_project = str(updates["project"]).replace("'", "\\'") if updates["project"] else ""
        valor_set_parts.append(f"project = '{escaped_project}'")
    
    if valor_set_parts:
        valor_query = f"""
            UPDATE `{FULL_VALOR_TABLE_ID}`
            SET {', '.join(valor_set_parts)}
            WHERE id = '{valor_id}'
        """
        try:
            client.query(valor_query).result()
        except Exception as e:
            errors.append(f"Erro ao atualizar valor_expenses: {str(e)}")
    
    if errors:
        return {"success": False, "errors": errors}
    
    return {"success": True}


def delete_uber_expense(trip_id: str) -> Dict[str, Any]:
    """
    Deleta uma despesa Uber por trip_eats_id.
    Também remove o registro correspondente em valor_expenses.
    """
    client = get_bigquery_client()
    errors = []
    
    # 1. Deletar de uber_expenses
    uber_query = f"""
        DELETE FROM `{FULL_TABLE_ID}`
        WHERE trip_eats_id = '{trip_id}'
    """
    try:
        client.query(uber_query).result()
    except Exception as e:
        errors.append(f"Erro ao deletar uber_expenses: {str(e)}")
    
    # 2. Deletar de valor_expenses
    valor_id = f"uber_{trip_id}"
    valor_query = f"""
        DELETE FROM `{FULL_VALOR_TABLE_ID}`
        WHERE id = '{valor_id}'
    """
    try:
        client.query(valor_query).result()
    except Exception as e:
        errors.append(f"Erro ao deletar valor_expenses: {str(e)}")
    
    if errors:
        return {"success": False, "errors": errors}
    
    return {"success": True}


def resync_all_uber_to_valor() -> Dict[str, Any]:
    """
    Re-sincroniza TODOS os registros do uber_expenses com valor_expenses usando MERGE.
    Isso não duplica - atualiza registros existentes ou insere novos.
    """
    client = get_bigquery_client()
    
    try:
        # Buscar todos os registros do uber_expenses
        query = f"""
            SELECT trip_eats_id, first_name, last_name, transaction_amount_usd, transaction_amount_brl,
                   transaction_timestamp_utc, service, city, project
            FROM `{FULL_TABLE_ID}`
        """
        result = list(client.query(query).result())
        
        if not result:
            return {"success": True, "synced_count": 0, "message": "No Uber expenses to sync"}
        
        # Preparar dados para MERGE
        valor_rows = []
        for row in result:
            trip_id = row.trip_eats_id or ""
            first_name = row.first_name or ""
            last_name = row.last_name or ""
            # Normalizar nomes (remover acentos, etc.)
            first_name, last_name = normalize_uber_name(first_name, last_name)
            full_name = f"{first_name} {last_name}".strip()
            
            # Usar USD se disponível
            try:
                amount = float(row.transaction_amount_usd) if row.transaction_amount_usd else (float(row.transaction_amount_brl) if row.transaction_amount_brl else 0)
            except:
                amount = 0
            
            # Extrair data
            try:
                if row.transaction_timestamp_utc:
                    dt = pd.to_datetime(row.transaction_timestamp_utc)
                    date_str = dt.strftime('%Y-%m-%d')
                    year = dt.year
                    month = dt.month
                else:
                    date_str = "1900-01-01"
                    year = 2024
                    month = 1
            except:
                date_str = "1900-01-01"
                year = 2024
                month = 1
            
            service = row.service or ""
            vendor = f"Uber {service}".strip() if service else "Uber"
            project = row.project or ""
            
            valor_id = f"uber_{trip_id}" if trip_id else str(uuid.uuid4())
            
            valor_rows.append({
                "id": valor_id,
                "name": full_name,
                "amount": amount,
                "category": "Ground Transportation - Travel",
                "date": date_str,
                "vendor": vendor,
                "year": year,
                "month": month,
                "source": "Uber",
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
        
        return {
            "success": True,
            "synced_count": total_synced,
            "message": f"Synced {total_synced} Uber expenses to valor_expenses (using MERGE - no duplicates)"
        }
        
    except Exception as e:
        return {"success": False, "error": str(e)}


def delete_uber_expenses_batch(trip_ids: List[str]) -> Dict[str, Any]:
    """
    Deleta múltiplas despesas Uber por trip_eats_id.
    Também remove os registros correspondentes em valor_expenses.
    """
    if not trip_ids:
        return {"success": False, "error": "Nenhum ID fornecido"}
    
    client = get_bigquery_client()
    errors = []
    
    # Build IN clauses
    uber_ids_list = ", ".join([f"'{tid}'" for tid in trip_ids])
    valor_ids_list = ", ".join([f"'uber_{tid}'" for tid in trip_ids])
    
    # 1. Deletar de uber_expenses
    uber_query = f"""
        DELETE FROM `{FULL_TABLE_ID}`
        WHERE trip_eats_id IN ({uber_ids_list})
    """
    try:
        client.query(uber_query).result()
    except Exception as e:
        errors.append(f"Erro ao deletar uber_expenses: {str(e)}")
    
    # 2. Deletar de valor_expenses
    valor_query = f"""
        DELETE FROM `{FULL_VALOR_TABLE_ID}`
        WHERE id IN ({valor_ids_list})
    """
    try:
        client.query(valor_query).result()
    except Exception as e:
        errors.append(f"Erro ao deletar valor_expenses: {str(e)}")
    
    if errors:
        return {"success": False, "errors": errors, "deleted_count": len(trip_ids)}
    
    return {"success": True, "deleted_count": len(trip_ids)}
