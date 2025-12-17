from fastapi import FastAPI, UploadFile, File, Form, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
import tempfile
import os
import uuid
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
from services.michael import (
    process_michael_file, categorize_michael_transactions, export_michael_to_excel,
    get_michael_expenses, get_michael_batches, add_michael_expenses_to_db,
    update_michael_expense, delete_michael_expense, delete_michael_batch,
    sync_michael_to_valor, get_michael_summary
)
from services.uber import process_uber_csv, upload_new_rows_to_bigquery, get_uber_dashboard_data
from services.rippling_employees import (
    get_all_employees, get_unique_display_names, add_employee, 
    update_employee, delete_employee, get_employee_types
)
from services.expenses_ytd import (
    get_all_expenses as get_ytd_expenses,
    get_expenses_summary as get_ytd_summary,
    get_expenses_by_employee_type as get_ytd_by_type,
    get_expense_categories as get_ytd_categories,
    get_available_years as get_ytd_years,
    add_expenses_to_consolidated,
    undo_expenses_from_consolidated
)
from services.credit_card_expenses import (
    add_credit_card_expenses,
    get_credit_card_expenses,
    get_credit_card_batches,
    delete_credit_card_expense,
    delete_credit_card_expenses_batch,
    delete_credit_card_batch,
    get_all_credit_card_expenses,
    get_credit_card_summary,
    get_unique_users as get_cc_users,
    get_unique_categories as get_cc_categories,
    get_available_years as get_cc_years,
    add_credit_card_expense,
    add_credit_card_expenses_batch,
    update_credit_card_expense,
    sync_to_valor_expenses as sync_cc_to_valor,
    VALID_CREDIT_CARDS,
    apply_firm_uber_rule
)
from services.rippling_expenses import (
    parse_rippling_file,
    upload_rippling_expenses,
    get_rippling_expenses,
    get_rippling_batches,
    delete_rippling_batch,
    delete_rippling_expense,
    update_rippling_expense,
    get_rippling_summary,
    get_employee_mapping,
    normalize_name
)
from services.valor_expenses import (
    get_all_expenses as get_valor_expenses,
    get_expenses_by_employee as get_valor_by_employee,
    get_summary as get_valor_summary,
    get_available_years as get_valor_years,
    get_categories as get_valor_categories,
    get_names as get_valor_names,
    get_vendors as get_valor_vendors,
    get_monthly_breakdown as get_valor_monthly,
    add_expenses as add_valor_expenses,
    delete_expense as delete_valor_expense,
    clear_vendor_for_credit_card_expenses,
    fix_category_case,
    export_consolidated_by_category
)
from services.it_subscriptions import (
    get_it_subscriptions,
    extract_vendors_for_expenses,
    get_it_subscriptions_summary
)

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
# MICHAEL CARD DATABASE ENDPOINTS
# =====================================================

class MichaelExpenseInput(BaseModel):
    date: str
    description: str
    card_member: Optional[str] = "Michael Nicklas"
    amount: float
    category: str
    project: Optional[str] = ""

class MichaelExpenseUpdate(BaseModel):
    category: Optional[str] = None
    project: Optional[str] = None
    description: Optional[str] = None
    amount: Optional[float] = None
    date: Optional[str] = None

class MichaelExpensesBatchInput(BaseModel):
    expenses: List[MichaelExpenseInput]

@app.get("/michael-expenses")
async def get_michael_expenses_endpoint(year: int = None, limit: int = 1000):
    """Get all Michael expenses."""
    try:
        expenses = get_michael_expenses(year=year, limit=limit)
        return {"expenses": expenses, "count": len(expenses)}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/michael-expenses/batches")
async def get_michael_batches_endpoint():
    """Get all Michael expense batches."""
    try:
        batches = get_michael_batches()
        return {"batches": batches}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/michael-expenses/summary")
async def get_michael_summary_endpoint(year: int = None):
    """Get Michael expenses summary."""
    try:
        summary = get_michael_summary(year=year)
        return summary
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/michael-expenses")
async def add_michael_expenses_endpoint(data: MichaelExpensesBatchInput):
    """Add batch of Michael expenses."""
    try:
        expenses = [exp.model_dump() for exp in data.expenses]
        result = add_michael_expenses_to_db(expenses)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.put("/michael-expenses/{expense_id}")
async def update_michael_expense_endpoint(expense_id: str, updates: MichaelExpenseUpdate):
    """Update a Michael expense."""
    try:
        updates_dict = {k: v for k, v in updates.model_dump().items() if v is not None}
        result = update_michael_expense(expense_id, updates_dict)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/michael-expenses/{expense_id}")
async def delete_michael_expense_endpoint(expense_id: str):
    """Delete a Michael expense."""
    try:
        result = delete_michael_expense(expense_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/michael-expenses/batches/{batch_id}")
async def delete_michael_batch_endpoint(batch_id: str):
    """Delete a Michael expense batch."""
    try:
        result = delete_michael_batch(batch_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/michael-expenses/sync")
async def sync_michael_to_valor_endpoint(expense_ids: Optional[List[str]] = None):
    """Sync Michael expenses to consolidated expenses."""
    try:
        result = sync_michael_to_valor(expense_ids)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
async def uber_upload(file: UploadFile = File(...), projects: str = Form(default="{}")):
    """
    Faz upload das novas linhas do CSV para o BigQuery.
    Apenas linhas que não existem na base são inseridas.
    Accepts optional projects JSON mapping trip_eats_id to project value.
    """
    try:
        import json
        content = await file.read()
        
        # Parse projects JSON
        projects_map = {}
        try:
            projects_map = json.loads(projects) if projects else {}
        except json.JSONDecodeError:
            projects_map = {}
        
        result = upload_new_rows_to_bigquery(content, projects_map)
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


class UberExpenseUpdate(BaseModel):
    user_name: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    service: Optional[str] = None
    city: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    vendor: Optional[str] = None
    project: Optional[str] = None


@app.put("/uber/expense/{trip_id}")
async def update_uber_expense_endpoint(trip_id: str, updates: UberExpenseUpdate):
    """Atualiza uma despesa Uber (sincroniza com valor_expenses)"""
    try:
        from services.uber import update_uber_expense
        
        updates_dict = {k: v for k, v in updates.model_dump().items() if v is not None}
        
        if not updates_dict:
            raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
        
        result = update_uber_expense(trip_id, updates_dict)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("errors", "Erro desconhecido"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar: {str(e)}")


@app.delete("/uber/expense/{trip_id}")
async def delete_uber_expense_endpoint(trip_id: str):
    """Deleta uma despesa Uber (também remove de valor_expenses)"""
    try:
        from services.uber import delete_uber_expense
        
        result = delete_uber_expense(trip_id)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("errors", "Erro desconhecido"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao deletar: {str(e)}")


class UberExpensesBatchDelete(BaseModel):
    trip_ids: List[str]


@app.post("/uber/expenses/delete-batch")
async def delete_uber_expenses_batch_endpoint(request: UberExpensesBatchDelete):
    """Deleta múltiplas despesas Uber (também remove de valor_expenses)"""
    try:
        from services.uber import delete_uber_expenses_batch
        
        result = delete_uber_expenses_batch(request.trip_ids)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("errors", "Erro desconhecido"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao deletar: {str(e)}")


@app.post("/uber/sync-to-valor")
async def resync_uber_to_valor_endpoint():
    """Re-sincroniza TODOS os registros Uber com valor_expenses usando MERGE (não duplica)"""
    try:
        from services.uber import resync_all_uber_to_valor
        
        result = resync_all_uber_to_valor()
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Erro desconhecido"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao sincronizar: {str(e)}")


# =====================================================
# RIPPLING EMPLOYEES ENDPOINTS
# =====================================================

class EmployeeCreate(BaseModel):
    rippling_name: str
    display_name: str
    employee_type: str

class EmployeeUpdate(BaseModel):
    rippling_name: Optional[str] = None
    display_name: Optional[str] = None
    employee_type: Optional[str] = None


@app.get("/rippling/employees")
async def list_employees():
    """Lista todos os mapeamentos de funcionários"""
    try:
        employees = get_all_employees()
        return JSONResponse(content={
            "success": True,
            "employees": employees,
            "total": len(employees)
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar funcionários: {str(e)}")


@app.get("/rippling/employees/unique")
async def list_unique_employees():
    """Lista funcionários únicos (agrupados por display_name)"""
    try:
        employees = get_unique_display_names()
        return JSONResponse(content={
            "success": True,
            "employees": employees,
            "total": len(employees)
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar funcionários: {str(e)}")


@app.get("/rippling/employees/types")
async def list_employee_types():
    """Lista tipos de funcionários válidos"""
    return JSONResponse(content={
        "types": get_employee_types()
    })


@app.post("/rippling/employees")
async def create_employee(employee: EmployeeCreate):
    """Adiciona um novo mapeamento de funcionário"""
    try:
        result = add_employee(
            rippling_name=employee.rippling_name,
            display_name=employee.display_name,
            employee_type=employee.employee_type
        )
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=400, detail=result["error"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao adicionar funcionário: {str(e)}")


@app.put("/rippling/employees/{employee_id}")
async def update_employee_endpoint(employee_id: str, employee: EmployeeUpdate):
    """Atualiza um mapeamento existente"""
    try:
        result = update_employee(
            id=employee_id,
            rippling_name=employee.rippling_name,
            display_name=employee.display_name,
            employee_type=employee.employee_type
        )
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=400, detail=result["error"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao atualizar funcionário: {str(e)}")


@app.delete("/rippling/employees/{employee_id}")
async def delete_employee_endpoint(employee_id: str):
    """Remove um mapeamento de funcionário"""
    try:
        result = delete_employee(employee_id)
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=400, detail=result["error"])
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao remover funcionário: {str(e)}")


# =====================================================
# EXPENSES YTD 2025 - CONSOLIDATED VIEW ENDPOINTS
# =====================================================

@app.get("/expenses/ytd")
async def list_expenses_ytd(year: int = None):
    """Lista todas as despesas YTD por funcionário"""
    try:
        expenses = get_ytd_expenses(year)
        return JSONResponse(content={
            "success": True,
            "expenses": expenses,
            "total": len(expenses),
            "year": year
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar despesas: {str(e)}")


@app.get("/expenses/ytd/summary")
async def get_expenses_ytd_summary(year: int = None):
    """Retorna resumo consolidado das despesas"""
    try:
        summary = get_ytd_summary(year)
        return JSONResponse(content={
            "success": True,
            "summary": summary,
            "year": year
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar resumo: {str(e)}")


@app.get("/expenses/ytd/by-type")
async def get_expenses_ytd_by_type(year: int = None):
    """Retorna despesas agrupadas por tipo de funcionário"""
    try:
        by_type = get_ytd_by_type(year)
        return JSONResponse(content={
            "success": True,
            "by_type": by_type,
            "year": year
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao buscar por tipo: {str(e)}")


@app.get("/expenses/ytd/categories")
async def get_expense_categories_list():
    """Retorna lista de categorias de despesas"""
    return JSONResponse(content={
        "categories": get_ytd_categories()
    })


@app.get("/expenses/ytd/years")
async def get_expense_years():
    """Retorna lista de anos disponíveis"""
    return JSONResponse(content={
        "years": get_ytd_years()
    })


class ConsolidatedExpenseTransaction(BaseModel):
    employee_name: str
    category: str
    amount: float


class AddToConsolidatedRequest(BaseModel):
    transactions: List[ConsolidatedExpenseTransaction]
    year: int


@app.post("/expenses/ytd/add")
async def add_to_consolidated(request: AddToConsolidatedRequest):
    """Adiciona transações categorizadas ao banco consolidado"""
    try:
        # Converter para formato esperado pela função
        transactions = [
            {
                "employee_name": t.employee_name,
                "category": t.category,
                "amount": t.amount
            }
            for t in request.transactions
        ]
        
        result = add_expenses_to_consolidated(transactions, request.year)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Erro desconhecido"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao adicionar despesas: {str(e)}")


@app.post("/expenses/ytd/undo")
async def undo_from_consolidated(request: AddToConsolidatedRequest):
    """Desfaz/subtrai transações do banco consolidado (undo)"""
    try:
        # Converter para formato esperado pela função
        transactions = [
            {
                "employee_name": t.employee_name,
                "category": t.category,
                "amount": t.amount
            }
            for t in request.transactions
        ]
        
        result = undo_expenses_from_consolidated(transactions, request.year)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Erro desconhecido"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao desfazer despesas: {str(e)}")


# =====================================================
# VALOR EXPENSES - NEW FORMAT ENDPOINTS
# =====================================================

@app.get("/valor-expenses")
async def list_valor_expenses(
    year: int = None, 
    month: int = None,
    name: str = None,
    category: str = None,
    start_date: str = None,
    end_date: str = None,
    limit: int = 5000
):
    """List all expenses from valor_expenses table with optional filters"""
    try:
        expenses = get_valor_expenses(year=year, month=month, name=name, category=category, 
                                       start_date=start_date, end_date=end_date, limit=limit)
        return JSONResponse(content={
            "success": True,
            "expenses": expenses,
            "total": len(expenses)
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching expenses: {str(e)}")


@app.get("/valor-expenses/by-employee")
async def list_valor_by_employee(year: int = None, start_date: str = None, end_date: str = None):
    """Get expenses aggregated by employee and category (for pivot table view)"""
    try:
        expenses = get_valor_by_employee(year=year, start_date=start_date, end_date=end_date)
        return JSONResponse(content={
            "success": True,
            "expenses": expenses,
            "total": len(expenses)
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching expenses by employee: {str(e)}")


@app.get("/valor-expenses/summary")
async def get_valor_expenses_summary(year: int = None):
    """Get summary statistics"""
    try:
        summary = get_valor_summary(year=year)
        return JSONResponse(content={
            "success": True,
            "summary": summary
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching summary: {str(e)}")


@app.get("/valor-expenses/years")
async def get_valor_expense_years():
    """Get list of available years"""
    try:
        years = get_valor_years()
        return JSONResponse(content={"years": years})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching years: {str(e)}")


@app.get("/valor-expenses/categories")
async def get_valor_expense_categories():
    """Get list of unique categories"""
    try:
        categories = get_valor_categories()
        return JSONResponse(content={"categories": categories})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching categories: {str(e)}")


@app.get("/valor-expenses/names")
async def get_valor_expense_names():
    """Get list of unique employee names"""
    try:
        names = get_valor_names()
        return JSONResponse(content={"names": names})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching names: {str(e)}")


@app.get("/valor-expenses/vendors")
async def get_valor_expense_vendors():
    """Get list of unique vendors"""
    try:
        vendors = get_valor_vendors()
        return JSONResponse(content={"vendors": vendors})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching vendors: {str(e)}")


@app.get("/valor-expenses/monthly/{year}")
async def get_valor_monthly_breakdown(year: int, name: str = None):
    """Get monthly breakdown of expenses"""
    try:
        monthly = get_valor_monthly(year=year, name=name)
        return JSONResponse(content={
            "success": True,
            "monthly": monthly,
            "year": year
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching monthly breakdown: {str(e)}")


class ValorExpenseItem(BaseModel):
    name: str
    amount: float
    category: str
    date: str
    vendor: Optional[str] = ""


class AddValorExpensesRequest(BaseModel):
    expenses: List[ValorExpenseItem]


@app.post("/valor-expenses")
async def add_valor_expense_items(request: AddValorExpensesRequest):
    """Add new expenses to valor_expenses table"""
    try:
        expenses = [exp.dict() for exp in request.expenses]
        result = add_valor_expenses(expenses)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding expenses: {str(e)}")


@app.delete("/valor-expenses/{expense_id}")
async def delete_valor_expense_item(expense_id: str):
    """Delete a single expense by ID"""
    try:
        result = delete_valor_expense(expense_id)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting expense: {str(e)}")


class ValorExpenseUpdate(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    date: Optional[str] = None
    vendor: Optional[str] = None


@app.put("/valor-expenses/{expense_id}")
async def update_valor_expense_item(expense_id: str, updates: ValorExpenseUpdate):
    """Update a valor expense by ID"""
    try:
        from services.valor_expenses import update_expense
        
        updates_dict = {k: v for k, v in updates.model_dump().items() if v is not None}
        
        if not updates_dict:
            raise HTTPException(status_code=400, detail="No fields to update")
        
        result = update_expense(expense_id, updates_dict)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating expense: {str(e)}")


class ValorExpensesBatchDelete(BaseModel):
    expense_ids: List[str]


@app.post("/valor-expenses/delete-batch")
async def delete_valor_expenses_batch(request: ValorExpensesBatchDelete):
    """Delete multiple valor expenses by IDs in a single query"""
    try:
        from services.valor_expenses import delete_expenses_batch
        
        result = delete_expenses_batch(request.expense_ids)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting expenses: {str(e)}")


# ==================== CREDIT CARD EXPENSES (Intermediate Table) ====================

class CreditCardTransaction(BaseModel):
    employee_name: str
    category: str
    amount: float
    description: Optional[str] = None
    transaction_date: Optional[str] = None


class AddCreditCardRequest(BaseModel):
    transactions: List[CreditCardTransaction]
    year: int
    source: str = "AMEX"


@app.post("/credit-card/expenses")
async def add_cc_expenses(request: AddCreditCardRequest):
    """Add credit card expenses to intermediate table and sync to consolidated"""
    try:
        transactions = [
            {
                "employee_name": t.employee_name,
                "category": t.category,
                "amount": t.amount,
                "description": t.description or "",
                "transaction_date": t.transaction_date or ""
            }
            for t in request.transactions
        ]
        
        result = add_credit_card_expenses(transactions, request.year, request.source)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding expenses: {str(e)}")


@app.get("/credit-card/expenses")
async def get_cc_expenses(year: Optional[int] = None, batch_id: Optional[str] = None):
    """Get credit card expenses from intermediate table"""
    try:
        result = get_credit_card_expenses(year, batch_id)
        expenses = result.get("expenses", []) if isinstance(result, dict) else result
        return JSONResponse(content={"success": True, "expenses": expenses})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching expenses: {str(e)}")


@app.get("/credit-card/batches")
async def get_cc_batches(year: Optional[int] = None):
    """Get credit card expense batches (grouped submissions)"""
    try:
        result = get_credit_card_batches(year)
        batches = result.get("batches", []) if isinstance(result, dict) else result
        return JSONResponse(content={"success": True, "batches": batches})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching batches: {str(e)}")


@app.delete("/credit-card/expenses/{expense_id}")
async def delete_cc_expense(expense_id: str):
    """Delete a single expense and subtract from consolidated"""
    try:
        result = delete_credit_card_expense(expense_id)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=404 if "not found" in result.get("error", "").lower() else 500, 
                              detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting expense: {str(e)}")


@app.delete("/credit-card/batches/{batch_id}")
async def delete_cc_batch(batch_id: str):
    """Delete all expenses from a batch and subtract from consolidated"""
    try:
        result = delete_credit_card_batch(batch_id)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=404 if "not found" in result.get("error", "").lower() else 500, 
                              detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting batch: {str(e)}")


# ==================== CREDIT CARD DASHBOARD (New Endpoints) ====================

class CreditCardExpenseNew(BaseModel):
    date: str  # YYYY-MM-DD
    credit_card: str  # Amex, SVB, Bradesco
    description: Optional[str] = ""
    user: str
    category: str
    amount: float
    comments: Optional[str] = ""


class CreditCardExpenseUpdate(BaseModel):
    date: Optional[str] = None
    credit_card: Optional[str] = None
    description: Optional[str] = None
    user: Optional[str] = None
    category: Optional[str] = None
    amount: Optional[float] = None
    comments: Optional[str] = None
    project: Optional[str] = None


@app.get("/credit-card/dashboard")
async def get_cc_dashboard(
    year: Optional[int] = None,
    credit_card: Optional[str] = None,
    user: Optional[str] = None,
    category: Optional[str] = None
):
    """Get credit card expenses for dashboard with filters"""
    try:
        expenses = get_all_credit_card_expenses(
            year=year,
            credit_card=credit_card,
            user=user,
            category=category
        )
        summary = get_credit_card_summary()
        
        return JSONResponse(content={
            "success": True,
            "expenses": expenses,
            "summary": summary,
            "valid_cards": VALID_CREDIT_CARDS
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching dashboard: {str(e)}")


@app.get("/credit-card/dashboard/summary")
async def get_cc_dashboard_summary():
    """Get credit card summary statistics"""
    try:
        summary = get_credit_card_summary()
        return JSONResponse(content={"success": True, **summary})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching summary: {str(e)}")


@app.get("/credit-card/dashboard/users")
async def get_cc_dashboard_users():
    """Get unique users from credit card expenses"""
    try:
        users = get_cc_users()
        return JSONResponse(content={"success": True, "users": users})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching users: {str(e)}")


@app.get("/credit-card/dashboard/categories")
async def get_cc_dashboard_categories():
    """Get unique categories from credit card expenses"""
    try:
        categories = get_cc_categories()
        return JSONResponse(content={"success": True, "categories": categories})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching categories: {str(e)}")


@app.get("/credit-card/dashboard/years")
async def get_cc_dashboard_years():
    """Get available years from credit card expenses"""
    try:
        years = get_cc_years()
        return JSONResponse(content={"success": True, "years": years})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching years: {str(e)}")


@app.post("/credit-card/dashboard/add")
async def add_cc_dashboard_expense(expense: CreditCardExpenseNew):
    """Add a single credit card expense"""
    try:
        result = add_credit_card_expense(
            date=expense.date,
            credit_card=expense.credit_card,
            description=expense.description or "",
            user=expense.user,
            category=expense.category,
            amount=expense.amount,
            comments=expense.comments or ""
        )
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding expense: {str(e)}")


@app.post("/credit-card/dashboard/add-batch")
async def add_cc_dashboard_batch(expenses: List[CreditCardExpenseNew]):
    """Add multiple credit card expenses at once"""
    try:
        expense_list = [
            {
                "date": e.date,
                "credit_card": e.credit_card,
                "description": e.description or "",
                "user": e.user,
                "category": e.category,
                "amount": e.amount,
                "comments": e.comments or ""
            }
            for e in expenses
        ]
        
        result = add_credit_card_expenses_batch(expense_list)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error adding expenses: {str(e)}")


@app.post("/credit-card/dashboard/preview-excel")
async def preview_cc_excel(
    file: UploadFile = File(...),
    credit_card: str = Form(default="SVB")
):
    """
    Preview Excel file with credit card expenses before uploading.
    Returns parsed data for editing before confirmation.
    Required columns: Date, Card, Description, User, Category, Amount, Comments
    """
    import pandas as pd
    from io import BytesIO
    
    try:
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents))
        
        # Normalize column names
        df.columns = [col.strip().lower() for col in df.columns]
        
        required_columns = ['date', 'card', 'description', 'user', 'category', 'amount', 'comments']
        missing_cols = [col for col in required_columns if col not in df.columns]
        if missing_cols:
            raise HTTPException(
                status_code=400, 
                detail=f"Missing required columns: {', '.join(missing_cols)}. Expected columns: Date, Card, Description, User, Category, Amount, Comments"
            )
        
        expenses = []
        errors = []
        
        for idx, row in df.iterrows():
            try:
                # Parse date
                date_val = row.get('date')
                if pd.isna(date_val):
                    errors.append(f"Row {idx+2}: Missing date")
                    continue
                
                if isinstance(date_val, str):
                    try:
                        dt = datetime.strptime(date_val, "%Y-%m-%d")
                    except:
                        try:
                            dt = datetime.strptime(date_val, "%m/%d/%Y")
                        except:
                            dt = datetime.strptime(date_val, "%d/%m/%Y")
                else:
                    dt = pd.to_datetime(date_val)
                
                date_str = dt.strftime("%Y-%m-%d")
                
                # Get card
                card_val = row.get('card', '')
                if pd.isna(card_val) or str(card_val).strip() == '':
                    card = credit_card
                else:
                    card = str(card_val).strip()
                
                if card not in VALID_CREDIT_CARDS:
                    errors.append(f"Row {idx+2}: Invalid card '{card}'")
                    continue
                
                # Get amount
                amount = row.get('amount', 0)
                if pd.isna(amount):
                    amount = 0
                amount = float(amount)
                
                # Get other fields
                description = str(row.get('description', '')) if not pd.isna(row.get('description')) else ''
                user = str(row.get('user', '')) if not pd.isna(row.get('user')) else ''
                category = str(row.get('category', '')) if not pd.isna(row.get('category')) else ''
                comments = str(row.get('comments', '')) if not pd.isna(row.get('comments')) else ''
                
                # Apply Firm Uber rule
                if 'UBER' in description.upper() and user == 'Doug Smith':
                    category = 'Firm Uber'
                
                expenses.append({
                    "id": str(idx),  # Temporary ID for frontend
                    "date": date_str,
                    "credit_card": card,
                    "description": description,
                    "user": user,
                    "category": category,
                    "amount": amount,
                    "comments": comments
                })
                
            except Exception as e:
                errors.append(f"Row {idx+2}: {str(e)}")
        
        return JSONResponse(content={
            "success": True,
            "expenses": expenses,
            "total_rows": len(expenses),
            "parse_errors": errors if errors else None
        })
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing Excel file: {str(e)}")


@app.post("/credit-card/dashboard/upload-excel")
async def upload_cc_excel(
    file: UploadFile = File(...),
    credit_card: str = Form(default="SVB")
):
    """
    Upload Excel file with credit card expenses.
    Required columns (in order): Date, Card, Description, User, Category, Amount, Comments
    """
    import pandas as pd
    from io import BytesIO
    
    try:
        # Read Excel file
        contents = await file.read()
        df = pd.read_excel(BytesIO(contents))
        
        # Normalize column names (case insensitive, strip whitespace)
        df.columns = [col.strip().lower() for col in df.columns]
        
        # Required columns in expected order
        required_columns = ['date', 'card', 'description', 'user', 'category', 'amount', 'comments']
        
        # Validate columns exist
        missing_cols = [col for col in required_columns if col not in df.columns]
        if missing_cols:
            raise HTTPException(
                status_code=400, 
                detail=f"Missing required columns: {', '.join(missing_cols)}. Expected columns: Date, Card, Description, User, Category, Amount, Comments"
            )
        
        expenses = []
        errors = []
        
        for idx, row in df.iterrows():
            try:
                # Parse date
                date_val = row.get('date')
                if pd.isna(date_val):
                    errors.append(f"Row {idx+2}: Missing date")
                    continue
                
                # Handle different date formats
                if isinstance(date_val, str):
                    try:
                        dt = datetime.strptime(date_val, "%Y-%m-%d")
                    except:
                        try:
                            dt = datetime.strptime(date_val, "%m/%d/%Y")
                        except:
                            dt = datetime.strptime(date_val, "%d/%m/%Y")
                else:
                    dt = pd.to_datetime(date_val)
                
                date_str = dt.strftime("%Y-%m-%d")
                
                # Get card from Excel (override form parameter if provided in Excel)
                card_val = row.get('card', '')
                if pd.isna(card_val) or str(card_val).strip() == '':
                    card = credit_card  # Use form default
                else:
                    card = str(card_val).strip()
                
                # Validate card
                if card not in VALID_CREDIT_CARDS:
                    errors.append(f"Row {idx+2}: Invalid card '{card}'. Valid cards: {', '.join(VALID_CREDIT_CARDS)}")
                    continue
                
                # Get amount
                amount = row.get('amount', 0)
                if pd.isna(amount):
                    amount = 0
                amount = float(amount)
                
                # Get other fields
                description = str(row.get('description', '')) if not pd.isna(row.get('description')) else ''
                user = str(row.get('user', '')) if not pd.isna(row.get('user')) else ''
                category = str(row.get('category', '')) if not pd.isna(row.get('category')) else ''
                comments = str(row.get('comments', '')) if not pd.isna(row.get('comments')) else ''
                
                # Apply Firm Uber rule: UBER + Doug Smith = Firm Uber
                if 'UBER' in description.upper() and user == 'Doug Smith':
                    category = 'Firm Uber'
                
                expenses.append({
                    "date": date_str,
                    "credit_card": card,
                    "description": description,
                    "user": user,
                    "category": category,
                    "amount": amount,
                    "comments": comments
                })
                
            except Exception as e:
                errors.append(f"Row {idx+2}: {str(e)}")
        
        if not expenses:
            raise HTTPException(status_code=400, detail=f"No valid expenses found. Errors: {errors}")
        
        # Add to database
        result = add_credit_card_expenses_batch(expenses)
        
        if result["success"]:
            return JSONResponse(content={
                "success": True,
                "added_count": result.get("added_count", 0),
                "parse_errors": errors if errors else None,
                "db_errors": result.get("errors"),
                "message": f"Successfully uploaded {result.get('added_count', 0)} expenses from Excel"
            })
        else:
            raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing Excel file: {str(e)}")


@app.put("/credit-card/dashboard/{expense_id}")
async def update_cc_dashboard_expense(expense_id: str, updates: CreditCardExpenseUpdate):
    """Update a credit card expense"""
    try:
        update_dict = {}
        if updates.date is not None:
            update_dict["date"] = updates.date
        if updates.credit_card is not None:
            update_dict["credit_card"] = updates.credit_card
        if updates.description is not None:
            update_dict["description"] = updates.description
        if updates.user is not None:
            update_dict["user"] = updates.user
        if updates.category is not None:
            update_dict["category"] = updates.category
        if updates.amount is not None:
            update_dict["amount"] = updates.amount
        if updates.comments is not None:
            update_dict["comments"] = updates.comments
        if updates.project is not None:
            update_dict["project"] = updates.project
        
        result = update_credit_card_expense(expense_id, update_dict)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=400, detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating expense: {str(e)}")


@app.delete("/credit-card/dashboard/{expense_id}")
async def delete_cc_dashboard_expense(expense_id: str):
    """Delete a credit card expense"""
    try:
        result = delete_credit_card_expense(expense_id)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=404 if "not found" in result.get("error", "").lower() else 500, 
                              detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting expense: {str(e)}")


@app.post("/credit-card/dashboard/delete-batch")
async def delete_cc_dashboard_batch(expense_ids: List[str]):
    """Delete multiple credit card expenses at once"""
    try:
        result = delete_credit_card_expenses_batch(expense_ids)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting expenses: {str(e)}")


@app.post("/credit-card/dashboard/sync-to-valor")
async def sync_cc_dashboard_to_valor():
    """Sync all unsynced credit card expenses to valor_expenses"""
    try:
        result = sync_cc_to_valor()
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error syncing to valor: {str(e)}")


@app.post("/credit-card/dashboard/apply-firm-uber-rule")
async def apply_firm_uber_rule_endpoint():
    """
    Apply Firm Uber rule to all existing credit card expenses:
    If description contains 'UBER' and user is 'Doug Smith', set category to 'Firm Uber'.
    This category won't be synced to consolidated expenses.
    """
    try:
        result = apply_firm_uber_rule()
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error applying rule: {str(e)}")


@app.post("/valor/fix-credit-card-vendors")
async def fix_credit_card_vendors():
    """Clear vendor field for all Credit Card expenses in valor_expenses (they should not have vendor)"""
    try:
        result = clear_vendor_for_credit_card_expenses()
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fixing vendors: {str(e)}")


@app.post("/valor/fix-category-case")
async def fix_valor_category_case():
    """
    Fix category case issues in valor_expenses.
    Converts lowercase categories like 'airfare' to proper case 'Airfare'.
    """
    try:
        result = fix_category_case()
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fixing category case: {str(e)}")


@app.get("/valor/export-by-category/{year}")
async def export_valor_by_category(year: int):
    """
    Export consolidated expenses by category to Excel.
    Returns Excel file with:
    - Summary sheet with totals by category
    - One sheet per category with all transactions
    - All Transactions sheet with everything
    """
    try:
        excel_buffer = export_consolidated_by_category(year)
        
        return StreamingResponse(
            excel_buffer,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={
                "Content-Disposition": f"attachment; filename=Consolidated_Expenses_{year}_by_Category.xlsx"
            }
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error exporting: {str(e)}")


# ===========================================
# RIPPLING EXPENSES ENDPOINTS
# ===========================================

@app.post("/rippling-expenses/parse")
async def parse_rippling_file_preview(file: UploadFile = File(...)):
    """
    Parse arquivo Rippling (xlsx ou csv) e retorna preview para edição.
    NÃO salva no banco - apenas retorna os dados para visualização/edição.
    Verifica duplicatas e marca transações que já existem.
    """
    # Validar extensão
    filename = file.filename.lower()
    if not (filename.endswith('.xlsx') or filename.endswith('.csv') or filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail="File must be .xlsx, .xls or .csv")
    
    try:
        content = await file.read()
        
        # Parse arquivo
        transactions = parse_rippling_file(content, file.filename)
        
        if not transactions:
            raise HTTPException(status_code=400, detail="No transactions found in file")
        
        # Buscar mapeamento de funcionários
        employee_mapping = get_employee_mapping()
        
        # Verificar duplicatas antes de retornar preview
        from services.rippling_expenses import check_existing_records
        unique_keys = [tx.get('unique_key', '') for tx in transactions]
        existing_keys = check_existing_records(unique_keys)
        
        # Processar transações para preview (com mapeamento de funcionários)
        preview_data = []
        unmapped_employees = set()
        duplicate_count = 0
        new_count = 0
        
        for tx in transactions:
            employee_original = tx.get('employee', '')
            employee_key = normalize_name(employee_original)
            
            # Mapear funcionário
            if employee_key in employee_mapping:
                employee_name = employee_mapping[employee_key]['display_name']
                employee_type = employee_mapping[employee_key]['employee_type']
            else:
                employee_name = employee_original
                employee_type = 'Unknown'
                unmapped_employees.add(employee_original)
            
            # Verificar se é duplicata
            is_duplicate = tx.get('unique_key', '') in existing_keys
            if is_duplicate:
                duplicate_count += 1
            else:
                new_count += 1
            
            preview_data.append({
                "id": str(uuid.uuid4())[:8],  # ID temporário para frontend
                "employee_original": employee_original,
                "employee_name": employee_name,
                "employee_type": employee_type,
                "vendor_name": tx.get('vendor_name', ''),
                "currency": tx.get('currency', 'USD'),
                "amount": tx.get('amount', 0),
                "category": tx.get('category', ''),  # Categoria original
                "original_category": tx.get('category', ''),  # Guardar original
                "purchase_date": str(tx.get('purchase_date', '')) if tx.get('purchase_date') else '',
                "object_type": tx.get('object_type', ''),
                "approval_state": tx.get('approval_state', ''),
                "unique_key": tx.get('unique_key', ''),
                "is_duplicate": is_duplicate,
            })
        
        return JSONResponse(content={
            "success": True,
            "transactions": preview_data,
            "total": len(preview_data),
            "new_count": new_count,
            "duplicate_count": duplicate_count,
            "unmapped_employees": list(unmapped_employees)
        })
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error parsing file: {str(e)}")


@app.post("/rippling-expenses/upload")
async def upload_rippling_file(file: UploadFile = File(...)):
    """
    Upload arquivo Rippling (xlsx ou csv) para o banco de dados.
    Faz mapeamento de funcionários e evita duplicatas.
    DEPRECATED: Usar /rippling-expenses/parse + /rippling-expenses/confirm
    """
    # Validar extensão
    filename = file.filename.lower()
    if not (filename.endswith('.xlsx') or filename.endswith('.csv') or filename.endswith('.xls')):
        raise HTTPException(status_code=400, detail="File must be .xlsx, .xls or .csv")
    
    try:
        content = await file.read()
        
        # Parse arquivo
        transactions = parse_rippling_file(content, file.filename)
        
        if not transactions:
            raise HTTPException(status_code=400, detail="No transactions found in file")
        
        # Upload para BigQuery
        result = upload_rippling_expenses(transactions)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error processing file: {str(e)}")


@app.post("/rippling-expenses/confirm")
async def confirm_rippling_upload(request: Request):
    """
    Confirma upload das transações Rippling editadas.
    Recebe as transações previamente parseadas com categorias potencialmente editadas.
    """
    try:
        body = await request.json()
        transactions = body.get("transactions", [])
        year = body.get("year")  # Opcional - para forçar ano específico
        
        if not transactions:
            raise HTTPException(status_code=400, detail="No transactions provided")
        
        # Upload para BigQuery com sync para consolidated
        result = upload_rippling_expenses(transactions, year=year)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Unknown error"))
            
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error uploading transactions: {str(e)}")


@app.get("/rippling-expenses")
async def get_rippling_expenses_list(batch_id: Optional[str] = None, year: Optional[int] = None, limit: int = 1000, start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Get Rippling expenses, optionally filtered by batch, year, or date range"""
    try:
        expenses = get_rippling_expenses(batch_id=batch_id, year=year, limit=limit, start_date=start_date, end_date=end_date)
        return JSONResponse(content={"expenses": expenses, "count": len(expenses)})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching expenses: {str(e)}")


@app.get("/rippling-expenses/batches")
async def get_rippling_batches_list():
    """Get list of Rippling upload batches"""
    try:
        batches = get_rippling_batches()
        return JSONResponse(content={"batches": batches})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching batches: {str(e)}")


@app.get("/rippling-expenses/summary")
async def get_rippling_expenses_summary(year: Optional[int] = None):
    """Get summary of Rippling expenses"""
    try:
        summary = get_rippling_summary(year=year)
        return JSONResponse(content=summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching summary: {str(e)}")


@app.delete("/rippling-expenses/batches/{batch_id}")
async def delete_rippling_expenses_batch(batch_id: str):
    """Delete a batch of Rippling expenses (also deletes from valor_expenses)"""
    try:
        result = delete_rippling_batch(batch_id)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=404 if "not found" in result.get("error", "").lower() else 500, 
                              detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting batch: {str(e)}")


@app.delete("/rippling-expenses/{expense_id}")
async def delete_single_rippling_expense(expense_id: str):
    """Delete a single Rippling expense (also deletes from valor_expenses)"""
    try:
        result = delete_rippling_expense(expense_id)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=404 if "not found" in result.get("error", "").lower() else 500, 
                              detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error deleting expense: {str(e)}")


@app.put("/rippling-expenses/{expense_id}")
async def update_single_rippling_expense(expense_id: str, request: Request):
    """Update a single Rippling expense (also updates valor_expenses)"""
    try:
        body = await request.json()
        result = update_rippling_expense(expense_id, body)
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=404 if "not found" in result.get("error", "").lower() else 500, 
                              detail=result.get("error", "Unknown error"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error updating expense: {str(e)}")


@app.post("/rippling/sync-to-valor")
async def resync_rippling_to_valor_endpoint():
    """Re-sincroniza TODOS os registros Rippling com valor_expenses usando MERGE (não duplica)"""
    try:
        from services.rippling_expenses import resync_all_rippling_to_valor
        
        result = resync_all_rippling_to_valor()
        
        if result["success"]:
            return JSONResponse(content=result)
        else:
            raise HTTPException(status_code=500, detail=result.get("error", "Erro desconhecido"))
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erro ao sincronizar: {str(e)}")


# ===========================================
# IT SUBSCRIPTIONS ENDPOINTS
# ===========================================

@app.get("/it-subscriptions")
async def get_it_subscriptions_endpoint(year: int = None, start_date: Optional[str] = None, end_date: Optional[str] = None):
    """Get all IT Subscriptions expenses for a given year or date range"""
    try:
        expenses = get_it_subscriptions(year, start_date, end_date)
        return JSONResponse(content={"expenses": expenses})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching IT subscriptions: {str(e)}")


@app.get("/it-subscriptions/summary")
async def get_it_subscriptions_summary_endpoint(year: int = None):
    """Get summary statistics for IT Subscriptions"""
    try:
        summary = get_it_subscriptions_summary(year)
        return JSONResponse(content=summary)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error fetching IT subscriptions summary: {str(e)}")


@app.post("/it-subscriptions/extract-vendors")
async def extract_vendors_endpoint(request: Request):
    """Extract vendors from IT Subscription expense descriptions using AI"""
    try:
        body = await request.json()
        expense_ids = body.get("expense_ids", None)
        
        results = extract_vendors_for_expenses(expense_ids)
        
        return JSONResponse(content={
            "success": True,
            "results": results,
            "processed_count": len(results),
            "updated_count": len([r for r in results if r["status"] == "updated"])
        })
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error extracting vendors: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
