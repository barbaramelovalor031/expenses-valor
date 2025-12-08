import { Header } from './Header';
import { Sidebar } from './Sidebar';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <Sidebar />
      <main className="ml-64 pt-16">
        <div className="container mx-auto px-8 py-8">
          {children}
        </div>
      </main>
    </div>
  );
}
