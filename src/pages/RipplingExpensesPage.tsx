import { useState, useEffect, useCallback, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Loader2, Trash2, Upload, FileSpreadsheet, Users, DollarSign, 
  RefreshCw, Calendar, AlertCircle, CheckCircle2, Database, Search,
  Plus, Pencil, Save, X, TrendingUp, PieChart
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  parseRipplingFile, confirmRipplingUpload, getRipplingExpenses, getRipplingBatches, 
  deleteRipplingBatch, deleteRipplingExpense, updateRipplingExpense, getRipplingSummary,
  RipplingExpense, RipplingBatch, RipplingSummary, RipplingPreviewTransaction
} from '@/lib/api';
import { API_BASE_URL } from '@/lib/api';

// Available expense categories
const EXPENSE_CATEGORIES = [
  "Airfare", "Board meetings", "Brazil Insurance", "Catering - Event",
  "Computer Equipment", "Conferences & Seminars", "Delivery and Postage",
  "Due Diligence - New Deals", "Due Diligence - Portfolio Company", "Gifts",
  "Ground Transportation - Local", "Ground Transportation - Travel",
  "IT Subscriptions", "Lodging", "Meals & Entertainment - Local",
  "Meals & Entertainment - Travel", "Membership Dues", "Miscellaneous",
  "Office Supplies", "Other - Event", "Pantry Food", "Personal Expenses",
  "Printing", "Printing - Event", "Rippling Wire Deduction", "Tech/AV - Event",
  "Telephone/Internet", "Training", "Travel Agent Fees", "Venue - Event",
  "Wellhub Reimbursement"
];

const EMPLOYEE_TYPES = ['Partner', 'Employee', 'Contractor', 'Advisor'];

interface Employee {
  id: string;
  rippling_name: string;
  display_name: string;
  employee_type: string;
}

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatCurrencyFull = (value: number) => {
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

export default function RipplingExpensesPage() {
  const [activeTab, setActiveTab] = useState('expenses');
  
  // Data state
  const [expenses, setExpenses] = useState<RipplingExpense[]>([]);
  const [batches, setBatches] = useState<RipplingBatch[]>([]);
  const [summary, setSummary] = useState<RipplingSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  
  // Filters
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Upload state
  const [isParsing, setIsParsing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewTransactions, setPreviewTransactions] = useState<RipplingPreviewTransaction[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [selectedForUpload, setSelectedForUpload] = useState<Set<string>>(new Set());
  const [unmappedEmployees, setUnmappedEmployees] = useState<string[]>([]);
  
  // Delete state
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'batch' | 'expense'; item: RipplingBatch | RipplingExpense } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Edit state
  const [editingExpense, setEditingExpense] = useState<RipplingExpense | null>(null);
  const [editForm, setEditForm] = useState({ name: '', amount: '', category: '', date: '', project: '' });
  const [isSaving, setIsSaving] = useState(false);
  
  // Employee mapping state
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false);
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [employeeEditForm, setEmployeeEditForm] = useState({ rippling_name: '', display_name: '', employee_type: '' });
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState({ rippling_name: '', display_name: '', employee_type: 'Contractor' });
  const [deleteEmployeeDialog, setDeleteEmployeeDialog] = useState<{ open: boolean; employee: Employee | null }>({ open: false, employee: null });
  
  const { toast } = useToast();

  // Load data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [expensesResult, batchesResult, summaryResult] = await Promise.all([
        getRipplingExpenses(undefined, 2000, selectedYear),
        getRipplingBatches(),
        getRipplingSummary(selectedYear)
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

  // Load employees
  const loadEmployees = async () => {
    setIsLoadingEmployees(true);
    try {
      const response = await fetch(`${API_BASE_URL}/rippling/employees`);
      if (!response.ok) throw new Error('Failed to load employees');
      const data = await response.json();
      setEmployees(data.employees || []);
    } catch (error) {
      console.error('Error loading employees:', error);
    } finally {
      setIsLoadingEmployees(false);
    }
  };

  useEffect(() => {
    loadData();
    loadEmployees();
  }, [loadData]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const matchesEmployee = filterEmployee === 'all' || exp.name === filterEmployee;
      const matchesCategory = filterCategory === 'all' || exp.category === filterCategory;
      const matchesSearch = searchTerm === '' || 
        (exp.vendor_name && exp.vendor_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        exp.name.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesEmployee && matchesCategory && matchesSearch;
    });
  }, [expenses, filterEmployee, filterCategory, searchTerm]);

  // Unique values for filters
  const uniqueEmployees = useMemo(() => [...new Set(expenses.map(e => e.name))].sort(), [expenses]);
  const uniqueCategories = useMemo(() => [...new Set(expenses.map(e => e.category))].sort(), [expenses]);

  // Dashboard stats
  const dashboardStats = useMemo(() => {
    const totalAmount = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    const byCategory: Record<string, number> = {};
    const byEmployee: Record<string, number> = {};
    
    filteredExpenses.forEach(e => {
      byCategory[e.category] = (byCategory[e.category] || 0) + e.amount;
      byEmployee[e.name] = (byEmployee[e.name] || 0) + e.amount;
    });
    
    const topCategories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const topEmployees = Object.entries(byEmployee).sort((a, b) => b[1] - a[1]).slice(0, 5);
    
    return { totalAmount, topCategories, topEmployees };
  }, [filteredExpenses]);

  // File upload handlers
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    try {
      const result = await parseRipplingFile(file);
      if (result.success && result.transactions.length > 0) {
        setPreviewTransactions(result.transactions);
        setUnmappedEmployees(result.unmapped_employees || []);
        // Only select non-duplicate transactions by default
        const nonDuplicateIds = result.transactions
          .filter(tx => !tx.is_duplicate)
          .map(tx => tx.id);
        setSelectedForUpload(new Set(nonDuplicateIds));
        setShowPreview(true);
        
        // Show info about duplicates
        if (result.duplicate_count > 0) {
          toast({ 
            title: `${result.new_count} new, ${result.duplicate_count} duplicates`, 
            description: 'Duplicate transactions are unchecked and will be skipped.',
          });
        }
      } else {
        toast({ title: 'No data found', description: 'The file contains no valid transactions.', variant: 'destructive' });
      }
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to parse file', variant: 'destructive' });
    } finally {
      setIsParsing(false);
      e.target.value = '';
    }
  };

  const handleCategoryChange = (txId: string, newCategory: string) => {
    setPreviewTransactions(prev => prev.map(tx => tx.id === txId ? { ...tx, category: newCategory } : tx));
  };

  const handleToggleSelect = (txId: string) => {
    const newSelected = new Set(selectedForUpload);
    if (newSelected.has(txId)) newSelected.delete(txId);
    else newSelected.add(txId);
    setSelectedForUpload(newSelected);
  };

  const handleSelectAll = () => {
    // Only toggle non-duplicate transactions
    const nonDuplicates = previewTransactions.filter(tx => !tx.is_duplicate);
    const selectedNonDuplicates = nonDuplicates.filter(tx => selectedForUpload.has(tx.id));
    
    if (selectedNonDuplicates.length === nonDuplicates.length) {
      // Deselect all non-duplicates
      setSelectedForUpload(new Set());
    } else {
      // Select all non-duplicates
      setSelectedForUpload(new Set(nonDuplicates.map(tx => tx.id)));
    }
  };

  const handleConfirmUpload = async () => {
    const selectedTransactions = previewTransactions.filter(tx => selectedForUpload.has(tx.id));
    if (selectedTransactions.length === 0) {
      toast({ title: 'No transactions selected', description: 'Please select at least one transaction.', variant: 'destructive' });
      return;
    }

    setIsUploading(true);
    try {
      const result = await confirmRipplingUpload(selectedTransactions);
      if (result.inserted > 0) {
        toast({ title: 'Upload successful!', description: `${result.inserted} transactions added. Also synced to Consolidated Expenses.` });
        setShowPreview(false);
        setPreviewTransactions([]);
        loadData();
      } else if (result.duplicates > 0) {
        toast({ title: 'No new data', description: `All ${result.duplicates} transactions already exist.` });
      }
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to upload', variant: 'destructive' });
    } finally {
      setIsUploading(false);
    }
  };

  // Delete handlers
  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    setIsDeleting(true);
    try {
      if (deleteTarget.type === 'batch') {
        await deleteRipplingBatch((deleteTarget.item as RipplingBatch).batch_id);
        toast({ title: 'Batch deleted', description: 'Also removed from Consolidated Expenses.' });
      } else {
        await deleteRipplingExpense((deleteTarget.item as RipplingExpense).id);
        toast({ title: 'Expense deleted', description: 'Also removed from Consolidated Expenses.' });
      }
      setDeleteTarget(null);
      loadData();
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to delete', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
    }
  };

  // Edit handlers
  const startEdit = (expense: RipplingExpense) => {
    setEditingExpense(expense);
    setEditForm({
      name: expense.name,
      amount: expense.amount.toString(),
      category: expense.category,
      date: expense.date || '',
      project: expense.project || '',
    });
  };

  const saveEdit = async () => {
    if (!editingExpense) return;
    
    setIsSaving(true);
    try {
      await updateRipplingExpense(editingExpense.id, {
        name: editForm.name,
        amount: parseFloat(editForm.amount),
        category: editForm.category,
        date: editForm.date || undefined,
        project: editForm.project || undefined,
      });
      toast({ title: 'Updated', description: 'Also synced to Consolidated Expenses.' });
      setEditingExpense(null);
      loadData();
    } catch (error) {
      toast({ title: 'Error', description: error instanceof Error ? error.message : 'Failed to update', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  // Employee mapping handlers
  const filteredEmployeeMappings = employees.filter(emp => {
    const matchesSearch = employeeSearchTerm === '' || 
      emp.rippling_name.toLowerCase().includes(employeeSearchTerm.toLowerCase()) ||
      emp.display_name.toLowerCase().includes(employeeSearchTerm.toLowerCase());
    const matchesType = filterType === 'all' || emp.employee_type === filterType;
    return matchesSearch && matchesType;
  });

  const startEmployeeEdit = (employee: Employee) => {
    setEditingEmployeeId(employee.id);
    setEmployeeEditForm({
      rippling_name: employee.rippling_name,
      display_name: employee.display_name,
      employee_type: employee.employee_type
    });
  };

  const saveEmployeeEdit = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/rippling/employees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(employeeEditForm)
      });
      if (!response.ok) throw new Error('Failed to update');
      toast({ title: 'Updated', description: 'Employee mapping saved.' });
      setEditingEmployeeId(null);
      loadEmployees();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to update mapping', variant: 'destructive' });
    }
  };

  const addEmployee = async () => {
    if (!newEmployee.rippling_name || !newEmployee.display_name) {
      toast({ title: 'Missing fields', description: 'Please fill all fields', variant: 'destructive' });
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/rippling/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEmployee)
      });
      if (!response.ok) throw new Error('Failed to add');
      toast({ title: 'Added', description: 'New employee mapping created.' });
      setIsAddDialogOpen(false);
      setNewEmployee({ rippling_name: '', display_name: '', employee_type: 'Contractor' });
      loadEmployees();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to add mapping', variant: 'destructive' });
    }
  };

  const deleteEmployee = async () => {
    if (!deleteEmployeeDialog.employee) return;
    try {
      const response = await fetch(`${API_BASE_URL}/rippling/employees/${deleteEmployeeDialog.employee.id}`, {
        method: 'DELETE'
      });
      if (!response.ok) throw new Error('Failed to delete');
      toast({ title: 'Deleted', description: 'Employee mapping removed.' });
      setDeleteEmployeeDialog({ open: false, employee: null });
      loadEmployees();
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to delete mapping', variant: 'destructive' });
    }
  };

  const previewTotals = useMemo(() => {
    const selected = previewTransactions.filter(tx => selectedForUpload.has(tx.id));
    return { count: selected.length, amount: selected.reduce((sum, tx) => sum + tx.amount, 0) };
  }, [previewTransactions, selectedForUpload]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <FileSpreadsheet className="w-8 h-8 text-blue-600" />
              Rippling Expenses
            </h1>
            <p className="text-muted-foreground mt-1">
              Synced with Consolidated Expenses (valor_expenses)
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
              <SelectTrigger className="w-[120px]">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadData} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <label htmlFor="file-upload">
              <Button asChild disabled={isParsing}>
                <span>
                  {isParsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  Upload File
                </span>
              </Button>
            </label>
            <input id="file-upload" type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileSelect} />
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total Amount</CardDescription>
              <CardTitle className="text-2xl text-green-600">{formatCurrencyFull(summary?.total_amount || 0)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Transactions</CardDescription>
              <CardTitle className="text-2xl">{summary?.total_records || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Employees</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                {summary?.total_employees || 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Batches</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-600" />
                {summary?.total_batches || 0}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="expenses" className="flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              Expenses
            </TabsTrigger>
            <TabsTrigger value="batches" className="flex items-center gap-2">
              <Database className="w-4 h-4" />
              Batches
            </TabsTrigger>
            <TabsTrigger value="employees" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              Employee Mapping
            </TabsTrigger>
          </TabsList>

          {/* Expenses Tab */}
          <TabsContent value="expenses" className="space-y-4">
            {/* Stats Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <PieChart className="w-4 h-4" /> Top Categories
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {dashboardStats.topCategories.map(([cat, amt], i) => (
                      <div key={cat} className="flex justify-between text-sm">
                        <span className="truncate max-w-[150px]">{i+1}. {cat}</span>
                        <span className="font-medium">{formatCurrency(amt)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Top Spenders
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {dashboardStats.topEmployees.map(([emp, amt], i) => (
                      <div key={emp} className="flex justify-between text-sm">
                        <span className="truncate max-w-[150px]">{i+1}. {emp}</span>
                        <span className="font-medium">{formatCurrency(amt)}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-blue-50 dark:bg-blue-950">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Filtered Total</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                    {formatCurrencyFull(dashboardStats.totalAmount)}
                  </div>
                  <p className="text-sm text-muted-foreground">{filteredExpenses.length} transactions</p>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Employee" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {uniqueEmployees.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={setFilterCategory}>
                <SelectTrigger className="w-[180px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {uniqueCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            {/* Expenses Table */}
            <div className="border rounded-md max-h-[500px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : filteredExpenses.length === 0 ? (
                    <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No expenses found</TableCell></TableRow>
                  ) : (
                    filteredExpenses.slice(0, 200).map((exp) => (
                      <TableRow key={exp.id}>
                        <TableCell className="font-medium">{exp.name}</TableCell>
                        <TableCell className="text-muted-foreground">{exp.vendor_name || '-'}</TableCell>
                        <TableCell><Badge variant="secondary" className="text-xs">{exp.category}</Badge></TableCell>
                        <TableCell>{formatDate(exp.date)}</TableCell>
                        <TableCell className="text-muted-foreground">{exp.project || '-'}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrencyFull(exp.amount)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" onClick={() => startEdit(exp)}><Pencil className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ type: 'expense', item: exp })}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            {filteredExpenses.length > 200 && <p className="text-sm text-muted-foreground text-center">Showing 200 of {filteredExpenses.length}</p>}
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
                    <TableHead>Employees</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-[80px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No batches found</TableCell></TableRow>
                  ) : (
                    batches.map((batch) => (
                      <TableRow key={batch.batch_id}>
                        <TableCell className="font-mono">{batch.batch_id}</TableCell>
                        <TableCell>{batch.created_at ? new Date(batch.created_at).toLocaleDateString() : '-'}</TableCell>
                        <TableCell>{batch.transaction_count}</TableCell>
                        <TableCell>{batch.employee_count}</TableCell>
                        <TableCell className="text-right font-medium">{formatCurrencyFull(batch.total_amount)}</TableCell>
                        <TableCell>
                          <Button variant="ghost" size="icon" onClick={() => setDeleteTarget({ type: 'batch', item: batch })}>
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

          {/* Employee Mapping Tab */}
          <TabsContent value="employees" className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input placeholder="Search mappings..." value={employeeSearchTerm} onChange={(e) => setEmployeeSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-[150px]"><SelectValue placeholder="Type" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {EMPLOYEE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
              <Button onClick={() => setIsAddDialogOpen(true)}><Plus className="w-4 h-4 mr-2" />Add Mapping</Button>
            </div>

            <div className="border rounded-md max-h-[500px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Rippling Name</TableHead>
                    <TableHead>Display Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoadingEmployees ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8"><RefreshCw className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                  ) : filteredEmployeeMappings.length === 0 ? (
                    <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No mappings found</TableCell></TableRow>
                  ) : (
                    filteredEmployeeMappings.map((emp) => (
                      <TableRow key={emp.id}>
                        {editingEmployeeId === emp.id ? (
                          <>
                            <TableCell><Input value={employeeEditForm.rippling_name} onChange={(e) => setEmployeeEditForm({...employeeEditForm, rippling_name: e.target.value})} /></TableCell>
                            <TableCell><Input value={employeeEditForm.display_name} onChange={(e) => setEmployeeEditForm({...employeeEditForm, display_name: e.target.value})} /></TableCell>
                            <TableCell>
                              <Select value={employeeEditForm.employee_type} onValueChange={(v) => setEmployeeEditForm({...employeeEditForm, employee_type: v})}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{EMPLOYEE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                              </Select>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" onClick={() => saveEmployeeEdit(emp.id)}><Save className="w-4 h-4 text-green-500" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => setEditingEmployeeId(null)}><X className="w-4 h-4" /></Button>
                              </div>
                            </TableCell>
                          </>
                        ) : (
                          <>
                            <TableCell className="font-mono text-sm">{emp.rippling_name}</TableCell>
                            <TableCell className="font-medium">{emp.display_name}</TableCell>
                            <TableCell><Badge variant="outline">{emp.employee_type}</Badge></TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="icon" onClick={() => startEmployeeEdit(emp)}><Pencil className="w-4 h-4" /></Button>
                                <Button variant="ghost" size="icon" onClick={() => setDeleteEmployeeDialog({ open: true, employee: emp })}><Trash2 className="w-4 h-4 text-red-500" /></Button>
                              </div>
                            </TableCell>
                          </>
                        )}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        </Tabs>

        {/* Upload Preview Dialog */}
        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Preview Transactions</DialogTitle>
              <DialogDescription>
                Review and edit categories before uploading. Selected: {previewTotals.count} transactions, {formatCurrencyFull(previewTotals.amount)}
              </DialogDescription>
            </DialogHeader>
            
            {unmappedEmployees.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-yellow-50 dark:bg-yellow-950 rounded-md">
                <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-medium text-yellow-800 dark:text-yellow-200">Unmapped Employees</p>
                  <p className="text-sm text-yellow-700 dark:text-yellow-300">{unmappedEmployees.join(', ')}</p>
                </div>
              </div>
            )}

            <div className="border rounded-md max-h-[400px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-[50px]">
                      <Checkbox 
                        checked={previewTransactions.filter(tx => !tx.is_duplicate).every(tx => selectedForUpload.has(tx.id)) && previewTransactions.some(tx => !tx.is_duplicate)} 
                        onCheckedChange={handleSelectAll} 
                      />
                    </TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="w-[80px]">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {previewTransactions.map((tx) => (
                    <TableRow key={tx.id} className={tx.is_duplicate ? 'opacity-50 bg-gray-50 dark:bg-gray-900' : !selectedForUpload.has(tx.id) ? 'opacity-50' : ''}>
                      <TableCell>
                        <Checkbox 
                          checked={selectedForUpload.has(tx.id)} 
                          onCheckedChange={() => handleToggleSelect(tx.id)}
                          disabled={tx.is_duplicate}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium">{tx.employee_name}</div>
                          {tx.employee_name !== tx.employee_original && (
                            <div className="text-xs text-muted-foreground">{tx.employee_original}</div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{tx.vendor_name}</TableCell>
                      <TableCell>
                        <Select value={tx.category} onValueChange={(v) => handleCategoryChange(tx.id, v)} disabled={tx.is_duplicate}>
                          <SelectTrigger className="w-[200px] h-8">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {EXPENSE_CATEGORIES.map(cat => <SelectItem key={cat} value={cat}>{cat}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell>{tx.purchase_date}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrencyFull(tx.amount)}</TableCell>
                      <TableCell>
                        {tx.is_duplicate ? (
                          <Badge variant="secondary" className="text-xs bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                            Duplicate
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs text-green-600">
                            New
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setShowPreview(false)}>Cancel</Button>
              <Button onClick={handleConfirmUpload} disabled={isUploading || previewTotals.count === 0}>
                {isUploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                Upload {previewTotals.count} Transactions
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Edit Expense Dialog */}
        <Dialog open={!!editingExpense} onOpenChange={(open) => !open && setEditingExpense(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Expense</DialogTitle>
              <DialogDescription>Changes will sync to Consolidated Expenses</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Name</label>
                <Input value={editForm.name} onChange={(e) => setEditForm({...editForm, name: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium">Amount</label>
                <Input type="number" step="0.01" value={editForm.amount} onChange={(e) => setEditForm({...editForm, amount: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium">Category</label>
                <Select value={editForm.category} onValueChange={(v) => setEditForm({...editForm, category: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Date</label>
                <Input type="date" value={editForm.date} onChange={(e) => setEditForm({...editForm, date: e.target.value})} />
              </div>
              <div>
                <label className="text-sm font-medium">Project</label>
                <Input value={editForm.project} onChange={(e) => setEditForm({...editForm, project: e.target.value})} placeholder="Project name" />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setEditingExpense(null)}>Cancel</Button>
              <Button onClick={saveEdit} disabled={isSaving}>
                {isSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Save
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete {deleteTarget?.type === 'batch' ? 'Batch' : 'Expense'}?</AlertDialogTitle>
              <AlertDialogDescription>
                This will also remove the data from Consolidated Expenses (valor_expenses). This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-600 hover:bg-red-700">
                {isDeleting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />}
                Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Add Employee Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Employee Mapping</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Rippling Name (exact match)</label>
                <Input value={newEmployee.rippling_name} onChange={(e) => setNewEmployee({...newEmployee, rippling_name: e.target.value})} placeholder="Name as it appears in Rippling" />
              </div>
              <div>
                <label className="text-sm font-medium">Display Name</label>
                <Input value={newEmployee.display_name} onChange={(e) => setNewEmployee({...newEmployee, display_name: e.target.value})} placeholder="Name to show in reports" />
              </div>
              <div>
                <label className="text-sm font-medium">Type</label>
                <Select value={newEmployee.employee_type} onValueChange={(v) => setNewEmployee({...newEmployee, employee_type: v})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EMPLOYEE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
              <Button onClick={addEmployee}><Plus className="w-4 h-4 mr-2" />Add</Button>
            </div>
          </DialogContent>
        </Dialog>

      {/* Delete Employee Dialog */}
      <AlertDialog open={deleteEmployeeDialog.open} onOpenChange={(open) => setDeleteEmployeeDialog({ open, employee: open ? deleteEmployeeDialog.employee : null })}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee Mapping?</AlertDialogTitle>
            <AlertDialogDescription>
              Remove mapping for "{deleteEmployeeDialog.employee?.rippling_name}"? Future uploads won't auto-map this employee.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteEmployee} className="bg-red-600 hover:bg-red-700">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
