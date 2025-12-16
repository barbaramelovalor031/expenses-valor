# 🚀 Deploy Guide - Expenses Portal to GCP Cloud Run

## Pré-requisitos

1. **Google Cloud SDK** instalado
2. **Conta GCP** com billing ativado
3. **Projeto GCP** (você já tem: `automatic-bond-462415-h6`)

---

## 📋 Passo a Passo

### 1. Configurar GCloud CLI

```bash
# Login no GCP
gcloud auth login

# Configurar projeto
gcloud config set project automatic-bond-462415-h6

# Habilitar APIs necessárias
gcloud services enable cloudbuild.googleapis.com
gcloud services enable run.googleapis.com
gcloud services enable secretmanager.googleapis.com
gcloud services enable containerregistry.googleapis.com
```

### 2. Criar Secrets no Secret Manager

```bash
# Criar secret para OpenAI API Key
echo -n "SUA_OPENAI_API_KEY" | gcloud secrets create openai-api-key --data-file=-

# Upload do arquivo de credenciais do BigQuery
gcloud secrets create bq-service-account --data-file=backend/credentials/bq-service-account.json
```

### 3. Dar Permissões ao Cloud Build

```bash
# Obter o número do projeto
PROJECT_NUMBER=$(gcloud projects describe automatic-bond-462415-h6 --format='value(projectNumber)')

# Dar permissão ao Cloud Build para acessar secrets
gcloud secrets add-iam-policy-binding openai-api-key \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding bq-service-account \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/secretmanager.secretAccessor"

# Dar permissão ao Cloud Build para deploy no Cloud Run
gcloud projects add-iam-policy-binding automatic-bond-462415-h6 \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/run.admin"

gcloud iam service-accounts add-iam-policy-binding \
    ${PROJECT_NUMBER}-compute@developer.gserviceaccount.com \
    --member="serviceAccount:${PROJECT_NUMBER}@cloudbuild.gserviceaccount.com" \
    --role="roles/iam.serviceAccountUser"
```

### 4. Deploy Manual (Primeira vez)

```bash
# Na raiz do projeto
cd /Users/barbara/Documents/card-extractor-pro-main

# Fazer deploy via Cloud Build
gcloud builds submit --config=cloudbuild.yaml
```

### 5. (Opcional) Configurar Deploy Automático via GitHub

```bash
# Conectar repositório GitHub ao Cloud Build
gcloud builds triggers create github \
    --name="expenses-portal-deploy" \
    --repo-name="expenses-valor" \
    --repo-owner="barbaramelovalor031" \
    --branch-pattern="^main$" \
    --build-config="cloudbuild.yaml"
```

---

## 🔗 URLs Após Deploy

Após o deploy, você receberá URLs como:
- **Frontend**: `https://expenses-frontend-XXXXX-uc.a.run.app`
- **Backend**: `https://expenses-backend-XXXXX-uc.a.run.app`

---

## 🌐 (Opcional) Domínio Customizado

Para usar um domínio próprio (ex: `expenses.suaempresa.com`):

```bash
# Mapear domínio customizado
gcloud run domain-mappings create \
    --service expenses-frontend \
    --domain expenses.suaempresa.com \
    --region us-central1
```

---

## 💰 Custos Estimados

| Serviço | Custo Estimado |
|---------|----------------|
| Cloud Run (Frontend) | ~$0-5/mês |
| Cloud Run (Backend) | ~$5-15/mês |
| BigQuery | Já incluso no seu uso atual |
| Secret Manager | ~$0.06/secret/mês |
| **Total** | **~$5-20/mês** |

---

## 🛠️ Comandos Úteis

```bash
# Ver logs do backend
gcloud run services logs read expenses-backend --region us-central1

# Ver logs do frontend
gcloud run services logs read expenses-frontend --region us-central1

# Listar serviços
gcloud run services list --region us-central1

# Atualizar apenas backend
gcloud builds submit --config=cloudbuild.yaml --substitutions=_DEPLOY_BACKEND=true

# Deletar serviços (se necessário)
gcloud run services delete expenses-backend --region us-central1
gcloud run services delete expenses-frontend --region us-central1
```

---

## ⚠️ Troubleshooting

### Erro de permissão no BigQuery
Certifique-se que o service account tem acesso ao dataset:
```bash
# No console do BigQuery, adicione o service account do Cloud Run
# com papel "BigQuery Data Editor" e "BigQuery Job User"
```

### Erro de CORS
O backend já está configurado para aceitar todas as origens. Se precisar restringir:
```python
# Em backend/main.py, altere:
allow_origins=["https://expenses-frontend-XXXXX-uc.a.run.app"]
```

### Container não inicia
Verifique os logs:
```bash
gcloud run services logs read expenses-backend --region us-central1 --limit 50
```

---

## ✅ Checklist de Deploy

- [ ] GCloud CLI instalado e configurado
- [ ] APIs habilitadas (Cloud Build, Cloud Run, Secret Manager)
- [ ] Secrets criados (openai-api-key, bq-service-account)
- [ ] Permissões configuradas
- [ ] Deploy executado com sucesso
- [ ] URLs funcionando
- [ ] Testar todas as funcionalidades
