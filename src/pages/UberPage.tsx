import { useState, useCallback, useEffect, useMemo } from 'react';
import { Car, Upload, FileSpreadsheet, X, Check, AlertCircle, TrendingUp, Users, MapPin, DollarSign, Clock, Navigation, Filter, RefreshCw, Download } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/lib/api';

interface PreviewData {
  total_rows_in_csv: number;
  new_rows: number;
  duplicate_rows: number;
  total_brl: number;
  total_usd: number;
  preview: any[];
  columns: string[];
}

interface Transaction {
  trip_eats_id: string;
  transaction_timestamp_utc: string;
  user_name: string;
  first_name: string;
  last_name: string;
  service: string;
  city: string;
  pickup_address: string;
  dropoff_address: string;
  amount_brl: number;
  amount_usd: number;
  ptax_rate: number;
  distance_mi: number;
  duration_min: number;
}

interface DashboardData {
  summary: {
    total_trips: number;
    unique_users: number;
    total_brl: number;
    total_usd: number;
    avg_trip_brl: number;
    avg_trip_usd: number;
    total_distance_mi: number;
    total_duration_min: number;
  };
  by_user: Array<{ user_name: string; trips: number; total_brl: number; total_usd: number }>;
  by_city: Array<{ city: string; trips: number; total_brl: number; total_usd: number }>;
  by_month: Array<{ month: string; trips: number; total_brl: number; total_usd: number }>;
  all_transactions: Transaction[];
}

const UberPage = () => {
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);
  
  // Filters
  const [selectedUser, setSelectedUser] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  
  // Address dialog
  const [addressDialog, setAddressDialog] = useState<{ open: boolean; title: string; address: string }>({
    open: false,
    title: '',
    address: ''
  });
  
  const { toast } = useToast();

  useEffect(() => {
    loadDashboard();
  }, []);

  const loadDashboard = async () => {
    setIsLoadingDashboard(true);
    try {
      const response = await fetch(`${API_BASE_URL}/uber/dashboard`);
      if (!response.ok) throw new Error('Failed to load dashboard');
      const data = await response.json();
      setDashboardData(data);
    } catch (error) {
      console.error('Error loading dashboard:', error);
      toast({
        title: "Error",
        description: "Failed to load dashboard data",
        variant: "destructive",
      });
    } finally {
      setIsLoadingDashboard(false);
    }
  };

  // Get unique users for filter
  const uniqueUsers = useMemo(() => {
    if (!dashboardData?.by_user) return [];
    return dashboardData.by_user.map(u => u.user_name).sort();
  }, [dashboardData]);

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    if (!dashboardData?.all_transactions) return [];
    
    return dashboardData.all_transactions.filter(tx => {
      // User filter
      if (selectedUser !== 'all' && tx.user_name !== selectedUser) {
        return false;
      }
      
      // Date filters
      if (startDate || endDate) {
        const txDate = tx.transaction_timestamp_utc?.split(' ')[0];
        if (!txDate) return false;
        
        if (startDate && txDate < startDate) return false;
        if (endDate && txDate > endDate) return false;
      }
      
      return true;
    });
  }, [dashboardData, selectedUser, startDate, endDate]);

  // Filtered stats
  const filteredStats = useMemo(() => {
    const txs = filteredTransactions;
    return {
      total_trips: txs.length,
      total_brl: txs.reduce((sum, tx) => sum + (tx.amount_brl || 0), 0),
      total_usd: txs.reduce((sum, tx) => sum + (tx.amount_usd || 0), 0),
      total_distance: txs.reduce((sum, tx) => sum + (tx.distance_mi || 0), 0),
      total_duration: txs.reduce((sum, tx) => sum + (tx.duration_min || 0), 0),
    };
  }, [filteredTransactions]);

  const processFile = async (uploadedFile: File) => {
    setIsProcessing(true);
    setFile(uploadedFile);
    setPreviewData(null);
    
    try {
      const formData = new FormData();
      formData.append('file', uploadedFile);
      
      const response = await fetch(`${API_BASE_URL}/uber/preview`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Error processing file');
      }
      
      const data = await response.json();
      setPreviewData(data);
      
      toast({
        title: "File processed!",
        description: `${data.new_rows} new rows found out of ${data.total_rows_in_csv} total`,
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

  const handleUpload = async () => {
    if (!file || !previewData || previewData.new_rows === 0) return;
    
    setIsUploading(true);
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch(`${API_BASE_URL}/uber/upload`, {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Error uploading');
      }
      
      const data = await response.json();
      
      if (data.success) {
        toast({
          title: "Upload complete!",
          description: data.message,
        });
        
        setFile(null);
        setPreviewData(null);
        loadDashboard();
      } else {
        throw new Error(data.message);
      }
      
    } catch (error) {
      console.error('Error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to upload",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragging(true);
    } else if (e.type === 'dragleave') {
      setIsDragging(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    
    const files = e.dataTransfer.files;
    if (files?.[0]) {
      processFile(files[0]);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files?.[0]) {
      processFile(files[0]);
    }
  };

  const clearFile = () => {
    setFile(null);
    setPreviewData(null);
  };

  const clearFilters = () => {
    setSelectedUser('all');
    setStartDate('');
    setEndDate('');
  };

  const formatCurrency = (value: number, currency: 'BRL' | 'USD' = 'BRL') => {
    if (value === null || value === undefined) return '-';
    const symbol = currency === 'BRL' ? 'R$' : '$';
    return `${symbol} ${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  const hasActiveFilters = selectedUser !== 'all' || startDate || endDate;

  // Export to XLSX
  const exportToXLSX = async (mode: 'all' | 'filtered' | 'by_user') => {
    if (!dashboardData?.all_transactions) return;

    try {
      // Dynamically import xlsx library
      const XLSX = await import('xlsx');
      
      let dataToExport: Transaction[] = [];
      let filename = 'uber_expenses';

      if (mode === 'all') {
        dataToExport = dashboardData.all_transactions;
        filename = 'uber_expenses_complete';
      } else if (mode === 'filtered') {
        dataToExport = filteredTransactions;
        const parts = ['uber_expenses'];
        if (selectedUser !== 'all') parts.push(selectedUser.replace(/\s+/g, '_'));
        if (startDate) parts.push(`from_${startDate}`);
        if (endDate) parts.push(`to_${endDate}`);
        filename = parts.join('_');
      } else if (mode === 'by_user') {
        // Export grouped by user in separate sheets
        const wb = XLSX.utils.book_new();
        
        const userGroups = dashboardData.all_transactions.reduce((acc, tx) => {
          const user = tx.user_name || 'Unknown';
          if (!acc[user]) acc[user] = [];
          acc[user].push(tx);
          return acc;
        }, {} as Record<string, Transaction[]>);

        Object.entries(userGroups).forEach(([user, transactions]) => {
          const rows = transactions.map(tx => ({
            'Date': tx.transaction_timestamp_utc?.split(' ')[0] || '',
            'User': tx.user_name,
            'Service': tx.service,
            'City': tx.city,
            'Pickup Address': tx.pickup_address || '',
            'Drop-off Address': tx.dropoff_address || '',
            'Amount USD': tx.amount_usd,
            'Amount BRL': tx.amount_brl,
            'PTAX Rate': tx.ptax_rate,
            'Distance (mi)': tx.distance_mi,
            'Duration (min)': tx.duration_min,
          }));
          const ws = XLSX.utils.json_to_sheet(rows);
          const sheetName = user.substring(0, 31); // Excel limit
          XLSX.utils.book_append_sheet(wb, ws, sheetName);
        });

        XLSX.writeFile(wb, 'uber_expenses_by_user.xlsx');
        toast({
          title: "Export complete!",
          description: `Exported ${Object.keys(userGroups).length} user sheets`,
        });
        return;
      }

      // Single sheet export
      const rows = dataToExport.map(tx => ({
        'Date': tx.transaction_timestamp_utc?.split(' ')[0] || '',
        'User': tx.user_name,
        'Service': tx.service,
        'City': tx.city,
        'Pickup Address': tx.pickup_address || '',
        'Drop-off Address': tx.dropoff_address || '',
        'Amount USD': tx.amount_usd,
        'Amount BRL': tx.amount_brl,
        'PTAX Rate': tx.ptax_rate,
        'Distance (mi)': tx.distance_mi,
        'Duration (min)': tx.duration_min,
      }));

      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Transactions');
      XLSX.writeFile(wb, `${filename}.xlsx`);

      toast({
        title: "Export complete!",
        description: `Exported ${dataToExport.length} transactions`,
      });
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: "Export failed",
        description: "Could not export data to XLSX",
        variant: "destructive",
      });
    }
  };

  // Handle double-click on address
  const handleAddressDoubleClick = (title: string, address: string) => {
    if (address) {
      setAddressDialog({ open: true, title, address });
    }
  };

  return (
    <div className="min-h-screen bg-background p-6">
      {/* Address Dialog */}
      <Dialog open={addressDialog.open} onOpenChange={(open) => setAddressDialog(prev => ({ ...prev, open }))}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{addressDialog.title}</DialogTitle>
            <DialogDescription className="pt-4 text-base">
              {addressDialog.address}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-black to-gray-700 flex items-center justify-center">
            <Car className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Uber for Business</h1>
        </div>
        <p className="text-muted-foreground">
          Upload new data and view expense dashboard
        </p>
      </div>

      {/* Upload Section */}
      <Card className="mb-8">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload New Data
          </CardTitle>
          <CardDescription>
            Drag and drop a CSV exported from Uber for Business. The system will compare with existing data and add only new trips.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!file ? (
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-all ${
                isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border hover:border-primary/50'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <FileSpreadsheet className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-2">
                Drop Uber CSV here
              </p>
              <p className="text-sm text-muted-foreground mb-4">
                or click to select
              </p>
              <input
                type="file"
                accept=".csv"
                className="hidden"
                id="file-input"
                onChange={handleFileInput}
              />
              <label htmlFor="file-input">
                <Button variant="outline" className="cursor-pointer" asChild>
                  <span>Select File</span>
                </Button>
              </label>
            </div>
          ) : (
            <div className="space-y-4">
              {/* File info */}
              <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-3">
                  <FileSpreadsheet className="w-8 h-8 text-primary" />
                  <div>
                    <p className="font-medium">{file.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(file.size / 1024).toFixed(1)} KB
                    </p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" onClick={clearFile}>
                  <X className="w-4 h-4" />
                </Button>
              </div>

              {/* Processing indicator */}
              {isProcessing && (
                <div className="flex items-center justify-center gap-3 py-8">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span>Processing file and fetching PTAX rates...</span>
                </div>
              )}

              {/* Preview Results */}
              {previewData && !isProcessing && (
                <div className="space-y-4">
                  {/* Stats */}
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <p className="text-sm text-blue-600">Total in CSV</p>
                      <p className="text-2xl font-bold text-blue-700">{previewData.total_rows_in_csv}</p>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <p className="text-sm text-green-600">New Rows</p>
                      <p className="text-2xl font-bold text-green-700">{previewData.new_rows}</p>
                    </div>
                    <div className="p-4 bg-orange-50 rounded-lg">
                      <p className="text-sm text-orange-600">Duplicates</p>
                      <p className="text-2xl font-bold text-orange-700">{previewData.duplicate_rows}</p>
                    </div>
                    <div className="p-4 bg-purple-50 rounded-lg">
                      <p className="text-sm text-purple-600">Total BRL</p>
                      <p className="text-xl font-bold text-purple-700">{formatCurrency(previewData.total_brl)}</p>
                    </div>
                    <div className="p-4 bg-emerald-50 rounded-lg">
                      <p className="text-sm text-emerald-600">Total USD</p>
                      <p className="text-xl font-bold text-emerald-700">{formatCurrency(previewData.total_usd, 'USD')}</p>
                    </div>
                  </div>

                  {/* Preview Table */}
                  {previewData.new_rows > 0 && (
                    <>
                      <div className="border rounded-lg overflow-hidden">
                        <div className="max-h-[300px] overflow-auto">
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Date</TableHead>
                                <TableHead>User</TableHead>
                                <TableHead>Service</TableHead>
                                <TableHead>Pickup</TableHead>
                                <TableHead>Drop-off</TableHead>
                                <TableHead className="text-right">BRL</TableHead>
                                <TableHead className="text-right">USD</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {previewData.preview.map((row, idx) => (
                                <TableRow key={row.trip_eats_id || idx}>
                                  <TableCell className="text-sm">
                                    {row.transaction_timestamp_utc?.split(' ')[0] || '-'}
                                  </TableCell>
                                  <TableCell>
                                    {row.first_name} {row.last_name}
                                  </TableCell>
                                  <TableCell>{row.service}</TableCell>
                                  <TableCell className="max-w-[150px] truncate" title={row.pickup_address}>
                                    {row.pickup_address || '-'}
                                  </TableCell>
                                  <TableCell className="max-w-[150px] truncate" title={row.dropoff_address}>
                                    {row.dropoff_address || '-'}
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {formatCurrency(row.transaction_amount_brl)}
                                  </TableCell>
                                  <TableCell className="text-right font-mono">
                                    {row.transaction_amount_usd ? formatCurrency(row.transaction_amount_usd, 'USD') : '-'}
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </div>
                      </div>

                      {/* Upload Button */}
                      <div className="flex justify-end">
                        <Button
                          onClick={handleUpload}
                          disabled={isUploading}
                          className="bg-gradient-to-r from-black to-gray-700 hover:from-gray-800 hover:to-gray-600"
                        >
                          {isUploading ? (
                            <>
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                              Uploading...
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4 mr-2" />
                              Upload {previewData.new_rows} new rows to BigQuery
                            </>
                          )}
                        </Button>
                      </div>
                    </>
                  )}

                  {previewData.new_rows === 0 && (
                    <div className="text-center py-8 text-muted-foreground">
                      <Check className="w-12 h-12 mx-auto mb-4 text-green-500" />
                      <p className="text-lg font-medium">No new rows found</p>
                      <p className="text-sm">All {previewData.duplicate_rows} rows already exist in the database</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dashboard Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Expense Dashboard
          </h2>
          <Button variant="outline" size="sm" onClick={loadDashboard}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>

        {isLoadingDashboard ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : dashboardData ? (
          <>
            {/* Summary Cards - Filtered */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                      <Car className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Trips</p>
                      <p className="text-2xl font-bold">{filteredStats.total_trips.toLocaleString()}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                      <DollarSign className="w-5 h-5 text-green-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total USD</p>
                      <p className="text-2xl font-bold">{formatCurrency(filteredStats.total_usd, 'USD')}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-orange-100 flex items-center justify-center">
                      <Navigation className="w-5 h-5 text-orange-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Distance</p>
                      <p className="text-2xl font-bold">{filteredStats.total_distance.toLocaleString()} mi</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-cyan-100 flex items-center justify-center">
                      <Clock className="w-5 h-5 text-cyan-600" />
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Total Time</p>
                      <p className="text-2xl font-bold">{Math.round(filteredStats.total_duration / 60)}h</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Tables Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* By User - with filters */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Expenses by User
                  </CardTitle>
                  {/* Filters inside Expenses by User */}
                  <div className="flex flex-wrap items-center gap-2 pt-3">
                    <Select value={selectedUser} onValueChange={setSelectedUser}>
                      <SelectTrigger className="h-9 w-[160px]">
                        <SelectValue placeholder="All users" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Users</SelectItem>
                        {uniqueUsers.map((user) => (
                          <SelectItem key={user} value={user}>
                            {user}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-[155px] h-9"
                    />
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                      className="w-[155px] h-9"
                    />
                    {hasActiveFilters && (
                      <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2">
                        <X className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[400px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>User</TableHead>
                          <TableHead className="text-right">Trips</TableHead>
                          <TableHead className="text-right">USD</TableHead>
                          <TableHead className="text-right">BRL</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dashboardData.by_user.map((user, idx) => (
                          <TableRow 
                            key={idx}
                            className={selectedUser === user.user_name ? 'bg-primary/10' : 'cursor-pointer hover:bg-muted/50'}
                            onClick={() => setSelectedUser(selectedUser === user.user_name ? 'all' : user.user_name)}
                          >
                            <TableCell className="font-medium">{user.user_name}</TableCell>
                            <TableCell className="text-right">{user.trips}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(user.total_usd, 'USD')}
                            </TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">
                              {formatCurrency(user.total_brl)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* By City */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Expenses by City
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="max-h-[400px] overflow-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>City</TableHead>
                          <TableHead className="text-right">Trips</TableHead>
                          <TableHead className="text-right">USD</TableHead>
                          <TableHead className="text-right">BRL</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dashboardData.by_city.map((city, idx) => (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{city.city}</TableCell>
                            <TableCell className="text-right">{city.trips}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(city.total_usd, 'USD')}
                            </TableCell>
                            <TableCell className="text-right font-mono text-muted-foreground">
                              {formatCurrency(city.total_brl)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* All Transactions */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  All Transactions
                  {hasActiveFilters && (
                    <span className="text-sm font-normal text-muted-foreground ml-2">
                      ({filteredTransactions.length} of {dashboardData.all_transactions?.length || 0})
                    </span>
                  )}
                </CardTitle>
                {/* Filters inside All Transactions */}
                <div className="flex flex-wrap items-center gap-2 pt-3">
                  <Select value={selectedUser} onValueChange={setSelectedUser}>
                    <SelectTrigger className="h-9 w-[180px]">
                      <SelectValue placeholder="All users" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Users</SelectItem>
                      {uniqueUsers.map((user) => (
                        <SelectItem key={user} value={user}>
                          {user}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-[155px] h-9"
                  />
                  <Input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-[155px] h-9"
                  />
                  {hasActiveFilters && (
                    <Button variant="ghost" size="sm" onClick={clearFilters} className="h-9 px-2">
                      <X className="w-4 h-4" />
                    </Button>
                  )}
                  
                  {/* Export button */}
                  <Button variant="outline" size="sm" onClick={() => exportToXLSX('filtered')} className="h-9 ml-auto">
                    <Download className="w-4 h-4 mr-1" />
                    Export
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="max-h-[600px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>User</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead>Pickup Address</TableHead>
                        <TableHead>Drop-off Address</TableHead>
                        <TableHead className="text-right">USD</TableHead>
                        <TableHead className="text-right">BRL</TableHead>
                        <TableHead className="text-right">PTAX</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredTransactions.map((tx, idx) => (
                        <TableRow key={tx.trip_eats_id || idx}>
                          <TableCell className="text-sm whitespace-nowrap">
                            {tx.transaction_timestamp_utc?.split(' ')[0] || '-'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{tx.user_name}</TableCell>
                          <TableCell>{tx.service}</TableCell>
                          <TableCell>{tx.city}</TableCell>
                          <TableCell 
                            className="max-w-[200px] cursor-pointer hover:bg-muted/50"
                            onDoubleClick={() => handleAddressDoubleClick('Pickup Address', tx.pickup_address)}
                          >
                            <span className="truncate block" title="Double-click to view full address">
                              {tx.pickup_address || '-'}
                            </span>
                          </TableCell>
                          <TableCell 
                            className="max-w-[200px] cursor-pointer hover:bg-muted/50"
                            onDoubleClick={() => handleAddressDoubleClick('Drop-off Address', tx.dropoff_address)}
                          >
                            <span className="truncate block" title="Double-click to view full address">
                              {tx.dropoff_address || '-'}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            {tx.amount_usd ? formatCurrency(tx.amount_usd, 'USD') : '-'}
                          </TableCell>
                          <TableCell className="text-right font-mono text-muted-foreground">
                            {formatCurrency(tx.amount_brl)}
                          </TableCell>
                          <TableCell className="text-right text-sm text-muted-foreground">
                            {tx.ptax_rate?.toFixed(4) || '-'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <div className="text-center py-12 text-muted-foreground">
            <AlertCircle className="w-12 h-12 mx-auto mb-4" />
            <p>Could not load dashboard data</p>
            <Button variant="outline" onClick={loadDashboard} className="mt-4">
              Try again
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};

export default UberPage;
