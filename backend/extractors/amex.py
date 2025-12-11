import pdfplumber
import pandas as pd
import re
from datetime import datetime
from services.name_normalizer import normalize_name

def normalize(s: str) -> str:
    return s.replace("–", "-").replace("−", "-").replace("⧫", "").strip()

def clean_amount(token: str):
    """Normaliza $ e negativos: -$123.45, ($123.45)"""
    t = normalize(token).replace("$", "").replace(",", "").strip()
    if re.fullmatch(r"\(\s*\d+(?:\.\d{2})?\s*\)", t):
        t = "-" + t.strip("()").strip()
    try:
        return float(t)
    except ValueError:
        return None

# === padrões ===
DATE_RE = re.compile(r"^(\d{2}/\d{2}/\d{2})\s+(.*)$")
AMOUNT_TOKEN_RE = re.compile(
    r"(?:-?\$\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?)|(?:\(\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})?\s*\))"
)
PAGE_FOOTER_RE = re.compile(r"\bp\.\s*\d+/\d+\s*$", re.IGNORECASE)

FEES_START = ("FEES",)
INTEREST_START = ("INTEREST CHARGED",)
SECTION_END = (
    "TOTAL FEES FOR THIS PERIOD",
    "TOTAL INTEREST CHARGED FOR THIS PERIOD",
    "ABOUT TRAILING INTEREST",
    "IMPORTANT NOTICES",
)
SKIP_PREFIXES = (
    "FOREIGN", "SPEND", "AMOUNT", "DETAIL", "CONTINUED ON NEXT PAGE",
)

def is_page_footer(line: str) -> bool:
    L = normalize(line)
    return bool(PAGE_FOOTER_RE.search(L))

def is_cardholder_header(lines, i):
    line = normalize(lines[i])
    if not line or line != line.upper():
        return None
    if not re.fullmatch(r"[A-Z .'\-]+", line):
        return None

    lookahead = " ".join(normalize(lines[i+k]) for k in range(1, 4) if i+k < len(lines))
    if ("CARD ENDING" in lookahead.upper()) or ("ACCOUNT ENDING" in lookahead.upper()) or ("CLOSING DATE" in lookahead.upper()):
        return line
    return None

def extract_amount_and_clean(desc_block: str):
    block = normalize(desc_block)
    matches = list(AMOUNT_TOKEN_RE.finditer(block))
    amount = None
    if matches:
        m = matches[-1]
        amt_raw = block[m.start():m.end()]
        amount = clean_amount(amt_raw)
        block = (block[:m.start()] + block[m.end():]).strip()
        block = re.sub(r"\s{2,}", " ", block).strip(" -|,")
    return amount, block


def extract_amex(pdf_file) -> dict:
    """Extrai transações de PDF da Amex"""
    lines = []
    with pdfplumber.open(pdf_file) as pdf:
        for page in pdf.pages:
            t = page.extract_text()
            if t:
                lines.extend(t.split("\n"))

    all_cardholders = {}
    current_holder = None
    skip_mode = None

    i, N = 0, len(lines)
    while i < N:
        raw = lines[i]
        line = normalize(raw)
        upper = line.upper()

        holder = is_cardholder_header(lines, i)
        if holder:
            current_holder = holder.title()
            all_cardholders.setdefault(current_holder, [])
            skip_mode = None
            i += 1
            continue

        if skip_mode is None and upper.startswith(FEES_START):
            skip_mode = 'fees'
            i += 1
            continue
        if skip_mode is None and upper.startswith(INTEREST_START):
            skip_mode = 'interest'
            i += 1
            continue

        if skip_mode is not None:
            if is_cardholder_header(lines, i) or is_page_footer(line) or any(upper.startswith(x) for x in SECTION_END):
                skip_mode = None
            else:
                i += 1
            continue

        if upper.startswith(SKIP_PREFIXES) or is_page_footer(line):
            i += 1
            continue

        m = DATE_RE.match(line)
        if m and current_holder:
            date_s, first_desc = m.group(1), m.group(2).strip()
            try:
                date_fmt = datetime.strptime(date_s, "%m/%d/%y").strftime("%Y-%m-%d")
            except Exception:
                date_fmt = date_s

            block_lines = [first_desc] if first_desc else []
            j = i + 1
            while j < N:
                nxt = normalize(lines[j])
                up = nxt.upper()

                if is_cardholder_header(lines, j):
                    break
                if DATE_RE.match(nxt):
                    break
                if up.startswith(FEES_START) or up.startswith(INTEREST_START):
                    break
                if any(up.startswith(x) for x in SECTION_END):
                    break
                if up.startswith(SKIP_PREFIXES) or is_page_footer(nxt):
                    j += 1
                    continue

                block_lines.append(nxt)
                j += 1

            block_text = " ".join([b for b in block_lines if b]).strip()
            amount, description = extract_amount_and_clean(block_text)

            all_cardholders[current_holder].append({
                "date": date_fmt,
                "description": description,
                "amount": amount,
            })

            i = j
            continue

        i += 1

    # Flatten to return single list with cardholder
    transactions = []
    for cardholder, txs in all_cardholders.items():
        # Normalize the cardholder name
        normalized_cardholder = normalize_name(cardholder)
        for tx in txs:
            tx["cardholder"] = normalized_cardholder
            transactions.append(tx)

    # Get unique normalized cardholders
    normalized_cardholders = list(set(normalize_name(ch) for ch in all_cardholders.keys()))

    return {
        "card_type": "amex",
        "transactions": transactions,
        "cardholders": normalized_cardholders
    }
