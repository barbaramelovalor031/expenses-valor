"""
Uber expenses service - Upload incremental para BigQuery com conversão BRL→USD
"""
import pandas as pd
from io import BytesIO, StringIO
from typing import Dict, List, Any, Optional
import requests
from datetime import datetime, timedelta
import re

from google.cloud import bigquery
from google.oauth2 import service_account
import os

# Configurações BigQuery
SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), "..", "credentials", "bq-service-account.json")
PROJECT_ID = "automatic-bond-462415-h6"
DATASET_ID = "finance"
TABLE_ID = "uber_expenses"
FULL_TABLE_ID = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"

# Cache de cotações PTAX
PTAX_CACHE = {}


def get_bigquery_client():
    """Cria cliente BigQuery usando service account"""
    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE,
        scopes=["https://www.googleapis.com/auth/bigquery"]
    )
    return bigquery.Client(credentials=credentials, project=PROJECT_ID)


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
                    'service', 'city', 'transaction_amount_brl', 'transaction_amount_usd', 'ptax_rate']
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


def upload_new_rows_to_bigquery(file_content: bytes) -> Dict[str, Any]:
    """
    Faz upload das novas linhas para o BigQuery usando MERGE para evitar duplicados.
    Mesmo se o mesmo CSV for enviado múltiplas vezes, não haverá duplicados.
    """
    # 1. Parsear e processar
    df = parse_uber_csv(file_content)
    
    if len(df) == 0:
        return {
            "success": True,
            "message": "CSV vazio",
            "rows_inserted": 0
        }
    
    # 2. Converter BRL para USD
    df = convert_brl_to_usd(df)
    
    # 3. Converter todas as colunas para string (para evitar problemas de tipo)
    for col in df.columns:
        df[col] = df[col].apply(lambda x: str(x) if pd.notna(x) and x != '' else None)
    
    client = get_bigquery_client()
    
    # 4. Criar tabela temporária com os dados do CSV
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
        
        # 5. MERGE: inserir apenas registros que não existem (baseado em trip_eats_id)
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
        
        # 6. Deletar tabela temporária
        client.delete_table(temp_table_id, not_found_ok=True)
        
        return {
            "success": True,
            "message": f"{rows_inserted} linhas inseridas com sucesso (duplicados ignorados)",
            "rows_inserted": rows_inserted
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
            "rows_inserted": 0
        }


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
                city,
                pickup_address,
                drop_off_address as dropoff_address,
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
