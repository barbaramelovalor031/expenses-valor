import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  DollarSign, Users, RefreshCw, Download, BarChart3, Calendar, Search,
  TrendingUp, PieChart, FileSpreadsheet, Filter, Trash2, Edit2, Check, X
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { 
  getValorExpenses, getValorExpensesByEmployee, getValorSummary, 
  getValorYears, getValorCategories, getValorNames, getValorVendors,
  ValorExpense, ValorExpenseByEmployee, ValorSummary,
  updateValorExpense, deleteValorExpensesBatch, API_BASE_URL
} from '@/lib/api';
import { Layout } from '@/components/Layout';

const formatCurrency = (value: number) => {
  if (!value || value === 0) return '-';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
};

const formatCurrencyFull = (value: number) => {
  if (!value || value === 0) return '$0';
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

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const ExpensesYTD = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Data states
  const [expenses, setExpenses] = useState<ValorExpense[]>([]);
  const [expensesByEmployee, setExpensesByEmployee] = useState<ValorExpenseByEmployee[]>([]);
  const [summary, setSummary] = useState<ValorSummary | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [names, setNames] = useState<string[]>([]);
  const [vendors, setVendors] = useState<string[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([2025]);
  const [selectedYear, setSelectedYear] = useState<number>(2025);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters for detailed view
  const [filterName, setFilterName] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [filterVendor, setFilterVendor] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterProject, setFilterProject] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Filters for employee view
  const [employeeFilterName, setEmployeeFilterName] = useState<string>('all');
  const [employeeDateFrom, setEmployeeDateFrom] = useState<string>('');
  const [employeeDateTo, setEmployeeDateTo] = useState<string>('');
  const [employeeViewLoading, setEmployeeViewLoading] = useState(false);
  
  // Multi-select and editing states
  const [selectedExpenses, setSelectedExpenses] = useState<Set<string>>(new Set());
  const [isDeletingBatch, setIsDeletingBatch] = useState(false);
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  
  const { toast } = useToast();

  // Load initial data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [
        expensesResult,
        byEmployeeResult,
        summaryResult,
        yearsResult,
        categoriesResult,
        namesResult,
        vendorsResult
      ] = await Promise.all([
        getValorExpenses(selectedYear),
        getValorExpensesByEmployee(selectedYear),
        getValorSummary(selectedYear),
        getValorYears(),
        getValorCategories(),
        getValorNames(),
        getValorVendors()
      ]);

      setExpenses(expensesResult.expenses || []);
      setExpensesByEmployee(byEmployeeResult.expenses || []);
      setSummary(summaryResult.summary || null);
      setAvailableYears(yearsResult.years || [2025]);
      setCategories(categoriesResult.categories || []);
      setNames(namesResult.names || []);
      setVendors(vendorsResult.vendors || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load expenses data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load data with date range for employee view (supports multi-year)
  const loadEmployeeDataWithDateRange = useCallback(async () => {
    if (!employeeDateFrom && !employeeDateTo) return;
    
    setEmployeeViewLoading(true);
    try {
      // When date range is set, load from API directly (ignores year filter)
      const [expensesResult, byEmployeeResult] = await Promise.all([
        getValorExpenses(undefined, undefined, undefined, undefined, employeeDateFrom || undefined, employeeDateTo || undefined),
        getValorExpensesByEmployee(undefined, employeeDateFrom || undefined, employeeDateTo || undefined)
      ]);
      
      setExpenses(expensesResult.expenses || []);
      setExpensesByEmployee(byEmployeeResult.expenses || []);
    } catch (error) {
      console.error('Error loading data with date range:', error);
      toast({
        title: "Error",
        description: "Failed to load expenses data",
        variant: "destructive",
      });
    } finally {
      setEmployeeViewLoading(false);
    }
  }, [employeeDateFrom, employeeDateTo, toast]);

  // Reload when date range changes (debounced)
  useEffect(() => {
    if (employeeDateFrom || employeeDateTo) {
      const timer = setTimeout(() => {
        loadEmployeeDataWithDateRange();
      }, 500); // Debounce 500ms
      return () => clearTimeout(timer);
    }
  }, [employeeDateFrom, employeeDateTo, loadEmployeeDataWithDateRange]);

  // Unique projects from expenses
  const uniqueProjects = useMemo(() => {
    const projects = new Set<string>();
    expenses.forEach(exp => {
      if (exp.project && exp.project.trim()) {
        projects.add(exp.project);
      }
    });
    return Array.from(projects).sort();
  }, [expenses]);

  // Filtered expenses for detailed view
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const matchesName = filterName === 'all' || exp.name === filterName;
      const matchesCategory = filterCategory === 'all' || exp.category === filterCategory;
      const matchesVendor = filterVendor === 'all' || exp.vendor === filterVendor;
      const matchesSource = filterSource === 'all' || 
        (filterSource === 'manual' ? (!exp.source || exp.source === '') : exp.source === filterSource);
      const matchesProject = filterProject === 'all' || 
        (filterProject === 'none' ? (!exp.project || exp.project === '') : exp.project === filterProject);
      const matchesSearch = searchTerm === '' || 
        exp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exp.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (exp.vendor && exp.vendor.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (exp.source && exp.source.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (exp.project && exp.project.toLowerCase().includes(searchTerm.toLowerCase()));
      
      // Date filters
      let matchesDateFrom = true;
      let matchesDateTo = true;
      if (filterDateFrom && exp.date) {
        matchesDateFrom = exp.date >= filterDateFrom;
      }
      if (filterDateTo && exp.date) {
        matchesDateTo = exp.date <= filterDateTo;
      }
      
      return matchesName && matchesCategory && matchesVendor && matchesSource && matchesProject && matchesSearch && matchesDateFrom && matchesDateTo;
    });
  }, [expenses, filterName, filterCategory, filterVendor, filterSource, filterProject, filterDateFrom, filterDateTo, searchTerm]);

  // Filtered expenses for employee view - calculated from raw expenses filtered by date
  const filteredExpensesForEmployeeView = useMemo(() => {
    return expenses.filter(exp => {
      const matchesName = employeeFilterName === 'all' || exp.name === employeeFilterName;
      
      // Date filters
      let matchesDateFrom = true;
      let matchesDateTo = true;
      if (employeeDateFrom && exp.date) {
        matchesDateFrom = exp.date >= employeeDateFrom;
      }
      if (employeeDateTo && exp.date) {
        matchesDateTo = exp.date <= employeeDateTo;
      }
      
      return matchesName && matchesDateFrom && matchesDateTo;
    });
  }, [expenses, employeeFilterName, employeeDateFrom, employeeDateTo]);

  // Recalculate pivot table from filtered expenses
  const filteredByEmployee = useMemo(() => {
    // If no date filters, use original data for performance
    if (!employeeDateFrom && !employeeDateTo && employeeFilterName === 'all') {
      return expensesByEmployee;
    }
    
    // Build pivot from filtered expenses
    const byEmployee: Record<string, { total: number; categories: Record<string, number> }> = {};
    
    filteredExpensesForEmployeeView.forEach(exp => {
      if (!byEmployee[exp.name]) {
        byEmployee[exp.name] = { total: 0, categories: {} };
      }
      byEmployee[exp.name].total += exp.amount;
      byEmployee[exp.name].categories[exp.category] = (byEmployee[exp.name].categories[exp.category] || 0) + exp.amount;
    });
    
    // Filter by name if needed
    return Object.entries(byEmployee)
      .filter(([name]) => employeeFilterName === 'all' || name === employeeFilterName)
      .map(([name, data]) => ({
        employee_name: name,
        total: data.total,
        categories: data.categories
      }))
      .sort((a, b) => b.total - a.total);
  }, [expensesByEmployee, filteredExpensesForEmployeeView, employeeFilterName, employeeDateFrom, employeeDateTo]);

  // Sorted categories for the pivot table
  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => a.localeCompare(b));
  }, [categories]);

  // Dashboard stats
  const dashboardStats = useMemo(() => {
    const byCategory: Record<string, number> = {};
    const byName: Record<string, number> = {};
    const byMonth: Record<number, number> = {};
    const byVendor: Record<string, number> = {};
    
    filteredExpenses.forEach(exp => {
      byCategory[exp.category] = (byCategory[exp.category] || 0) + exp.amount;
      byName[exp.name] = (byName[exp.name] || 0) + exp.amount;
      if (exp.month) {
        byMonth[exp.month] = (byMonth[exp.month] || 0) + exp.amount;
      }
      if (exp.vendor) {
        byVendor[exp.vendor] = (byVendor[exp.vendor] || 0) + exp.amount;
      }
    });
    
    const topCategories = Object.entries(byCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    
    const topNames = Object.entries(byName)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    const topVendors = Object.entries(byVendor)
      .filter(([p]) => p !== '')
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
    
    const monthlyData = Object.entries(byMonth)
      .map(([m, amount]) => ({ month: parseInt(m), amount }))
      .sort((a, b) => a.month - b.month);
    
    const totalFiltered = filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
    
    return { topCategories, topNames, topVendors, monthlyData, totalFiltered, byCategory };
  }, [filteredExpenses]);

  // Category totals for pivot table
  const categoryTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    sortedCategories.forEach(cat => {
      totals[cat] = filteredByEmployee.reduce((sum, exp) => sum + (exp.categories[cat] || 0), 0);
    });
    return totals;
  }, [filteredByEmployee, sortedCategories]);

  const grandTotal = useMemo(() => {
    return filteredByEmployee.reduce((sum, exp) => sum + exp.total, 0);
  }, [filteredByEmployee]);

  const exportToCSV = () => {
    if (!expenses.length) return;

    const headers = ['Name', 'Amount', 'Category', 'Date', 'Vendor', 'Source', 'Year', 'Month'];
    const rows = filteredExpenses.map(exp => [
      `"${exp.name}"`,
      exp.amount,
      `"${exp.category}"`,
      exp.date || '',
      `"${exp.vendor || ''}"`,
      `"${exp.source || ''}"`,
      exp.year || '',
      exp.month || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Valor_Expenses_${selectedYear}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Export By Employee pivot to CSV
  const exportByEmployeePivotCSV = () => {
    if (!filteredByEmployee.length) return;

    // Build headers: Employee + all categories + Total
    const headers = ['Employee', ...sortedCategories, 'Total'];
    
    // Build rows
    const rows = filteredByEmployee
      .sort((a, b) => a.employee_name.localeCompare(b.employee_name))
      .map(exp => [
        `"${exp.employee_name}"`,
        ...sortedCategories.map(cat => exp.categories[cat] || 0),
        exp.total
      ]);
    
    // Add totals row
    rows.push([
      '"TOTAL"',
      ...sortedCategories.map(cat => categoryTotals[cat] || 0),
      grandTotal
    ]);

    const csvContent = [
      headers.map(h => `"${h}"`).join(','),
      ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    
    // Build filename with filter info
    let filename = `expenses_by_employee_${selectedYear}`;
    if (employeeFilterName !== 'all') filename += `_${employeeFilterName.replace(/\s+/g, '_')}`;
    if (employeeDateFrom) filename += `_from_${employeeDateFrom}`;
    if (employeeDateTo) filename += `_to_${employeeDateTo}`;
    filename += '.csv';
    
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Multi-select functions
  const displayedExpenses = filteredExpenses.slice(0, 200);

  const toggleSelectExpense = (id: string) => {
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

  const toggleSelectAll = () => {
    if (selectedExpenses.size === displayedExpenses.length) {
      setSelectedExpenses(new Set());
    } else {
      setSelectedExpenses(new Set(displayedExpenses.map(e => e.id)));
    }
  };

  const deleteSelectedExpenses = async () => {
    if (selectedExpenses.size === 0) return;

    setIsDeletingBatch(true);
    try {
      const idsToDelete = Array.from(selectedExpenses);
      await deleteValorExpensesBatch(idsToDelete);
      
      toast({
        title: "Deleted",
        description: `${idsToDelete.length} expenses deleted successfully`,
      });
      
      setSelectedExpenses(new Set());
      loadData();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete expenses",
        variant: "destructive",
      });
    } finally {
      setIsDeletingBatch(false);
    }
  };

  // Inline editing functions
  const startEditing = (id: string, field: string, currentValue: string) => {
    setEditingCell({ id, field });
    setEditingValue(currentValue || '');
  };

  const cancelEditing = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  const saveEditing = async () => {
    if (!editingCell) return;

    try {
      const updates: Record<string, string | number> = {};
      if (editingCell.field === 'amount') {
        updates[editingCell.field] = parseFloat(editingValue) || 0;
      } else {
        updates[editingCell.field] = editingValue;
      }

      await updateValorExpense(editingCell.id, updates);
      
      // Update local state
      setExpenses(prev => prev.map(exp => 
        exp.id === editingCell.id 
          ? { ...exp, [editingCell.field]: editingCell.field === 'amount' ? parseFloat(editingValue) : editingValue }
          : exp
      ));
      
      toast({
        title: "Updated",
        description: `${editingCell.field} updated successfully`,
      });
      
      cancelEditing();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update expense",
        variant: "destructive",
      });
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      saveEditing();
    } else if (e.key === 'Escape') {
      cancelEditing();
    }
  };

  return (
    <Layout>
      <div className="p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <BarChart3 className="w-8 h-8 text-green-600" />
              Consolidated Expenses
            </h1>
            <p className="text-muted-foreground mt-1">
              Year-to-date expenses from valor_expenses table
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={String(selectedYear)} onValueChange={(val) => setSelectedYear(Number(val))}>
              <SelectTrigger className="w-[120px]">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {availableYears.map(year => (
                  <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadData} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button onClick={exportToCSV} disabled={!expenses.length}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
            <Button 
              variant="default"
              onClick={() => window.open(`${API_BASE_URL}/valor/export-by-category/${selectedYear}`, '_blank')}
              disabled={!expenses.length}
              className="bg-green-600 hover:bg-green-700"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" />
              Export Excel by Category
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Grand Total</CardDescription>
              <CardTitle className="text-2xl text-green-600">
                {formatCurrencyFull(summary?.grand_total || 0)}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Employees</CardDescription>
              <CardTitle className="text-2xl flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                {summary?.employee_count || 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Transactions</CardDescription>
              <CardTitle className="text-2xl">
                {summary?.transaction_count || 0}
              </CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Categories</CardDescription>
              <CardTitle className="text-2xl text-purple-600">
                {categories.length}
              </CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="dashboard" className="flex items-center gap-2">
              <PieChart className="w-4 h-4" />
              Dashboard & Details
            </TabsTrigger>
            <TabsTrigger value="by-employee" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              By Employee (Pivot)
            </TabsTrigger>
          </TabsList>

          {/* Dashboard Tab */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Top Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Top Categories */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <PieChart className="w-5 h-5" />
                    Top Categories
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {dashboardStats.topCategories.map(([category, amount], idx) => (
                      <div key={category} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={idx === 0 ? 'default' : 'secondary'} className="text-xs">
                            {idx + 1}
                          </Badge>
                          <span className="text-sm truncate max-w-[150px]" title={category}>{category}</span>
                        </div>
                        <span className="font-medium text-sm">{formatCurrency(amount)}</span>
                      </div>
                    ))}
                    {dashboardStats.topCategories.length === 0 && (
                      <p className="text-muted-foreground text-center py-4">No data</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Top Spenders */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <TrendingUp className="w-5 h-5" />
                    Top Spenders
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {dashboardStats.topNames.map(([name, amount], idx) => (
                      <div key={name} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant={idx === 0 ? 'default' : 'secondary'} className="text-xs">
                            {idx + 1}
                          </Badge>
                          <span className="text-sm truncate max-w-[150px]" title={name}>{name}</span>
                        </div>
                        <span className="font-medium text-sm">{formatCurrency(amount)}</span>
                      </div>
                    ))}
                    {dashboardStats.topNames.length === 0 && (
                      <p className="text-muted-foreground text-center py-4">No data</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Monthly Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Calendar className="w-5 h-5" />
                    Monthly Breakdown
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {dashboardStats.monthlyData.map(({ month, amount }) => (
                      <div key={month} className="flex items-center justify-between">
                        <span className="text-sm">{MONTH_NAMES[month]} {selectedYear}</span>
                        <span className="font-medium text-sm">{formatCurrency(amount)}</span>
                      </div>
                    ))}
                    {dashboardStats.monthlyData.length === 0 && (
                      <p className="text-muted-foreground text-center py-4">No data</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Filters */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileSpreadsheet className="w-5 h-5" />
                  Expense Details
                </CardTitle>
                <CardDescription>
                  All transactions from the database ({filteredExpenses.length} of {expenses.length} shown)
                </CardDescription>
              </CardHeader>
              <CardContent>
                {/* Filter Controls */}
                <div className="flex flex-wrap gap-4 mb-4">
                  <div className="relative flex-1 min-w-[200px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      placeholder="Search name, category, project..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  <Select value={filterName} onValueChange={setFilterName}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by name" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Names</SelectItem>
                      {names.map(n => (
                        <SelectItem key={n} value={n}>{n}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterCategory} onValueChange={setFilterCategory}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {categories.map(c => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterVendor} onValueChange={setFilterVendor}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by vendor" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Vendors</SelectItem>
                      {vendors.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={filterSource} onValueChange={setFilterSource}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by source" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sources</SelectItem>
                      <SelectItem value="Uber">Uber</SelectItem>
                      <SelectItem value="Rippling">Rippling</SelectItem>
                      <SelectItem value="Credit Card - Amex">Credit Card - Amex</SelectItem>
                      <SelectItem value="Credit Card - SVB">Credit Card - SVB</SelectItem>
                      <SelectItem value="Credit Card - Bradesco">Credit Card - Bradesco</SelectItem>
                      <SelectItem value="manual">Manual</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={filterProject} onValueChange={setFilterProject}>
                    <SelectTrigger className="w-[180px]">
                      <SelectValue placeholder="Filter by project" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Projects</SelectItem>
                      <SelectItem value="none">No Project</SelectItem>
                      {uniqueProjects.map(p => (
                        <SelectItem key={p} value={p}>{p}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Date Range Filter */}
                <div className="flex flex-wrap gap-4 mb-4 items-center">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Date Range:</span>
                  </div>
                  <Input
                    type="date"
                    value={filterDateFrom}
                    onChange={(e) => setFilterDateFrom(e.target.value)}
                    className="w-[160px]"
                    placeholder="From"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={filterDateTo}
                    onChange={(e) => setFilterDateTo(e.target.value)}
                    className="w-[160px]"
                    placeholder="To"
                  />
                  {(filterDateFrom || filterDateTo) && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => { setFilterDateFrom(''); setFilterDateTo(''); }}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Clear Dates
                    </Button>
                  )}
                </div>

                {/* Filtered Total */}
                {(filterName !== 'all' || filterCategory !== 'all' || filterVendor !== 'all' || filterSource !== 'all' || filterProject !== 'all' || filterDateFrom || filterDateTo || searchTerm) && (
                  <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <span className="text-sm text-blue-700 dark:text-blue-300">
                      Filtered Total: <strong>{formatCurrencyFull(dashboardStats.totalFiltered)}</strong> ({filteredExpenses.length} transactions)
                    </span>
                  </div>
                )}

                {/* Multi-select actions */}
                {selectedExpenses.size > 0 && (
                  <div className="mb-4 p-3 bg-red-50 dark:bg-red-950 rounded-lg flex items-center justify-between">
                    <span className="text-sm text-red-700 dark:text-red-300">
                      {selectedExpenses.size} expense(s) selected
                    </span>
                    <Button 
                      variant="destructive" 
                      size="sm"
                      onClick={deleteSelectedExpenses}
                      disabled={isDeletingBatch}
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      {isDeletingBatch ? 'Deleting...' : 'Delete Selected'}
                    </Button>
                  </div>
                )}

                {/* Transactions Table */}
                <div className="max-h-[500px] overflow-auto border rounded-md">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background">
                      <TableRow>
                        <TableHead className="w-[40px]">
                          <Checkbox
                            checked={displayedExpenses.length > 0 && selectedExpenses.size === displayedExpenses.length}
                            onCheckedChange={toggleSelectAll}
                          />
                        </TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Project</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {isLoading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8">
                            <RefreshCw className="w-6 h-6 animate-spin mx-auto" />
                          </TableCell>
                        </TableRow>
                      ) : displayedExpenses.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                            No expenses found
                          </TableCell>
                        </TableRow>
                      ) : (
                        displayedExpenses.map((expense) => (
                          <TableRow key={expense.id} className={selectedExpenses.has(expense.id) ? 'bg-blue-50 dark:bg-blue-950' : ''}>
                            <TableCell>
                              <Checkbox
                                checked={selectedExpenses.has(expense.id)}
                                onCheckedChange={() => toggleSelectExpense(expense.id)}
                              />
                            </TableCell>
                            {/* Name - Editable */}
                            <TableCell className="font-medium">
                              {editingCell?.id === expense.id && editingCell?.field === 'name' ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                    onKeyDown={handleEditKeyDown}
                                    className="h-7 w-32"
                                    autoFocus
                                  />
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveEditing}>
                                    <Check className="h-3 w-3 text-green-600" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEditing}>
                                    <X className="h-3 w-3 text-red-600" />
                                  </Button>
                                </div>
                              ) : (
                                <span 
                                  className="cursor-pointer hover:underline"
                                  onClick={() => startEditing(expense.id, 'name', expense.name)}
                                  title="Click to edit"
                                >
                                  {expense.name}
                                </span>
                              )}
                            </TableCell>
                            {/* Category - Editable */}
                            <TableCell>
                              {editingCell?.id === expense.id && editingCell?.field === 'category' ? (
                                <div className="flex items-center gap-1">
                                  <Select value={editingValue} onValueChange={(val) => { setEditingValue(val); }}>
                                    <SelectTrigger className="h-7 w-32">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {categories.map(c => (
                                        <SelectItem key={c} value={c}>{c}</SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveEditing}>
                                    <Check className="h-3 w-3 text-green-600" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEditing}>
                                    <X className="h-3 w-3 text-red-600" />
                                  </Button>
                                </div>
                              ) : (
                                <Badge 
                                  variant="secondary" 
                                  className="text-xs cursor-pointer hover:bg-secondary/80"
                                  onClick={() => startEditing(expense.id, 'category', expense.category)}
                                  title="Click to edit"
                                >
                                  {expense.category || '-'}
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell>{formatDate(expense.date)}</TableCell>
                            {/* Vendor - Editable */}
                            <TableCell className="text-muted-foreground">
                              {editingCell?.id === expense.id && editingCell?.field === 'vendor' ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                    onKeyDown={handleEditKeyDown}
                                    className="h-7 w-24"
                                    autoFocus
                                  />
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveEditing}>
                                    <Check className="h-3 w-3 text-green-600" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEditing}>
                                    <X className="h-3 w-3 text-red-600" />
                                  </Button>
                                </div>
                              ) : (
                                <span 
                                  className="cursor-pointer hover:underline"
                                  onClick={() => startEditing(expense.id, 'vendor', expense.vendor || '')}
                                  title="Click to edit"
                                >
                                  {expense.vendor || '-'}
                                </span>
                              )}
                            </TableCell>
                            <TableCell>
                              {expense.source ? (
                                <Badge 
                                  variant={expense.source === 'Uber' ? 'default' : expense.source === 'Rippling' ? 'outline' : 'secondary'}
                                  className="text-xs"
                                >
                                  {expense.source}
                                </Badge>
                              ) : '-'}
                            </TableCell>
                            {/* Project - Editable */}
                            <TableCell className="text-muted-foreground">
                              {editingCell?.id === expense.id && editingCell?.field === 'project' ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                    onKeyDown={handleEditKeyDown}
                                    className="h-7 w-24"
                                    autoFocus
                                  />
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveEditing}>
                                    <Check className="h-3 w-3 text-green-600" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEditing}>
                                    <X className="h-3 w-3 text-red-600" />
                                  </Button>
                                </div>
                              ) : (
                                <span 
                                  className="cursor-pointer hover:underline"
                                  onClick={() => startEditing(expense.id, 'project', expense.project || '')}
                                  title="Click to edit"
                                >
                                  {expense.project || '-'}
                                </span>
                              )}
                            </TableCell>
                            {/* Amount - Editable */}
                            <TableCell className="text-right font-medium">
                              {editingCell?.id === expense.id && editingCell?.field === 'amount' ? (
                                <div className="flex items-center gap-1 justify-end">
                                  <Input
                                    type="number"
                                    value={editingValue}
                                    onChange={(e) => setEditingValue(e.target.value)}
                                    onKeyDown={handleEditKeyDown}
                                    className="h-7 w-24 text-right"
                                    autoFocus
                                  />
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={saveEditing}>
                                    <Check className="h-3 w-3 text-green-600" />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={cancelEditing}>
                                    <X className="h-3 w-3 text-red-600" />
                                  </Button>
                                </div>
                              ) : (
                                <span 
                                  className="cursor-pointer hover:underline"
                                  onClick={() => startEditing(expense.id, 'amount', String(expense.amount))}
                                  title="Click to edit"
                                >
                                  {formatCurrencyFull(expense.amount)}
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
                {filteredExpenses.length > 200 && (
                  <p className="text-sm text-muted-foreground mt-2 text-center">
                    Showing 200 of {filteredExpenses.length} records
                  </p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* By Employee Tab (Pivot Table) */}
          <TabsContent value="by-employee" className="space-y-6">
            {/* Category Summary */}
            <Card>
              <CardHeader>
                <CardTitle>Category Summary</CardTitle>
                <CardDescription>
                  Total expenses by category (sorted by amount){(employeeFilterName !== 'all' || employeeDateFrom || employeeDateTo) && ' - filtered'}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                  {Object.entries(categoryTotals)
                    .filter(([_, amount]) => amount > 0)
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 12)
                    .map(([cat, amount], idx) => (
                    <div 
                      key={cat} 
                      className={`p-3 rounded-lg border ${
                        idx === 0 ? 'bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-800' :
                        idx < 3 ? 'bg-blue-50 dark:bg-blue-950 border-blue-200 dark:border-blue-800' :
                        'bg-muted/50'
                      }`}
                    >
                      <div className="text-xs text-muted-foreground truncate" title={cat}>
                        {cat}
                      </div>
                      <div className="text-sm font-semibold mt-1">
                        {formatCurrencyFull(amount)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {grandTotal > 0 ? ((amount / grandTotal) * 100).toFixed(1) : 0}%
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Pivot Table */}
            <Card>
              <CardHeader>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div>
                    <CardTitle>Expenses by Employee</CardTitle>
                    <CardDescription>
                      Scroll horizontally to see all categories
                    </CardDescription>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <Select value={employeeFilterName} onValueChange={setEmployeeFilterName}>
                      <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="All Employees" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Employees</SelectItem>
                        {names.map(name => (
                          <SelectItem key={name} value={name}>{name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {/* Date Range Filter for Employee View */}
                <div className="flex flex-wrap gap-4 mt-4 items-center">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-muted-foreground" />
                    <span className="text-sm text-muted-foreground">Date Range:</span>
                  </div>
                  <Input
                    type="date"
                    value={employeeDateFrom}
                    onChange={(e) => setEmployeeDateFrom(e.target.value)}
                    className="w-[160px]"
                    placeholder="From"
                  />
                  <span className="text-muted-foreground">to</span>
                  <Input
                    type="date"
                    value={employeeDateTo}
                    onChange={(e) => setEmployeeDateTo(e.target.value)}
                    className="w-[160px]"
                    placeholder="To"
                  />
                  {(employeeDateFrom || employeeDateTo) && (
                    <Button 
                      variant="ghost" 
                      size="sm"
                      onClick={() => { 
                        setEmployeeDateFrom(''); 
                        setEmployeeDateTo(''); 
                        // Reload data for selected year
                        loadData();
                      }}
                    >
                      <X className="w-4 h-4 mr-1" />
                      Clear
                    </Button>
                  )}
                  <div className="flex-1" />
                  <Button variant="outline" size="sm" onClick={exportByEmployeePivotCSV}>
                    <Download className="w-4 h-4 mr-2" />
                    Export CSV
                  </Button>
                </div>
                {(employeeDateFrom || employeeDateTo) && (
                  <div className="mt-2 text-sm text-blue-600 dark:text-blue-400">
                    Showing data filtered by date range
                  </div>
                )}
              </CardHeader>
              <CardContent className="p-0">
                {(isLoading || employeeViewLoading) ? (
                  <div className="flex items-center justify-center py-20">
                    <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="overflow-auto max-h-[600px]">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-muted/95 backdrop-blur z-10">
                        <tr>
                          <th className="text-left p-3 font-semibold border-b min-w-[200px] sticky left-0 bg-muted/95 z-20">
                            Employee
                          </th>
                          {sortedCategories.map(cat => (
                            <th key={cat} className="text-right p-3 font-semibold border-b min-w-[120px] whitespace-nowrap">
                              {cat}
                            </th>
                          ))}
                          <th className="text-right p-3 font-bold border-b min-w-[120px] bg-green-50 dark:bg-green-950 sticky right-0 z-20">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredByEmployee
                          .sort((a, b) => a.employee_name.localeCompare(b.employee_name))
                          .map((exp, idx) => (
                          <tr key={exp.employee_name} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                            <td className={`p-3 font-medium border-b sticky left-0 z-10 ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}`}>
                              {exp.employee_name}
                            </td>
                            {sortedCategories.map(cat => (
                              <td key={cat} className="p-3 text-right border-b text-muted-foreground">
                                {formatCurrency(exp.categories[cat] || 0)}
                              </td>
                            ))}
                            <td className={`p-3 text-right font-semibold border-b bg-green-50 dark:bg-green-950 sticky right-0 z-10`}>
                              {formatCurrencyFull(exp.total)}
                            </td>
                          </tr>
                        ))}
                        {/* Totals Row */}
                        <tr className="bg-muted font-bold sticky bottom-0 z-10">
                          <td className="p-3 border-t-2 border-primary sticky left-0 bg-muted z-20">
                            TOTAL ({filteredByEmployee.length} people)
                          </td>
                          {sortedCategories.map(cat => (
                            <td key={cat} className="p-3 text-right border-t-2 border-primary">
                              {formatCurrencyFull(categoryTotals[cat])}
                            </td>
                          ))}
                          <td className="p-3 text-right border-t-2 border-primary bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300 sticky right-0 z-20">
                            {formatCurrencyFull(grandTotal)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default ExpensesYTD;
