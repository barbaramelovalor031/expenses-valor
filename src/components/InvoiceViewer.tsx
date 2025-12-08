import { ExtractedInvoice } from '@/types/invoice';
import { Button } from '@/components/ui/button';
import { X, Download, Calendar, CreditCard, Receipt, Users } from 'lucide-react';
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
import { useState, useMemo } from 'react';

interface InvoiceViewerProps {
  invoice: ExtractedInvoice;
  onClose: () => void;
  originalFile?: File;
}

export function InvoiceViewer({ invoice, onClose, originalFile }: InvoiceViewerProps) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string>('all');

  // Agrupa transações por cardholder
  const transactionsByCardholder = useMemo(() => {
    return invoice.transactions.reduce((acc, tx) => {
      const holder = tx.category || 'Outros';
      if (!acc[holder]) acc[holder] = [];
      acc[holder].push(tx);
      return acc;
    }, {} as Record<string, typeof invoice.transactions>);
  }, [invoice.transactions]);

  const cardholders = Object.keys(transactionsByCardholder).sort();

  // Calcula totais por usuário
  const totalsByUser = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const [holder, txs] of Object.entries(transactionsByCardholder)) {
      totals[holder] = txs.reduce((sum, tx) => sum + (tx.amount || 0), 0);
    }
    return totals;
  }, [transactionsByCardholder]);

  // Filtra transações baseado no usuário selecionado
  const filteredTransactions = useMemo(() => {
    if (selectedUser === 'all') {
      return invoice.transactions;
    }
    return transactionsByCardholder[selectedUser] || [];
  }, [selectedUser, invoice.transactions, transactionsByCardholder]);

  // Filtered total
  const filteredTotal = useMemo(() => {
    return filteredTransactions.reduce((sum, tx) => sum + (tx.amount || 0), 0);
  }, [filteredTransactions]);

  const handleDownloadExcel = async () => {
    if (!originalFile) {
      // Fallback para CSV se não tiver o arquivo original
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
        throw new Error('Erro ao gerar Excel');
      }

      const blob = await response.blob();
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${invoice.fileName.replace('.pdf', '')}_by_user.xlsx`;
      link.click();
    } catch (error) {
      console.error('Error downloading Excel:', error);
      // Fallback para CSV
      handleDownloadCSV();
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownloadCSV = () => {
    const headers = ['Date', 'Description', 'Category', 'Amount'];
    const rows = invoice.transactions.map((t) => [
      t.date,
      t.description,
      t.category || '',
      t.amount.toFixed(2),
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(',')),
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${invoice.fileName.replace('.pdf', '')}_extrato.csv`;
    link.click();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-foreground/20 backdrop-blur-sm animate-fade-in">
      <div className="w-full max-w-4xl max-h-[90vh] bg-card rounded-2xl shadow-elevated overflow-hidden animate-scale-in">
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
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-muted-foreground" />
                <Select value={selectedUser} onValueChange={setSelectedUser}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Filter by user" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      All users ({invoice.transactions.length})
                    </SelectItem>
                    {cardholders.map((holder) => (
                      <SelectItem key={holder} value={holder}>
                        {holder} ({transactionsByCardholder[holder].length})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="text-sm">
                <span className="text-muted-foreground">Total: </span>
                <span className="font-bold text-foreground">
                  $ {filteredTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
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
                  <TableHead className="font-semibold">Date</TableHead>
                  <TableHead className="font-semibold">Description</TableHead>
                  {selectedUser === 'all' && (
                    <TableHead className="font-semibold">User</TableHead>
                  )}
                  <TableHead className="font-semibold text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTransactions.map((transaction) => (
                  <TableRow key={transaction.id} className="hover:bg-muted/30">
                    <TableCell className="text-muted-foreground">
                      {transaction.date}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {transaction.description}
                    </TableCell>
                    {selectedUser === 'all' && (
                      <TableCell>
                        {transaction.category && (
                          <button 
                            onClick={() => setSelectedUser(transaction.category!)}
                            className="px-2 py-1 text-xs rounded-full bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                          >
                            {transaction.category}
                          </button>
                        )}
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
    </div>
  );
}
