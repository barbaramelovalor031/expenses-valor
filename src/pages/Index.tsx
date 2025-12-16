import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { CardSelector } from '@/components/CardSelector';
import { FileUploadZone } from '@/components/FileUploadZone';
import { InvoiceList } from '@/components/InvoiceList';
import { InvoiceViewer } from '@/components/InvoiceViewer';
import { creditCards } from '@/data/creditCards';
import { ExtractedInvoice, Transaction } from '@/types/invoice';
import { useToast } from '@/hooks/use-toast';
import { extractPDF, getCreditCardDashboard, deleteCreditCardDashboardExpense, deleteCreditCardExpensesBatch, updateCreditCardDashboardExpense, syncCreditCardToValor, uploadCreditCardExcel, previewCreditCardExcel, addCreditCardExpensesBatch, CreditCardDashboardExpense, ExcelPreviewExpense } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Trash2, Upload, Download, RefreshCw, Search, CheckCircle, XCircle, Database, CreditCard as CreditCardIcon, DollarSign, Edit, Check, X, FileSpreadsheet } from 'lucide-react';

const VALID_CREDIT_CARDS = ['Amex', 'SVB', 'Bradesco'];

// Lista de sócios/usuários válidos
const VALID_USERS = [
  "Scott Sobel",
  "Clifford Sobel",
  "Doug Smith",
  "Michael Nicklas",
  "Paulo Passoni",
  "Antoine Colaco",
  "Carlos Costa",
  "Kelli SpanglerBallard",
];

// Lista de categorias válidas (inclui Firm Uber para casos especiais)
const VALID_CATEGORIES = [
  "Airfare",
  "Board meetings",
  "Brazil Insurance",
  "Catering - Event",
  "Computer Equipment",
  "Conferences & Seminars",
  "Delivery and Postage",
  "Due Diligence - New Deals",
  "Due Diligence - Portfolio Company",
  "Firm Uber",
  "Gifts",
  "Ground Transportation - Local",
  "Ground Transportation - Travel",
  "IT Subscriptions",
  "Lodging",
  "Meals & Entertainment - Local",
  "Meals & Entertainment - Travel",
  "Membership Dues",
  "Miscellaneous",
  "Office Supplies",
  "Other - Event",
  "Pantry Food",
  "Personal Expenses",
  "Printing",
  "Printing - Event",
  "Rippling Wire Deduction",
  "Tech/AV - Event",
  "Telephone/Internet",
  "Training",
  "Travel Agent Fees",
  "Venue - Event",
  "Wellhub Reimbursement",
];

const cardColors: Record<string, string> = {
  'Amex': 'bg-blue-500',
  'SVB': 'bg-green-500',
  'Bradesco': 'bg-red-500',
};

const Index = () => {
  const [selectedCard, setSelectedCard] = useState<string>('');
  const [invoices, setInvoices] = useState<ExtractedInvoice[]>([]);
  const [originalFiles, setOriginalFiles] = useState<Record<string, File>>({});
  const [viewingInvoice, setViewingInvoice] = useState<ExtractedInvoice | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  // Dashboard state
  const [expenses, setExpenses] = useState<CreditCardDashboardExpense[]>([]);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isUploadingExcel, setIsUploadingExcel] = useState(false);
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterCard, setFilterCard] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<CreditCardDashboardExpense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  
  // Inline editing state
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  const inputRef = useRef<HTMLInputElement>(null);
  // Excel preview state
  const [previewData, setPreviewData] = useState<ExcelPreviewExpense[]>([]);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [isConfirmingUpload, setIsConfirmingUpload] = useState(false);
  const [previewEditingCell, setPreviewEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [previewEditingValue, setPreviewEditingValue] = useState<string>('');
  const [selectedPreviewRows, setSelectedPreviewRows] = useState<Set<string>>(new Set());

  // Handle Excel preview (instead of direct upload)
  const handleExcelPreview = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingExcel(true);
    try {
      const result = await previewCreditCardExcel(file, 'SVB');
      if (result.success && result.expenses.length > 0) {
        setPreviewData(result.expenses);
        setSelectedPreviewRows(new Set()); // Reset selection
        setShowPreviewModal(true);
        if (result.parse_errors && result.parse_errors.length > 0) {
          toast({
            title: 'Warning',
            description: `${result.parse_errors.length} rows had errors and were skipped`,
            variant: 'destructive',
          });
        }
      } else {
        toast({
          title: 'Error',
          description: 'No valid data found in Excel file',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error previewing Excel:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to preview Excel',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingExcel(false);
      e.target.value = '';
    }
  };

  // Confirm and upload preview data
  const handleConfirmUpload = async () => {
    setIsConfirmingUpload(true);
    try {
      // Remove temporary id from preview data before sending
      const dataToUpload = previewData.map(({ id, ...rest }) => rest);
      const result = await addCreditCardExpensesBatch(dataToUpload);
      toast({
        title: 'Upload Complete',
        description: `Successfully added ${result.added_count} expenses`,
      });
      setShowPreviewModal(false);
      setPreviewData([]);
      setSelectedPreviewRows(new Set());
      await loadExpenses();
    } catch (error) {
      console.error('Error uploading:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload',
        variant: 'destructive',
      });
    } finally {
      setIsConfirmingUpload(false);
    }
  };

  // Edit preview data
  const updatePreviewData = (id: string, field: string, value: string) => {
    setPreviewData(prev => prev.map(exp => {
      if (exp.id === id) {
        if (field === 'amount') {
          return { ...exp, [field]: parseFloat(value) || 0 };
        }
        return { ...exp, [field]: value };
      }
      return exp;
    }));
  };

  // Delete row from preview
  const deletePreviewRow = (id: string) => {
    setPreviewData(prev => prev.filter(exp => exp.id !== id));
    setSelectedPreviewRows(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
  };

  // Toggle row selection
  const togglePreviewRowSelection = (id: string) => {
    setSelectedPreviewRows(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // Select/deselect all rows
  const toggleAllPreviewRows = () => {
    if (selectedPreviewRows.size === previewData.length) {
      setSelectedPreviewRows(new Set());
    } else {
      setSelectedPreviewRows(new Set(previewData.map(r => r.id)));
    }
  };

  // Delete selected rows
  const deleteSelectedPreviewRows = () => {
    setPreviewData(prev => prev.filter(exp => !selectedPreviewRows.has(exp.id)));
    setSelectedPreviewRows(new Set());
  };

  // Handle Excel upload (legacy - keeping for compatibility)
  const handleExcelUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingExcel(true);
    try {
      const result = await uploadCreditCardExcel(file, 'SVB');
      toast({
        title: 'Upload Complete',
        description: result.message,
      });
      if (result.parse_errors && result.parse_errors.length > 0) {
        console.warn('Parse errors:', result.parse_errors);
      }
      await loadExpenses();
    } catch (error) {
      console.error('Error uploading Excel:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload Excel',
        variant: 'destructive',
      });
    } finally {
      setIsUploadingExcel(false);
      // Reset the input
      e.target.value = '';
    }
  };

  // Load expenses from database
  const loadExpenses = async () => {
    setIsLoadingExpenses(true);
    try {
      const result = await getCreditCardDashboard();
      setExpenses(result.expenses);
    } catch (error) {
      console.error('Error loading expenses:', error);
      toast({
        title: 'Error',
        description: 'Failed to load expenses from database',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingExpenses(false);
    }
  };

  useEffect(() => {
    loadExpenses();
  }, []);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      if (filterYear !== 'all' && exp.year !== parseInt(filterYear)) return false;
      if (filterCard !== 'all' && exp.credit_card !== filterCard) return false;
      if (filterUser !== 'all' && exp.user !== filterUser) return false;
      if (filterCategory !== 'all') {
        if (filterCategory === '__empty__') {
          if (exp.category?.trim()) return false; // Has category, exclude
        } else if (filterCategory === '__pending__') {
          // Pending = empty category AND not Firm Uber (for sync)
          const cat = exp.category?.trim() || '';
          if (cat && cat !== 'Firm Uber') return false; // Has non-Firm Uber category, exclude
          if (cat === 'Firm Uber') return false; // Is Firm Uber, exclude
        } else {
          if (exp.category !== filterCategory) return false;
        }
      }
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (
          !exp.description?.toLowerCase().includes(search) &&
          !exp.user?.toLowerCase().includes(search) &&
          !exp.category?.toLowerCase().includes(search) &&
          !exp.comments?.toLowerCase().includes(search)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [expenses, filterYear, filterCard, filterUser, filterCategory, searchTerm]);

  // Available filter options
  const availableYears = useMemo(() => {
    return [...new Set(expenses.map(e => e.year).filter(Boolean))] as number[];
  }, [expenses]);

  const availableUsers = useMemo(() => {
    return [...new Set(expenses.map(e => e.user).filter(Boolean))].sort();
  }, [expenses]);

  const availableCategories = useMemo(() => {
    return [...new Set(expenses.map(e => e.category).filter(Boolean))].sort();
  }, [expenses]);

  // Stats
  const stats = useMemo(() => {
    const total = filteredExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const synced = filteredExpenses.filter(exp => exp.synced_to_valor).length;
    // Only exclude "Firm Uber" from pending - empty categories should show as pending so user doesn't forget
    const firmUberCount = filteredExpenses.filter(exp => exp.category === 'Firm Uber' && !exp.synced_to_valor).length;
    const emptyCategoryCount = filteredExpenses.filter(exp => !exp.category?.trim() && !exp.synced_to_valor).length;
    // Pending = not synced AND not Firm Uber (includes empty categories!)
    const unsynced = filteredExpenses.filter(exp => 
      !exp.synced_to_valor && 
      exp.category !== 'Firm Uber'
    ).length;
    return { total, synced, unsynced, count: filteredExpenses.length, firmUberCount, emptyCategoryCount };
  }, [filteredExpenses]);

  // Handle sync to valor
  const handleSyncToValor = async () => {
    setIsSyncing(true);
    try {
      const result = await syncCreditCardToValor();
      toast({
        title: 'Sync Complete',
        description: result.message,
      });
      await loadExpenses();
    } catch (error) {
      console.error('Error syncing:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to sync',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      await deleteCreditCardDashboardExpense(deleteTarget.id);
      toast({
        title: 'Expense Deleted',
        description: 'Transaction removed successfully',
      });
      setDeleteTarget(null);
      setSelectedExpenses(prev => {
        const newSet = new Set(prev);
        newSet.delete(deleteTarget.id);
        return newSet;
      });
      await loadExpenses();
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to delete expense',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Multi-select functions for expenses table
  const toggleExpenseSelection = (id: string) => {
    setSelectedExpenses(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleAllExpenses = () => {
    if (selectedExpenses.size === filteredExpenses.length) {
      setSelectedExpenses(new Set());
    } else {
      setSelectedExpenses(new Set(filteredExpenses.map(e => e.id)));
    }
  };

  const deleteSelectedExpenses = async () => {
    if (selectedExpenses.size === 0) return;
    
    setIsDeletingBatch(true);
    try {
      const result = await deleteCreditCardExpensesBatch(Array.from(selectedExpenses));
      
      toast({
        title: 'Batch Delete Complete',
        description: `Deleted ${result.deleted_count} expense${result.deleted_count !== 1 ? 's' : ''}${result.valor_deleted_count > 0 ? ` (${result.valor_deleted_count} from consolidated)` : ''}`,
      });
      
      setSelectedExpenses(new Set());
      await loadExpenses();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete expenses',
        variant: 'destructive',
      });
    } finally {
      setIsDeletingBatch(false);
    }
  };

  // Inline editing functions
  const startInlineEdit = (expense: CreditCardDashboardExpense, field: string) => {
    const value = expense[field as keyof CreditCardDashboardExpense];
    setEditingCell({ id: expense.id, field });
    setEditingValue(value?.toString() || '');
  };

  const cancelInlineEdit = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  const saveInlineEdit = async (expense: CreditCardDashboardExpense, newValue?: string) => {
    if (!editingCell) return;
    
    const { field } = editingCell;
    // Get value from ref if not provided directly
    const valueToSave = newValue !== undefined ? newValue : (inputRef.current?.value || editingValue);
    
    // Check if value changed
    const currentValue = expense[field as keyof CreditCardDashboardExpense]?.toString() || '';
    if (valueToSave === currentValue) {
      setEditingCell(null);
      setEditingValue('');
      return;
    }
    
    let updates: Record<string, any> = {};
    if (field === 'amount') {
      updates[field] = parseFloat(valueToSave) || 0;
    } else {
      updates[field] = valueToSave;
    }
    
    try {
      await updateCreditCardDashboardExpense(expense.id, updates);
      
      // Update local state
      setExpenses(prev => prev.map(e => 
        e.id === expense.id ? { ...e, ...updates, synced_to_valor: false } : e
      ));
      
      toast({ title: 'Updated', description: `${field} updated successfully` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update', variant: 'destructive' });
    } finally {
      setEditingCell(null);
      setEditingValue('');
    }
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent, expense: CreditCardDashboardExpense) => {
    if (e.key === 'Enter') saveInlineEdit(expense, inputRef.current?.value);
    else if (e.key === 'Escape') cancelInlineEdit();
  };

  // Export CSV
  const handleExportCSV = () => {
    const headers = ['Date', 'Credit Card', 'Description', 'User', 'Category', 'Amount', 'Comments', 'Synced'];
    const rows = filteredExpenses.map(exp => [
      exp.date || '',
      exp.credit_card,
      `"${(exp.description || '').replace(/"/g, '""')}"`,
      exp.user,
      exp.category,
      exp.amount.toFixed(2),
      `"${(exp.comments || '').replace(/"/g, '""')}"`,
      exp.synced_to_valor ? 'Yes' : 'No'
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credit_card_expenses_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric'
    });
  };

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (!selectedCard) {
        toast({
          title: 'Select a Credit Card',
          description: 'Please select a credit card before uploading files.',
          variant: 'destructive',
        });
        return;
      }

      setIsProcessing(true);

      const pendingInvoices: ExtractedInvoice[] = files.map((file) => ({
        id: `inv-${Date.now()}-${file.name}`,
        fileName: file.name,
        cardId: selectedCard,
        cardName: creditCards.find((c) => c.id === selectedCard)?.name || '',
        transactions: [],
        extractedAt: new Date(),
        status: 'processing' as const,
      }));

      const newOriginalFiles: Record<string, File> = {};
      pendingInvoices.forEach((inv, i) => {
        newOriginalFiles[inv.id] = files[i];
      });
      setOriginalFiles((prev) => ({ ...prev, ...newOriginalFiles }));

      setInvoices((prev) => [...pendingInvoices, ...prev]);

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const pending = pendingInvoices[i];
        
        try {
          const result = await extractPDF(file, selectedCard);
          
          const transactions: Transaction[] = (result.transactions || []).map((tx, idx) => ({
            id: `t-${Date.now()}-${idx}`,
            date: tx.date || '',
            description: tx.description || '',
            amount: tx.amount ?? 0,
            category: tx.cardholder || '',
          }));

          const totalAmount = transactions.reduce((acc, t) => acc + (t.amount || 0), 0);

          setInvoices((prev) =>
            prev.map((inv) =>
              inv.id === pending.id
                ? { ...inv, transactions, totalAmount, status: 'completed' as const }
                : inv
            )
          );
        } catch (error) {
          console.error('Error extracting PDF:', error);
          setInvoices((prev) =>
            prev.map((inv) =>
              inv.id === pending.id
                ? { ...inv, status: 'error' as const }
                : inv
            )
          );
          
          toast({
            title: 'Processing error',
            description: error instanceof Error ? error.message : 'Unknown error',
            variant: 'destructive',
          });
        }
      }

      setIsProcessing(false);
      toast({
        title: 'Processing completed',
        description: `${files.length} file(s) processed.`,
      });
    },
    [selectedCard, toast]
  );

  return (
    <div className="max-w-6xl">
      <Tabs defaultValue="upload" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="upload" className="gap-2">
            <Upload className="h-4 w-4" />
            Upload PDF
          </TabsTrigger>
          <TabsTrigger value="database" className="gap-2">
            <Database className="h-4 w-4" />
            Database ({expenses.length})
          </TabsTrigger>
        </TabsList>

        {/* Upload Tab */}
        <TabsContent value="upload">
          <section className="mb-10 animate-fade-in">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-6">
              Credit Card Statement
            </h2>
            
            <div className="grid gap-6 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <div className="bg-card rounded-2xl p-6 shadow-card border border-border/50">
                  <CardSelector
                    cards={creditCards}
                    selectedCard={selectedCard}
                    onSelect={setSelectedCard}
                  />
                </div>
              </div>
              <div className="lg:col-span-3">
                <div className="bg-card rounded-2xl p-6 shadow-card border border-border/50">
                  <FileUploadZone
                    onFilesSelected={handleFilesSelected}
                    disabled={isProcessing}
                  />
                </div>
              </div>
            </div>
          </section>

          <div className="bg-card rounded-2xl p-6 shadow-card border border-border/50 animate-fade-in">
            <h3 className="font-display text-xl font-semibold text-foreground mb-6">
              Processed Invoices
            </h3>
            <InvoiceList invoices={invoices} onView={setViewingInvoice} />
          </div>
        </TabsContent>

        {/* Database Tab */}
        <TabsContent value="database">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
                <DollarSign className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{formatCurrency(stats.total)}</div>
                <p className="text-xs text-muted-foreground">{stats.count} transactions</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Synced</CardTitle>
                <CheckCircle className="h-4 w-4 text-green-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-green-600">{stats.synced}</div>
                <p className="text-xs text-muted-foreground">Synced to Valor</p>
              </CardContent>
            </Card>
            
            <Card className="cursor-pointer hover:border-orange-300 transition-colors" onClick={() => setFilterCategory('__pending__')}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Pending</CardTitle>
                <XCircle className="h-4 w-4 text-orange-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{stats.unsynced}</div>
                <p className="text-xs text-muted-foreground">
                  {stats.firmUberCount > 0 
                    ? `Excluded: ${stats.firmUberCount} Firm Uber`
                    : 'Not synced'}
                </p>
                {stats.emptyCategoryCount > 0 && (
                  <p className="text-xs text-red-500 font-medium mt-1">
                    ⚠️ {stats.emptyCategoryCount} without category
                  </p>
                )}
                <p className="text-xs text-blue-500 mt-1">Click to filter</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Actions</CardTitle>
                <CreditCardIcon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={handleExportCSV}>
                  <Download className="h-3 w-3 mr-1" />
                  CSV
                </Button>
                <Button size="sm" onClick={handleSyncToValor} disabled={isSyncing || stats.unsynced === 0}>
                  {isSyncing ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Upload className="h-3 w-3 mr-1" />}
                  Sync
                </Button>
                <label htmlFor="excel-preview-upload" className="cursor-pointer">
                  <Button size="sm" variant="outline" asChild disabled={isUploadingExcel}>
                    <span>
                      {isUploadingExcel ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <FileSpreadsheet className="h-3 w-3 mr-1" />}
                      Excel
                    </span>
                  </Button>
                </label>
                <input
                  id="excel-preview-upload"
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={handleExcelPreview}
                  className="hidden"
                />
              </CardContent>
            </Card>
          </div>

          {/* Filters */}
          <Card className="mb-6">
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-9"
                  />
                </div>
                
                <Select value={filterYear} onValueChange={setFilterYear}>
                  <SelectTrigger>
                    <SelectValue placeholder="Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Years</SelectItem>
                    {availableYears.sort((a, b) => b - a).map(year => (
                      <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={filterCard} onValueChange={setFilterCard}>
                  <SelectTrigger>
                    <SelectValue placeholder="Card" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cards</SelectItem>
                    {VALID_CREDIT_CARDS.map(card => (
                      <SelectItem key={card} value={card}>{card}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                
                <Select value={filterUser} onValueChange={setFilterUser}>
                  <SelectTrigger>
                    <SelectValue placeholder="User" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Users</SelectItem>
                    {availableUsers.map(user => (
                      <SelectItem key={user} value={user}>{user}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={filterCategory} onValueChange={setFilterCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    <SelectItem value="__pending__" className="text-orange-500 font-medium">🔄 Pending (need sync)</SelectItem>
                    <SelectItem value="__empty__" className="text-red-500">⚠️ Empty / No Category</SelectItem>
                    {availableCategories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          {/* Data Table */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>Credit Card Expenses</CardTitle>
                <CardDescription>
                  Showing {filteredExpenses.length} of {expenses.length} expenses
                  {selectedExpenses.size > 0 && ` • ${selectedExpenses.size} selected`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {selectedExpenses.size > 0 && (
                  <Button 
                    variant="destructive" 
                    size="sm" 
                    onClick={deleteSelectedExpenses}
                    disabled={isDeletingBatch}
                  >
                    {isDeletingBatch && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete {selectedExpenses.size}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={loadExpenses} disabled={isLoadingExpenses}>
                  <RefreshCw className={`h-4 w-4 ${isLoadingExpenses ? 'animate-spin' : ''}`} />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoadingExpenses ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : filteredExpenses.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No expenses found. Upload a PDF and send to database!
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={filteredExpenses.length > 0 && selectedExpenses.size === filteredExpenses.length}
                            onCheckedChange={toggleAllExpenses}
                          />
                        </TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Card</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead>Comments</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-center">Synced</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredExpenses.map((expense) => (
                        <TableRow key={expense.id} className={selectedExpenses.has(expense.id) ? 'bg-blue-50' : ''}>
                          <TableCell>
                            <Checkbox
                              checked={selectedExpenses.has(expense.id)}
                              onCheckedChange={() => toggleExpenseSelection(expense.id)}
                            />
                          </TableCell>
                          <TableCell className="text-sm">{formatDate(expense.date)}</TableCell>
                          <TableCell>
                            <Badge className={`${cardColors[expense.credit_card] || 'bg-gray-500'} text-xs`}>
                              {expense.credit_card}
                            </Badge>
                          </TableCell>
                          {/* Description - Editable */}
                          <TableCell 
                            className="max-w-[150px] cursor-pointer hover:bg-muted/50" 
                            onClick={() => startInlineEdit(expense, 'description')}
                            title={expense.description}
                          >
                            {editingCell?.id === expense.id && editingCell?.field === 'description' ? (
                              <Input
                                ref={inputRef}
                                defaultValue={editingValue}
                                onKeyDown={(e) => handleInlineKeyDown(e, expense)}
                                onBlur={() => saveInlineEdit(expense)}
                                autoFocus
                                className="h-7 text-sm"
                              />
                            ) : (
                              <span className="truncate block text-sm">{expense.description || '-'}</span>
                            )}
                          </TableCell>
                          {/* User - Editable with Dropdown + Input */}
                          <TableCell 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => !editingCell && startInlineEdit(expense, 'user')}
                          >
                            {editingCell?.id === expense.id && editingCell?.field === 'user' ? (
                              <div className="relative">
                                <div className="flex items-center gap-1">
                                  <Input
                                    ref={inputRef}
                                    defaultValue={editingValue}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') saveInlineEdit(expense, inputRef.current?.value);
                                      if (e.key === 'Escape') cancelInlineEdit();
                                    }}
                                    className="h-7 text-sm w-32"
                                    placeholder="Type name..."
                                    autoFocus
                                  />
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => saveInlineEdit(expense, inputRef.current?.value)}>
                                    <Check className="h-3 w-3 text-green-600" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelInlineEdit}>
                                    <X className="h-3 w-3 text-red-600" />
                                  </Button>
                                </div>
                                {/* Dropdown suggestions - show all users */}
                                <div className="absolute z-50 top-8 left-0 w-40 max-h-48 overflow-auto bg-white dark:bg-gray-800 border rounded-md shadow-lg">
                                  {VALID_USERS.map(user => (
                                    <div
                                      key={user}
                                      className="px-2 py-1.5 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        saveInlineEdit(expense, user);
                                      }}
                                    >
                                      {user}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <span className="text-sm">{expense.user}</span>
                            )}
                          </TableCell>
                          {/* Category - Editable with Dropdown */}
                          <TableCell 
                            className="cursor-pointer hover:bg-muted/50"
                            onClick={() => startInlineEdit(expense, 'category')}
                          >
                            {editingCell?.id === expense.id && editingCell?.field === 'category' ? (
                              <Select
                                value={editingValue}
                                onValueChange={(value) => {
                                  setEditingValue(value);
                                  saveInlineEdit(expense, value);
                                }}
                              >
                                <SelectTrigger className="h-7 text-sm w-48">
                                  <SelectValue placeholder="Select category" />
                                </SelectTrigger>
                                <SelectContent>
                                  {VALID_CATEGORIES.map(cat => (
                                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className={`text-sm ${expense.category === 'Firm Uber' ? 'text-orange-600 font-medium' : ''}`}>
                                {expense.category}
                              </span>
                            )}
                          </TableCell>
                          {/* Amount - Editable */}
                          <TableCell 
                            className="text-right cursor-pointer hover:bg-muted/50"
                            onClick={() => startInlineEdit(expense, 'amount')}
                          >
                            {editingCell?.id === expense.id && editingCell?.field === 'amount' ? (
                              <Input
                                ref={inputRef}
                                type="number"
                                step="0.01"
                                defaultValue={editingValue}
                                onKeyDown={(e) => handleInlineKeyDown(e, expense)}
                                onBlur={() => saveInlineEdit(expense)}
                                autoFocus
                                className="h-7 text-sm w-24 text-right"
                              />
                            ) : (
                              <span className="font-medium">{formatCurrency(expense.amount)}</span>
                            )}
                          </TableCell>
                          {/* Comments - Editable */}
                          <TableCell 
                            className="max-w-[120px] cursor-pointer hover:bg-muted/50"
                            onClick={() => startInlineEdit(expense, 'comments')}
                            title={expense.comments || ''}
                          >
                            {editingCell?.id === expense.id && editingCell?.field === 'comments' ? (
                              <Input
                                ref={inputRef}
                                defaultValue={editingValue}
                                onKeyDown={(e) => handleInlineKeyDown(e, expense)}
                                onBlur={() => saveInlineEdit(expense)}
                                autoFocus
                                className="h-7 text-sm"
                                placeholder="Add comment..."
                              />
                            ) : (
                              <span className="truncate block text-sm text-muted-foreground">
                                {expense.comments || '-'}
                              </span>
                            )}
                          </TableCell>
                          {/* Project - Editable */}
                          <TableCell 
                            className="max-w-[120px] cursor-pointer hover:bg-muted/50"
                            onClick={() => startInlineEdit(expense, 'project')}
                            title={expense.project || ''}
                          >
                            {editingCell?.id === expense.id && editingCell?.field === 'project' ? (
                              <Input
                                ref={inputRef}
                                defaultValue={editingValue}
                                onKeyDown={(e) => handleInlineKeyDown(e, expense)}
                                onBlur={() => saveInlineEdit(expense)}
                                autoFocus
                                className="h-7 text-sm"
                                placeholder="Add project..."
                              />
                            ) : (
                              <span className="truncate block text-sm text-muted-foreground">
                                {expense.project || '-'}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {expense.synced_to_valor ? (
                              <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                            ) : (
                              <XCircle className="h-4 w-4 text-orange-500 mx-auto" />
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeleteTarget(expense)}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Invoice Viewer Modal */}
      {viewingInvoice && (
        <InvoiceViewer 
          invoice={viewingInvoice} 
          onClose={() => {
            setViewingInvoice(null);
            // Refresh database after closing viewer (in case data was sent)
            loadExpenses();
          }}
          originalFile={originalFiles[viewingInvoice.id]}
        />
      )}

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this expense?
              {deleteTarget?.synced_to_valor && (
                <span className="block mt-2 text-orange-600">
                  This expense is synced and will also be removed from the main expense table.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-500 hover:bg-red-600">
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Excel Preview Dialog */}
      <Dialog open={showPreviewModal} onOpenChange={setShowPreviewModal}>
        <DialogContent className="max-w-6xl max-h-[90vh]">
          <DialogHeader>
            <DialogTitle>Preview Excel Upload</DialogTitle>
            <DialogDescription>
              Review and edit data before uploading. Select rows to delete multiple at once.
            </DialogDescription>
          </DialogHeader>
          
          <div className="flex items-center justify-between mb-2">
            <div className="text-sm text-gray-500">
              {previewData.length} row{previewData.length !== 1 ? 's' : ''} • Total: ${previewData.reduce((sum, r) => sum + (r.amount || 0), 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
            {selectedPreviewRows.size > 0 && (
              <Button
                variant="destructive"
                size="sm"
                onClick={deleteSelectedPreviewRows}
                className="h-8"
              >
                <Trash2 className="h-4 w-4 mr-1" />
                Delete {selectedPreviewRows.size} selected
              </Button>
            )}
          </div>

          <ScrollArea className="h-[500px] border rounded-md">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50">
                  <TableHead className="w-10">
                    <Checkbox
                      checked={previewData.length > 0 && selectedPreviewRows.size === previewData.length}
                      onCheckedChange={toggleAllPreviewRows}
                    />
                  </TableHead>
                  <TableHead className="w-24">Date</TableHead>
                  <TableHead className="w-20">Card</TableHead>
                  <TableHead className="w-60">Description</TableHead>
                  <TableHead className="w-36">User</TableHead>
                  <TableHead className="w-36">Category</TableHead>
                  <TableHead className="w-24 text-right">Amount</TableHead>
                  <TableHead className="w-40">Comments</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {previewData.map((row) => (
                  <TableRow key={row.id} className={`hover:bg-gray-50 ${selectedPreviewRows.has(row.id) ? 'bg-blue-50' : ''}`}>
                    <TableCell>
                      <Checkbox
                        checked={selectedPreviewRows.has(row.id)}
                        onCheckedChange={() => togglePreviewRowSelection(row.id)}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {previewEditingCell?.id === row.id && previewEditingCell?.field === 'date' ? (
                        <Input
                          type="date"
                          value={previewEditingValue}
                          onChange={(e) => setPreviewEditingValue(e.target.value)}
                          onBlur={() => { updatePreviewData(row.id, 'date', previewEditingValue); setPreviewEditingCell(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { updatePreviewData(row.id, 'date', previewEditingValue); setPreviewEditingCell(null); }}}
                          autoFocus
                          className="h-7 w-full"
                        />
                      ) : (
                        <span 
                          className="cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded"
                          onClick={() => { setPreviewEditingCell({ id: row.id, field: 'date' }); setPreviewEditingValue(row.date); }}
                        >
                          {row.date}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={row.credit_card || ''} 
                        onValueChange={(value) => updatePreviewData(row.id, 'credit_card', value)}
                      >
                        <SelectTrigger className="h-7 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {['Amex', 'SVB', 'Bradesco'].map(card => (
                            <SelectItem key={card} value={card}>{card}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-sm">
                      {previewEditingCell?.id === row.id && previewEditingCell?.field === 'description' ? (
                        <Input
                          value={previewEditingValue}
                          onChange={(e) => setPreviewEditingValue(e.target.value)}
                          onBlur={() => { updatePreviewData(row.id, 'description', previewEditingValue); setPreviewEditingCell(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { updatePreviewData(row.id, 'description', previewEditingValue); setPreviewEditingCell(null); }}}
                          autoFocus
                          className="h-7 w-full"
                        />
                      ) : (
                        <span 
                          className="cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded block truncate max-w-[250px]"
                          onClick={() => { setPreviewEditingCell({ id: row.id, field: 'description' }); setPreviewEditingValue(row.description); }}
                          title={row.description}
                        >
                          {row.description}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={row.user || ''} 
                        onValueChange={(value) => updatePreviewData(row.id, 'user', value)}
                      >
                        <SelectTrigger className="h-7 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VALID_USERS.map(user => (
                            <SelectItem key={user} value={user}>{user}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select 
                        value={row.category || ''} 
                        onValueChange={(value) => updatePreviewData(row.id, 'category', value)}
                      >
                        <SelectTrigger className="h-7 w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {VALID_CATEGORIES.map(cat => (
                            <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      {previewEditingCell?.id === row.id && previewEditingCell?.field === 'amount' ? (
                        <Input
                          type="number"
                          step="0.01"
                          value={previewEditingValue}
                          onChange={(e) => setPreviewEditingValue(e.target.value)}
                          onBlur={() => { updatePreviewData(row.id, 'amount', previewEditingValue); setPreviewEditingCell(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { updatePreviewData(row.id, 'amount', previewEditingValue); setPreviewEditingCell(null); }}}
                          autoFocus
                          className="h-7 w-20 text-right"
                        />
                      ) : (
                        <span 
                          className="cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded"
                          onClick={() => { setPreviewEditingCell({ id: row.id, field: 'amount' }); setPreviewEditingValue(row.amount?.toString() || '0'); }}
                        >
                          ${row.amount?.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {previewEditingCell?.id === row.id && previewEditingCell?.field === 'comments' ? (
                        <Input
                          value={previewEditingValue}
                          onChange={(e) => setPreviewEditingValue(e.target.value)}
                          onBlur={() => { updatePreviewData(row.id, 'comments', previewEditingValue); setPreviewEditingCell(null); }}
                          onKeyDown={(e) => { if (e.key === 'Enter') { updatePreviewData(row.id, 'comments', previewEditingValue); setPreviewEditingCell(null); }}}
                          autoFocus
                          className="h-7 w-full"
                        />
                      ) : (
                        <span 
                          className="cursor-pointer hover:bg-blue-50 px-1 py-0.5 rounded block truncate max-w-[180px]"
                          onClick={() => { setPreviewEditingCell({ id: row.id, field: 'comments' }); setPreviewEditingValue(row.comments || ''); }}
                          title={row.comments}
                        >
                          {row.comments || '-'}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-red-500 hover:text-red-700 hover:bg-red-50"
                        onClick={() => deletePreviewRow(row.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </ScrollArea>

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowPreviewModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmUpload} 
              disabled={isConfirmingUpload || previewData.length === 0}
              className="bg-green-600 hover:bg-green-700"
            >
              {isConfirmingUpload && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Upload {previewData.length} Row{previewData.length !== 1 ? 's' : ''}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Index;
