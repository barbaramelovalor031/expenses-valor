"""
BigQuery client factory - works both locally and in Cloud Run
"""

import os
from google.cloud import bigquery
from google.oauth2 import service_account

# Configurações
PROJECT_ID = "automatic-bond-462415-h6"
DATASET_ID = "finance"

# Path para credenciais locais
SERVICE_ACCOUNT_FILE = os.path.join(os.path.dirname(__file__), "..", "credentials", "bq-service-account.json")


def get_bigquery_client() -> bigquery.Client:
    """
    Cria cliente BigQuery.
    - Em ambiente local: usa arquivo de credenciais
    - No Cloud Run: usa Application Default Credentials
    """
    # Verifica se existe arquivo de credenciais local
    if os.path.exists(SERVICE_ACCOUNT_FILE):
        credentials = service_account.Credentials.from_service_account_file(
            SERVICE_ACCOUNT_FILE,
            scopes=["https://www.googleapis.com/auth/bigquery"]
        )
        return bigquery.Client(credentials=credentials, project=PROJECT_ID)
    
    # Se não existe, usa ADC (Application Default Credentials)
    # Funciona automaticamente no Cloud Run
    return bigquery.Client(project=PROJECT_ID)


# Alias para compatibilidade
def get_client() -> bigquery.Client:
    return get_bigquery_client()
