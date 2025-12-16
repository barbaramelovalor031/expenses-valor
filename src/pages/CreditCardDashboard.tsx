import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { Label } from '@/components/ui/label';
import { 
  Loader2, Trash2, Edit, Plus, CreditCard, Calendar, DollarSign, Users, 
  RefreshCw, Download, Upload, CheckCircle, XCircle, Search
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { 
  getCreditCardDashboard,
  addCreditCardDashboardExpense,
  updateCreditCardDashboardExpense,
  deleteCreditCardDashboardExpense,
  syncCreditCardToValor,
  CreditCardDashboardExpense,
  CreditCardSummary,
  getCategories,
  getValorNames,
} from '@/lib/api';

const VALID_CREDIT_CARDS = ['Amex', 'SVB', 'Bradesco'];

const cardColors: Record<string, string> = {
  'Amex': 'bg-blue-500',
  'SVB': 'bg-green-500',
  'Bradesco': 'bg-red-500',
};

export default function CreditCardDashboardPage() {
  const [expenses, setExpenses] = useState<CreditCardDashboardExpense[]>([]);
  const [summary, setSummary] = useState<CreditCardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Filters
  const [filterYear, setFilterYear] = useState<string>('all');
  const [filterCard, setFilterCard] = useState<string>('all');
  const [filterUser, setFilterUser] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Available options
  const [availableYears, setAvailableYears] = useState<number[]>([]);
  const [availableUsers, setAvailableUsers] = useState<string[]>([]);
  const [availableCategories, setAvailableCategories] = useState<string[]>([]);
  const [allCategories, setAllCategories] = useState<string[]>([]);
  const [allNames, setAllNames] = useState<string[]>([]);
  
  // Edit/Add dialog
  const [editDialog, setEditDialog] = useState<{
    open: boolean;
    expense: Partial<CreditCardDashboardExpense> | null;
    isNew: boolean;
  }>({ open: false, expense: null, isNew: false });
  const [isSaving, setIsSaving] = useState(false);
  
  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<CreditCardDashboardExpense | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  
  // Inline editing
  const [editingCell, setEditingCell] = useState<{ id: string; field: string } | null>(null);
  const [editingValue, setEditingValue] = useState<string>('');
  
  const { toast } = useToast();

  // Load data
  const loadData = async () => {
    setIsLoading(true);
    try {
      const result = await getCreditCardDashboard();
      setExpenses(result.expenses);
      setSummary(result.summary);
      
      // Extract unique values for filters
      const years = [...new Set(result.expenses.map(e => e.year).filter(Boolean))] as number[];
      const users = [...new Set(result.expenses.map(e => e.user).filter(Boolean))];
      const categories = [...new Set(result.expenses.map(e => e.category).filter(Boolean))];
      
      setAvailableYears(years.sort((a, b) => b - a));
      setAvailableUsers(users.sort());
      setAvailableCategories(categories.sort());
      
      // Load all categories and names for dropdowns
      try {
        const [catResult, namesResult] = await Promise.all([
          getCategories(),
          getValorNames()
        ]);
        setAllCategories(catResult);
        setAllNames(namesResult.names || []);
      } catch {
        // Keep existing values
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load credit card expenses',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    return expenses.filter(exp => {
      if (filterYear !== 'all' && exp.year !== parseInt(filterYear)) return false;
      if (filterCard !== 'all' && exp.credit_card !== filterCard) return false;
      if (filterUser !== 'all' && exp.user !== filterUser) return false;
      if (filterCategory !== 'all' && exp.category !== filterCategory) return false;
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        if (
          !exp.description?.toLowerCase().includes(search) &&
          !exp.user?.toLowerCase().includes(search) &&
          !exp.category?.toLowerCase().includes(search)
        ) {
          return false;
        }
      }
      return true;
    });
  }, [expenses, filterYear, filterCard, filterUser, filterCategory, searchTerm]);

  // Summary stats for filtered
  const filteredStats = useMemo(() => {
    const total = filteredExpenses.reduce((sum, exp) => sum + (exp.amount || 0), 0);
    const synced = filteredExpenses.filter(exp => exp.synced_to_valor).length;
    const unsynced = filteredExpenses.length - synced;
    return { total, synced, unsynced, count: filteredExpenses.length };
  }, [filteredExpenses]);

  // Handle sync to valor
  const handleSyncToValor = async () => {
    setIsSyncing(true);
    try {
      const result = await syncCreditCardToValor();
      toast({
        title: 'Sync Complete',
        description: result.message,
      });
      await loadData();
    } catch (error) {
      console.error('Error syncing:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to sync to Valor',
        variant: 'destructive',
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Handle save (add or update)
  const handleSave = async () => {
    if (!editDialog.expense) return;
    
    const exp = editDialog.expense;
    
    // Validation
    if (!exp.date || !exp.credit_card || !exp.user || !exp.category || !exp.amount) {
      toast({
        title: 'Validation Error',
        description: 'Please fill in all required fields',
        variant: 'destructive',
      });
      return;
    }
    
    setIsSaving(true);
    try {
      if (editDialog.isNew) {
        await addCreditCardDashboardExpense({
          date: exp.date,
          credit_card: exp.credit_card,
          description: exp.description || '',
          user: exp.user,
          category: exp.category,
          amount: Number(exp.amount),
          comments: exp.comments || '',
        });
        toast({
          title: 'Expense Added',
          description: 'Credit card expense added successfully',
        });
      } else {
        await updateCreditCardDashboardExpense(exp.id!, {
          date: exp.date,
          credit_card: exp.credit_card,
          description: exp.description,
          user: exp.user,
          category: exp.category,
          amount: Number(exp.amount),
          comments: exp.comments,
        });
        toast({
          title: 'Expense Updated',
          description: 'Credit card expense updated successfully',
        });
      }
      
      setEditDialog({ open: false, expense: null, isNew: false });
      await loadData();
    } catch (error) {
      console.error('Error saving:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to save expense',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Handle delete
  const handleDelete = async () => {
    if (!deleteTarget) return;
    
    setIsDeleting(true);
    try {
      const result = await deleteCreditCardDashboardExpense(deleteTarget.id);
      toast({
        title: 'Expense Deleted',
        description: result.valor_deleted 
          ? 'Expense deleted from both credit card and valor tables'
          : 'Expense deleted successfully',
      });
      setDeleteTarget(null);
      await loadData();
    } catch (error) {
      console.error('Error deleting:', error);
      toast({
        title: 'Error',
        description: error instanceof Error ? error.message : 'Failed to delete expense',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Handle inline edit
  const startInlineEdit = (expense: CreditCardDashboardExpense, field: string) => {
    const value = expense[field as keyof CreditCardDashboardExpense];
    setEditingCell({ id: expense.id, field });
    setEditingValue(value?.toString() || '');
  };

  const cancelInlineEdit = () => {
    setEditingCell(null);
    setEditingValue('');
  };

  const saveInlineEdit = async (expense: CreditCardDashboardExpense, newValue?: string) => {
    if (!editingCell) return;
    
    const { field } = editingCell;
    const valueToSave = newValue !== undefined ? newValue : editingValue;
    
    // Check if value actually changed
    const currentValue = expense[field as keyof CreditCardDashboardExpense]?.toString() || '';
    if (valueToSave === currentValue) {
      setEditingCell(null);
      setEditingValue('');
      return;
    }
    
    let updates: Record<string, any> = {};
    
    if (field === 'amount') {
      updates[field] = parseFloat(valueToSave) || 0;
    } else {
      updates[field] = valueToSave;
    }
    
    try {
      await updateCreditCardDashboardExpense(expense.id, updates);
      
      // Update local state immediately for better UX
      setExpenses(prev => prev.map(e => 
        e.id === expense.id ? { ...e, ...updates, synced_to_valor: false } : e
      ));
      
      toast({
        title: 'Updated',
        description: `${field} updated successfully`,
      });
    } catch (error) {
      console.error('Error updating:', error);
      toast({
        title: 'Error',
        description: 'Failed to update',
        variant: 'destructive',
      });
    } finally {
      setEditingCell(null);
      setEditingValue('');
    }
  };

  const handleInlineKeyDown = (e: React.KeyboardEvent, expense: CreditCardDashboardExpense) => {
    if (e.key === 'Enter') {
      saveInlineEdit(expense);
    } else if (e.key === 'Escape') {
      cancelInlineEdit();
    }
  };

  // Export to CSV
  const handleExportCSV = () => {
    const headers = ['Date', 'Credit Card', 'Description', 'User', 'Category', 'Amount', 'Comments', 'Synced'];
    const rows = filteredExpenses.map(exp => [
      exp.date || '',
      exp.credit_card,
      `"${(exp.description || '').replace(/"/g, '""')}"`,
      exp.user,
      exp.category,
      exp.amount.toFixed(2),
      `"${(exp.comments || '').replace(/"/g, '""')}"`,
      exp.synced_to_valor ? 'Yes' : 'No'
    ]);
    
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `credit_card_expenses_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(value);
  };

  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return new Date(date + 'T00:00:00').toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Credit Card Expenses</h1>
          <p className="text-muted-foreground">
            Manage credit card expenses and sync to main expense table
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExportCSV}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
          <Button 
            variant="outline" 
            onClick={handleSyncToValor}
            disabled={isSyncing}
          >
            {isSyncing ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Sync to Valor
          </Button>
          <Button onClick={() => setEditDialog({ 
            open: true, 
            expense: { date: new Date().toISOString().split('T')[0], credit_card: 'Amex' }, 
            isNew: true 
          })}>
            <Plus className="h-4 w-4 mr-2" />
            Add Expense
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Amount</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(filteredStats.total)}</div>
            <p className="text-xs text-muted-foreground">
              {filteredStats.count} transactions
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Synced</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{filteredStats.synced}</div>
            <p className="text-xs text-muted-foreground">
              Synced to Valor
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Sync</CardTitle>
            <XCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{filteredStats.unsynced}</div>
            <p className="text-xs text-muted-foreground">
              Not yet synced
            </p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">By Card</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 flex-wrap">
              {summary && Object.entries(summary.by_card).map(([card, data]) => (
                <Badge key={card} className={`${cardColors[card] || 'bg-gray-500'}`}>
                  {card}: {data.count}
                </Badge>
              ))}
              {(!summary || Object.keys(summary.by_card).length === 0) && (
                <span className="text-sm text-muted-foreground">No data</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Filters</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            
            <Select value={filterYear} onValueChange={setFilterYear}>
              <SelectTrigger>
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Years</SelectItem>
                {availableYears.map(year => (
                  <SelectItem key={year} value={year.toString()}>{year}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterCard} onValueChange={setFilterCard}>
              <SelectTrigger>
                <SelectValue placeholder="Card" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Cards</SelectItem>
                {VALID_CREDIT_CARDS.map(card => (
                  <SelectItem key={card} value={card}>{card}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterUser} onValueChange={setFilterUser}>
              <SelectTrigger>
                <SelectValue placeholder="User" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Users</SelectItem>
                {availableUsers.map(user => (
                  <SelectItem key={user} value={user}>{user}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger>
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                {availableCategories.map(cat => (
                  <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle>Expenses</CardTitle>
            <CardDescription>
              Showing {filteredExpenses.length} of {expenses.length} expenses
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={loadData} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : filteredExpenses.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No expenses found. Add your first expense!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Card</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Comments</TableHead>
                    <TableHead className="text-center">Synced</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredExpenses.map((expense) => (
                    <TableRow key={expense.id}>
                      {/* Date - Editable */}
                      <TableCell 
                        className="cursor-pointer hover:bg-muted/50" 
                        onClick={() => startInlineEdit(expense, 'date')}
                      >
                        {editingCell?.id === expense.id && editingCell?.field === 'date' ? (
                          <Input
                            type="date"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => handleInlineKeyDown(e, expense)}
                            onBlur={() => saveInlineEdit(expense)}
                            autoFocus
                            className="h-8 w-32"
                          />
                        ) : (
                          formatDate(expense.date)
                        )}
                      </TableCell>
                      
                      {/* Card - Editable via Select */}
                      <TableCell 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => startInlineEdit(expense, 'credit_card')}
                      >
                        {editingCell?.id === expense.id && editingCell?.field === 'credit_card' ? (
                          <Select 
                            value={editingValue} 
                            onValueChange={(value) => {
                              saveInlineEdit(expense, value);
                            }}
                          >
                            <SelectTrigger className="h-8 w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {VALID_CREDIT_CARDS.map(card => (
                                <SelectItem key={card} value={card}>{card}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge className={`${cardColors[expense.credit_card] || 'bg-gray-500'}`}>
                            {expense.credit_card}
                          </Badge>
                        )}
                      </TableCell>
                      
                      {/* Description - Editable */}
                      <TableCell 
                        className="max-w-[200px] cursor-pointer hover:bg-muted/50"
                        onClick={() => startInlineEdit(expense, 'description')}
                        title={expense.description}
                      >
                        {editingCell?.id === expense.id && editingCell?.field === 'description' ? (
                          <Input
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => handleInlineKeyDown(e, expense)}
                            onBlur={() => saveInlineEdit(expense)}
                            autoFocus
                            className="h-8"
                          />
                        ) : (
                          <span className="truncate block">{expense.description || '-'}</span>
                        )}
                      </TableCell>
                      
                      {/* User - Editable via Select */}
                      <TableCell 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => startInlineEdit(expense, 'user')}
                      >
                        {editingCell?.id === expense.id && editingCell?.field === 'user' ? (
                          <Select 
                            value={editingValue} 
                            onValueChange={(value) => {
                              saveInlineEdit(expense, value);
                            }}
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(allNames.length > 0 ? allNames : availableUsers).map(name => (
                                <SelectItem key={name} value={name}>{name}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          expense.user
                        )}
                      </TableCell>
                      
                      {/* Category - Editable via Select */}
                      <TableCell 
                        className="cursor-pointer hover:bg-muted/50"
                        onClick={() => startInlineEdit(expense, 'category')}
                      >
                        {editingCell?.id === expense.id && editingCell?.field === 'category' ? (
                          <Select 
                            value={editingValue} 
                            onValueChange={(value) => {
                              saveInlineEdit(expense, value);
                            }}
                          >
                            <SelectTrigger className="h-8 w-44">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(allCategories.length > 0 ? allCategories : availableCategories).map(cat => (
                                <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          expense.category
                        )}
                      </TableCell>
                      
                      {/* Amount - Editable */}
                      <TableCell 
                        className="text-right font-medium cursor-pointer hover:bg-muted/50"
                        onClick={() => startInlineEdit(expense, 'amount')}
                      >
                        {editingCell?.id === expense.id && editingCell?.field === 'amount' ? (
                          <Input
                            type="number"
                            step="0.01"
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => handleInlineKeyDown(e, expense)}
                            onBlur={() => saveInlineEdit(expense)}
                            autoFocus
                            className="h-8 w-24 text-right"
                          />
                        ) : (
                          formatCurrency(expense.amount)
                        )}
                      </TableCell>
                      
                      {/* Comments - Editable */}
                      <TableCell 
                        className="max-w-[150px] cursor-pointer hover:bg-muted/50"
                        onClick={() => startInlineEdit(expense, 'comments')}
                        title={expense.comments || ''}
                      >
                        {editingCell?.id === expense.id && editingCell?.field === 'comments' ? (
                          <Input
                            value={editingValue}
                            onChange={(e) => setEditingValue(e.target.value)}
                            onKeyDown={(e) => handleInlineKeyDown(e, expense)}
                            onBlur={() => saveInlineEdit(expense)}
                            autoFocus
                            className="h-8"
                            placeholder="Add comment..."
                          />
                        ) : (
                          <span className="truncate block text-muted-foreground">{expense.comments || '-'}</span>
                        )}
                      </TableCell>
                      
                      <TableCell className="text-center">
                        {expense.synced_to_valor ? (
                          <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                        ) : (
                          <XCircle className="h-4 w-4 text-orange-500 mx-auto" />
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setEditDialog({ open: true, expense: { ...expense }, isNew: false })}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setDeleteTarget(expense)}
                          >
                            <Trash2 className="h-4 w-4 text-red-500" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit/Add Dialog */}
      <Dialog open={editDialog.open} onOpenChange={(open) => {
        if (!open) setEditDialog({ open: false, expense: null, isNew: false });
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editDialog.isNew ? 'Add Expense' : 'Edit Expense'}</DialogTitle>
            <DialogDescription>
              {editDialog.isNew ? 'Add a new credit card expense' : 'Update expense details'}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={editDialog.expense?.date || ''}
                onChange={(e) => setEditDialog(prev => ({
                  ...prev,
                  expense: { ...prev.expense, date: e.target.value }
                }))}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="credit_card">Credit Card *</Label>
              <Select 
                value={editDialog.expense?.credit_card || ''} 
                onValueChange={(value) => setEditDialog(prev => ({
                  ...prev,
                  expense: { ...prev.expense, credit_card: value }
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select card" />
                </SelectTrigger>
                <SelectContent>
                  {VALID_CREDIT_CARDS.map(card => (
                    <SelectItem key={card} value={card}>{card}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="user">User *</Label>
              <Select 
                value={editDialog.expense?.user || ''} 
                onValueChange={(value) => setEditDialog(prev => ({
                  ...prev,
                  expense: { ...prev.expense, user: value }
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select user" />
                </SelectTrigger>
                <SelectContent>
                  {(allNames.length > 0 ? allNames : availableUsers).map(name => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="category">Category *</Label>
              <Select 
                value={editDialog.expense?.category || ''} 
                onValueChange={(value) => setEditDialog(prev => ({
                  ...prev,
                  expense: { ...prev.expense, category: value }
                }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {(allCategories.length > 0 ? allCategories : availableCategories).map(cat => (
                    <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={editDialog.expense?.description || ''}
                onChange={(e) => setEditDialog(prev => ({
                  ...prev,
                  expense: { ...prev.expense, description: e.target.value }
                }))}
                placeholder="Enter description"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="amount">Amount (USD) *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                value={editDialog.expense?.amount || ''}
                onChange={(e) => setEditDialog(prev => ({
                  ...prev,
                  expense: { ...prev.expense, amount: parseFloat(e.target.value) || 0 }
                }))}
                placeholder="0.00"
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="comments">Comments</Label>
              <Input
                id="comments"
                value={editDialog.expense?.comments || ''}
                onChange={(e) => setEditDialog(prev => ({
                  ...prev,
                  expense: { ...prev.expense, comments: e.target.value }
                }))}
                placeholder="Add comments..."
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setEditDialog({ open: false, expense: null, isNew: false })}
            >
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editDialog.isNew ? 'Add' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Expense?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this expense?
              {deleteTarget?.synced_to_valor && (
                <span className="block mt-2 text-orange-600">
                  This expense is synced to Valor and will also be removed from the main expense table.
                </span>
              )}
              <div className="mt-4 p-3 bg-muted rounded-md">
                <p><strong>Date:</strong> {formatDate(deleteTarget?.date || null)}</p>
                <p><strong>User:</strong> {deleteTarget?.user}</p>
                <p><strong>Amount:</strong> {formatCurrency(deleteTarget?.amount || 0)}</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={isDeleting} className="bg-red-500 hover:bg-red-600">
              {isDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
