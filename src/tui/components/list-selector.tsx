import { Box, Text, useInput } from 'ink';
import { type ReactElement, useState } from 'react';

const selectionCache = new Map<string, number>();

interface ListItem {
  label: string;
  action: () => void;
}

export interface ListSelectorProps<T extends ListItem> {
  /** Stable id used to remember the highlighted index across unmount/remount. */
  id: string;
  /** The items to choose from. */
  items: readonly T[];
}

/** A minimal vertical list picker: up/down to move (with wraparound), Enter to select. */
export function ListSelector<T extends ListItem>({ id, items }: ListSelectorProps<T>): ReactElement {
  const [selected, setSelected] = useState(() => selectionCache.get(id) ?? 0);

  const move = (next: number) => {
    setSelected(next);
    selectionCache.set(id, next);
  };

  useInput((_input, key) => {
    if (key.upArrow) {
      move(selected === 0 ? items.length - 1 : selected - 1);
    } else if (key.downArrow) {
      move(selected === items.length - 1 ? 0 : selected + 1);
    } else if (key.return) {
      const item = items[selected];
      if (item) item.action();
    }
  });

  return (
    <Box flexDirection="column">
      {items.map((item, i) => {
        return (
          <Text key={item.label} color={i === selected ? 'cyan' : undefined}>
            {i === selected ? '> ' : '  '}
            {item.label}
          </Text>
        );
      })}
    </Box>
  );
}
