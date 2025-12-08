import { useCallback, useState } from 'react';
import { Upload, FileText, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface FileUploadZoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
}

export function FileUploadZone({ onFilesSelected, disabled }: FileUploadZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);

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

    const files = Array.from(e.dataTransfer.files).filter(
      (file) => file.type === 'application/pdf'
    );

    if (files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...files]);
    }
  }, []);

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []).filter(
      (file) => file.type === 'application/pdf'
    );

    if (files.length > 0) {
      setSelectedFiles((prev) => [...prev, ...files]);
    }
    e.target.value = '';
  }, []);

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

  const handleUpload = () => {
    if (selectedFiles.length > 0) {
      onFilesSelected(selectedFiles);
      setSelectedFiles([]);
    }
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={cn(
          'relative border-2 border-dashed rounded-xl p-8 transition-all duration-300 cursor-pointer',
          'hover:border-primary/50 hover:bg-primary/5',
          isDragging
            ? 'border-primary bg-primary/10 scale-[1.02]'
            : 'border-border bg-card',
          disabled && 'opacity-50 pointer-events-none'
        )}
      >
        <input
          type="file"
          accept=".pdf"
          multiple
          onChange={handleFileInput}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          disabled={disabled}
        />
        <div className="flex flex-col items-center gap-4 text-center">
          <div
            className={cn(
              'w-16 h-16 rounded-full flex items-center justify-center transition-all duration-300',
              isDragging
                ? 'gradient-primary text-primary-foreground scale-110'
                : 'bg-primary/10 text-primary'
            )}
          >
            <Upload className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <p className="font-display text-lg font-semibold text-foreground">
              {isDragging ? 'Drop files here' : 'Drag your PDFs here'}
            </p>
            <p className="text-sm text-muted-foreground">
              or click to select files
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            Only PDF files are accepted
          </p>
        </div>
      </div>

      {selectedFiles.length > 0 && (
        <div className="space-y-3 animate-fade-in">
          <h4 className="text-sm font-medium text-foreground">
            Selected files ({selectedFiles.length})
          </h4>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {selectedFiles.map((file, index) => (
              <div
                key={`${file.name}-${index}`}
                className="flex items-center gap-3 p-3 bg-secondary rounded-lg animate-slide-in"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <FileText className="w-5 h-5 text-primary shrink-0" />
                <span className="flex-1 text-sm text-foreground truncate">
                  {file.name}
                </span>
                <span className="text-xs text-muted-foreground">
                  {(file.size / 1024).toFixed(0)} KB
                </span>
                <button
                  onClick={() => removeFile(index)}
                  className="p-1 hover:bg-destructive/10 rounded-full transition-colors"
                >
                  <X className="w-4 h-4 text-destructive" />
                </button>
              </div>
            ))}
          </div>
          <Button
            variant="gradient"
            size="lg"
            className="w-full"
            onClick={handleUpload}
            disabled={disabled}
          >
            <Upload className="w-5 h-5" />
            Process {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''}
          </Button>
        </div>
      )}
    </div>
  );
}
