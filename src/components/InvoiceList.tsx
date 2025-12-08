import { ExtractedInvoice } from '@/types/invoice';
import { FileText, CheckCircle2, Loader2, AlertCircle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface InvoiceListProps {
  invoices: ExtractedInvoice[];
  onView: (invoice: ExtractedInvoice) => void;
}

const statusConfig = {
  pending: {
    icon: Loader2,
    label: 'Pending',
    className: 'text-muted-foreground',
    iconClass: '',
  },
  processing: {
    icon: Loader2,
    label: 'Processing',
    className: 'text-primary',
    iconClass: 'animate-spin',
  },
  completed: {
    icon: CheckCircle2,
    label: 'Completed',
    className: 'text-accent',
    iconClass: '',
  },
  error: {
    icon: AlertCircle,
    label: 'Error',
    className: 'text-destructive',
    iconClass: '',
  },
};

export function InvoiceList({ invoices, onView }: InvoiceListProps) {
  if (invoices.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
          <FileText className="w-10 h-10 text-muted-foreground" />
        </div>
        <h3 className="font-display text-lg font-semibold text-foreground mb-2">
          No invoices processed
        </h3>
        <p className="text-sm text-muted-foreground">
          Upload PDF invoices to get started
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {invoices.map((invoice, index) => {
        const status = statusConfig[invoice.status];
        const StatusIcon = status.icon;

        return (
          <div
            key={invoice.id}
            className="flex items-center gap-4 p-4 bg-card rounded-xl shadow-card border border-border/50 animate-fade-in hover:shadow-elevated transition-shadow"
            style={{ animationDelay: `${index * 100}ms` }}
          >
            <div className="w-12 h-12 rounded-lg gradient-primary flex items-center justify-center shrink-0">
              <FileText className="w-6 h-6 text-primary-foreground" />
            </div>

            <div className="flex-1 min-w-0">
              <h4 className="font-medium text-foreground truncate">
                {invoice.fileName}
              </h4>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-muted-foreground">
                  {invoice.cardName}
                </span>
                {invoice.totalAmount !== undefined && (
                  <>
                    <span className="text-muted-foreground">•</span>
                    <span className="text-xs font-medium text-foreground">
                      $ {invoice.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </>
                )}
              </div>
            </div>

            <div className={cn('flex items-center gap-2', status.className)}>
              <StatusIcon className={cn('w-4 h-4', status.iconClass)} />
              <span className="text-xs font-medium hidden sm:inline">
                {status.label}
              </span>
            </div>

            {invoice.status === 'completed' && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => onView(invoice)}
                className="shrink-0"
              >
                <Eye className="w-4 h-4" />
                <span className="hidden sm:inline ml-1">View</span>
              </Button>
            )}
          </div>
        );
      })}
    </div>
  );
}
