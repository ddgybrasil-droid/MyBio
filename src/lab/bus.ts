/** Keeps at most one bench piece rendering at a time. */
export interface Runnable {
  /** Called when another piece takes over the GPU. */
  yield(): void;
  /** Whether the piece is currently rendering by the visitor's choice. */
  isRunning(): boolean;
}

const pieces = new Set<Runnable>();

export function register(piece: Runnable): () => void {
  pieces.add(piece);
  return () => pieces.delete(piece);
}

export function claim(owner: Runnable): void {
  for (const piece of pieces) {
    if (piece !== owner) piece.yield();
  }
}

export function othersRunning(owner: Runnable): boolean {
  for (const piece of pieces) {
    if (piece !== owner && piece.isRunning()) return true;
  }
  return false;
}
