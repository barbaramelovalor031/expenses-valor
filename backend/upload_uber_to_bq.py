"""
Script para fazer upload do Excel Uber Data Base para BigQuery
Tabela: automatic-bond-462415-h6.finance.uber_expenses

Inclui conversão de BRL para USD usando cotação PTAX do Banco Central
"""

import pandas as pd
from google.cloud import bigquery
from google.oauth2 import service_account
import os
import requests
from datetime import datetime, timedelta
from typing import Optional

# Configurações
SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), "credentials", "bq-service-account.json")
PROJECT_ID = "automatic-bond-462415-h6"
DATASET_ID = "finance"
TABLE_ID = "uber_expenses"
FULL_TABLE_ID = f"{PROJECT_ID}.{DATASET_ID}.{TABLE_ID}"

# Caminho do arquivo Excel
EXCEL_FILE = os.path.join(os.path.dirname(__file__), "..", "Uber Data Base.xlsx")

# Cache de cotações para evitar chamadas repetidas
PTAX_CACHE = {}


def get_cotacao_dolar_ptax(data_iso: str) -> Optional[float]:
    """
    Busca cotação do dólar PTAX do Banco Central.
    data_iso no formato YYYY-MM-DD.
    Usa fallback para dia útil anterior se não houver cotação.
    Retorna a cotacaoVenda (fechamento) como float.
    """
    if data_iso in PTAX_CACHE:
        return PTAX_CACHE[data_iso]

    try:
        dt = datetime.strptime(data_iso, "%Y-%m-%d")
    except:
        PTAX_CACHE[data_iso] = None
        return None
    
    # Tenta até 7 dias anteriores para encontrar dia útil
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
            print(f"[WARN] Erro ao buscar PTAX para {data_iso} ({data_bcb}): {e}")
            PTAX_CACHE[data_iso] = None
            return None

        valores = data.get("value", [])
        if valores:
            ultimo = valores[-1]
            rate = float(ultimo["cotacaoVenda"])
            PTAX_CACHE[data_iso] = rate
            return rate

        # Tenta dia anterior
        dt = dt - timedelta(days=1)

    PTAX_CACHE[data_iso] = None
    return None


def convert_brl_to_usd(df: pd.DataFrame) -> pd.DataFrame:
    """
    Converte valores de BRL para USD usando cotação PTAX do dia da transação.
    Usa a coluna transaction_timestamp_utc para pegar a data.
    Converte a coluna transaction_amount_brl para USD.
    """
    print("\n💱 Convertendo valores BRL para USD...")
    
    # Colunas que vamos usar
    timestamp_col = 'transaction_timestamp_utc'
    brl_col = 'transaction_amount_brl'
    
    if timestamp_col not in df.columns:
        print(f"   ⚠️ Coluna '{timestamp_col}' não encontrada. Pulando conversão.")
        df['transaction_amount_usd'] = None
        df['ptax_rate'] = None
        return df
    
    if brl_col not in df.columns:
        print(f"   ⚠️ Coluna '{brl_col}' não encontrada. Pulando conversão.")
        df['transaction_amount_usd'] = None
        df['ptax_rate'] = None
        return df
    
    # Extrair datas únicas para buscar cotações
    df['_temp_date'] = pd.to_datetime(df[timestamp_col], errors='coerce').dt.strftime('%Y-%m-%d')
    unique_dates = df['_temp_date'].dropna().unique()
    
    print(f"   → Buscando cotações para {len(unique_dates)} datas únicas...")
    
    # Buscar cotações para todas as datas únicas
    cotacoes = {}
    for i, data in enumerate(unique_dates):
        if pd.notna(data) and data != 'NaT':
            rate = get_cotacao_dolar_ptax(data)
            cotacoes[data] = rate
            if (i + 1) % 50 == 0:
                print(f"   → Progresso: {i + 1}/{len(unique_dates)} datas processadas")
    
    print(f"   → {len([v for v in cotacoes.values() if v])} cotações encontradas")
    
    # Aplicar conversão
    def convert_row(row):
        date = row['_temp_date']
        brl_amount = row[brl_col]
        
        if pd.isna(date) or pd.isna(brl_amount):
            return pd.Series({'transaction_amount_usd': None, 'ptax_rate': None})
        
        try:
            brl_amount = float(brl_amount)
        except:
            return pd.Series({'transaction_amount_usd': None, 'ptax_rate': None})
        
        rate = cotacoes.get(date)
        if rate and rate > 0:
            usd_amount = round(brl_amount / rate, 2)
            return pd.Series({'transaction_amount_usd': usd_amount, 'ptax_rate': rate})
        
        return pd.Series({'transaction_amount_usd': None, 'ptax_rate': None})
    
    # Aplicar a conversão
    converted = df.apply(convert_row, axis=1)
    df['transaction_amount_usd'] = converted['transaction_amount_usd']
    df['ptax_rate'] = converted['ptax_rate']
    
    # Remover coluna temporária
    df = df.drop(columns=['_temp_date'])
    
    # Estatísticas
    converted_count = df['transaction_amount_usd'].notna().sum()
    total_brl = df[brl_col].sum() if df[brl_col].dtype in ['float64', 'int64'] else 0
    total_usd = df['transaction_amount_usd'].sum() if df['transaction_amount_usd'].notna().any() else 0
    
    print(f"   ✓ {converted_count} de {len(df)} transações convertidas")
    if total_brl > 0:
        print(f"   ✓ Total BRL: R$ {total_brl:,.2f}")
    if total_usd > 0:
        print(f"   ✓ Total USD: $ {total_usd:,.2f}")
    
    return df


def clean_column_names(df: pd.DataFrame) -> pd.DataFrame:
    """
    Limpa nomes das colunas para serem compatíveis com BigQuery
    - Remove caracteres especiais
    - Substitui espaços por underscores
    - Converte para lowercase
    """
    import re
    
    new_columns = {}
    for col in df.columns:
        new_name = col.lower()
        new_name = new_name.replace(" ", "_")
        new_name = new_name.replace("/", "_")
        new_name = new_name.replace("-", "_")
        new_name = new_name.replace("#", "num")
        # Remove todos os caracteres que não são letras, números ou underscore
        new_name = re.sub(r'[^a-z0-9_]', '', new_name)
        # Remove underscores duplicados
        new_name = re.sub(r'_+', '_', new_name)
        # Remove underscore no início ou fim
        new_name = new_name.strip('_')
        # Trunca para 300 caracteres (limite do BigQuery)
        new_name = new_name[:300]
        new_columns[col] = new_name
    
    return df.rename(columns=new_columns)


def prepare_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Prepara o DataFrame para upload no BigQuery
    """
    # Limpar nomes das colunas
    df = clean_column_names(df)
    
    # NÃO converter para string ainda - precisa fazer a conversão USD primeiro
    return df


def finalize_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    """
    Finaliza o DataFrame convertendo para strings antes do upload
    """
    # Converter TODAS as colunas para string para evitar problemas de tipo
    for col in df.columns:
        # Converter para string, tratando NaN como None
        df[col] = df[col].apply(lambda x: str(x) if pd.notna(x) and x != '' else None)
    
    return df


def create_bigquery_client():
    """
    Cria cliente BigQuery usando service account
    """
    credentials = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE,
        scopes=["https://www.googleapis.com/auth/bigquery"]
    )
    
    client = bigquery.Client(credentials=credentials, project=PROJECT_ID)
    return client


def create_dataset_if_not_exists(client: bigquery.Client):
    """
    Cria o dataset se não existir
    """
    dataset_ref = f"{PROJECT_ID}.{DATASET_ID}"
    
    try:
        client.get_dataset(dataset_ref)
        print(f"✓ Dataset '{DATASET_ID}' já existe")
    except Exception:
        dataset = bigquery.Dataset(dataset_ref)
        dataset.location = "US"
        client.create_dataset(dataset, exists_ok=True)
        print(f"✓ Dataset '{DATASET_ID}' criado com sucesso")


def upload_to_bigquery(df: pd.DataFrame, client: bigquery.Client):
    """
    Faz upload do DataFrame para BigQuery
    """
    # Configuração do job
    job_config = bigquery.LoadJobConfig(
        write_disposition=bigquery.WriteDisposition.WRITE_TRUNCATE,  # Substitui a tabela
        autodetect=True,  # Auto detecta schema
    )
    
    print(f"\n📤 Fazendo upload de {len(df)} linhas para {FULL_TABLE_ID}...")
    
    # Upload
    job = client.load_table_from_dataframe(df, FULL_TABLE_ID, job_config=job_config)
    job.result()  # Aguarda conclusão
    
    # Verifica resultado
    table = client.get_table(FULL_TABLE_ID)
    print(f"✓ Upload concluído! Tabela {FULL_TABLE_ID} agora tem {table.num_rows} linhas")
    
    return table


def main():
    print("=" * 60)
    print("UPLOAD UBER DATA BASE PARA BIGQUERY")
    print("=" * 60)
    
    # 1. Verificar se arquivo de credenciais existe
    if not os.path.exists(SERVICE_ACCOUNT_FILE):
        print(f"\n❌ Arquivo de credenciais não encontrado: {SERVICE_ACCOUNT_FILE}")
        print("   Por favor, copie o arquivo JSON da service account para:")
        print(f"   {SERVICE_ACCOUNT_FILE}")
        return
    
    # 2. Ler o Excel
    print(f"\n📖 Lendo arquivo: {EXCEL_FILE}")
    df = pd.read_excel(EXCEL_FILE)
    print(f"   → {len(df)} linhas, {len(df.columns)} colunas")
    
    # 3. Preparar dados
    print("\n🔧 Preparando dados...")
    df = prepare_dataframe(df)
    print(f"   → Colunas renomeadas para formato BigQuery")
    
    # 4. Converter BRL para USD usando cotação PTAX
    df = convert_brl_to_usd(df)
    
    # 5. Finalizar DataFrame (converter para strings)
    df = finalize_dataframe(df)
    
    # 6. Criar cliente BigQuery
    print("\n🔑 Conectando ao BigQuery...")
    client = create_bigquery_client()
    print("   → Conexão estabelecida")
    
    # 6. Criar dataset se não existir
    create_dataset_if_not_exists(client)
    
    # 7. Upload
    table = upload_to_bigquery(df, client)
    
    # 8. Mostrar schema final
    print("\n📋 Schema da tabela:")
    for field in table.schema[:10]:  # Mostra primeiros 10 campos
        print(f"   • {field.name}: {field.field_type}")
    if len(table.schema) > 10:
        print(f"   ... e mais {len(table.schema) - 10} campos")
    
    print("\n" + "=" * 60)
    print("✅ UPLOAD CONCLUÍDO COM SUCESSO!")
    print("=" * 60)


if __name__ == "__main__":
    main()
