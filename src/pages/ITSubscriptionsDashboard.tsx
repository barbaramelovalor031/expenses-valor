import { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Monitor, Cloud, Server, RefreshCw, Download, Search,
  TrendingUp, DollarSign, Building2, Sparkles, Loader2
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
import { API_BASE_URL } from '@/lib/api';
import { Layout } from '@/components/Layout';

interface ITExpense {
  id: string;
  date: string | null;
  description: string;
  user: string;
  category: string;
  amount: number;
  credit_card: string;
  vendor_extracted?: string;
  source: string;
}

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

const ITSubscriptionsDashboard = () => {
  const [activeTab, setActiveTab] = useState('overview');
  
  // Data states
  const [expenses, setExpenses] = useState<ITExpense[]>([]);
  const [selectedYear, setSelectedYear] = useState<string>('2025');
  const [isLoading, setIsLoading] = useState(true);
  const [isExtractingVendors, setIsExtractingVendors] = useState(false);
  
  // Filters
  const [filterEmployee, setFilterEmployee] = useState<string>('all');
  const [filterVendor, setFilterVendor] = useState<string>('all');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [dateRangeLoading, setDateRangeLoading] = useState(false);
  
  const { toast } = useToast();

  // Load data
  const loadData = useCallback(async () => {
    setIsLoading(true);
    try {
      const yearParam = selectedYear === 'all' ? '' : `year=${selectedYear}`;
      const response = await fetch(`${API_BASE_URL}/it-subscriptions?${yearParam}`);
      if (!response.ok) throw new Error('Failed to load data');
      const data = await response.json();
      setExpenses(data.expenses || []);
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: "Error",
        description: "Failed to load IT subscriptions data",
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
      const response = await fetch(`${API_BASE_URL}/it-subscriptions?start_date=${startDate}&end_date=${endDate}`);
      if (!response.ok) throw new Error('Failed to load data');
      const data = await response.json();
      setExpenses(data.expenses || []);
    } catch (error) {
      console.error('Error loading data with date range:', error);
      toast({
        title: "Error",
        description: "Failed to load IT subscriptions data for date range",
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

  // Extract vendors using AI
  const extractVendors = async () => {
    setIsExtractingVendors(true);
    try {
      const yearParam = selectedYear === 'all' ? null : parseInt(selectedYear);
      const response = await fetch(`${API_BASE_URL}/it-subscriptions/extract-vendors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ year: yearParam }),
      });
      if (!response.ok) throw new Error('Failed to extract vendors');
      const result = await response.json();
      toast({
        title: "Vendors extracted!",
        description: `Updated ${result.updated_count} records`,
      });
      loadData(); // Reload data
    } catch (error) {
      console.error('Error extracting vendors:', error);
      toast({
        title: "Error",
        description: "Failed to extract vendors",
        variant: "destructive",
      });
    } finally {
      setIsExtractingVendors(false);
    }
  };

  // Unique employees
  const uniqueEmployees = useMemo(() => {
    const employees = new Set<string>();
    expenses.forEach(exp => employees.add(exp.user));
    return Array.from(employees).sort();
  }, [expenses]);

  // Unique vendors (extracted)
  const uniqueVendors = useMemo(() => {
    const vendors = new Set<string>();
    expenses.forEach(exp => {
      if (exp.vendor_extracted) vendors.add(exp.vendor_extracted);
    });
    return Array.from(vendors).sort();
  }, [expenses]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      const matchesEmployee = filterEmployee === 'all' || exp.user === filterEmployee;
      const matchesVendor = filterVendor === 'all' || exp.vendor_extracted === filterVendor;
      const matchesSearch = searchTerm === '' || 
        exp.user.toLowerCase().includes(searchTerm.toLowerCase()) ||
        exp.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (exp.vendor_extracted && exp.vendor_extracted.toLowerCase().includes(searchTerm.toLowerCase()));
      
      let matchesDateFrom = true;
      let matchesDateTo = true;
      if (filterDateFrom && exp.date) {
        matchesDateFrom = exp.date >= filterDateFrom;
      }
      if (filterDateTo && exp.date) {
        matchesDateTo = exp.date <= filterDateTo;
      }
      
      return matchesEmployee && matchesVendor && matchesSearch && matchesDateFrom && matchesDateTo;
    });
  }, [expenses, filterEmployee, filterVendor, filterDateFrom, filterDateTo, searchTerm]);

  // Summary
  const summary = useMemo(() => {
    const byVendor: Record<string, number> = {};
    const byEmployee: Record<string, number> = {};
    const byMonth: Record<string, number> = {};
    
    filteredExpenses.forEach(exp => {
      // By vendor
      const vendor = exp.vendor_extracted || 'Unknown';
      byVendor[vendor] = (byVendor[vendor] || 0) + exp.amount;
      
      // By employee
      byEmployee[exp.user] = (byEmployee[exp.user] || 0) + exp.amount;
      
      // By month
      if (exp.date) {
        const month = exp.date.substring(0, 7); // YYYY-MM
        byMonth[month] = (byMonth[month] || 0) + exp.amount;
      }
    });
    
    const total = filteredExpenses.reduce((sum, exp) => sum + exp.amount, 0);
    
    const vendorList = Object.entries(byVendor)
      .map(([vendor, amount]) => ({ vendor, amount }))
      .sort((a, b) => b.amount - a.amount);
    
    const employeeList = Object.entries(byEmployee)
      .map(([name, amount]) => ({ name, amount }))
      .sort((a, b) => b.amount - a.amount);
    
    const monthlyList = Object.entries(byMonth)
      .map(([month, amount]) => ({ month, amount }))
      .sort((a, b) => a.month.localeCompare(b.month));
    
    return {
      total,
      byVendor: vendorList,
      byEmployee: employeeList,
      byMonth: monthlyList,
      transactionCount: filteredExpenses.length,
      vendorCount: vendorList.length,
    };
  }, [filteredExpenses]);

  // Export to CSV
  const exportToCSV = async () => {
    try {
      const XLSX = await import('xlsx');
      
      const rows = filteredExpenses.map(exp => ({
        'Date': exp.date || '',
        'Employee': exp.user,
        'Vendor (AI)': exp.vendor_extracted || '',
        'Description': exp.description,
        'Amount': exp.amount,
        'Credit Card': exp.credit_card,
        'Source': exp.source,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'IT Subscriptions');
      
      let filename = `it_subscriptions_${selectedYear === 'all' ? 'all_years' : selectedYear}`;
      if (filterEmployee !== 'all') filename += `_${filterEmployee.replace(/\s+/g, '_')}`;
      if (filterVendor !== 'all') filename += `_${filterVendor.replace(/\s+/g, '_')}`;
      if (filterDateFrom) filename += `_from_${filterDateFrom}`;
      if (filterDateTo) filename += `_to_${filterDateTo}`;
      
      XLSX.writeFile(wb, `${filename}.xlsx`);
      toast({ title: 'Export complete!', description: `Exported ${filteredExpenses.length} records` });
    } catch (error) {
      toast({ title: 'Export failed', variant: 'destructive' });
    }
  };

  const clearFilters = () => {
    setFilterEmployee('all');
    setFilterVendor('all');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchTerm('');
    // Reload data for selected year
    loadData();
  };

  const hasActiveFilters = filterEmployee !== 'all' || filterVendor !== 'all' || filterDateFrom || filterDateTo || searchTerm;

  return (
    <Layout>
      <div className="min-h-screen bg-background p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-3">
                <Monitor className="w-8 h-8 text-blue-600" />
                IT Subscriptions
              </h1>
              <p className="text-muted-foreground mt-1">
                Software and cloud services expenses
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Select value={selectedYear} onValueChange={setSelectedYear}>
                <SelectTrigger className="w-[120px]">
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
              <Button variant="outline" onClick={extractVendors} disabled={isExtractingVendors}>
                <Sparkles className={`w-4 h-4 mr-2 ${isExtractingVendors ? 'animate-pulse' : ''}`} />
                {isExtractingVendors ? 'Extracting...' : 'Extract Vendors (AI)'}
              </Button>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-950 dark:to-blue-900">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  Total Spend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatCurrencyFull(summary.total)}</p>
                <p className="text-sm text-muted-foreground">{summary.transactionCount} transactions</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Cloud className="w-4 h-4" />
                  Vendors
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{summary.vendorCount}</p>
                <p className="text-sm text-muted-foreground">unique vendors</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" />
                  Top Vendor
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold truncate">{summary.byVendor[0]?.vendor || '-'}</p>
                <p className="text-sm text-muted-foreground">{formatCurrency(summary.byVendor[0]?.amount || 0)}</p>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="w-4 h-4" />
                  Top Spender
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-lg font-bold truncate">{summary.byEmployee[0]?.name || '-'}</p>
                <p className="text-sm text-muted-foreground">{formatCurrency(summary.byEmployee[0]?.amount || 0)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Tabs */}
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="by-vendor">By Vendor</TabsTrigger>
              <TabsTrigger value="by-employee">By Employee</TabsTrigger>
              <TabsTrigger value="transactions">All Transactions</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Top Vendors */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Cloud className="w-4 h-4" />
                      Top Vendors
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {summary.byVendor.slice(0, 10).map((item, i) => (
                        <div key={item.vendor} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-5">{i + 1}.</span>
                            <span className="font-medium truncate max-w-[200px]">{item.vendor}</span>
                          </div>
                          <span className="font-mono">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Top Employees */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Building2 className="w-4 h-4" />
                      Top Spenders
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      {summary.byEmployee.slice(0, 10).map((item, i) => (
                        <div key={item.name} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground w-5">{i + 1}.</span>
                            <span className="font-medium">{item.name}</span>
                          </div>
                          <span className="font-mono">{formatCurrency(item.amount)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            {/* By Vendor Tab */}
            <TabsContent value="by-vendor" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Expenses by Vendor</CardTitle>
                  <Button variant="outline" size="sm" onClick={exportToCSV}>
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Vendor</TableHead>
                        <TableHead className="text-right">Transactions</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.byVendor.map((item) => {
                        const txCount = filteredExpenses.filter(e => (e.vendor_extracted || 'Unknown') === item.vendor).length;
                        return (
                          <TableRow key={item.vendor}>
                            <TableCell className="font-medium">{item.vendor}</TableCell>
                            <TableCell className="text-right">{txCount}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrencyFull(item.amount)}</TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell>TOTAL</TableCell>
                        <TableCell className="text-right">{filteredExpenses.length}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrencyFull(summary.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* By Employee Tab */}
            <TabsContent value="by-employee" className="space-y-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>Expenses by Employee</CardTitle>
                  <Button variant="outline" size="sm" onClick={exportToCSV}>
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">Transactions</TableHead>
                        <TableHead className="text-right">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {summary.byEmployee.map((item) => {
                        const txCount = filteredExpenses.filter(e => e.user === item.name).length;
                        return (
                          <TableRow key={item.name}>
                            <TableCell className="font-medium">{item.name}</TableCell>
                            <TableCell className="text-right">{txCount}</TableCell>
                            <TableCell className="text-right font-mono">{formatCurrencyFull(item.amount)}</TableCell>
                          </TableRow>
                        );
                      })}
                      <TableRow className="font-bold bg-muted/50">
                        <TableCell>TOTAL</TableCell>
                        <TableCell className="text-right">{filteredExpenses.length}</TableCell>
                        <TableCell className="text-right font-mono">{formatCurrencyFull(summary.total)}</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* All Transactions Tab */}
            <TabsContent value="transactions" className="space-y-4">
              {/* Filters */}
              <div className="flex flex-wrap gap-3 items-end">
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search description or vendor..." 
                    value={searchTerm} 
                    onChange={(e) => setSearchTerm(e.target.value)} 
                    className="pl-9" 
                  />
                </div>
                <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Employee" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Employees</SelectItem>
                    {uniqueEmployees.map(e => <SelectItem key={e} value={e}>{e}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Select value={filterVendor} onValueChange={setFilterVendor}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Vendor" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Vendors</SelectItem>
                    {uniqueVendors.map(v => <SelectItem key={v} value={v}>{v}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input 
                  type="date" 
                  value={filterDateFrom} 
                  onChange={(e) => setFilterDateFrom(e.target.value)} 
                  className="w-[145px] h-9" 
                />
                <span className="text-muted-foreground text-sm">to</span>
                <Input 
                  type="date" 
                  value={filterDateTo} 
                  onChange={(e) => setFilterDateTo(e.target.value)} 
                  className="w-[145px] h-9" 
                />
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters}>
                    Clear
                  </Button>
                )}
                <Button variant="outline" size="sm" onClick={exportToCSV} className="ml-auto">
                  <Download className="w-4 h-4 mr-2" />
                  Export
                </Button>
              </div>

              {/* Summary badges */}
              {hasActiveFilters && (
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">
                    {filteredExpenses.length} transactions
                  </Badge>
                  <Badge variant="secondary">
                    {formatCurrencyFull(summary.total)}
                  </Badge>
                </div>
              )}

              {/* Table */}
              <Card>
                <CardContent className="p-0">
                  <div className="max-h-[600px] overflow-auto">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background">
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Employee</TableHead>
                          <TableHead>Vendor (AI)</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead>Source</TableHead>
                          <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(isLoading || dateRangeLoading) ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8">
                              <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                            </TableCell>
                          </TableRow>
                        ) : filteredExpenses.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                              No IT subscription expenses found
                            </TableCell>
                          </TableRow>
                        ) : (
                          filteredExpenses.map((exp) => (
                            <TableRow key={exp.id}>
                              <TableCell className="whitespace-nowrap">{formatDate(exp.date)}</TableCell>
                              <TableCell>{exp.user}</TableCell>
                              <TableCell>
                                {exp.vendor_extracted ? (
                                  <Badge variant="outline" className="font-normal">
                                    {exp.vendor_extracted}
                                  </Badge>
                                ) : (
                                  <span className="text-muted-foreground">-</span>
                                )}
                              </TableCell>
                              <TableCell className="max-w-[300px] truncate" title={exp.description}>
                                {exp.description}
                              </TableCell>
                              <TableCell>
                                <Badge variant="secondary">{exp.source}</Badge>
                              </TableCell>
                              <TableCell className="text-right font-mono">
                                {formatCurrencyFull(exp.amount)}
                              </TableCell>
                            </TableRow>
                          ))
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
};

export default ITSubscriptionsDashboard;
