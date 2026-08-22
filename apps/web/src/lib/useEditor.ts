import {useState} from 'react';

/** Add/edit state shared by the catalogue sections: at most one form open. */
export function useEditor<T extends {readonly id: string}>(
  items: readonly T[],
) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const editing = items.find(item => item.id === editingId);
  return {
    adding,
    editing,
    startAdd() {
      setAdding(true);
      setEditingId(null);
    },
    startEdit(id: string) {
      setEditingId(id);
      setAdding(false);
    },
    close() {
      setAdding(false);
      setEditingId(null);
    },
  };
}
