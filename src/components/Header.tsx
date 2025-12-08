export function Header() {
  return (
    <header className="sticky top-0 z-40 w-full border-b border-border/50 bg-background/80 backdrop-blur-lg">
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img 
            src="/valor-logo.jpg" 
            alt="Valor Logo" 
            className="w-10 h-10 rounded-xl object-cover shadow-soft"
          />
          <div>
            <h1 className="font-display font-bold text-lg text-foreground">
              Expenses Portal
            </h1>
          </div>
        </div>
      </div>
    </header>
  );
}
