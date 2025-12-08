const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface ExtractedTransaction {
  date: string;
  description: string;
  amount: number | null;
  cardholder?: string;
  amount_brl?: number;
  fx_rate?: number;
  mcc?: string;
  merchant_zip?: string;
}

export interface ExtractionResult {
  success: boolean;
  filename: string;
  card_type: string;
  total_transactions: number;
  cardholders: string[];
  transactions: ExtractedTransaction[];
}

export async function extractPDF(file: File, cardType: string): Promise<ExtractionResult> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('card_type', cardType);

  const response = await fetch(`${API_URL}/extract`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Erro ao processar PDF');
  }

  return response.json();
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
