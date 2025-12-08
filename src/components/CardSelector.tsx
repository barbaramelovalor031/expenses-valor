import { CreditCard } from '@/types/invoice';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CardSelectorProps {
  cards: CreditCard[];
  selectedCard: string;
  onSelect: (cardId: string) => void;
}

export function CardSelector({ cards, selectedCard, onSelect }: CardSelectorProps) {
  const selected = cards.find((c) => c.id === selectedCard);

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium text-foreground">
        Select credit card
      </label>
      <Select value={selectedCard} onValueChange={onSelect}>
        <SelectTrigger className="w-full h-12 bg-card border-border shadow-card transition-shadow hover:shadow-elevated">
          <SelectValue placeholder="Choose a card">
            {selected && (
              <div className="flex items-center gap-3">
                <span className="text-xl">{selected.icon}</span>
                <span className="font-medium">{selected.name}</span>
              </div>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent className="bg-popover border-border z-50">
          {cards.map((card) => (
            <SelectItem
              key={card.id}
              value={card.id}
              className="cursor-pointer hover:bg-accent focus:bg-accent"
            >
              <div className="flex items-center gap-3 py-1">
                <span className="text-xl">{card.icon}</span>
                <span className="font-medium">{card.name}</span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
