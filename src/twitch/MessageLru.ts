export class MessageLru {
  private readonly ids = new Map<string, true>();

  constructor(private readonly maximum = 500) {}

  hasOrAdd(id: string): boolean {
    if (this.ids.has(id)) return true;
    this.ids.set(id, true);
    if (this.ids.size > this.maximum) {
      const oldest = this.ids.keys().next().value;
      if (oldest) this.ids.delete(oldest);
    }
    return false;
  }
}
