export class RequestGate {
  private latest = 0;

  begin(): number {
    return ++this.latest;
  }

  isCurrent(request: number): boolean {
    return request === this.latest;
  }

  cancel(): void {
    this.latest++;
  }
}
