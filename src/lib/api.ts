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

export interface ConsolidatedTransaction {
  employee_name: string;
  category: string;
  amount: number;
}

export interface AddToConsolidatedResult {
  success: boolean;
  updated: number;
  created: number;
  total_employees: number;
  errors?: string[];
}

export async function addToConsolidated(
  transactions: ConsolidatedTransaction[],
  year: number
): Promise<AddToConsolidatedResult> {
  const response = await fetch(`${API_URL}/expenses/ytd/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transactions, year }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error adding to consolidated');
  }

  return response.json();
}

export async function undoFromConsolidated(
  transactions: ConsolidatedTransaction[],
  year: number
): Promise<AddToConsolidatedResult> {
  const response = await fetch(`${API_URL}/expenses/ytd/undo`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transactions, year }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error undoing from consolidated');
  }

  return response.json();
}

// ==================== CREDIT CARD EXPENSES (Intermediate Table) ====================

export interface CreditCardTransaction {
  employee_name: string;
  category: string;
  amount: number;
  description?: string;
  transaction_date?: string;
}

export interface CreditCardExpense {
  id: string;
  created_at: string;
  year: number;
  employee_name: string;
  category: string;
  amount: number;
  description: string;
  transaction_date: string;
  source: string;
  batch_id: string;
}

export interface CreditCardBatch {
  batch_id: string;
  year: number;
  source: string;
  created_at: string;
  transaction_count: number;
  employee_count: number;
  total_amount: number;
  categories: string[];
}

export interface AddCreditCardResult {
  success: boolean;
  batch_id: string;
  records_added: number;
  sync_result: {
    updated: number;
    created: number;
    errors: string[];
  };
}

export async function addCreditCardExpenses(
  transactions: CreditCardTransaction[],
  year: number,
  source: string = "AMEX"
): Promise<AddCreditCardResult> {
  const response = await fetch(`${API_URL}/credit-card/expenses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transactions, year, source }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error adding credit card expenses');
  }

  return response.json();
}

export async function getCreditCardExpenses(
  year?: number,
  batchId?: string
): Promise<{ success: boolean; expenses: CreditCardExpense[] }> {
  const params = new URLSearchParams();
  if (year) params.append('year', year.toString());
  if (batchId) params.append('batch_id', batchId);
  
  const response = await fetch(`${API_URL}/credit-card/expenses?${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching credit card expenses');
  }

  return response.json();
}

export async function getCreditCardBatches(
  year?: number
): Promise<{ success: boolean; batches: CreditCardBatch[] }> {
  const params = new URLSearchParams();
  if (year) params.append('year', year.toString());
  
  const response = await fetch(`${API_URL}/credit-card/batches?${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching batches');
  }

  return response.json();
}

export async function deleteCreditCardExpense(
  expenseId: string
): Promise<{ success: boolean; deleted_record: CreditCardExpense }> {
  const response = await fetch(`${API_URL}/credit-card/expenses/${expenseId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error deleting expense');
  }

  return response.json();
}

export async function deleteCreditCardBatch(
  batchId: string
): Promise<{ success: boolean; deleted_count: number; total_amount: number }> {
  const response = await fetch(`${API_URL}/credit-card/batches/${batchId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error deleting batch');
  }

  return response.json();
}

// ===========================================
// CREDIT CARD DASHBOARD API
// ===========================================

export interface CreditCardDashboardExpense {
  id: string;
  created_at: string | null;
  date: string | null;
  credit_card: string;
  description: string;
  user: string;
  category: string;
  amount: number;
  year: number | null;
  month: number | null;
  synced_to_valor: boolean;
  comments: string;
  project: string;
}

export interface CreditCardSummary {
  by_card: {
    [key: string]: {
      count: number;
      total: number;
      unique_users: number;
      unique_categories: number;
    };
  };
  totals: {
    count: number;
    amount: number;
    users: number;
    synced: number;
  };
}

export interface CreditCardDashboardResult {
  success: boolean;
  expenses: CreditCardDashboardExpense[];
  summary: CreditCardSummary;
  valid_cards: string[];
}

export async function getCreditCardDashboard(
  year?: number,
  creditCard?: string,
  user?: string,
  category?: string
): Promise<CreditCardDashboardResult> {
  const params = new URLSearchParams();
  if (year) params.append('year', year.toString());
  if (creditCard) params.append('credit_card', creditCard);
  if (user) params.append('user', user);
  if (category) params.append('category', category);
  
  const response = await fetch(`${API_URL}/credit-card/dashboard?${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching credit card dashboard');
  }

  return response.json();
}

export async function getCreditCardDashboardSummary(): Promise<{ success: boolean } & CreditCardSummary> {
  const response = await fetch(`${API_URL}/credit-card/dashboard/summary`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching summary');
  }

  return response.json();
}

export async function getCreditCardDashboardUsers(): Promise<{ success: boolean; users: string[] }> {
  const response = await fetch(`${API_URL}/credit-card/dashboard/users`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching users');
  }

  return response.json();
}

export async function getCreditCardDashboardCategories(): Promise<{ success: boolean; categories: string[] }> {
  const response = await fetch(`${API_URL}/credit-card/dashboard/categories`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching categories');
  }

  return response.json();
}

export async function getCreditCardDashboardYears(): Promise<{ success: boolean; years: number[] }> {
  const response = await fetch(`${API_URL}/credit-card/dashboard/years`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching years');
  }

  return response.json();
}

export interface AddCreditCardDashboardExpense {
  date: string;
  credit_card: string;
  description?: string;
  user: string;
  category: string;
  amount: number;
  comments?: string;
  project?: string;
}

export async function addCreditCardDashboardExpense(
  expense: AddCreditCardDashboardExpense
): Promise<{ success: boolean; id: string; expense: CreditCardDashboardExpense }> {
  const response = await fetch(`${API_URL}/credit-card/dashboard/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(expense),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error adding expense');
  }

  return response.json();
}

export async function addCreditCardDashboardExpensesBatch(
  expenses: AddCreditCardDashboardExpense[]
): Promise<{ success: boolean; added_count: number; errors?: string[] }> {
  const response = await fetch(`${API_URL}/credit-card/dashboard/add-batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(expenses),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error adding expenses');
  }

  return response.json();
}

export async function updateCreditCardDashboardExpense(
  expenseId: string,
  updates: Partial<AddCreditCardDashboardExpense>
): Promise<{ success: boolean; id: string }> {
  const response = await fetch(`${API_URL}/credit-card/dashboard/${expenseId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error updating expense');
  }

  return response.json();
}

export async function deleteCreditCardDashboardExpense(
  expenseId: string
): Promise<{ success: boolean; id: string; valor_deleted: boolean }> {
  const response = await fetch(`${API_URL}/credit-card/dashboard/${expenseId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error deleting expense');
  }

  return response.json();
}

export async function deleteCreditCardExpensesBatch(
  expenseIds: string[]
): Promise<{ success: boolean; deleted_count: number; valor_deleted_count: number }> {
  const response = await fetch(`${API_URL}/credit-card/dashboard/delete-batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(expenseIds),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error deleting expenses');
  }

  return response.json();
}

export async function syncCreditCardToValor(): Promise<{ success: boolean; synced_count: number; message: string }> {
  const response = await fetch(`${API_URL}/credit-card/dashboard/sync-to-valor`, {
    method: 'POST',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error syncing to valor');
  }

  return response.json();
}

export async function uploadCreditCardExcel(
  file: File, 
  creditCard: string = 'SVB'
): Promise<{ success: boolean; added_count: number; message: string; parse_errors?: string[]; db_errors?: string[] }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('credit_card', creditCard);

  const response = await fetch(`${API_URL}/credit-card/dashboard/upload-excel`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error uploading Excel');
  }

  return response.json();
}

export interface ExcelPreviewExpense {
  id: string;
  date: string;
  credit_card: string;
  description: string;
  user: string;
  category: string;
  amount: number;
  comments: string;
}

export async function previewCreditCardExcel(
  file: File, 
  creditCard: string = 'SVB'
): Promise<{ success: boolean; expenses: ExcelPreviewExpense[]; total_rows: number; parse_errors?: string[] }> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('credit_card', creditCard);

  const response = await fetch(`${API_URL}/credit-card/dashboard/preview-excel`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error previewing Excel');
  }

  return response.json();
}

export async function addCreditCardExpensesBatch(
  expenses: Omit<ExcelPreviewExpense, 'id'>[]
): Promise<{ success: boolean; added_count: number; errors?: string[] }> {
  const response = await fetch(`${API_URL}/credit-card/dashboard/add-batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(expenses.map(exp => ({
      date: exp.date,
      credit_card: exp.credit_card,
      description: exp.description,
      user: exp.user,
      category: exp.category,
      amount: exp.amount,
      comments: exp.comments
    }))),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error adding expenses');
  }

  return response.json();
}

// ===========================================
// RIPPLING EXPENSES API
// ===========================================

export interface RipplingExpense {
  id: string;
  created_at: string;
  name: string;  // Nome mapeado (display_name)
  amount: number;
  category: string;
  date: string | null;
  vendor: string;
  year: number | null;
  month: number | null;
  batch_id: string;
  employee_original: string;
  employee_type: string;
  vendor_name: string;
  currency: string;
  object_type: string;
  approval_state: string;
  receipt_filepath: string;
  valor_expense_id: string;  // Link para valor_expenses
  project?: string;
}

// Preview transaction (before upload)
export interface RipplingPreviewTransaction {
  id: string;  // Temporary ID
  employee_original: string;
  employee_name: string;
  employee_type: string;
  vendor_name: string;
  currency: string;
  amount: number;
  category: string;
  original_category: string;  // Keep original for reference
  purchase_date: string;
  object_type: string;
  approval_state: string;
  unique_key?: string;  // For duplicate detection
  is_duplicate?: boolean;  // True if already exists in DB
}

export interface RipplingBatch {
  batch_id: string;
  created_at: string;
  transaction_count: number;
  employee_count: number;
  total_amount: number;
  categories: string;
}

export interface RipplingSummary {
  total_records: number;
  total_batches: number;
  total_employees: number;
  total_amount: number;
  date_range: {
    min: string | null;
    max: string | null;
  };
  by_category: Array<{
    category: string;
    total: number;
    count: number;
  }>;
}

// Parse file for preview (without saving)
export async function parseRipplingFile(file: File): Promise<{
  success: boolean;
  transactions: RipplingPreviewTransaction[];
  total: number;
  new_count: number;
  duplicate_count: number;
  unmapped_employees: string[];
}> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/rippling-expenses/parse`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error parsing file');
  }

  return response.json();
}

// Confirm upload with (potentially edited) transactions
export async function confirmRipplingUpload(
  transactions: RipplingPreviewTransaction[],
  year?: number
): Promise<{
  success: boolean;
  batch_id?: string;
  total: number;
  duplicates: number;
  inserted: number;
  unmapped_employees?: string[];
  sync_result?: { updated: number; created: number; errors: string[] };
}> {
  const response = await fetch(`${API_URL}/rippling-expenses/confirm`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ transactions, year }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error uploading transactions');
  }

  return response.json();
}

// Legacy direct upload (deprecated - use parseRipplingFile + confirmRipplingUpload)
export async function uploadRipplingFile(file: File): Promise<{
  success: boolean;
  batch_id?: string;
  total: number;
  duplicates: number;
  inserted: number;
  unmapped_employees?: string[];
  message?: string;
  error?: string;
}> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_URL}/rippling-expenses/upload`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error uploading file');
  }

  return response.json();
}

export async function getRipplingExpenses(
  batchId?: string,
  limit: number = 1000,
  year?: number
): Promise<{ expenses: RipplingExpense[]; count: number }> {
  const params = new URLSearchParams();
  if (batchId) params.append('batch_id', batchId);
  if (year) params.append('year', year.toString());
  params.append('limit', limit.toString());
  
  const response = await fetch(`${API_URL}/rippling-expenses?${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching expenses');
  }

  return response.json();
}

export async function getRipplingBatches(): Promise<{ batches: RipplingBatch[] }> {
  const response = await fetch(`${API_URL}/rippling-expenses/batches`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching batches');
  }

  return response.json();
}

export async function getRipplingSummary(year?: number): Promise<RipplingSummary> {
  const params = year ? `?year=${year}` : '';
  const response = await fetch(`${API_URL}/rippling-expenses/summary${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching summary');
  }

  return response.json();
}

export async function deleteRipplingExpense(
  expenseId: string
): Promise<{ success: boolean; synced_valor: boolean }> {
  const response = await fetch(`${API_URL}/rippling-expenses/${expenseId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error deleting expense');
  }

  return response.json();
}

export async function updateRipplingExpense(
  expenseId: string,
  updates: Partial<{ name: string; amount: number; category: string; date: string; vendor: string; project: string }>
): Promise<{ success: boolean; synced_valor: boolean }> {
  const response = await fetch(`${API_URL}/rippling-expenses/${expenseId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error updating expense');
  }

  return response.json();
}

export async function deleteRipplingBatch(
  batchId: string
): Promise<{ success: boolean; deleted_count: number; total_amount: number }> {
  const response = await fetch(`${API_URL}/rippling-expenses/batches/${batchId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error deleting batch');
  }

  return response.json();
}

// =====================================================
// VALOR EXPENSES API
// =====================================================

export interface ValorExpense {
  id: string;
  name: string;
  amount: number;
  category: string;
  date: string | null;
  vendor: string;
  year: number | null;
  month: number | null;
  source: string;
  project: string;
}

export interface ValorExpenseByEmployee {
  employee_name: string;
  employee_type: string;
  total: number;
  categories: Record<string, number>;
}

export interface ValorSummary {
  grand_total: number;
  employee_count: number;
  transaction_count: number;
  by_category: Record<string, number>;
}

export interface ValorMonthlyBreakdown {
  month: number;
  total: number;
  categories: Record<string, number>;
}

export async function getValorExpenses(
  year?: number,
  month?: number,
  name?: string,
  category?: string,
  limit: number = 5000
): Promise<{ expenses: ValorExpense[]; total: number }> {
  const params = new URLSearchParams();
  if (year) params.append('year', year.toString());
  if (month) params.append('month', month.toString());
  if (name) params.append('name', name);
  if (category) params.append('category', category);
  params.append('limit', limit.toString());

  const response = await fetch(`${API_URL}/valor-expenses?${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching expenses');
  }

  return response.json();
}

export async function getValorExpensesByEmployee(
  year?: number
): Promise<{ expenses: ValorExpenseByEmployee[]; total: number }> {
  const params = new URLSearchParams();
  if (year) params.append('year', year.toString());

  const response = await fetch(`${API_URL}/valor-expenses/by-employee?${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching expenses');
  }

  return response.json();
}

export async function getValorSummary(year?: number): Promise<{ summary: ValorSummary }> {
  const params = new URLSearchParams();
  if (year) params.append('year', year.toString());

  const response = await fetch(`${API_URL}/valor-expenses/summary?${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching summary');
  }

  return response.json();
}

export async function getValorYears(): Promise<{ years: number[] }> {
  const response = await fetch(`${API_URL}/valor-expenses/years`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching years');
  }

  return response.json();
}

export async function getValorCategories(): Promise<{ categories: string[] }> {
  const response = await fetch(`${API_URL}/valor-expenses/categories`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching categories');
  }

  return response.json();
}

export async function getValorNames(): Promise<{ names: string[] }> {
  const response = await fetch(`${API_URL}/valor-expenses/names`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching names');
  }

  return response.json();
}

export async function getValorVendors(): Promise<{ vendors: string[] }> {
  const response = await fetch(`${API_URL}/valor-expenses/vendors`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching vendors');
  }

  return response.json();
}

export async function getValorMonthlyBreakdown(
  year: number,
  name?: string
): Promise<{ monthly: ValorMonthlyBreakdown[]; year: number }> {
  const params = new URLSearchParams();
  if (name) params.append('name', name);

  const response = await fetch(`${API_URL}/valor-expenses/monthly/${year}?${params}`);

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error fetching monthly breakdown');
  }

  return response.json();
}

export interface ValorExpenseUpdate {
  name?: string;
  amount?: number;
  category?: string;
  date?: string;
  vendor?: string;
  project?: string;
}

export async function updateValorExpense(
  expenseId: string,
  updates: ValorExpenseUpdate
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_URL}/valor-expenses/${expenseId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error updating expense');
  }

  return response.json();
}

export async function deleteValorExpensesBatch(
  expenseIds: string[]
): Promise<{ success: boolean; deleted_count: number }> {
  const response = await fetch(`${API_URL}/valor-expenses/delete-batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expense_ids: expenseIds }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error deleting expenses');
  }

  return response.json();
}

// =====================================================
// UBER EXPENSES API
// =====================================================

export interface UberExpenseUpdate {
  user_name?: string;
  first_name?: string;
  last_name?: string;
  service?: string;
  city?: string;
  category?: string;
  amount?: number;
  vendor?: string;
}

export async function updateUberExpense(
  tripId: string,
  updates: UberExpenseUpdate
): Promise<{ success: boolean }> {
  const response = await fetch(`${API_URL}/uber/expense/${tripId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error updating Uber expense');
  }

  return response.json();
}

export async function deleteUberExpense(tripId: string): Promise<{ success: boolean }> {
  const response = await fetch(`${API_URL}/uber/expense/${tripId}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error deleting Uber expense');
  }

  return response.json();
}

export async function deleteUberExpensesBatch(
  tripIds: string[]
): Promise<{ success: boolean; deleted_count: number }> {
  const response = await fetch(`${API_URL}/uber/expenses/delete-batch`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ trip_ids: tripIds }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.detail || 'Error deleting Uber expenses');
  }

  return response.json();
}
