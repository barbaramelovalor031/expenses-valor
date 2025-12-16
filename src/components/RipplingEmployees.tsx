import { useState, useEffect } from 'react';
import { Users, Plus, Pencil, Trash2, Save, X, RefreshCw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { API_BASE_URL } from '@/lib/api';

interface Employee {
  id: string;
  rippling_name: string;
  display_name: string;
  employee_type: string;
  created_at: string;
  updated_at: string;
}

const EMPLOYEE_TYPES = ['Partner', 'Employee', 'Contractor', 'Advisor'];

const RipplingEmployees = () => {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  
  // Edit mode
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ rippling_name: '', display_name: '', employee_type: '' });
  
  // Add dialog
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newEmployee, setNewEmployee] = useState({
    rippling_name: '',
    display_name: '',
    employee_type: 'Contractor'
  });
  
  // Delete dialog
  const [deleteDialog, setDeleteDialog] = useState<{ open: boolean; employee: Employee | null }>({
    open: false,
    employee: null
  });

  const { toast } = useToast();

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/rippling/employees`);
      if (!response.ok) throw new Error('Failed to load employees');
      const data = await response.json();
      setEmployees(data.employees || []);
    } catch (error) {
      console.error('Error loading employees:', error);
      toast({
        title: "Error",
        description: "Failed to load employees",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const filteredEmployees = employees.filter(emp => {
    const matchesSearch = searchTerm === '' || 
      emp.rippling_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.display_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || emp.employee_type === filterType;
    return matchesSearch && matchesType;
  });

  const startEdit = (employee: Employee) => {
    setEditingId(employee.id);
    setEditForm({
      rippling_name: employee.rippling_name,
      display_name: employee.display_name,
      employee_type: employee.employee_type
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ rippling_name: '', display_name: '', employee_type: '' });
  };

  const saveEdit = async (id: string) => {
    try {
      const response = await fetch(`${API_BASE_URL}/rippling/employees/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update');
      }
      
      toast({
        title: "Success",
        description: "Employee updated successfully",
      });
      
      setEditingId(null);
      loadEmployees();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update employee",
        variant: "destructive",
      });
    }
  };

  const handleAdd = async () => {
    if (!newEmployee.rippling_name || !newEmployee.display_name) {
      toast({
        title: "Error",
        description: "Please fill in all required fields",
        variant: "destructive",
      });
      return;
    }

    try {
      const response = await fetch(`${API_BASE_URL}/rippling/employees`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEmployee)
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to add');
      }
      
      toast({
        title: "Success",
        description: "Employee added successfully",
      });
      
      setIsAddDialogOpen(false);
      setNewEmployee({
        rippling_name: '',
        display_name: '',
        employee_type: 'Contractor'
      });
      loadEmployees();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add employee",
        variant: "destructive",
      });
    }
  };

  const handleDelete = async () => {
    if (!deleteDialog.employee) return;
    
    try {
      const response = await fetch(`${API_BASE_URL}/rippling/employees/${deleteDialog.employee.id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to delete');
      }
      
      toast({
        title: "Success",
        description: "Employee deleted successfully",
      });
      
      setDeleteDialog({ open: false, employee: null });
      loadEmployees();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete employee",
        variant: "destructive",
      });
    }
  };

  // Stats
  const stats = {
    total: employees.length,
    partners: employees.filter(e => e.employee_type === 'Partner').length,
    employees: employees.filter(e => e.employee_type === 'Employee').length,
    contractors: employees.filter(e => e.employee_type === 'Contractor').length,
    advisors: employees.filter(e => e.employee_type === 'Advisor').length,
  };

  const uniqueDisplayNames = [...new Set(employees.map(e => e.display_name))].length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Mappings</CardDescription>
            <CardTitle className="text-2xl">{stats.total}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Partners</CardDescription>
            <CardTitle className="text-2xl text-blue-600">{stats.partners}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Employees</CardDescription>
            <CardTitle className="text-2xl text-green-600">{stats.employees}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Contractors</CardDescription>
            <CardTitle className="text-2xl text-orange-600">{stats.contractors}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unique People</CardDescription>
            <CardTitle className="text-2xl text-purple-600">{uniqueDisplayNames}</CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters and Actions */}
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex gap-4 items-center flex-wrap">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search by name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 w-64"
            />
          </div>
          <Select value={filterType} onValueChange={setFilterType}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {EMPLOYEE_TYPES.map(type => (
                <SelectItem key={type} value={type}>{type}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadEmployees} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Button onClick={() => setIsAddDialogOpen(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add Mapping
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <div className="max-h-[500px] overflow-auto">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>Rippling Name</TableHead>
                  <TableHead>Display Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      Loading...
                    </TableCell>
                  </TableRow>
                ) : filteredEmployees.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      No employees found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredEmployees.map((employee) => (
                    <TableRow key={employee.id}>
                      <TableCell>
                        {editingId === employee.id ? (
                          <Input
                            value={editForm.rippling_name}
                            onChange={(e) => setEditForm({ ...editForm, rippling_name: e.target.value })}
                            className="h-8 font-mono text-sm"
                          />
                        ) : (
                          <span className="font-mono text-sm">{employee.rippling_name}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === employee.id ? (
                          <Input
                            value={editForm.display_name}
                            onChange={(e) => setEditForm({ ...editForm, display_name: e.target.value })}
                            className="h-8"
                          />
                        ) : (
                          <span className="font-medium">{employee.display_name}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === employee.id ? (
                          <Select
                            value={editForm.employee_type}
                            onValueChange={(v) => setEditForm({ ...editForm, employee_type: v })}
                          >
                            <SelectTrigger className="h-8 w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {EMPLOYEE_TYPES.map(type => (
                                <SelectItem key={type} value={type}>{type}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            employee.employee_type === 'Partner' ? 'bg-blue-100 text-blue-700' :
                            employee.employee_type === 'Employee' ? 'bg-green-100 text-green-700' :
                            employee.employee_type === 'Contractor' ? 'bg-orange-100 text-orange-700' :
                            'bg-purple-100 text-purple-700'
                          }`}>
                            {employee.employee_type}
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        {editingId === employee.id ? (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => saveEdit(employee.id)}>
                              <Save className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={cancelEdit}>
                              <X className="w-4 h-4" />
                            </Button>
                          </div>
                        ) : (
                          <div className="flex gap-1 justify-end">
                            <Button size="sm" variant="ghost" onClick={() => startEdit(employee)}>
                              <Pencil className="w-4 h-4" />
                            </Button>
                            <Button 
                              size="sm" 
                              variant="ghost" 
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleteDialog({ open: true, employee })}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Employee Mapping</DialogTitle>
            <DialogDescription>
              Add a new name mapping for Rippling expenses
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Rippling Name *</label>
              <Input
                placeholder="Name as it appears in Rippling"
                value={newEmployee.rippling_name}
                onChange={(e) => setNewEmployee({ ...newEmployee, rippling_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Display Name *</label>
              <Input
                placeholder="Canonical display name"
                value={newEmployee.display_name}
                onChange={(e) => setNewEmployee({ ...newEmployee, display_name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Type *</label>
              <Select
                value={newEmployee.employee_type}
                onValueChange={(v) => setNewEmployee({ ...newEmployee, employee_type: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EMPLOYEE_TYPES.map(type => (
                    <SelectItem key={type} value={type}>{type}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAdd}>
              Add Employee
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialog.open} onOpenChange={(open) => setDeleteDialog({ ...deleteDialog, open })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Employee Mapping</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete the mapping for "{deleteDialog.employee?.rippling_name}"?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialog({ open: false, employee: null })}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDelete}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default RipplingEmployees;
