import { Users } from 'lucide-react';

const Rippling = () => {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center">
        <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center mx-auto mb-4">
          <Users className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="font-display text-2xl font-bold text-foreground mb-2">
          Rippling
        </h2>
        <p className="text-muted-foreground max-w-md">
          Coming soon! 
        </p>
      </div>
    </div>
  );
};

export default Rippling;
