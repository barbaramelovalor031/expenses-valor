import { ExtractedInvoice, Transaction } from '@/types/invoice';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { X, Download, Calendar, CreditCard, Receipt, Users, Sparkles, Loader2, FileSpreadsheet, Send, Database } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { PROJECT_OPTIONS } from '@/data/projects';
import { Checkbox } from '@/components/ui/checkbox';
import { useState, useMemo, useRef, useCallback } from 'react';
import { categorizeTransactions, addCreditCardDashboardExpensesBatch, AddCreditCardDashboardExpense } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

// Available expense categories
const EXPENSE_CATEGORIES = [
  "Airfare",
  "Board meetings",
  "Brazil Insurance",
  "Catering - Event",
  "Computer Equipment",
  "Conferences & Seminars",
  "Delivery and Postage",
  "Due Diligence - New Deals",
  "Due Diligence - Portfolio Company",
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

// Available cardholders/users (canonical names) - MUST MATCH CONSOLIDATED DATABASE
const AVAILABLE_USERS = [
  "Scott Sobel",
  "Clifford Sobel",
  "Doug Smith",
  "Michael Nicklas",
  "Paulo Passoni",
  "Antoine Colaco",
  "Carlos Costa",
  "Daniel Schulman",
  "Kelli Spangler-Ballard",
];

// Alias mappings for user names (lowercase key -> canonical name)
const USER_ALIASES: Record<string, string> = {
  // Doug Smith variations (AMEX shows as J. Douglas Smith)
  "j.douglas smith": "Doug Smith",
  "j. douglas smith": "Doug Smith",
  "j douglas smith": "Doug Smith",
  "jd smith": "Doug Smith",
  "j.d. smith": "Doug Smith",
  "douglas smith": "Doug Smith",
  "john douglas smith": "Doug Smith",
  // Antoine variations
  "antoine colaço": "Antoine Colaco",
  // Kelli variations
  "kelli spangler": "Kelli Spangler-Ballard",
  "kelli spanglerballard": "Kelli Spangler-Ballard",
  // Daniel variations
  "dan schulman": "Daniel Schulman",
};

// Helper to find canonical user name (case-insensitive + aliases)
const getCanonicalUser = (user: string | undefined): string => {
  if (!user) return '__none__';
  const lowerUser = user.toLowerCase().trim();
  
  // Check aliases first
  if (USER_ALIASES[lowerUser]) {
    return USER_ALIASES[lowerUser];
  }
  
  // Then check direct match with canonical names
  const found = AVAILABLE_USERS.find(u => u.toLowerCase() === lowerUser);
  return found || user;
};

interface InvoiceViewerProps {
  invoice: ExtractedInvoice;
  onClose: () => void;
  originalFile?: File;
  onUpdateTransactions?: (transactions: Transaction[]) => void;
}

export function InvoiceViewer({ invoice, onClose, originalFile, onUpdateTransactions }: InvoiceViewerProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isSendingToDb, setIsSendingToDb] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [transactions, setTransactions] = useState(invoice.transactions);
  // Show categories if any transaction already has ai_category OR after categorization
  const [showCategories, setShowCategories] = useState(() => 
    invoice.transactions.some(tx => tx.ai_category)
  );
  const [selectedDescription, setSelectedDescription] = useState<string | null>(null);
  // Selected transactions for sending to database
  const [selectedForSend, setSelectedForSend] = useState<Set<string>>(new Set());
  const { toast } = useToast();

  // Groups transactions by cardholder
  const transactionsByCardholder = useMemo(() => {
    return transactions.reduce((acc, tx) => {
      const holder = tx.category || 'Others';
      if (!acc[holder]) acc[holder] = [];
      acc[holder].push(tx);
      return acc;
    }, {} as Record<string, typeof transactions>);
  }, [transactions]);

  const cardholders = Object.keys(transactionsByCardholder).sort();

  // Get unique AI categories from transactions
  const usedCategories = useMemo(() => {
    const cats = new Set<string>();
    transactions.forEach(tx => {
      if (tx.ai_category) cats.add(tx.ai_category);
    });
    return Array.from(cats).sort();
  }, [transactions]);

  // Count uncategorized
  const uncategorizedCount = useMemo(() => {
    return transactions.filter(tx => !tx.ai_category).length;
  }, [transactions]);

  // Auto-show categories when any transaction has ai_category
  const hasAnyCategory = useMemo(() => {
    return transactions.some(tx => tx.ai_category);
  }, [transactions]);

  // Update showCategories when categories are added
  if (hasAnyCategory && !showCategories) {
    setShowCategories(true);
  }

  // Calculate totals by user
  const totalsByUser = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const [holder, txs] of Object.entries(transactionsByCardholder)) {
      totals[holder] = txs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    }
    return totals;
  }, [transactionsByCardholder]);

  // Filter transactions based on selected user AND category
  const filteredTransactions = useMemo(() => {
    let filtered = transactions;
    
    // Filter by user
    if (selectedUser !== 'all') {
      filtered = filtered.filter(tx => (tx.category || 'Others') === selectedUser);
    }
    
    // Filter by AI category
    if (selectedCategory === 'uncategorized') {
      filtered = filtered.filter(tx => !tx.ai_category);
    } else if (selectedCategory !== 'all') {
      filtered = filtered.filter(tx => tx.ai_category === selectedCategory);
    }
    
    return filtered;
  }, [transactions, selectedUser, selectedCategory]);

  // Filtered total
  const filteredTotal = useMemo(() => {
    return filteredTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  }, [filteredTransactions]);

  // Handle AI categorization
  const handleCategorize = async () => {
    setIsCategorizing(true);
    try {
      const result = await categorizeTransactions(transactions.map(tx => ({
        date: tx.date,
        description: tx.description,
        amount: tx.amount,
        cardholder: tx.category,
      })));

      if (result.success) {
        const updatedTransactions = transactions.map((tx, index) => ({
          ...tx,
          ai_category: result.transactions[index]?.ai_category || '',
        }));
        setTransactions(updatedTransactions);
        setShowCategories(true);
        onUpdateTransactions?.(updatedTransactions);
        
        toast({
          title: "Categorization complete!",
          description: `${result.transactions.filter(t => t.ai_category).length} of ${transactions.length} transactions categorized.`,
        });
      }
    } catch (error) {
      console.error('Error categorizing:', error);
      toast({
        title: "Error",
        description: "Failed to categorize transactions. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCategorizing(false);
    }
  };

  // Handle manual category change
  const handleCategoryChange = (index: number, category: string) => {
    const updatedTransactions = [...transactions];
    const txIndex = transactions.findIndex(t => t === filteredTransactions[index]);
    if (txIndex !== -1) {
      // If "__none__" is selected, set to empty string
      const finalCategory = category === '__none__' ? '' : category;
      updatedTransactions[txIndex] = {
        ...updatedTransactions[txIndex],
        ai_category: finalCategory,
      };
      setTransactions(updatedTransactions);
      onUpdateTransactions?.(updatedTransactions);
    }
  };

  // Handle user/cardholder change
  const handleUserChange = (index: number, newUser: string) => {
    const updatedTransactions = [...transactions];
    const txIndex = transactions.findIndex(t => t === filteredTransactions[index]);
    if (txIndex !== -1) {
      updatedTransactions[txIndex] = {
        ...updatedTransactions[txIndex],
        category: newUser, // category field stores the cardholder
      };
      setTransactions(updatedTransactions);
      onUpdateTransactions?.(updatedTransactions);
      
      toast({
        title: "User updated",
        description: `Transaction assigned to ${newUser}`,
      });
    }
  };

  // Handle comments change - debounced
  const commentsTimeoutRef = useRef<Record<number, NodeJS.Timeout>>({});
  const handleCommentsChange = useCallback((index: number, comments: string) => {
    // Clear previous timeout for this index
    if (commentsTimeoutRef.current[index]) {
      clearTimeout(commentsTimeoutRef.current[index]);
    }
    // Debounce the update
    commentsTimeoutRef.current[index] = setTimeout(() => {
      const updatedTransactions = [...transactions];
      const txIndex = transactions.findIndex(t => t === filteredTransactions[index]);
      if (txIndex !== -1) {
        updatedTransactions[txIndex] = {
          ...updatedTransactions[txIndex],
          comments,
        };
        setTransactions(updatedTransactions);
        onUpdateTransactions?.(updatedTransactions);
      }
    }, 300);
  }, [transactions, filteredTransactions, onUpdateTransactions]);

  // Handle project change - debounced
  const projectTimeoutRef = useRef<Record<number, NodeJS.Timeout>>({});
  const handleProjectChange = useCallback((index: number, project: string) => {
    const projectValue = project === '__none__' ? '' : project;
    // Clear previous timeout for this index
    if (projectTimeoutRef.current[index]) {
      clearTimeout(projectTimeoutRef.current[index]);
    }
    // Debounce the update
    projectTimeoutRef.current[index] = setTimeout(() => {
      const updatedTransactions = [...transactions];
      const txIndex = transactions.findIndex(t => t === filteredTransactions[index]);
      if (txIndex !== -1) {
        updatedTransactions[txIndex] = {
          ...updatedTransactions[txIndex],
          project: projectValue,
        };
        setTransactions(updatedTransactions);
        onUpdateTransactions?.(updatedTransactions);
      }
    }, 300);
  }, [transactions, filteredTransactions, onUpdateTransactions]);

  // Handle selection toggle for individual transaction
  const handleSelectTransaction = (transactionId: string) => {
    const newSelected = new Set(selectedForSend);
    if (newSelected.has(transactionId)) {
      newSelected.delete(transactionId);
    } else {
      newSelected.add(transactionId);
    }
    setSelectedForSend(newSelected);
  };

  // Handle select all / deselect all for filtered transactions
  const handleSelectAll = () => {
    const filteredIds = filteredTransactions.map(tx => tx.id);
    const allSelected = filteredIds.every(id => selectedForSend.has(id));
    
    const newSelected = new Set(selectedForSend);
    if (allSelected) {
      // Deselect all filtered
      filteredIds.forEach(id => newSelected.delete(id));
    } else {
      // Select all filtered
      filteredIds.forEach(id => newSelected.add(id));
    }
    setSelectedForSend(newSelected);
  };

  // Check if all filtered are selected
  const allFilteredSelected = useMemo(() => {
    if (filteredTransactions.length === 0) return false;
    return filteredTransactions.every(tx => selectedForSend.has(tx.id));
  }, [filteredTransactions, selectedForSend]);

  // Get transactions ready to send (selected + categorized + has user)
  const transactionsReadyToSend = useMemo(() => {
    return transactions.filter(tx => 
      selectedForSend.has(tx.id) && 
      tx.ai_category && 
      tx.category
    );
  }, [transactions, selectedForSend]);

  // Count selected but not ready (missing category or user)
  const selectedButNotReady = useMemo(() => {
    return transactions.filter(tx => 
      selectedForSend.has(tx.id) && 
      (!tx.ai_category || !tx.category)
    ).length;
  }, [transactions, selectedForSend]);

  // Handle send to consolidated database (via intermediate table)
  const handleSendToDatabase = async () => {
    if (transactionsReadyToSend.length === 0) {
      const reason = selectedForSend.size === 0 
        ? "Select transactions first using the checkboxes."
        : `${selectedButNotReady} selected transaction(s) are missing a category or user assignment.`;
      toast({
        title: "Cannot send to database",
        description: reason,
        variant: "destructive",
      });
      return;
    }

    setIsSendingToDb(true);
    try {
      // Map card ID to proper credit card name
      const cardNameMap: Record<string, string> = {
        'amex': 'Amex',
        'svb': 'SVB',
        'bradesco': 'Bradesco',
      };
      const creditCardName = cardNameMap[invoice.cardId.toLowerCase()] || 'Amex';

      // Prepare transactions for the new API format
      const expenses: AddCreditCardDashboardExpense[] = transactionsReadyToSend.map(tx => ({
        date: tx.date || new Date().toISOString().split('T')[0],
        credit_card: creditCardName,
        description: tx.description,
        user: getCanonicalUser(tx.category),
        category: tx.ai_category!,
        amount: tx.amount,
        comments: tx.comments || '',
      }));

      const result = await addCreditCardDashboardExpensesBatch(expenses);

      if (result.success) {
        toast({
          title: "✅ Sent to database!",
          description: `Added ${result.added_count} transactions. Switch to Database tab to view.`,
        });
        
        // Clear selection after successful send
        setSelectedForSend(new Set());
      }
    } catch (error) {
      console.error('Error sending to database:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to send to database. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSendingToDb(false);
    }
  };

  const handleDownloadExcel = async () => {
    if (!originalFile) {
      // Fallback to CSV if no original file
      handleDownloadCSV();
      return;
    }

    setIsDownloading(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const formData = new FormData();
      formData.append('file', originalFile);
      formData.append('card_type', invoice.cardId);

      const response = await fetch(`${API_URL}/export-excel`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Error generating Excel');
      }

      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${invoice.fileName.replace('.pdf', '')}_by_user.xlsx`;
      link.click();
    } catch (error) {
      console.error('Error downloading Excel:', error);
      // Fallback to CSV
      handleDownloadCSV();
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadCSV = () => {
    const headers = showCategories 
      ? ['Date', 'Description', 'User', 'AI Category', 'Amount']
      : ['Date', 'Description', 'User', 'Amount'];
    const rows = transactions.map((t) => 
      showCategories 
        ? [t.date, t.description, t.category || '', t.ai_category || '', t.amount.toFixed(2)]
        : [t.date, t.description, t.category || '', t.amount.toFixed(2)]
    );

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${invoice.fileName.replace('.pdf', '')}_expenses.csv`;
    link.click();
  };

  const handleDownloadExcelWithCategories = async () => {
    setIsDownloading(true);
    try {
      const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      
      // Send transactions with categories to backend
      const response = await fetch(`${API_URL}/export-excel-with-categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transactions: transactions.map(tx => ({
            date: tx.date,
            description: tx.description,
            cardholder: tx.category,
            ai_category: tx.ai_category || '',
            amount: tx.amount,
          })),
          filename: invoice.fileName.replace('.pdf', ''),
        }),
      });

      if (!response.ok) {
        throw new Error('Error generating Excel');
      }

      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${invoice.fileName.replace('.pdf', '')}_with_categories.xlsx`;
      link.click();
      
      toast({
        title: "Excel exported!",
        description: "File downloaded with all categories included.",
      });
    } catch (error) {
      console.error('Error downloading Excel with categories:', error);
      toast({
        title: "Error",
        description: "Failed to export Excel. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-7xl max-h-[90vh] bg-card rounded-2xl shadow-elevated overflow-hidden animate-scale-in">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border gradient-primary">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-primary-foreground/20 flex items-center justify-center">
              <Receipt className="w-6 h-6 text-primary-foreground" />
            </div>
            <div>
              <h2 className="font-display text-xl font-bold text-primary-foreground">
                {invoice.fileName}
              </h2>
              <p className="text-sm text-primary-foreground/80">{invoice.cardName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-primary-foreground/20 transition-colors"
          >
            <X className="w-6 h-6 text-primary-foreground" />
          </button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-6 border-b border-border bg-secondary/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Card</p>
              <p className="font-medium text-foreground">{invoice.cardName}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <Calendar className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Due Date</p>
              <p className="font-medium text-foreground">
                {invoice.dueDate || 'Not informed'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-accent/10 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-accent" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Total</p>
              <p className="font-bold text-lg text-foreground">
                ${' '}
                {invoice.totalAmount?.toLocaleString('en-US', {
                  minimumFractionDigits: 2,
                }) || '0.00'}
              </p>
            </div>
          </div>
        </div>

        {/* Transactions Table */}
        <div className="p-6 overflow-auto max-h-[50vh]">
          {/* Filter and Actions Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Filter by user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      All users ({transactions.length})
                    </SelectItem>
                    {cardholders.map((holder) => (
                      <SelectItem key={holder} value={holder}>
                        {holder} ({transactionsByCardholder[holder].length})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              {/* AI Category Filter - only show when categories are visible */}
              {showCategories && (
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-purple-500" />
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-[220px] border-purple-200 bg-purple-50">
                      <SelectValue placeholder="Filter by AI category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        ✓ All categories ({transactions.length})
                      </SelectItem>
                      <SelectItem value="uncategorized">
                        ⚠️ Uncategorized ({uncategorizedCount})
                      </SelectItem>
                      {usedCategories.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat} ({transactions.filter(tx => tx.ai_category === cat).length})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              
              <div className="text-sm">
                <span className="text-muted-foreground">Total: </span>
                <span className="font-bold text-foreground">
                  $ {filteredTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="default" 
                size="sm" 
                onClick={handleCategorize}
                disabled={isCategorizing}
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                {isCategorizing ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
                {isCategorizing ? 'Categorizing...' : 'Categorize with AI'}
              </Button>
              {showCategories && (
                <Button 
                  variant="default" 
                  size="sm" 
                  onClick={handleDownloadExcelWithCategories}
                  disabled={isDownloading}
                  className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  {isDownloading ? 'Generating...' : 'Export with Categories'}
                </Button>
              )}
              {showCategories && (
                <div className="flex items-center gap-2 pl-2 border-l border-border">
                  <Button 
                    variant="default" 
                    size="sm" 
                    onClick={handleSendToDatabase}
                    disabled={isSendingToDb || transactionsReadyToSend.length === 0}
                    className={`${transactionsReadyToSend.length > 0 
                      ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600' 
                      : 'bg-gray-400'}`}
                    title={selectedButNotReady > 0 ? `${selectedButNotReady} selected are missing category/user` : ''}
                  >
                    {isSendingToDb ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Database className="w-4 h-4" />
                    )}
                    {isSendingToDb ? 'Sending...' : `Send to DB (${transactionsReadyToSend.length})`}
                  </Button>
                  {selectedButNotReady > 0 && (
                    <span className="text-xs text-amber-600">
                      ⚠️ {selectedButNotReady} missing category
                    </span>
                  )}
                </div>
              )}
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleDownloadExcel}
                disabled={isDownloading}
              >
                <Download className="w-4 h-4" />
                {isDownloading ? 'Generating...' : 'Download XLSX'}
              </Button>
            </div>
          </div>

          {/* User Summary Cards */}
          {selectedUser === 'all' && cardholders.length > 1 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 mb-4">
              {cardholders.map((holder) => (
                <button
                  key={holder}
                  onClick={() => setSelectedUser(holder)}
                  className="p-3 rounded-lg border border-border bg-muted/30 hover:bg-muted/50 transition-colors text-left"
                >
                  <p className="text-xs font-medium text-foreground truncate">{holder}</p>
                  <p className="text-xs text-muted-foreground">
                    {transactionsByCardholder[holder].length} transactions
                  </p>
                  <p className="text-sm font-bold text-primary">
                    $ {totalsByUser[holder].toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </button>
              ))}
            </div>
          )}

          {/* Selected User Info */}
          {selectedUser !== 'all' && (
            <div className="flex items-center justify-between p-3 mb-4 rounded-lg bg-primary/10 border border-primary/20">
              <div>
                <p className="font-medium text-foreground">{selectedUser}</p>
                <p className="text-sm text-muted-foreground">
                  {filteredTransactions.length} transactions
                </p>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setSelectedUser('all')}>
                View all
              </Button>
            </div>
          )}

          <div className="rounded-lg border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  {showCategories && (
                    <TableHead className="w-[40px]">
                      <Checkbox 
                        checked={allFilteredSelected}
                        onCheckedChange={handleSelectAll}
                        aria-label="Select all"
                      />
                    </TableHead>
                  )}
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Description</TableHead>
                  {selectedUser === 'all' && (
                    <TableHead className="font-semibold">User</TableHead>
                  )}
                  {showCategories && (
                    <TableHead className="font-semibold">AI Category</TableHead>
                  )}
                  {showCategories && (
                    <TableHead className="font-semibold">Comments</TableHead>
                  )}
                  {showCategories && (
                    <TableHead className="font-semibold">Project</TableHead>
                  )}
                  <TableHead className="font-semibold text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((transaction, index) => (
                  <TableRow 
                    key={transaction.id} 
                    className={`hover:bg-muted/30 ${selectedForSend.has(transaction.id) ? 'bg-blue-50' : ''}`}
                  >
                    {showCategories && (
                      <TableCell>
                        <Checkbox 
                          checked={selectedForSend.has(transaction.id)}
                          onCheckedChange={() => handleSelectTransaction(transaction.id)}
                          aria-label={`Select transaction ${transaction.description}`}
                        />
                      </TableCell>
                    )}
                    <TableCell className="text-muted-foreground">
                      {transaction.date}
                    </TableCell>
                    <TableCell className="font-medium text-foreground max-w-[200px]">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <button
                            onClick={() => setSelectedDescription(transaction.description)}
                            className="text-left truncate block w-full hover:text-primary cursor-pointer transition-colors"
                          >
                            {transaction.description}
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[400px]">
                          <p className="text-sm">Click to see full description</p>
                        </TooltipContent>
                      </Tooltip>
                    </TableCell>
                    {selectedUser === 'all' && (
                      <TableCell>
                        <Select 
                          value={getCanonicalUser(transaction.category)} 
                          onValueChange={(value) => handleUserChange(index, value === '__none__' ? '' : value)}
                        >
                          <SelectTrigger className="w-[160px] h-8 text-xs">
                            <SelectValue placeholder="Select user..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-muted-foreground">-- Select --</span>
                            </SelectItem>
                            {AVAILABLE_USERS.map((user) => (
                              <SelectItem key={user} value={user}>
                                {user}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    {showCategories && (
                      <TableCell>
                        <Select 
                          value={transaction.ai_category || '__none__'} 
                          onValueChange={(value) => handleCategoryChange(index, value)}
                        >
                          <SelectTrigger className={`w-[180px] h-8 text-xs ${
                            transaction.ai_category 
                              ? 'bg-green-50 border-green-200 text-green-700' 
                              : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                          }`}>
                            <SelectValue placeholder="Select category..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">
                              <span className="text-muted-foreground">-- Select --</span>
                            </SelectItem>
                            {EXPENSE_CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat}>
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    {showCategories && (
                      <TableCell>
                        <Input
                          type="text"
                          placeholder="Add comments..."
                          defaultValue={transaction.comments || ''}
                          onChange={(e) => handleCommentsChange(index, e.target.value)}
                          className="w-[150px] h-8 text-xs"
                        />
                      </TableCell>
                    )}
                    {showCategories && (
                      <TableCell>
                        <Select
                          value={transaction.project || '__none__'}
                          onValueChange={(value) => handleProjectChange(index, value)}
                        >
                          <SelectTrigger className="w-[150px] h-8 text-xs">
                            <SelectValue placeholder="Select project..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No project</SelectItem>
                            {PROJECT_OPTIONS.map((proj) => (
                              <SelectItem key={proj} value={proj}>{proj}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                    )}
                    <TableCell className="text-right font-medium text-foreground">
                      ${' '}
                      {transaction.amount.toLocaleString('en-US', {
                        minimumFractionDigits: 2,
                      })}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      {/* Description Dialog */}
      <Dialog open={!!selectedDescription} onOpenChange={() => setSelectedDescription(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Full Description</DialogTitle>
          </DialogHeader>
          <div className="mt-4 p-4 rounded-lg bg-muted/50 border border-border">
            <p className="text-foreground whitespace-pre-wrap break-words">
              {selectedDescription}
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
