import { useState, useCallback } from 'react';
import { CreditCard, Upload, FileSpreadsheet, X, Download, Sparkles, Check, AlertCircle } from 'lucide-react';
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
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/lib/api';

// Mesmas categorias do backend
const EXPENSE_CATEGORIES = [
  "Airfare",
  "Computer Equipment",
  "Travel - Event",
  "Gifts",
  "Lodging",
  "Miscellaneous",
  "Office Supplies",
  "IT Subscriptions",
  "Training",
  "Brazil Insurance",
  "Personal Expenses",
  "Membership Dues",
  "Printing",
  "Rippling Wire Deduction",
  "Ground Transportation",
  "Meals & Entertainment",
  "Conferences & Seminars",
  "Telephone/Internet",
  "Wellhub Reimbursement",
  "Pantry Food",
  "Travel Agent Fees",
  "Delivery and Postage",
  "Venue - Event",
  "Catering - Event",
  "Printing - Event",
  "Tech/AV - Event",
  "Other - Event",
  "Board meetings",
  "Due Diligence - Portfolio Company",
  "Due Diligence - New Deals",
];

interface Transaction {
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

const MichaelCard = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isCategorizing, setIsCategorizing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const { toast } = useToast();

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
        throw new Error(error.detail || 'Erro ao processar arquivo');
      }
      
      const data = await response.json();
      setTransactions(data.transactions);
      
      toast({
        title: "Arquivo processado!",
        description: `${data.total_transactions} transações carregadas. Total: $${data.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
      });
      
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao processar arquivo",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCategorize = async () => {
    if (transactions.length === 0) return;
    
    setIsCategorizing(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/michael/categorize`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions }),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Erro ao categorizar');
      }
      
      const data = await response.json();
      setTransactions(data.transactions);
      
      const categorized = data.transactions.filter((t: Transaction) => t.ai_category).length;
      toast({
        title: "Categorização concluída!",
        description: `${categorized} de ${data.transactions.length} transações categorizadas.`,
      });
      
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: error instanceof Error ? error.message : "Falha ao categorizar",
        variant: "destructive",
      });
    } finally {
      setIsCategorizing(false);
    }
  };

  const handleExport = async () => {
    if (transactions.length === 0) return;
    
    setIsExporting(true);
    
    try {
      const response = await fetch(`${API_BASE_URL}/michael/export`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactions }),
      });
      
      if (!response.ok) {
        throw new Error('Erro ao exportar');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `michael_categorized_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "Exportado!",
        description: "Arquivo Excel baixado com sucesso.",
      });
      
    } catch (error) {
      console.error('Erro:', error);
      toast({
        title: "Erro",
        description: "Falha ao exportar Excel",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  const handleCategoryChange = (transactionId: number, newCategory: string) => {
    setTransactions(prev => 
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

  const handleClear = () => {
    setFile(null);
    setTransactions([]);
  };

  const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
  const categorizedCount = transactions.filter(tx => tx.ai_category).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-foreground">Michael Credit Card</h1>
          <p className="text-muted-foreground mt-1">
            Upload Michael's Amex statement and categorize expenses using AI
          </p>
        </div>
        {transactions.length > 0 && (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleClear}>
              <X className="w-4 h-4 mr-2" />
              Clear
            </Button>
            <Button 
              onClick={handleCategorize} 
              disabled={isCategorizing}
              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
            >
              <Sparkles className="w-4 h-4 mr-2" />
              {isCategorizing ? 'Categorizing...' : 'AI Categorize'}
            </Button>
            <Button 
              onClick={handleExport}
              disabled={isExporting}
              className="bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
            >
              <Download className="w-4 h-4 mr-2" />
              {isExporting ? 'Exporting...' : 'Export Excel'}
            </Button>
          </div>
        )}
      </div>

      {/* Upload Zone */}
      {transactions.length === 0 && (
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
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              ) : (
                <CreditCard className={`w-8 h-8 ${isDragging ? 'text-primary' : 'text-purple-500'}`} />
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

      {/* Stats */}
      {transactions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-card rounded-xl p-4 border">
            <p className="text-sm text-muted-foreground">Total Transactions</p>
            <p className="text-2xl font-bold">{transactions.length}</p>
          </div>
          <div className="bg-card rounded-xl p-4 border">
            <p className="text-sm text-muted-foreground">Total Amount</p>
            <p className="text-2xl font-bold">${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
          </div>
          <div className="bg-card rounded-xl p-4 border">
            <p className="text-sm text-muted-foreground">Categorized</p>
            <p className="text-2xl font-bold text-green-500">{categorizedCount}</p>
          </div>
          <div className="bg-card rounded-xl p-4 border">
            <p className="text-sm text-muted-foreground">Pending</p>
            <p className="text-2xl font-bold text-orange-500">{transactions.length - categorizedCount}</p>
          </div>
        </div>
      )}

      {/* Transactions Table */}
      {transactions.length > 0 && (
        <div className="bg-card rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[100px]">Date</TableHead>
                  <TableHead className="w-[200px]">Description</TableHead>
                  <TableHead className="w-[150px]">Extended Details</TableHead>
                  <TableHead className="w-[150px]">Original Category</TableHead>
                  <TableHead className="text-right w-[100px]">Amount</TableHead>
                  <TableHead className="w-[200px]">AI Category</TableHead>
                  <TableHead className="w-[50px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {transactions.map((tx, index) => (
                  <TableRow key={`tx-${tx.id}-${index}`} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-sm">{tx.date}</TableCell>
                    <TableCell>
                      <div className="max-w-[200px]">
                        <p className="truncate font-medium" title={tx.description}>
                          {tx.description}
                        </p>
                        {tx.notes && (
                          <p className="text-xs text-muted-foreground truncate" title={tx.notes}>
                            {tx.notes}
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <p className="text-sm truncate max-w-[150px]" title={tx.extended_details}>
                        {tx.extended_details}
                      </p>
                    </TableCell>
                    <TableCell>
                      <span className="text-xs bg-muted px-2 py-1 rounded">
                        {tx.amex_category}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      ${tx.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Select
                        value={tx.ai_category || "uncategorized"}
                        onValueChange={(value) => handleCategoryChange(tx.id, value === "uncategorized" ? "" : value)}
                      >
                        <SelectTrigger className={`w-[180px] h-8 text-xs ${
                          tx.ai_category 
                            ? 'bg-green-50 border-green-200 text-green-700' 
                            : 'bg-yellow-50 border-yellow-200 text-yellow-700'
                        }`}>
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="uncategorized">
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
                    <TableCell>
                      {tx.ai_category ? (
                        <Check className="w-4 h-4 text-green-500" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-orange-500" />
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </div>
  );
};

export default MichaelCard;
