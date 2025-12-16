import { useState, useCallback, useMemo } from 'react';
import { Users, Upload, FileSpreadsheet, X, Download, Check, AlertCircle, Receipt, Calendar, DollarSign, Settings } from 'lucide-react';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import * as XLSX from 'xlsx';
import RipplingEmployees from '@/components/RipplingEmployees';

// Employee name mapping: Rippling Name -> { displayName, type }
const EMPLOYEE_DATA: Record<string, { displayName: string; type: string }> = {
  "Ana Coutinho": { displayName: "Ana Coutinho", type: "Contractor" },
  "Antoine Colaco": { displayName: "Antoine Colaco", type: "Partner" },
  "Barbara Melo": { displayName: "Barbara Melo", type: "Contractor" },
  "BARBARA MELO ADVISORY": { displayName: "Barbara Melo", type: "Contractor" },
  "Bernardo Rocha": { displayName: "Bernardo Rocha", type: "Contractor" },
  "BGFR CONSULTING BUSINESS INTELLIGENCE LTDA": { displayName: "Bernardo Rocha", type: "Contractor" },
  "Annelise Barre": { displayName: "Annelise Barre", type: "Contractor" },
  "Barre Negócios LTDA": { displayName: "Annelise Barre", type: "Contractor" },
  "Beatriz Balbuena": { displayName: "Beatriz Balbuena", type: "Contractor" },
  "Clifford Sobel": { displayName: "Clifford Sobel", type: "Partner" },
  "Bluebridge Advisers LLC": { displayName: "Clifford Sobel", type: "Partner" },
  "Bruno Batavia": { displayName: "Bruno Batavia", type: "Contractor" },
  "Pedro Bustamante": { displayName: "Pedro Bustamante", type: "Contractor" },
  "Bustamante LTDA": { displayName: "Pedro Bustamante", type: "Contractor" },
  "Caitlyn Oshman": { displayName: "Caitlyn Oshman", type: "Employee" },
  "Carlos Costa": { displayName: "Carlos Costa", type: "Partner" },
  "Carolina Hibner": { displayName: "Carolina Hibner", type: "Contractor" },
  "Carolina Ades Hibner LTDA": { displayName: "Carolina Hibner", type: "Contractor" },
  "DOUG SMITH": { displayName: "Doug Smith", type: "Partner" },
  "Doug Smith": { displayName: "Doug Smith", type: "Partner" },
  "Daniel Schulman": { displayName: "Daniel Schulman", type: "Partner" },
  "Fabiana Scionti": { displayName: "Fabiana Scionti", type: "Employee" },
  "Felipe Mendes": { displayName: "Felipe Mendes", type: "Contractor" },
  "Frances Townsend": { displayName: "Frances Townsend", type: "Advisor" },
  "Gabriel Gil": { displayName: "Gabriel Gil", type: "Contractor" },
  "GARGIL INTERMEDIACAO E AGENCIAMENTO LTDA": { displayName: "Gabriel Gil", type: "Contractor" },
  "Gustavo Nolla": { displayName: "Gustavo Nolla", type: "Contractor" },
  "GUSTAVO NOLLA CONSULTORIA LTDA": { displayName: "Gustavo Nolla", type: "Contractor" },
  "Gustavo Berger": { displayName: "Gustavo Berger", type: "Contractor" },
  "Karina Martinez": { displayName: "Karina Martinez", type: "Contractor" },
  "Kelli Spangler-Ballard": { displayName: "Kelli Spangler-Ballard", type: "Employee" },
  "Lana Brandao": { displayName: "Lana Brandao", type: "Contractor" },
  "Laura Pettinelli": { displayName: "Laura Pettinelli", type: "Employee" },
  "Marc Luongo": { displayName: "Marc Luongo", type: "Employee" },
  "Mario Mello": { displayName: "Mario Mello", type: "Partner" },
  "Michael Nicklas": { displayName: "Michael Nicklas", type: "Partner" },
  "Nicole Salim": { displayName: "Nicole Salim", type: "Contractor" },
  "NICOLE SALIM LTDA": { displayName: "Nicole Salim", type: "Contractor" },
  "Nicolas Marin": { displayName: "Nicolas Marin", type: "Contractor" },
  "Jose Noblecilla": { displayName: "Jose Noblecilla", type: "Contractor" },
  "PTECH": { displayName: "Jose Noblecilla", type: "Contractor" },
  "Paula Favaro": { displayName: "Paula Favaro", type: "Contractor" },
  "Paula Falcao Dufech Favaro LTDA": { displayName: "Paula Favaro", type: "Contractor" },
  "Paula Parnes": { displayName: "Paula Parnes", type: "Contractor" },
  "Paulo Passoni": { displayName: "Paulo Passoni", type: "Partner" },
  "Ricardo Villela Marino": { displayName: "Ricardo Villela Marino", type: "Partner" },
  "Scott Sobel": { displayName: "Scott Sobel", type: "Partner" },
  "Vivian Consolo": { displayName: "Vivian Consolo", type: "Contractor" },
  "Vivian Consolo Assessoria Executiva Ltda": { displayName: "Vivian Consolo", type: "Contractor" },
};

// Category mapping from Rippling categories to output columns
const CATEGORY_MAPPING: Record<string, string> = {
  "Airfare": "Airfare",
  "Lodging": "Lodging",
  "Ground Transportation - Local": "Ground Transportation",
  "Ground Transportation - Travel": "Ground Transportation",
  "Meals & Entertainment - Local": "Meals & Entertainment",
  "Meals & Entertainment - Travel": "Meals & Entertainment",
  "Rippling Wire Deduction": "Rippling Wire Deduction",
  "IT Subscriptions": "IT Subscriptions",
  "Computer Equipment": "Computer Equipment",
  "Office Supplies": "Office Supplies",
  "Training": "Training",
  "Telephone/Internet": "Telephone/Internet",
  "Delivery and Postage": "Delivery and Postage",
  "Travel Agent Fees": "Travel Agent Fees",
  "Conferences & Seminars": "Conferences & Seminars",
  "Miscellaneous": "Miscellaneous",
};

// All possible output categories
const OUTPUT_CATEGORIES = [
  "Airfare",
  "Lodging", 
  "Ground Transportation",
  "Meals & Entertainment",
  "Rippling Wire Deduction",
  "IT Subscriptions",
  "Computer Equipment",
  "Office Supplies",
  "Training",
  "Telephone/Internet",
  "Delivery and Postage",
  "Travel Agent Fees",
  "Conferences & Seminars",
  "Miscellaneous",
];

interface RipplingExpense {
  id: number;
  employee: string;
  vendorName: string;
  amount: number;
  category: string;
  mappedCategory: string;
  purchaseDate: string;
  mappedEmployee: string;
  employeeType: string;
}

interface EmployeeSummary {
  employeeName: string;
  employeeType: string;
  categories: Record<string, number>;
  total: number;
}

const Rippling = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [expenses, setExpenses] = useState<RipplingExpense[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState<string>('all');
  const { toast } = useToast();

  // Find employee data
  const findEmployeeData = (name: string): { displayName: string; type: string } => {
    if (!name) return { displayName: name, type: 'Unknown' };
    
    // Direct match
    if (EMPLOYEE_DATA[name]) {
      return EMPLOYEE_DATA[name];
    }
    
    // Case-insensitive match
    const nameLower = name.toLowerCase().trim();
    for (const [key, data] of Object.entries(EMPLOYEE_DATA)) {
      if (key.toLowerCase() === nameLower) {
        return data;
      }
    }
    
    return { displayName: name, type: 'Unknown' };
  };

  // Map Rippling category to output category
  const mapCategory = (category: string): string => {
    if (!category) return 'Miscellaneous';
    
    // Direct match
    if (CATEGORY_MAPPING[category]) {
      return CATEGORY_MAPPING[category];
    }
    
    // Partial match
    for (const [key, value] of Object.entries(CATEGORY_MAPPING)) {
      if (category.toLowerCase().includes(key.toLowerCase())) {
        return value;
      }
    }
    
    return 'Miscellaneous';
  };

  // Process uploaded file
  const processFile = async (uploadedFile: File) => {
    setIsProcessing(true);
    setFile(uploadedFile);
    
    try {
      const isExcel = uploadedFile.name.toLowerCase().endsWith('.xlsx') || 
                      uploadedFile.name.toLowerCase().endsWith('.xls');
      const isCSV = uploadedFile.name.toLowerCase().endsWith('.csv');
      
      if (!isExcel && !isCSV) {
        toast({
          title: "Invalid file type",
          description: "Please upload a CSV or Excel file (.csv, .xlsx, .xls)",
          variant: "destructive",
        });
        setIsProcessing(false);
        return;
      }
      
      const arrayBuffer = await uploadedFile.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];
      
      // Map the data
      const processedExpenses: RipplingExpense[] = jsonData.map((row, index) => {
        const employee = String(row['Employee'] || '');
        const category = String(row['Category name'] || '');
        const employeeData = findEmployeeData(employee);
        
        return {
          id: index + 1,
          employee,
          vendorName: String(row['Vendor name'] || ''),
          amount: parseFloat(String(row['Amount'] || '0')) || 0,
          category,
          mappedCategory: mapCategory(category),
          purchaseDate: String(row['Purchase date'] || '').split('T')[0],
          mappedEmployee: employeeData.displayName,
          employeeType: employeeData.type,
        };
      });
      
      setExpenses(processedExpenses);
      
      const uniqueEmployees = new Set(processedExpenses.map(e => e.mappedEmployee)).size;
      toast({
        title: "File processed!",
        description: `${processedExpenses.length} expenses loaded from ${uniqueEmployees} employees.`,
      });
      
    } catch (error) {
      console.error('Error processing file:', error);
      toast({
        title: "Error",
        description: "Failed to process the file. Please check the format.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // Calculate summary by employee
  const employeeSummaries = useMemo((): EmployeeSummary[] => {
    const summaryMap = new Map<string, EmployeeSummary>();
    
    expenses.forEach(expense => {
      const key = expense.mappedEmployee;
      
      if (!summaryMap.has(key)) {
        const categories: Record<string, number> = {};
        OUTPUT_CATEGORIES.forEach(cat => categories[cat] = 0);
        
        summaryMap.set(key, {
          employeeName: expense.mappedEmployee,
          employeeType: expense.employeeType,
          categories,
          total: 0,
        });
      }
      
      const summary = summaryMap.get(key)!;
      summary.categories[expense.mappedCategory] = (summary.categories[expense.mappedCategory] || 0) + expense.amount;
      summary.total += expense.amount;
    });
    
    return Array.from(summaryMap.values()).sort((a, b) => a.employeeName.localeCompare(b.employeeName));
  }, [expenses]);

  // Get unique employees for filter
  const uniqueEmployees = useMemo(() => {
    return Array.from(new Set(expenses.map(e => e.mappedEmployee))).sort();
  }, [expenses]);

  // Filter expenses
  const filteredExpenses = useMemo(() => {
    if (selectedEmployee === 'all') return expenses;
    return expenses.filter(e => e.mappedEmployee === selectedEmployee);
  }, [expenses, selectedEmployee]);

  // Calculate totals
  const totalAmount = useMemo(() => {
    return filteredExpenses.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  // Handle drag events
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

  const handleClear = () => {
    setFile(null);
    setExpenses([]);
    setSelectedEmployee('all');
  };

  const handleExportSummary = () => {
    if (employeeSummaries.length === 0) return;
    
    // Create workbook
    const wb = XLSX.utils.book_new();
    
    // Create summary data
    const summaryData = employeeSummaries.map(summary => {
      const row: Record<string, string | number> = {
        'Employee Name': summary.employeeName,
        'Employee Type': summary.employeeType,
      };
      
      OUTPUT_CATEGORIES.forEach(cat => {
        row[cat] = summary.categories[cat] || '';
      });
      
      row['Total'] = summary.total;
      
      return row;
    });
    
    // Add total row
    const totalRow: Record<string, string | number> = {
      'Employee Name': 'TOTAL',
      'Employee Type': '',
    };
    OUTPUT_CATEGORIES.forEach(cat => {
      totalRow[cat] = employeeSummaries.reduce((sum, s) => sum + (s.categories[cat] || 0), 0);
    });
    totalRow['Total'] = employeeSummaries.reduce((sum, s) => sum + s.total, 0);
    summaryData.push(totalRow);
    
    const ws = XLSX.utils.json_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, ws, 'Summary');
    
    // Export
    XLSX.writeFile(wb, `rippling_summary_${new Date().toISOString().split('T')[0]}.xlsx`);
    
    toast({
      title: "Exported!",
      description: "Summary file downloaded.",
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Rippling Expenses</h1>
          <p className="text-muted-foreground mt-1">
            Upload expense reports and manage employee mappings
          </p>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="expenses" className="space-y-6">
        <TabsList>
          <TabsTrigger value="expenses" className="gap-2">
            <Receipt className="w-4 h-4" />
            Expense Reports
          </TabsTrigger>
          <TabsTrigger value="employees" className="gap-2">
            <Settings className="w-4 h-4" />
            Employee Mappings
          </TabsTrigger>
        </TabsList>

        <TabsContent value="expenses" className="space-y-6">
          {/* Action buttons for expenses */}
          {expenses.length > 0 && (
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={handleClear}>
                <X className="w-4 h-4 mr-2" />
                Clear
              </Button>
              <Button onClick={handleExportSummary} className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600">
                <Download className="w-4 h-4 mr-2" />
                Export Summary
              </Button>
            </div>
          )}

          {/* Upload Zone */}
          {expenses.length === 0 && (
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
                accept=".csv,.xlsx,.xls"
                onChange={handleFileSelect}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <div className="flex flex-col items-center gap-4">
                <div className={`
                  w-16 h-16 rounded-2xl flex items-center justify-center transition-colors
                  ${isDragging ? 'bg-primary/20' : 'bg-muted'}
                `}>
                  {isProcessing ? (
                    <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Upload className={`w-8 h-8 ${isDragging ? 'text-primary' : 'text-muted-foreground'}`} />
                  )}
                </div>
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground mb-1">
                    {isDragging ? 'Drop your file here' : 'Upload Rippling Export'}
              </h3>
              <p className="text-sm text-muted-foreground">
                Drag and drop your Rippling expense export file
              </p>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <FileSpreadsheet className="w-4 h-4" />
              <span>Supports .csv, .xlsx, .xls</span>
            </div>
          </div>
        </div>
      )}

      {/* Summary Stats */}
      {expenses.length > 0 && (
        <div className="grid grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Receipt className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Expenses</p>
                <p className="text-xl font-bold text-foreground">{filteredExpenses.length}</p>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <Users className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Employees</p>
                <p className="text-xl font-bold text-foreground">{uniqueEmployees.length}</p>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-muted/50 border border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Amount</p>
                <p className="text-xl font-bold text-foreground">
                  $ {totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
            </div>
          </div>
          <div className="p-4 rounded-xl bg-green-50 border border-green-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                <Check className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-green-600">File Loaded</p>
                <p className="text-sm font-medium text-green-700 truncate max-w-[150px]">{file?.name}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Employee Summary Table */}
      {expenses.length > 0 && (
        <div className="space-y-4">
          <h3 className="font-display text-lg font-semibold text-foreground">
            Summary by Employee
          </h3>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur-sm">
                  <TableRow>
                    <TableHead className="font-semibold min-w-[150px]">Employee Name</TableHead>
                    <TableHead className="font-semibold min-w-[100px]">Type</TableHead>
                    {OUTPUT_CATEGORIES.map(cat => (
                      <TableHead key={cat} className="font-semibold text-right min-w-[100px]">
                        {cat}
                      </TableHead>
                    ))}
                    <TableHead className="font-semibold text-right min-w-[100px]">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeSummaries.map((summary) => (
                    <TableRow key={summary.employeeName}>
                      <TableCell className="font-medium">{summary.employeeName}</TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          summary.employeeType === 'Partner' ? 'bg-purple-100 text-purple-700' :
                          summary.employeeType === 'Employee' ? 'bg-blue-100 text-blue-700' :
                          summary.employeeType === 'Advisor' ? 'bg-orange-100 text-orange-700' :
                          'bg-gray-100 text-gray-700'
                        }`}>
                          {summary.employeeType}
                        </span>
                      </TableCell>
                      {OUTPUT_CATEGORIES.map(cat => (
                        <TableCell key={cat} className="text-right">
                          {summary.categories[cat] > 0 
                            ? `$ ${summary.categories[cat].toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                            : '-'
                          }
                        </TableCell>
                      ))}
                      <TableCell className="text-right font-bold">
                        $ {summary.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                  {/* Total Row */}
                  <TableRow className="bg-muted/50 font-bold">
                    <TableCell>TOTAL</TableCell>
                    <TableCell></TableCell>
                    {OUTPUT_CATEGORIES.map(cat => (
                      <TableCell key={cat} className="text-right">
                        $ {employeeSummaries.reduce((sum, s) => sum + (s.categories[cat] || 0), 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      $ {employeeSummaries.reduce((sum, s) => sum + s.total, 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Expenses Table */}
      {expenses.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-lg font-semibold text-foreground">
              Expense Details
            </h3>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-muted-foreground" />
              <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Filter by employee" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">
                    All employees ({expenses.length})
                  </SelectItem>
                  {uniqueEmployees.map((emp) => (
                    <SelectItem key={emp} value={emp}>
                      {emp} ({expenses.filter(e => e.mappedEmployee === emp).length})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="max-h-[400px] overflow-auto">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/95 backdrop-blur-sm">
                  <TableRow>
                    <TableHead className="font-semibold">Date</TableHead>
                    <TableHead className="font-semibold">Employee</TableHead>
                    <TableHead className="font-semibold">Vendor</TableHead>
                    <TableHead className="font-semibold">Category</TableHead>
                    <TableHead className="font-semibold text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      <TableCell className="text-muted-foreground">{expense.purchaseDate}</TableCell>
                      <TableCell className="font-medium">{expense.mappedEmployee}</TableCell>
                      <TableCell>{expense.vendorName}</TableCell>
                      <TableCell>
                        <span className="px-2 py-1 rounded-full text-xs bg-primary/10 text-primary">
                          {expense.mappedCategory}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        $ {expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </div>
      )}
        </TabsContent>

        <TabsContent value="employees">
          <RipplingEmployees />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default Rippling;
