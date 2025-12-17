import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Plane, Hotel, Utensils, Car, Users, RefreshCw, Download, Calendar, Search,
  TrendingUp, PieChart, DollarSign, MapPin, Building2
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
import { useToast } from '@/hooks/use-toast';
import { getValorExpenses, ValorExpense } from '@/lib/api';
import { Layout } from '@/components/Layout';

// Travel categories to include
const TRAVEL_CATEGORIES = {
  airfare: ['Airfare'],
  lodging: ['Lodging'],
  meals: ['Meals & Entertainment - Local', 'Meals & Entertainment - Travel'],
  ground: ['Ground Transportation - Local', 'Ground Transportation - Travel'],
};

const ALL_TRAVEL_CATEGORIES = [
  ...TRAVEL_CATEGORIES.airfare,
  ...TRAVEL_CATEGORIES.lodging,
  ...TRAVEL_CATEGORIES.meals,
  ...TRAVEL_CATEGORIES.ground,
];

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

// Category display info
const CATEGORY_INFO: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  airfare: { label: 'Airfare', icon: Plane, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900' },
  lodging: { label: 'Lodging', icon: Hotel, color: 'text-purple-600 bg-purple-100 dark:bg-purple-900' },
  meals: { label: 'Meals & Entertainment', icon: Utensils, color: 'text-orange-600 bg-orange-100 dark:bg-orange-900' },
  ground: { label: 'Ground Transportation', icon: Car, color: 'text-green-600 bg-green-100 dark:bg-green-900' },
};

const TravelDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  
  // Data states
  const [allExpenses, setAllExpenses] = useState<ValorExpense[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('2025');
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [filterCategoryType, setFilterCategoryType] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRangeLoading, setDateRangeLoading] = useState(false);
  
  // Filters for By Employee tab
  const [byEmpFilterEmployee, setByEmpFilterEmployee] = useState<string>('all');
  const [byEmpDateFrom, setByEmpDateFrom] = useState<string>('');
  const [byEmpDateTo, setByEmpDateTo] = useState<string>('');
  
  const { toast } = useToast();

  // Load data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const yearParam = selectedYear === 'all' ? undefined : Number(selectedYear);
      const limit = selectedYear === 'all' ? 20000 : 5000;
      const result = await getValorExpenses(yearParam, undefined, undefined, undefined, undefined, undefined, limit);
      setAllExpenses(result.expenses || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load travel data",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  }, [selectedYear, toast]);

  // Load data with date range (when date filters are used)
  const loadDataWithDateRange = useCallback(async (startDate: string, endDate: string) => {
    setDateRangeLoading(true);
    try {
      const result = await getValorExpenses(
        undefined, // year - ignore when using date range
        undefined, // month
        undefined, // name
        undefined, // category
        startDate,
        endDate
      );
      setAllExpenses(result.expenses || []);
    } catch (error) {
      console.error('Error loading data with date range:', error);
      toast({
        title: "Error",
        description: "Failed to load travel data for date range",
        variant: "destructive",
      });
    } finally {
      setDateRangeLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Debounced date range loading
  useEffect(() => {
    if (filterDateFrom && filterDateTo) {
      const timeoutId = setTimeout(() => {
        loadDataWithDateRange(filterDateFrom, filterDateTo);
      }, 500);
      return () => clearTimeout(timeoutId);
    }
  }, [filterDateFrom, filterDateTo, loadDataWithDateRange]);

  // Filter only travel-related expenses
  const travelExpenses = useMemo(() => {
    return allExpenses.filter(exp => ALL_TRAVEL_CATEGORIES.includes(exp.category));
  }, [allExpenses]);

  // Get category type for an expense
  const getCategoryType = (category: string): string => {
    if (TRAVEL_CATEGORIES.airfare.includes(category)) return 'airfare';
    if (TRAVEL_CATEGORIES.lodging.includes(category)) return 'lodging';
    if (TRAVEL_CATEGORIES.meals.includes(category)) return 'meals';
    if (TRAVEL_CATEGORIES.ground.includes(category)) return 'ground';
    return 'other';
  };

  // Unique employees from travel expenses
  const uniqueEmployees = useMemo(() => {
    const employees = new Set<string>();
    travelExpenses.forEach(exp => employees.add(exp.name));
    return Array.from(employees).sort();
  }, [travelExpenses]);

  // Filtered travel expenses
  const filteredExpenses = useMemo(() => {
    return travelExpenses.filter(exp => {
      const matchesEmployee = filterEmployee === 'all' || exp.name === filterEmployee;
      const categoryType = getCategoryType(exp.category);
      const matchesCategoryType = filterCategoryType === 'all' || categoryType === filterCategoryType;
      const matchesSearch = searchTerm === '' || 
        exp.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (exp.vendor && exp.vendor.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (exp.project && exp.project.toLowerCase().includes(searchTerm.toLowerCase()));
      
      let matchesDateFrom = true;
      let matchesDateTo = true;
      if (filterDateFrom && exp.date) {
        matchesDateFrom = exp.date >= filterDateFrom;
      }
      if (filterDateTo && exp.date) {
        matchesDateTo = exp.date <= filterDateTo;
      }
      
      return matchesEmployee && matchesCategoryType && matchesSearch && matchesDateFrom && matchesDateTo;
    });
  }, [travelExpenses, filterEmployee, filterCategoryType, filterDateFrom, filterDateTo, searchTerm]);

  // Dashboard summary
  const summary = useMemo(() => {
    const byType: Record<string, number> = { airfare: 0, lodging: 0, meals: 0, ground: 0 };
    const byEmployee: Record<string, { total: number; airfare: number; lodging: number; meals: number; ground: number }> = {};
    const byMonth: Record<string, { total: number; airfare: number; lodging: number; meals: number; ground: number }> = {};
    const byVendor: Record<string, number> = {};
    
    filteredExpenses.forEach(exp => {
      const catType = getCategoryType(exp.category);
      
      // By type
      byType[catType] = (byType[catType] || 0) + exp.amount;
      
      // By employee
      if (!byEmployee[exp.name]) {
        byEmployee[exp.name] = { total: 0, airfare: 0, lodging: 0, meals: 0, ground: 0 };
      }
      byEmployee[exp.name].total += exp.amount;
      byEmployee[exp.name][catType as keyof typeof byEmployee[string]] = 
        (byEmployee[exp.name][catType as keyof typeof byEmployee[string]] as number || 0) + exp.amount;
      
      // By month
      if (exp.month) {
        const monthKey = `${exp.year}-${String(exp.month).padStart(2, '0')}`;
        if (!byMonth[monthKey]) {
          byMonth[monthKey] = { total: 0, airfare: 0, lodging: 0, meals: 0, ground: 0 };
        }
        byMonth[monthKey].total += exp.amount;
        byMonth[monthKey][catType as keyof typeof byMonth[string]] = 
          (byMonth[monthKey][catType as keyof typeof byMonth[string]] as number || 0) + exp.amount;
      }
      
      // By vendor
      const vendorName = exp.vendor || 'Unknown';
      byVendor[vendorName] = (byVendor[vendorName] || 0) + exp.amount;
    });
    
    const total = Object.values(byType).reduce((sum, val) => sum + val, 0);
    const employeeList = Object.entries(byEmployee)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
    const monthlyList = Object.entries(byMonth)
      .map(([month, data]) => ({ month, ...data }))
      .sort((a, b) => a.month.localeCompare(b.month));
    const vendorList = Object.entries(byVendor)
      .map(([vendor, amount]) => ({ vendor, amount }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 10);
    
    return {
      total,
      byType,
      byEmployee: employeeList,
      byMonth: monthlyList,
      topVendors: vendorList,
      transactionCount: filteredExpenses.length,
      employeeCount: employeeList.length,
    };
  }, [filteredExpenses]);

  // Filtered data for By Employee tab with its own filters
  const byEmployeeFiltered = useMemo(() => {
    // Apply filters specific to By Employee tab
    const filtered = travelExpenses.filter(exp => {
      const matchesEmployee = byEmpFilterEmployee === 'all' || exp.name === byEmpFilterEmployee;
      
      let matchesDateFrom = true;
      let matchesDateTo = true;
      if (byEmpDateFrom && exp.date) {
        matchesDateFrom = exp.date >= byEmpDateFrom;
      }
      if (byEmpDateTo && exp.date) {
        matchesDateTo = exp.date <= byEmpDateTo;
      }
      
      return matchesEmployee && matchesDateFrom && matchesDateTo;
    });

    // Build pivot
    const byType: Record<string, number> = { airfare: 0, lodging: 0, meals: 0, ground: 0 };
    const byEmployee: Record<string, { total: number; airfare: number; lodging: number; meals: number; ground: number }> = {};
    
    filtered.forEach(exp => {
      const catType = getCategoryType(exp.category);
      byType[catType] = (byType[catType] || 0) + exp.amount;
      
      if (!byEmployee[exp.name]) {
        byEmployee[exp.name] = { total: 0, airfare: 0, lodging: 0, meals: 0, ground: 0 };
      }
      byEmployee[exp.name].total += exp.amount;
      byEmployee[exp.name][catType as keyof typeof byEmployee[string]] = 
        (byEmployee[exp.name][catType as keyof typeof byEmployee[string]] as number || 0) + exp.amount;
    });
    
    const total = Object.values(byType).reduce((sum, val) => sum + val, 0);
    const employeeList = Object.entries(byEmployee)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
    
    return { byType, byEmployee: employeeList, total };
  }, [travelExpenses, byEmpFilterEmployee, byEmpDateFrom, byEmpDateTo]);

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Date', 'Employee', 'Category', 'Type', 'Vendor', 'Amount', 'Project', 'Source'];
    const rows = filteredExpenses.map(exp => [
      exp.date || '',
      exp.name,
      exp.category,
      getCategoryType(exp.category),
      exp.vendor || '',
      exp.amount.toString(),
      exp.project || '',
      exp.source || '',
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `travel_expenses_${selectedYear === 'all' ? 'all_years' : selectedYear}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  // Export By Employee pivot to CSV
  const exportByEmployeeCSV = () => {
    const headers = ['Employee', 'Airfare', 'Lodging', 'Meals & Entertainment', 'Ground Transportation', 'Total'];
    const rows = byEmployeeFiltered.byEmployee.map(emp => [
      emp.name,
      emp.airfare.toString(),
      emp.lodging.toString(),
      emp.meals.toString(),
      emp.ground.toString(),
      emp.total.toString(),
    ]);
    
    // Add total row
    rows.push([
      'TOTAL',
      byEmployeeFiltered.byType.airfare.toString(),
      byEmployeeFiltered.byType.lodging.toString(),
      byEmployeeFiltered.byType.meals.toString(),
      byEmployeeFiltered.byType.ground.toString(),
      byEmployeeFiltered.total.toString(),
    ]);
    
    const csvContent = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    // Build filename with filter info
    let filename = `travel_by_employee_${selectedYear === 'all' ? 'all_years' : selectedYear}`;
    if (byEmpFilterEmployee !== 'all') filename += `_${byEmpFilterEmployee.replace(/\s+/g, '_')}`;
    if (byEmpDateFrom) filename += `_from_${byEmpDateFrom}`;
    if (byEmpDateTo) filename += `_to_${byEmpDateTo}`;
    filename += '.csv';
    
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  };

  const clearFilters = () => {
    setFilterEmployee('all');
    setFilterCategoryType('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchTerm('');
    // Reload data for selected year when date filters are cleared
    loadData();
  };

  const clearByEmpFilters = () => {
    setByEmpFilterEmployee('all');
    setByEmpDateFrom('');
    setByEmpDateTo('');
    // Reload data for selected year when date filters are cleared
    loadData();
  };

  return (
    <Layout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold flex items-center gap-3">
              <Plane className="w-8 h-8 text-blue-600" />
              Travel Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">
              Airfare, Lodging, Meals & Entertainment, Ground Transportation
            </p>
          </div>
          <div className="flex gap-2">
            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[130px]">
                <Calendar className="w-4 h-4 mr-2" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2024">2024</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={loadData} disabled={isLoading}>
              <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportToCSV}>
              <Download className="w-4 h-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900 border-blue-200">
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <DollarSign className="w-4 h-4" /> Total Travel
              </CardDescription>
              <CardTitle className="text-2xl text-blue-700 dark:text-blue-300">
                {formatCurrency(summary.total)}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs text-muted-foreground">{summary.transactionCount} transactions</p>
            </CardContent>
          </Card>
          
          {Object.entries(CATEGORY_INFO).map(([key, info]) => (
            <Card key={key} className={`border-${info.color.split('-')[1]}-200`}>
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <info.icon className="w-4 h-4" /> {info.label}
                </CardDescription>
                <CardTitle className="text-xl">
                  {formatCurrency(summary.byType[key] || 0)}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground">
                  {summary.total > 0 ? Math.round((summary.byType[key] || 0) / summary.total * 100) : 0}% of total
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <PieChart className="w-4 h-4" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="by-employee" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              By Employee
            </TabsTrigger>
            <TabsTrigger value="by-month" className="flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Monthly Trend
            </TabsTrigger>
            <TabsTrigger value="details" className="flex items-center gap-2">
              <Building2 className="w-4 h-4" />
              Details
            </TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Category Breakdown */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <PieChart className="w-5 h-5" />
                    Spending by Category
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {Object.entries(CATEGORY_INFO).map(([key, info]) => {
                      const amount = summary.byType[key] || 0;
                      const percentage = summary.total > 0 ? (amount / summary.total * 100) : 0;
                      return (
                        <div key={key}>
                          <div className="flex justify-between items-center mb-1">
                            <span className="flex items-center gap-2 text-sm">
                              <info.icon className="w-4 h-4" />
                              {info.label}
                            </span>
                            <span className="font-medium">{formatCurrency(amount)}</span>
                          </div>
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${info.color.includes('blue') ? 'bg-blue-600' : info.color.includes('purple') ? 'bg-purple-600' : info.color.includes('orange') ? 'bg-orange-600' : 'bg-green-600'}`}
                              style={{ width: `${percentage}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Top Travelers */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Top Travelers
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    {summary.byEmployee.slice(0, 5).map((emp, idx) => (
                      <div key={emp.name} className="p-3 bg-accent rounded-lg">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-lg font-bold text-muted-foreground">#{idx + 1}</span>
                          <span className="font-medium truncate">{emp.name}</span>
                        </div>
                        <div className="text-xl font-bold">{formatCurrency(emp.total)}</div>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {emp.airfare > 0 && <Badge variant="secondary" className="text-xs"><Plane className="w-3 h-3 mr-1" />{formatCurrency(emp.airfare)}</Badge>}
                          {emp.lodging > 0 && <Badge variant="secondary" className="text-xs"><Hotel className="w-3 h-3 mr-1" />{formatCurrency(emp.lodging)}</Badge>}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* By Employee Tab */}
          <TabsContent value="by-employee" className="space-y-4">
            {/* Filters for By Employee */}
            <div className="flex flex-wrap gap-4 items-end">
              <Select value={byEmpFilterEmployee} onValueChange={setByEmpFilterEmployee}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {uniqueEmployees.map(emp => (
                    <SelectItem key={emp} value={emp}>{emp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={byEmpDateFrom}
                  onChange={(e) => setByEmpDateFrom(e.target.value)}
                  className="w-[140px]"
                  placeholder="From"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={byEmpDateTo}
                  onChange={(e) => setByEmpDateTo(e.target.value)}
                  className="w-[140px]"
                  placeholder="To"
                />
              </div>
              {(byEmpFilterEmployee !== 'all' || byEmpDateFrom || byEmpDateTo) && (
                <Button variant="ghost" size="sm" onClick={clearByEmpFilters}>
                  Clear filters
                </Button>
              )}
              <div className="flex-1" />
              <Button variant="outline" size="sm" onClick={exportByEmployeeCSV}>
                <Download className="w-4 h-4 mr-2" />
                Export CSV
              </Button>
            </div>

            {/* Summary of filtered */}
            {(byEmpFilterEmployee !== 'all' || byEmpDateFrom || byEmpDateTo) && (
              <div className="flex items-center gap-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                <span className="text-sm font-medium">Filtered Total:</span>
                <span className="text-lg font-bold text-blue-700 dark:text-blue-300">
                  {formatCurrencyFull(byEmployeeFiltered.total)}
                </span>
                <span className="text-sm text-muted-foreground">
                  ({byEmployeeFiltered.byEmployee.length} employees)
                </span>
              </div>
            )}

            <div className="border rounded-md max-h-[600px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-[200px]">Employee</TableHead>
                    <TableHead className="text-right">Airfare</TableHead>
                    <TableHead className="text-right">Lodging</TableHead>
                    <TableHead className="text-right">Meals & Ent.</TableHead>
                    <TableHead className="text-right">Ground Trans.</TableHead>
                    <TableHead className="text-right font-bold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : byEmployeeFiltered.byEmployee.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No travel expenses found
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {byEmployeeFiltered.byEmployee.map((emp) => (
                        <TableRow key={emp.name}>
                          <TableCell className="font-medium">{emp.name}</TableCell>
                          <TableCell className="text-right">{formatCurrency(emp.airfare)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(emp.lodging)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(emp.meals)}</TableCell>
                          <TableCell className="text-right">{formatCurrency(emp.ground)}</TableCell>
                          <TableCell className="text-right font-bold">{formatCurrency(emp.total)}</TableCell>
                        </TableRow>
                      ))}
                      {/* Total row */}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell>TOTAL</TableCell>
                        <TableCell className="text-right">{formatCurrency(byEmployeeFiltered.byType.airfare)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(byEmployeeFiltered.byType.lodging)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(byEmployeeFiltered.byType.meals)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(byEmployeeFiltered.byType.ground)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(byEmployeeFiltered.total)}</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Monthly Trend Tab */}
          <TabsContent value="by-month" className="space-y-4">
            <div className="border rounded-md max-h-[600px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead className="w-[120px]">Month</TableHead>
                    <TableHead className="text-right">Airfare</TableHead>
                    <TableHead className="text-right">Lodging</TableHead>
                    <TableHead className="text-right">Meals & Ent.</TableHead>
                    <TableHead className="text-right">Ground Trans.</TableHead>
                    <TableHead className="text-right font-bold">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : summary.byMonth.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                        No data
                      </TableCell>
                    </TableRow>
                  ) : (
                    <>
                      {summary.byMonth.map((item) => {
                        const [year, month] = item.month.split('-');
                        return (
                          <TableRow key={item.month}>
                            <TableCell className="font-medium">
                              {MONTH_NAMES[parseInt(month)]} {year}
                            </TableCell>
                            <TableCell className="text-right">{formatCurrency(item.airfare)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.lodging)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.meals)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(item.ground)}</TableCell>
                            <TableCell className="text-right font-bold">{formatCurrency(item.total)}</TableCell>
                          </TableRow>
                        );
                      })}
                      {/* Total row */}
                      <TableRow className="bg-muted/50 font-bold">
                        <TableCell>TOTAL</TableCell>
                        <TableCell className="text-right">{formatCurrency(summary.byType.airfare)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(summary.byType.lodging)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(summary.byType.meals)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(summary.byType.ground)}</TableCell>
                        <TableCell className="text-right">{formatCurrency(summary.total)}</TableCell>
                      </TableRow>
                    </>
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>

          {/* Details Tab */}
          <TabsContent value="details" className="space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap gap-4 items-end">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  placeholder="Search vendor, employee, project..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Employees</SelectItem>
                  {uniqueEmployees.map(emp => (
                    <SelectItem key={emp} value={emp}>{emp}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterCategoryType} onValueChange={setFilterCategoryType}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  <SelectItem value="airfare">Airfare</SelectItem>
                  <SelectItem value="lodging">Lodging</SelectItem>
                  <SelectItem value="meals">Meals & Entertainment</SelectItem>
                  <SelectItem value="ground">Ground Transportation</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Input
                  type="date"
                  value={filterDateFrom}
                  onChange={(e) => setFilterDateFrom(e.target.value)}
                  className="w-[140px]"
                  placeholder="From"
                />
                <span className="text-muted-foreground">to</span>
                <Input
                  type="date"
                  value={filterDateTo}
                  onChange={(e) => setFilterDateTo(e.target.value)}
                  className="w-[140px]"
                  placeholder="To"
                />
              </div>
              {(filterEmployee !== 'all' || filterCategoryType !== 'all' || filterDateFrom || filterDateTo || searchTerm) && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>

            {/* Summary of filtered */}
            <div className="flex items-center gap-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
              <span className="text-sm font-medium">Filtered Total:</span>
              <span className="text-lg font-bold text-blue-700 dark:text-blue-300">
                {formatCurrencyFull(filteredExpenses.reduce((sum, e) => sum + e.amount, 0))}
              </span>
              <span className="text-sm text-muted-foreground">
                ({filteredExpenses.length} transactions)
              </span>
            </div>

            {/* Expenses Table */}
            <div className="border rounded-md max-h-[500px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-background">
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Employee</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Vendor</TableHead>
                    <TableHead>Project</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Source</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(isLoading || dateRangeLoading) ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8">
                        <RefreshCw className="w-6 h-6 animate-spin mx-auto" />
                      </TableCell>
                    </TableRow>
                  ) : filteredExpenses.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                        No travel expenses found
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredExpenses.slice(0, 300).map((exp) => {
                      const catType = getCategoryType(exp.category);
                      const catInfo = CATEGORY_INFO[catType];
                      return (
                        <TableRow key={exp.id}>
                          <TableCell>{formatDate(exp.date)}</TableCell>
                          <TableCell className="font-medium">{exp.name}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className={`${catInfo?.color || ''} text-xs`}>
                              {catInfo && <catInfo.icon className="w-3 h-3 mr-1 inline" />}
                              {exp.category}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{exp.vendor || '-'}</TableCell>
                          <TableCell className="text-muted-foreground">{exp.project || '-'}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrencyFull(exp.amount)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{exp.source || 'Manual'}</Badge>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
            {filteredExpenses.length > 300 && (
              <p className="text-sm text-muted-foreground text-center">
                Showing 300 of {filteredExpenses.length} transactions
              </p>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default TravelDashboard;
