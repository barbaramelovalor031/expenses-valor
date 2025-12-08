import pdfplumber
import pandas as pd
import re
from datetime import datetime

def normalize(s: str) -> str:
    return s.replace("–", "-").replace("−", "-").replace("⧫", "").strip()

def clean_amount(raw_value):
    """
    Normaliza o valor numérico:
    - remove $ e vírgulas
    - converte parênteses e traços longos (–, −) em valores negativos
    """
    value = raw_value.strip()
    value = value.replace("$", "").replace(",", "")
    # Parentheses = negative
    if re.match(r"^\(.*\)$", value):
        value = "-" + value.strip("()")
    # Long dash or similar
    value = value.replace("–", "-").replace("−", "-").strip()
    try:
        return float(value)
    except ValueError:
        return None


def parse_transaction_line(line):
    """
    Detecta linhas de transações no formato: MM-DD-YY <descrição> <valor>
    Inclui negativos, com ou sem cifrão.
    """
    match = re.match(
        r"(\d{2}-\d{2}-\d{2})\s+(.+?)\s+(\(?-?\$?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?)$",
        line.strip()
    )
    if match:
        date_str = match.group(1)
        desc = match.group(2).strip()
        raw_amount = match.group(3)

        try:
            date_obj = datetime.strptime(date_str, "%m-%d-%y")
            date_fmt = date_obj.strftime("%Y-%m-%d")
        except Exception:
            date_fmt = date_str

        amount = clean_amount(raw_amount)
        if amount is None:
            return None

        return {
            "date": date_fmt,
            "description": desc,
            "amount": amount,
        }
    return None


def extract_svb(pdf_file) -> dict:
    """Extrai transações de PDF do SVB"""
    all_cardholders = {}
    lines = []

    with pdfplumber.open(pdf_file) as pdf:
        for page in pdf.pages:
            text = page.extract_text()
            if text:
                lines.extend(text.split("\n"))

    cardholder_pattern = re.compile(r"^(.*?) TOTAL FOR ACCOUNT ENDING IN \d+.*$", re.IGNORECASE)

    pending_tx = []
    pending_idx = []

    for i, line in enumerate(lines):
        holder_match = cardholder_pattern.match(line)
        tx = parse_transaction_line(line)

        if tx:
            pending_tx.append(tx)
            pending_idx.append(i)

        elif holder_match:
            cardholder = holder_match.group(1).strip()
            if pending_tx:
                for j, tx_item in enumerate(pending_tx):
                    idx = pending_idx[j]
                    next_lines = lines[idx + 1: idx + 3]
                    context = " ".join(next_lines)
                    mcc_match = re.search(r"MCC:\s*(\d+)", context)
                    zip_match = re.search(r"MERCHANT ZIP:\s*(\d+)", context)
                    tx_item["mcc"] = mcc_match.group(1) if mcc_match else ""
                    tx_item["merchant_zip"] = zip_match.group(1) if zip_match else ""

                all_cardholders.setdefault(cardholder, []).extend(pending_tx)
                pending_tx = []
                pending_idx = []

    # If no sections per cardholder
    if pending_tx:
        acct_match = None
        for line in lines:
            m = re.search(r"Account Number:\s+Ending in\s+(\d+)", line)
            if m:
                acct_match = m
                break

        if acct_match:
            holder_name = f"Account {acct_match.group(1)}"
        else:
            holder_name = "All Transactions"

        all_cardholders.setdefault(holder_name, []).extend(pending_tx)

    # Flatten to return single list with cardholder
    transactions = []
    for cardholder, txs in all_cardholders.items():
        for tx in txs:
            # Exclude lines with "PAYMENT - THANK YOU"
            if "PAYMENT - THANK YOU" in tx["description"].upper():
                continue
            tx["cardholder"] = cardholder
            transactions.append(tx)

    return {
        "card_type": "svb",
        "transactions": transactions,
        "cardholders": list(all_cardholders.keys())
    }
