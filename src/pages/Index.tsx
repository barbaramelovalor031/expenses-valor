import { useState, useCallback } from 'react';
import { CardSelector } from '@/components/CardSelector';
import { FileUploadZone } from '@/components/FileUploadZone';
import { InvoiceList } from '@/components/InvoiceList';
import { InvoiceViewer } from '@/components/InvoiceViewer';
import { creditCards } from '@/data/creditCards';
import { ExtractedInvoice, Transaction } from '@/types/invoice';
import { useToast } from '@/hooks/use-toast';
import { extractPDF } from '@/lib/api';

const Index = () => {
  const [selectedCard, setSelectedCard] = useState<string>('');
  const [invoices, setInvoices] = useState<ExtractedInvoice[]>([]);
  const [originalFiles, setOriginalFiles] = useState<Record<string, File>>({});
  const [viewingInvoice, setViewingInvoice] = useState<ExtractedInvoice | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleFilesSelected = useCallback(
    async (files: File[]) => {
      if (!selectedCard) {
        toast({
          title: 'Select a Credit Card',
          description: 'Please select a credit card before uploading files.',
          variant: 'destructive',
        });
        return;
      }

      setIsProcessing(true);

      // Add pending invoices
      const pendingInvoices: ExtractedInvoice[] = files.map((file) => ({
        id: `inv-${Date.now()}-${file.name}`,
        fileName: file.name,
        cardId: selectedCard,
        cardName: creditCards.find((c) => c.id === selectedCard)?.name || '',
        transactions: [],
        extractedAt: new Date(),
        status: 'processing' as const,
      }));

      // Guarda referência aos arquivos originais
      const newOriginalFiles: Record<string, File> = {};
      pendingInvoices.forEach((inv, i) => {
        newOriginalFiles[inv.id] = files[i];
      });
      setOriginalFiles((prev) => ({ ...prev, ...newOriginalFiles }));

      setInvoices((prev) => [...pendingInvoices, ...prev]);

      // Process files using real API
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const pending = pendingInvoices[i];
        
        try {
          const result = await extractPDF(file, selectedCard);
          
          console.log('API Result:', result); // Debug log
          
          // Convert API response to ExtractedInvoice format
          const transactions: Transaction[] = (result.transactions || []).map((tx, idx) => ({
            id: `t-${Date.now()}-${idx}`,
            date: tx.date || '',
            description: tx.description || '',
            amount: tx.amount ?? 0,
            category: tx.cardholder || '',
          }));

          const totalAmount = transactions.reduce((acc, t) => acc + (t.amount || 0), 0);

          setInvoices((prev) =>
            prev.map((inv) =>
              inv.id === pending.id
                ? {
                    ...inv,
                    transactions,
                    totalAmount,
                    status: 'completed' as const,
                  }
                : inv
            )
          );
        } catch (error) {
          console.error('Error extracting PDF:', error);
          setInvoices((prev) =>
            prev.map((inv) =>
              inv.id === pending.id
                ? { ...inv, status: 'error' as const }
                : inv
            )
          );
          
          toast({
            title: 'Processing error',
            description: error instanceof Error ? error.message : 'Unknown error',
            variant: 'destructive',
          });
        }
      }

      setIsProcessing(false);
      toast({
        title: 'Processing completed',
        description: `${files.length} file(s) processed.`,
      });
    },
    [selectedCard, toast]
  );

  return (
    <div className="max-w-4xl">
      {/* Credit Card Section */}
      <section className="mb-10 animate-fade-in">
        <h2 className="font-display text-2xl sm:text-3xl font-bold text-foreground mb-6">
          Credit Card
        </h2>
        
        <div className="grid gap-6 lg:grid-cols-5">
          <div className="lg:col-span-2" style={{ animationDelay: '100ms' }}>
            <div className="bg-card rounded-2xl p-6 shadow-card border border-border/50">
              <CardSelector
                cards={creditCards}
                selectedCard={selectedCard}
                onSelect={setSelectedCard}
              />
            </div>
          </div>
          <div className="lg:col-span-3" style={{ animationDelay: '200ms' }}>
            <div className="bg-card rounded-2xl p-6 shadow-card border border-border/50">
              <FileUploadZone
                onFilesSelected={handleFilesSelected}
                disabled={isProcessing}
              />
            </div>
          </div>
        </div>
      </section>

      {/* Invoices List */}
      <div className="bg-card rounded-2xl p-6 shadow-card border border-border/50 animate-fade-in" style={{ animationDelay: '300ms' }}>
        <h3 className="font-display text-xl font-semibold text-foreground mb-6">
          Processed Invoices
        </h3>
        <InvoiceList invoices={invoices} onView={setViewingInvoice} />
      </div>

      {/* Invoice Viewer Modal */}
      {viewingInvoice && (
        <InvoiceViewer 
          invoice={viewingInvoice} 
          onClose={() => setViewingInvoice(null)}
          originalFile={originalFiles[viewingInvoice.id]}
        />
      )}
    </div>
  );
};

export default Index;
