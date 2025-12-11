from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
import tempfile
import os
import pandas as pd
from io import BytesIO
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

from extractors.svb import extract_svb
from extractors.amex import extract_amex
from extractors.bradesco import extract_bradesco
from services.categorizer import categorize_transactions, EXPENSE_CATEGORIES
from services.rippling import process_rippling_file, export_rippling_to_excel
from services.michael import process_michael_file, categorize_michael_transactions, export_michael_to_excel
from services.uber import process_uber_csv, upload_new_rows_to_bigquery, get_uber_dashboard_data

app = FastAPI(
    title="Expenses Portal API",
    description="API for extracting credit card statement data",
    version="1.0.0"
)

# CORS - allows requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins in development
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"message": "Expenses Portal API", "status": "running"}


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.post("/extract")
async def extract_pdf(
    file: UploadFile = File(...),
    card_type: str = Form(...)
):
    """
    Extracts transactions from a credit card PDF statement.
    
    - **file**: PDF file of the statement
    - **card_type**: Card type (svb, amex, bradesco)
    """
    
    # Validate file type
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    # Validate card type
    valid_cards = ["svb", "amex", "bradesco"]
    if card_type.lower() not in valid_cards:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid card type. Use: {', '.join(valid_cards)}"
        )
    
    try:
        # Save file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        # Extract data based on card type
        card = card_type.lower()
        if card == "svb":
            result = extract_svb(tmp_path)
        elif card == "amex":
            result = extract_amex(tmp_path)
        elif card == "bradesco":
            result = extract_bradesco(tmp_path)
        else:
            raise HTTPException(status_code=400, detail="Card type not supported")
        
        # Remove temporary file
        os.unlink(tmp_path)
        
        return JSONResponse(content={
            "success": True,
            "filename": file.filename,
            "card_type": card_type,
            "total_transactions": len(result["transactions"]),
            "cardholders": result["cardholders"],
            "transactions": result["transactions"]
        })
        
    except Exception as e:
        # Remove temporary file in case of error
        if 'tmp_path' in locals():
            try:
                os.unlink(tmp_path)
            except:
                pass
        
        raise HTTPException(status_code=500, detail=f"Error processing PDF: {str(e)}")


@app.post("/export-excel")
async def export_excel(
    file: UploadFile = File(...),
    card_type: str = Form(...)
):
    """
    Extracts transactions and returns an Excel file with tabs per user and totals.
    """
    
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="File must be a PDF")
    
    valid_cards = ["svb", "amex", "bradesco"]
    if card_type.lower() not in valid_cards:
        raise HTTPException(status_code=400, detail=f"Invalid card type")
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        
        card = card_type.lower()
        if card == "svb":
            result = extract_svb(tmp_path)
        elif card == "amex":
            result = extract_amex(tmp_path)
        elif card == "bradesco":
            result = extract_bradesco(tmp_path)
        
        os.unlink(tmp_path)
        
        # Group transactions by cardholder
        by_cardholder = {}
        for tx in result["transactions"]:
            holder = tx.get("cardholder", "Unknown")
            if holder not in by_cardholder:
                by_cardholder[holder] = []
            by_cardholder[holder].append(tx)
        
        # Create Excel in memory
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            # Summary tab by user
            summary_data = []
            for holder, txs in by_cardholder.items():
                total = sum(tx.get("amount") or 0 for tx in txs)
                summary_data.append({
                    "Cardholder": holder,
                    "Total Transactions": len(txs),
                    "Total Amount (USD)": round(total, 2)
                })
            
            df_summary = pd.DataFrame(summary_data)
            df_summary.to_excel(writer, sheet_name="Summary", index=False)
            
            # One tab per cardholder
            for holder, txs in by_cardholder.items():
                df = pd.DataFrame(txs)
                
                # Select and rename columns
                columns_map = {
                    "date": "Date",
                    "description": "Description", 
                    "amount": "Amount (USD)"
                }
                
                df_export = pd.DataFrame()
                for old_col, new_col in columns_map.items():
                    if old_col in df.columns:
                        df_export[new_col] = df[old_col]
                
                # Limit sheet name to 31 characters
                sheet_name = holder[:31] if holder else "Unknown"
                df_export.to_excel(writer, sheet_name=sheet_name, index=False)
        
        output.seek(0)
        
        filename = file.filename.replace('.pdf', '_by_user.xlsx')
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        if 'tmp_path' in locals():
            try:
                os.unlink(tmp_path)
            except:
                pass
        raise HTTPException(status_code=500, detail=f"Error generating Excel: {str(e)}")


# Pydantic models for categorization
class Transaction(BaseModel):
    date: Optional[str] = None
    description: str
    amount: Optional[float] = None
    cardholder: Optional[str] = None
    category: Optional[str] = None
    ai_category: Optional[str] = None

class CategorizeRequest(BaseModel):
    transactions: List[Transaction]

class CategorizeResponse(BaseModel):
    success: bool
    transactions: List[dict]
    categories: List[str]


# Model for Michael transactions (includes extended_details and amex_category)
class MichaelTransaction(BaseModel):
    id: Optional[int] = None
    date: Optional[str] = None
    description: Optional[str] = None
    notes: Optional[str] = None
    amount: Optional[float] = None
    extended_details: Optional[str] = None
    amex_category: Optional[str] = None
    ai_category: Optional[str] = None
    city_state: Optional[str] = None

class MichaelCategorizeRequest(BaseModel):
    transactions: List[MichaelTransaction]


@app.post("/categorize", response_model=CategorizeResponse)
async def categorize_expenses(request: CategorizeRequest):
    """
    Categorize transactions using AI.
    
    - **transactions**: List of transactions with description field
    """
    try:
        # Convert to list of dicts
        transactions_list = [tx.model_dump() for tx in request.transactions]
        
        # Categorize using OpenAI
        categorized = categorize_transactions(transactions_list)
        
        return CategorizeResponse(
            success=True,
            transactions=categorized,
            categories=EXPENSE_CATEGORIES
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error categorizing: {str(e)}")


@app.get("/categories")
async def get_categories():
    """
    Get list of available expense categories.
    """
    return {"categories": EXPENSE_CATEGORIES}


# Model for export with categories
class ExportTransaction(BaseModel):
    date: Optional[str] = None
    description: str
    cardholder: Optional[str] = None
    ai_category: Optional[str] = None
    amount: Optional[float] = None

class ExportWithCategoriesRequest(BaseModel):
    transactions: List[ExportTransaction]
    filename: str


@app.post("/export-excel-with-categories")
async def export_excel_with_categories(request: ExportWithCategoriesRequest):
    """
    Export transactions to Excel with AI categories included.
    Creates tabs per user and includes the AI category column.
    """
    try:
        transactions_list = [tx.model_dump() for tx in request.transactions]
        
        # Group transactions by cardholder
        by_cardholder = {}
        for tx in transactions_list:
            holder = tx.get("cardholder") or "Unknown"
            if holder not in by_cardholder:
                by_cardholder[holder] = []
            by_cardholder[holder].append(tx)
        
        # Create Excel in memory
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            # Summary tab by user
            summary_data = []
            for holder, txs in by_cardholder.items():
                total = sum(tx.get("amount") or 0 for tx in txs)
                categorized_count = len([tx for tx in txs if tx.get("ai_category")])
                summary_data.append({
                    "Cardholder": holder,
                    "Total Transactions": len(txs),
                    "Categorized": categorized_count,
                    "Total Amount (USD)": round(total, 2)
                })
            
            df_summary = pd.DataFrame(summary_data)
            df_summary.to_excel(writer, sheet_name="Summary", index=False)
            
            # All transactions tab with categories
            all_data = []
            for tx in transactions_list:
                all_data.append({
                    "Date": tx.get("date", ""),
                    "Description": tx.get("description", ""),
                    "Cardholder": tx.get("cardholder", ""),
                    "Category": tx.get("ai_category", ""),
                    "Amount (USD)": tx.get("amount", 0)
                })
            
            df_all = pd.DataFrame(all_data)
            df_all.to_excel(writer, sheet_name="All Transactions", index=False)
            
            # One tab per cardholder
            for holder, txs in by_cardholder.items():
                data = []
                for tx in txs:
                    data.append({
                        "Date": tx.get("date", ""),
                        "Description": tx.get("description", ""),
                        "Category": tx.get("ai_category", ""),
                        "Amount (USD)": tx.get("amount", 0)
                    })
                
                df = pd.DataFrame(data)
                
                # Limit sheet name to 31 characters
                sheet_name = holder[:31] if holder else "Unknown"
                df.to_excel(writer, sheet_name=sheet_name, index=False)
        
        output.seek(0)
        
        filename = f"{request.filename}_with_categories.xlsx"
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generating Excel: {str(e)}")


# ==================== RIPPLING ENDPOINTS ====================

@app.post("/rippling/process")
async def process_rippling(file: UploadFile = File(...)):
    """
    Processa arquivo Rippling (CSV ou XLSX) e retorna dados agregados por funcionário e categoria.
    """
    # Validar tipo de arquivo
    filename = file.filename.lower()
    if not (filename.endswith('.csv') or filename.endswith('.xlsx') or filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail="Arquivo deve ser CSV ou Excel (.xlsx/.xls)")
    
    try:
        content = await file.read()
        result = process_rippling_file(content, file.filename)
        
        return JSONResponse(content={
            "success": True,
            "filename": file.filename,
            **result
        })
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar arquivo: {str(e)}")


@app.post("/rippling/export")
async def export_rippling(file: UploadFile = File(...)):
    """
    Processa arquivo Rippling e retorna Excel formatado com pivot por funcionário/categoria.
    """
    filename = file.filename.lower()
    if not (filename.endswith('.csv') or filename.endswith('.xlsx') or filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail="Arquivo deve ser CSV ou Excel (.xlsx/.xls)")
    
    try:
        content = await file.read()
        data = process_rippling_file(content, file.filename)
        excel_content = export_rippling_to_excel(data)
        
        output = BytesIO(excel_content)
        export_filename = file.filename.rsplit('.', 1)[0] + '_report.xlsx'
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={export_filename}"}
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar Excel: {str(e)}")


# ==================== MICHAEL CREDIT CARD ENDPOINTS ====================

@app.post("/michael/process")
async def process_michael(file: UploadFile = File(...)):
    """
    Processa arquivo Excel do Michael e retorna transações.
    """
    filename = file.filename.lower()
    if not (filename.endswith('.csv') or filename.endswith('.xlsx') or filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail="Arquivo deve ser CSV ou Excel (.xlsx/.xls)")
    
    try:
        content = await file.read()
        result = process_michael_file(content, file.filename)
        
        return JSONResponse(content={
            "success": True,
            "filename": file.filename,
            **result
        })
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar arquivo: {str(e)}")


@app.post("/michael/categorize")
async def categorize_michael(request: MichaelCategorizeRequest):
    """
    Categoriza transações do Michael usando AI.
    """
    try:
        transactions = [t.model_dump() for t in request.transactions]
        print(f"[DEBUG] Received {len(transactions)} transactions for categorization")
        if transactions:
            print(f"[DEBUG] First tx: extended_details[:50]='{transactions[0].get('extended_details', '')[:50] if transactions[0].get('extended_details') else ''}', amex_category='{transactions[0].get('amex_category', '')}'")
        
        categorized = categorize_michael_transactions(transactions)
        
        return JSONResponse(content={
            "success": True,
            "transactions": categorized
        })
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao categorizar: {str(e)}")


@app.post("/michael/export")
async def export_michael(request: MichaelCategorizeRequest):
    """
    Exporta transações categorizadas do Michael para Excel.
    """
    try:
        transactions = [t.model_dump() for t in request.transactions]
        excel_content = export_michael_to_excel(transactions)
        
        output = BytesIO(excel_content)
        
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=michael_categorized.xlsx"}
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao gerar Excel: {str(e)}")


# =====================================================
# UBER ENDPOINTS
# =====================================================

@app.post("/uber/preview")
async def uber_preview(file: UploadFile = File(...)):
    """
    Processa CSV do Uber e retorna preview das novas linhas.
    Compara com a base existente no BigQuery.
    """
    try:
        content = await file.read()
        result = process_uber_csv(content, file.filename)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao processar CSV: {str(e)}")


@app.post("/uber/upload")
async def uber_upload(file: UploadFile = File(...)):
    """
    Faz upload das novas linhas do CSV para o BigQuery.
    Apenas linhas que não existem na base são inseridas.
    """
    try:
        content = await file.read()
        result = upload_new_rows_to_bigquery(content)
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao fazer upload: {str(e)}")


@app.get("/uber/dashboard")
async def uber_dashboard():
    """
    Retorna dados agregados para o dashboard do Uber.
    """
    try:
        result = get_uber_dashboard_data()
        return JSONResponse(content=result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar dados: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
