export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

// Alias for backward compatibility
const API_URL = API_BASE_URL;

export interface ExtractedTransaction {
  date: string;
  description: string;
  amount: number | null;
  cardholder?: string;
  amount_brl?: number;
  fx_rate?: number;
  mcc?: string;
  merchant_zip?: string;
  ai_category?: string;
  category?: string;
}

export interface ExtractionResult {
  success: boolean;
  filename: string;
  card_type: string;
  total_transactions: number;
  cardholders: string[];
  transactions: ExtractedTransaction[];
}

export interface CategorizeResult {
  success: boolean;
  transactions: ExtractedTransaction[];
  categories: string[];
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
    throw new Error(error.detail || 'Error processing PDF');
  }

  return response.json();
}

export async function categorizeTransactions(transactions: ExtractedTransaction[]): Promise<CategorizeResult> {
  const response = await fetch(`${API_URL}/categorize`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transactions }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error categorizing transactions');
  }

  return response.json();
}

export async function getCategories(): Promise<string[]> {
  const response = await fetch(`${API_URL}/categories`);
  
  if (!response.ok) {
    throw new Error('Error fetching categories');
  }
  
  const data = await response.json();
  return data.categories;
}

export async function checkHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_URL}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
