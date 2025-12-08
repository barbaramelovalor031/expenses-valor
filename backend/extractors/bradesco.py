import pdfplumber
import pandas as pd
import re
from datetime import datetime, timedelta
import requests

def normalize(s: str) -> str:
    return s.replace("\u00a0", " ").strip() if s else ""

def parse_brl_number(tok: str):
    """
    Converte:
      '1.234,56'  -> 1234.56
      '0,00'      -> 0.0
      '(123,45)'  -> -123.45
      '-1.234,56' -> -1234.56
    """
    if tok is None:
        return None
    t = normalize(tok)
    negative = False
    if t.startswith("(") and t.endswith(")"):
        negative = True
        t = t[1:-1]
    t = t.replace("R$", "").replace("$", "").replace(" ", "")
    t = t.replace(".", "")
    t = t.replace(",", ".")
    if t.startswith("-"):
        negative = True
        t = t[1:]
    try:
        val = float(t)
        return -val if negative else val
    except ValueError:
        return None


def get_cotacao_dolar_ptax(data_iso: str, cache: dict):
    """
    data_iso no formato YYYY-MM-DD.
    Usa a API PTAX do Bacen, com fallback para dia útil anterior.
    Retorna a cotacaoVenda (fechamento) como float.
    """
    if data_iso in cache:
        return cache[data_iso]

    dt = datetime.strptime(data_iso, "%Y-%m-%d")
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
            print(f"[WARN] Error fetching PTAX for {data_iso} ({data_bcb}): {e}")
            cache[data_iso] = None
            return None

        valores = data.get("value", [])
        if valores:
            ultimo = valores[-1]
            rate = float(ultimo["cotacaoVenda"])
            cache[data_iso] = rate
            return rate

        dt = dt - timedelta(days=1)

    cache[data_iso] = None
    return None


def extract_bradesco(pdf_file) -> dict:
    """Extrai transações de PDF do Bradesco"""
    lines = []
    with pdfplumber.open(pdf_file) as pdf:
        for page in pdf.pages:
            txt = page.extract_text()
            if txt:
                lines.extend([normalize(l) for l in txt.split("\n")])

    # Discover year and cardholder name
    year = None
    holder = "Cardholder"

    for l in lines:
        m_month = re.search(r"M[eê]s:\s*\w+\/(\d{4})", l, flags=re.IGNORECASE)
        if m_month:
            year = int(m_month.group(1))

        m_name = re.search(r"^Nome:\s*(.+)$", l, flags=re.IGNORECASE)
        if m_name:
            holder = m_name.group(1).strip()

    if year is None:
        m_any = re.search(r"(20\d{2})", " ".join(lines))
        year = int(m_any.group(1)) if m_any else datetime.now().year

    # Parse transactions
    MONEY_BR = r"\(?-?\d{1,3}(?:\.\d{3})*,\d{2}\)?"
    row_re = re.compile(
        rf"^(\d{{2}}/\d{{2}})\s+(.+?)\s+({MONEY_BR})\s+({MONEY_BR})\s*$"
    )

    txs = []
    for l in lines:
        if l.upper().startswith(("DATA HISTÓRICO", "DATA HISTORICO")):
            continue
        if l.upper().startswith("TOTAL:"):
            continue

        m = row_re.match(l)
        if not m:
            money_matches = list(re.finditer(MONEY_BR, l))
            if len(money_matches) < 2:
                continue
            m_usd, m_brl = money_matches[-2], money_matches[-1]

            m_date = re.match(r"^(\d{2}/\d{2})\s+", l)
            if not m_date:
                continue
            ddmm = m_date.group(1)

            desc = l[m_date.end(): m_usd.start()].strip()
            usd_raw = l[m_usd.start(): m_usd.end()]
            brl_raw = l[m_brl.start(): m_brl.end()]
        else:
            ddmm, desc, usd_raw, brl_raw = m.groups()

        day, month = ddmm.split("/")
        try:
            date_fmt = datetime(year=int(year), month=int(month), day=int(day)).strftime("%Y-%m-%d")
        except ValueError:
            date_fmt = f"{day}/{month}/{year}"

        amount_usd = parse_brl_number(usd_raw)
        amount_brl = parse_brl_number(brl_raw)

        txs.append({
            "date": date_fmt,
            "description": desc.strip(),
            "amount_usd": amount_usd,
            "amount_brl": amount_brl,
            "cardholder": holder,
        })

    # Apply PTAX exchange rate
    fx_cache = {}
    transactions = []
    
    for tx in txs:
        fx_rate = get_cotacao_dolar_ptax(tx["date"], fx_cache) if tx["date"] else None
        
        final_amount = None
        if tx["amount_brl"] and fx_rate and fx_rate > 0:
            final_amount = round(tx["amount_brl"] / fx_rate, 2)
        
        transactions.append({
            "date": tx["date"],
            "description": tx["description"],
            "amount": final_amount,
            "amount_brl": tx["amount_brl"],
            "fx_rate": fx_rate,
            "cardholder": tx["cardholder"],
        })

    return {
        "card_type": "bradesco",
        "transactions": transactions,
        "cardholders": [holder]
    }
