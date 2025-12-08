from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import tempfile
import os
import pandas as pd
from io import BytesIO

from extractors.svb import extract_svb
from extractors.amex import extract_amex
from extractors.bradesco import extract_bradesco

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
                
                # Add total row at the end
                total_amount = df_export["Amount (USD)"].sum() if "Amount (USD)" in df_export.columns else 0
                total_row = pd.DataFrame([{
                    "Date": "",
                    "Description": "TOTAL",
                    "Amount (USD)": round(total_amount, 2)
                }])
                df_export = pd.concat([df_export, total_row], ignore_index=True)
                
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
