export interface CreditCard {
  id: string;
  name: string;
  icon: string;
  color: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  amount: number;
  category?: string;
}

export interface ExtractedInvoice {
  id: string;
  fileName: string;
  cardId: string;
  cardName: string;
  dueDate?: string;
  totalAmount?: number;
  transactions: Transaction[];
  extractedAt: Date;
  status: 'pending' | 'processing' | 'completed' | 'error';
}

export interface UploadedFile {
  id: string;
  file: File;
  cardId: string;
  status: 'pending' | 'processing' | 'completed' | 'error';
  extractedData?: ExtractedInvoice;
}
