import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { 
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow 
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Trash2, Eye, CreditCard, Calendar, DollarSign, Users, RefreshCw } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  getCreditCardBatches, getCreditCardExpenses, deleteCreditCardBatch, deleteCreditCardExpense,
  CreditCardBatch, CreditCardExpense 
} from '@/lib/api';

export default function CreditCardHistory() {
  const [batches, setBatches] = useState<CreditCardBatch[]>([]);
  const [selectedBatch, setSelectedBatch] = useState<CreditCardBatch | null>(null);
  const [batchExpenses, setBatchExpenses] = useState<CreditCardExpense[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);
  const [selectedYear, setSelectedYear] = useState<string>('all');
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'batch' | 'expense', id: string, info: string } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const { toast } = useToast();

  // Load batches
  const loadBatches = async () => {
    setIsLoading(true);
    try {
      const year = selectedYear !== 'all' ? parseInt(selectedYear) : undefined;
      const result = await getCreditCardBatches(year);
      setBatches(result.batches);
    } catch (error) {
      console.error('Error loading batches:', error);
      toast({
        title: 'Error',
        description: 'Failed to load credit card history',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBatches();
  }, [selectedYear]);

  // Load expenses for a batch
  const loadBatchExpenses = async (batch: CreditCardBatch) => {
    setSelectedBatch(batch);
    setIsLoadingExpenses(true);
    try {
      const result = await getCreditCardExpenses(undefined, batch.batch_id);
      setBatchExpenses(result.expenses);
    } catch (error) {
      console.error('Error loading expenses:', error);
      toast({
        title: 'Error',
        description: 'Failed to load batch expenses',
        variant: 'destructive',
      });
    } finally {
      setIsLoadingExpenses(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    setIsDeleting(true);
    try {
      if (deleteTarget.type === 'batch') {
        const result = await deleteCreditCardBatch(deleteTarget.id);
        toast({
          title: 'Batch deleted!',
          description: `Removed ${result.deleted_count} transactions ($${result.total_amount.toFixed(2)}) and updated consolidated table.`,
        });
        // Refresh batches
        loadBatches();
        setSelectedBatch(null);
        setBatchExpenses([]);
      } else {
        await deleteCreditCardExpense(deleteTarget.id);
        toast({
          title: 'Expense deleted!',
          description: 'Transaction removed and consolidated table updated.',
        });
        // Refresh current batch expenses
        if (selectedBatch) {
          loadBatchExpenses(selectedBatch);
        }
        loadBatches();
      }
    } catch (error) {
      console.error('Error deleting:', error);
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

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // Stats
  const totalTransactions = (batches || []).reduce((sum, b) => sum + b.transaction_count, 0);
  const totalAmount = (batches || []).reduce((sum, b) => sum + b.total_amount, 0);

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CreditCard className="w-8 h-8 text-primary" />
            Credit Card History
          </h1>
          <p className="text-muted-foreground mt-1">
            View and manage credit card expenses sent to the database
          </p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[120px]">
              <Calendar className="w-4 h-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Years</SelectItem>
              <SelectItem value="2024">2024</SelectItem>
              <SelectItem value="2025">2025</SelectItem>
              <SelectItem value="2026">2026</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={loadBatches} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Batches</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{batches.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalTransactions}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Amount</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Batches Table */}
      <Card>
        <CardHeader>
          <CardTitle>Expense Batches</CardTitle>
          <CardDescription>
            Each batch represents a submission from the Credit Card page. 
            Deleting a batch will automatically subtract the amounts from the consolidated expenses.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : batches.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No credit card expenses found. Send some from the Credit Card page.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Batch ID</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead>Year</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-center">Transactions</TableHead>
                  <TableHead className="text-center">Employees</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batches.map((batch) => (
                  <TableRow key={batch.batch_id}>
                    <TableCell className="font-mono text-sm">{batch.batch_id}</TableCell>
                    <TableCell>{formatDate(batch.created_at)}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{batch.year}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge>{batch.source}</Badge>
                    </TableCell>
                    <TableCell className="text-center">{batch.transaction_count}</TableCell>
                    <TableCell className="text-center">{batch.employee_count}</TableCell>
                    <TableCell className="text-right font-medium">
                      ${batch.total_amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => loadBatchExpenses(batch)}
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteTarget({ 
                            type: 'batch', 
                            id: batch.batch_id,
                            info: `${batch.transaction_count} transactions ($${batch.total_amount.toFixed(2)})`
                          })}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Batch Detail Dialog */}
      <Dialog open={!!selectedBatch} onOpenChange={() => setSelectedBatch(null)}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Batch Details: {selectedBatch?.batch_id}</DialogTitle>
            <DialogDescription>
              {selectedBatch && (
                <span>
                  {formatDate(selectedBatch.created_at)} • {selectedBatch.transaction_count} transactions • ${selectedBatch.total_amount.toFixed(2)}
                </span>
              )}
            </DialogDescription>
          </DialogHeader>
          
          {isLoadingExpenses ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Employee</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Description</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-center">Delete</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {batchExpenses.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium">{expense.employee_name}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{expense.category}</Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate" title={expense.description}>
                      {expense.description || '-'}
                    </TableCell>
                    <TableCell>{expense.transaction_date || '-'}</TableCell>
                    <TableCell className="text-right font-medium">
                      ${expense.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setDeleteTarget({ 
                          type: 'expense', 
                          id: expense.id,
                          info: `${expense.employee_name} - ${expense.category} ($${expense.amount.toFixed(2)})`
                        })}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={() => !isDeleting && setDeleteTarget(null)}>
        <AlertDialogContent>
          {isDeleting ? (
            <div className="flex flex-col items-center justify-center py-8 gap-4">
              <Loader2 className="w-12 h-12 animate-spin text-destructive" />
              <div className="text-center">
                <p className="text-lg font-semibold">Deleting...</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Removing {deleteTarget?.type === 'batch' ? 'batch' : 'expense'} and updating consolidated table
                </p>
              </div>
            </div>
          ) : (
            <>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Delete {deleteTarget?.type === 'batch' ? 'Batch' : 'Expense'}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  This will delete {deleteTarget?.info} and automatically subtract the amounts from the consolidated expenses table.
                  <br /><br />
                  <strong>This action cannot be undone.</strong>
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDelete}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
