import { useState, useCallback, useEffect, useMemo } from 'react';
import { CreditCard, Upload, FileSpreadsheet, X, Download, Sparkles, Check, AlertCircle, RefreshCw, Trash2, Database, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL, getMichaelExpenses, getMichaelBatches, getMichaelSummary, addMichaelExpenses, updateMichaelExpense, deleteMichaelExpense, deleteMichaelBatch, syncMichaelToValor, MichaelExpense, MichaelBatch, MichaelSummary } from '@/lib/api';
import { PROJECT_OPTIONS } from '@/data/projects';

// Mesmas categorias do backend
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

interface PreviewTransaction {
  id: number;
  date: string;
  description: string;
  notes: string;
  amount: number;
  extended_details: string;
  amex_category: string;
  ai_category: string;
  city_state: string;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(value);
};

const formatDate = (dateStr: string | null) => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const MichaelCard = () => {
  const [activeTab, setActiveTab] = useState('expenses');
  
  // Database data
  const [expenses, setExpenses] = useState<MichaelExpense[]>([]);
  const [batches, setBatches] = useState<MichaelBatch[]>([]);
  const [summary, setSummary] = useState<MichaelSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(2024);
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  
  // Upload state
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [previewTransactions, setPreviewTransactions] = useState<PreviewTransaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [selectedForUpload, setSelectedForUpload] = useState<Set<number>>(new Set());
  
  // Other state
  const [savingProjectId, setSavingProjectId] = useState<string | null>(null);
  const [savingCategoryId, setSavingCategoryId] = useState<string | null>(null);
  const [savingDateId, setSavingDateId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'expense' | 'batch'; item: MichaelExpense | MichaelBatch } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  const { toast } = useToast();

  // Load data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [expensesResult, batchesResult, summaryResult] = await Promise.all([
        getMichaelExpenses(selectedYear, 2000),
        getMichaelBatches(),
        getMichaelSummary(selectedYear)
      ]);
      setExpenses(expensesResult.expenses);
      setBatches(batchesResult.batches);
      setSummary(summaryResult);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({ title: 'Error', description: 'Failed to load data', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const matchesSearch = !searchTerm || 
        exp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exp.category.toLowerCase().includes(searchTerm.toLowerCase());
      const matchesCategory = filterCategory === 'all' || exp.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [expenses, searchTerm, filterCategory]);

  // Upload file processing
  const processFile = async (uploadedFile: File) => {
    setIsProcessing(true);
    setFile(uploadedFile);
    
    try {
      const formData = new FormData();
      formData.append('file', uploadedFile);
      
      const response = await fetch(`${API_BASE_URL}/michael/process`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Error processing file');
      }
      
      const data = await response.json();
      setPreviewTransactions(data.transactions);
      setSelectedForUpload(new Set(data.transactions.map((t: PreviewTransaction) => t.id)));
      setActiveTab('upload');
      
      toast({
        title: "File processed!",
        description: `${data.total_transactions} transactions loaded. Total: ${formatCurrency(data.total_amount)}`,
      });
      
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to process file",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCategorize = async () => {
    if (previewTransactions.length === 0) return;
    
    setIsCategorizing(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/michael/categorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions: previewTransactions }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Error categorizing');
      }
      
      const data = await response.json();
      setPreviewTransactions(data.transactions);
      
      const categorized = data.transactions.filter((t: PreviewTransaction) => t.ai_category).length;
      toast({
        title: "Categorization complete!",
        description: `${categorized} of ${data.transactions.length} transactions categorized.`,
      });
      
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to categorize",
        variant: "destructive",
      });
    } finally {
      setIsCategorizing(false);
    }
  };

  const handleUploadToDatabase = async () => {
    const selectedTransactions = previewTransactions.filter(t => selectedForUpload.has(t.id));
    if (selectedTransactions.length === 0) {
      toast({ title: 'Error', description: 'No transactions selected', variant: 'destructive' });
      return;
    }
    
    setIsUploading(true);
    
    try {
      const expensesToUpload = selectedTransactions.map(t => ({
        date: t.date,
        description: t.description,
        card_member: 'Michael Nicklas',
        amount: t.amount,
        category: t.ai_category || 'Miscellaneous',
        project: '',
      }));
      
      const result = await addMichaelExpenses(expensesToUpload);
      
      toast({
        title: 'Upload complete!',
        description: `Added ${result.added_count} expenses. Total: ${formatCurrency(result.total_amount)}`,
      });
      
      // Clear preview and reload data
      setPreviewTransactions([]);
      setSelectedForUpload(new Set());
      setFile(null);
      setActiveTab('expenses');
      await loadData();
      
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to upload',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const result = await syncMichaelToValor();
      toast({
        title: 'Sync complete!',
        description: result.message,
      });
      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to sync',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    setIsDeleting(true);
    try {
      if (deleteTarget.type === 'expense') {
        await deleteMichaelExpense((deleteTarget.item as MichaelExpense).id);
        toast({ title: 'Expense deleted' });
      } else {
        const result = await deleteMichaelBatch((deleteTarget.item as MichaelBatch).batch_id);
        toast({ title: 'Batch deleted', description: `Deleted ${result.deleted_count} expenses` });
      }
      await loadData();
    } catch (error) {
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  };

  const handleCategoryChange = (transactionId: number, newCategory: string) => {
    setPreviewTransactions(prev => 
      prev.map(tx => 
        tx.id === transactionId ? { ...tx, ai_category: newCategory } : tx
      )
    );
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      processFile(droppedFile);
    }
  }, []);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      processFile(selectedFile);
    }
  };

  const toggleSelectAll = () => {
    if (selectedForUpload.size === previewTransactions.length) {
      setSelectedForUpload(new Set());
    } else {
      setSelectedForUpload(new Set(previewTransactions.map(t => t.id)));
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground flex items-center gap-2">
            <CreditCard className="w-8 h-8 text-purple-500" />
            Michael Card
          </h1>
          <p className="text-muted-foreground mt-1">
            Michael Nicklas expenses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={selectedYear.toString()} onValueChange={(v) => setSelectedYear(parseInt(v))}>
            <SelectTrigger className="w-[100px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button 
            onClick={handleSync} 
            disabled={isSyncing || (summary?.unsynced_count || 0) === 0}
            className="bg-gradient-to-r from-blue-500 to-indigo-500"
          >
            <Database className={`w-4 h-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing...' : `Sync (${summary?.unsynced_count || 0})`}
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-purple-500/10 to-pink-500/10 border-purple-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Expenses</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{formatCurrency(summary.total_amount)}</p>
              <p className="text-xs text-muted-foreground">{summary.total_count} transactions</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Synced</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.synced_amount)}</p>
              <p className="text-xs text-muted-foreground">{summary.synced_count} transactions</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Pending Sync</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-orange-600">{formatCurrency(summary.unsynced_amount)}</p>
              <p className="text-xs text-muted-foreground">{summary.unsynced_count} transactions</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Batches</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{batches.length}</p>
              <p className="text-xs text-muted-foreground">uploaded batches</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="expenses">Expenses ({expenses.length})</TabsTrigger>
          <TabsTrigger value="batches">Batches ({batches.length})</TabsTrigger>
          <TabsTrigger value="upload">Upload New</TabsTrigger>
        </TabsList>

        {/* Expenses Tab */}
        <TabsContent value="expenses" className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap gap-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input 
                placeholder="Search expenses..." 
                value={searchTerm} 
                onChange={(e) => setSearchTerm(e.target.value)} 
                className="pl-9" 
              />
            </div>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {EXPENSE_CATEGORIES.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Expenses Table */}
          <div className="border rounded-md max-h-[500px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Project</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">Synced</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <RefreshCw className="w-6 h-6 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : filteredExpenses.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      No expenses found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredExpenses.map((exp) => (
                    <TableRow key={exp.id}>
                      <TableCell className="font-mono text-sm">
                        <div className="flex items-center gap-1">
                          <input
                            type="date"
                            value={exp.date ? exp.date.split('T')[0] : ''}
                            onChange={(e) => {
                              const newDate = e.target.value;
                              setSavingDateId(exp.id);
                              updateMichaelExpense(exp.id, { date: newDate })
                                .then(() => {
                                  setExpenses(prev => prev.map(ex => 
                                    ex.id === exp.id ? { ...ex, date: newDate } : ex
                                  ));
                                  toast({ title: 'Date updated' });
                                })
                                .catch(() => toast({ title: 'Failed to update date', variant: 'destructive' }))
                                .finally(() => setSavingDateId(null));
                            }}
                            disabled={savingDateId === exp.id}
                            className="w-[130px] h-7 px-2 text-sm border rounded bg-background"
                          />
                          {savingDateId === exp.id && <Loader2 className="h-3 w-3 animate-spin" />}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate" title={exp.description}>
                        {exp.description}
                      </TableCell>
                      <TableCell className="max-w-[180px]">
                        <Select
                          value={exp.category || '__none__'}
                          onValueChange={(value) => {
                            const categoryValue = value === '__none__' ? '' : value;
                            setSavingCategoryId(exp.id);
                            updateMichaelExpense(exp.id, { category: categoryValue })
                              .then(() => {
                                setExpenses(prev => prev.map(e => 
                                  e.id === exp.id ? { ...e, category: categoryValue } : e
                                ));
                                toast({ title: 'Category updated' });
                              })
                              .catch(() => toast({ title: 'Failed to update', variant: 'destructive' }))
                              .finally(() => setSavingCategoryId(null));
                          }}
                          disabled={savingCategoryId === exp.id}
                        >
                          <SelectTrigger className="h-7 text-sm">
                            {savingCategoryId === exp.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <SelectValue placeholder="Select..." />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No category</SelectItem>
                            {EXPENSE_CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="max-w-[150px]">
                        <Select
                          value={exp.project || '__none__'}
                          onValueChange={(value) => {
                            const projectValue = value === '__none__' ? '' : value;
                            setSavingProjectId(exp.id);
                            updateMichaelExpense(exp.id, { project: projectValue })
                              .then(() => {
                                setExpenses(prev => prev.map(e => 
                                  e.id === exp.id ? { ...e, project: projectValue } : e
                                ));
                                toast({ title: 'Project updated' });
                              })
                              .catch(() => toast({ title: 'Failed to update', variant: 'destructive' }))
                              .finally(() => setSavingProjectId(null));
                          }}
                          disabled={savingProjectId === exp.id}
                        >
                          <SelectTrigger className="h-7 text-sm">
                            {savingProjectId === exp.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <SelectValue placeholder="Select..." />
                            )}
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="__none__">No project</SelectItem>
                            {PROJECT_OPTIONS.map((proj) => (
                              <SelectItem key={proj} value={proj}>{proj}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(exp.amount)}</TableCell>
                      <TableCell className="text-center">
                        {exp.synced_to_valor ? (
                          <Check className="w-4 h-4 text-green-500 mx-auto" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-orange-500 mx-auto" />
                        )}
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => setDeleteTarget({ type: 'expense', item: exp })}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Batches Tab */}
        <TabsContent value="batches" className="space-y-4">
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Transactions</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No batches found
                    </TableCell>
                  </TableRow>
                ) : (
                  batches.map((batch) => (
                    <TableRow key={batch.batch_id}>
                      <TableCell className="font-mono">{batch.batch_id}</TableCell>
                      <TableCell>{batch.created_at ? new Date(batch.created_at).toLocaleDateString() : '-'}</TableCell>
                      <TableCell>{batch.transaction_count}</TableCell>
                      <TableCell className="text-right font-mono">{formatCurrency(batch.total_amount)}</TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => setDeleteTarget({ type: 'batch', item: batch })}
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>

        {/* Upload Tab */}
        <TabsContent value="upload" className="space-y-4">
          {/* Upload Zone */}
          {previewTransactions.length === 0 && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                relative border-2 border-dashed rounded-2xl p-12 text-center transition-all duration-300
                ${isDragging 
                  ? 'border-primary bg-primary/5 scale-[1.02]' 
                  : 'border-border hover:border-primary/50 hover:bg-muted/30'
                }
              `}
            >
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              
              <div className="flex flex-col items-center gap-4">
                <div className={`
                  w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300
                  ${isDragging 
                    ? 'bg-primary/20 scale-110' 
                    : 'bg-gradient-to-br from-purple-500/20 to-pink-500/20'
                  }
                `}>
                  {isProcessing ? (
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  ) : (
                    <Upload className={`w-8 h-8 ${isDragging ? 'text-primary' : 'text-purple-500'}`} />
                  )}
                </div>
                
                <div>
                  <p className="font-medium text-lg">
                    {isProcessing 
                      ? 'Processing file...' 
                      : isDragging 
                        ? 'Drop file here' 
                        : 'Drag & drop Excel file here'
                    }
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    or click to browse • CSV, XLSX supported
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Preview Table */}
          {previewTransactions.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <p className="text-sm text-muted-foreground">
                    {selectedForUpload.size} of {previewTransactions.length} selected
                  </p>
                  <Button variant="outline" size="sm" onClick={toggleSelectAll}>
                    {selectedForUpload.size === previewTransactions.length ? 'Deselect All' : 'Select All'}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => { setPreviewTransactions([]); setFile(null); }}
                  >
                    <X className="w-4 h-4 mr-2" />
                    Clear
                  </Button>
                  <Button 
                    onClick={handleCategorize} 
                    disabled={isCategorizing}
                    className="bg-gradient-to-r from-purple-500 to-pink-500"
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    {isCategorizing ? 'Categorizing...' : 'AI Categorize'}
                  </Button>
                  <Button 
                    onClick={handleUploadToDatabase}
                    disabled={isUploading || selectedForUpload.size === 0}
                    className="bg-gradient-to-r from-green-500 to-emerald-500"
                  >
                    <Database className="w-4 h-4 mr-2" />
                    {isUploading ? 'Uploading...' : `Upload ${selectedForUpload.size} to DB`}
                  </Button>
                </div>
              </div>

              <div className="border rounded-md max-h-[500px] overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="w-[50px]">
                        <Checkbox 
                          checked={selectedForUpload.size === previewTransactions.length}
                          onCheckedChange={toggleSelectAll}
                        />
                      </TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewTransactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          <Checkbox 
                            checked={selectedForUpload.has(tx.id)}
                            onCheckedChange={(checked) => {
                              const newSet = new Set(selectedForUpload);
                              if (checked) {
                                newSet.add(tx.id);
                              } else {
                                newSet.delete(tx.id);
                              }
                              setSelectedForUpload(newSet);
                            }}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{tx.date}</TableCell>
                        <TableCell className="max-w-[300px] truncate" title={tx.description}>
                          {tx.description}
                        </TableCell>
                        <TableCell className="text-right font-mono">{formatCurrency(tx.amount)}</TableCell>
                        <TableCell>
                          <Select
                            value={tx.ai_category || "__none__"}
                            onValueChange={(value) => handleCategoryChange(tx.id, value === "__none__" ? "" : value)}
                          >
                            <SelectTrigger className={`w-[180px] h-8 text-xs ${
                              tx.ai_category 
                                ? 'bg-green-50 border-green-200 text-green-700' 
                                : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                            }`}>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="__none__">-- Select --</SelectItem>
                              {EXPENSE_CATEGORIES.map((cat) => (
                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </TabsContent>
      </Tabs>

      {/* Delete Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Delete</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.type === 'expense' 
                ? `Delete expense "${(deleteTarget.item as MichaelExpense).description.substring(0, 50)}..."?`
                : `Delete batch "${(deleteTarget?.item as MichaelBatch)?.batch_id}" with ${(deleteTarget?.item as MichaelBatch)?.transaction_count} transactions?`
              }
              {' '}This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-500 hover:bg-red-600">
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default MichaelCard;