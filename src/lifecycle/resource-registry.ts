export interface Disposable {
  dispose(): void;
}

export class ResourceRegistry {
  private readonly resources: Disposable[] = [];

  add<T extends Disposable>(resource: T): T {
    this.resources.push(resource);
    return resource;
  }

  dispose(): void {
    for (const resource of this.resources.splice(0).reverse()) {
      resource.dispose();
    }
  }
}
